#!/usr/bin/env node
'use strict'

// Builds the frozen v1 documentation and places it at `/v1/` of the published
// site. v1 receives no further changes, so this is a build of a fixed tag
// rather than of anything in the working tree.
//
// The result is cached under `.cache/v1-docs`, keyed by the tag: the first run
// pays for a checkout, an install and a build, every run after it copies. CI
// caches that directory, so a deploy normally pays nothing at all.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')

// The last v1 release. This is the whole configuration — change it only if v1
// ever gets another release, and drop the cache when you do.
const V1_TAG = 'v1.8.1'

const repoRoot = path.resolve(__dirname, '..')
const cacheDirectory = path.join(repoRoot, '.cache', 'v1-docs', V1_TAG)
const outputDirectory = path.join(repoRoot, 'docs', '.vitepress', 'dist', 'v1')

// Parts of the v1 build the live site already serves, or that would compete
// with it. A second sitemap would push v1 URLs into the search index; a second
// llms.txt would hand an LLM the previous major's API as if it were current.
const DROP_FROM_OUTPUT = [
  'examples',
  'llms.txt',
  'llms-full.txt',
  'sitemap.xml',
  'robots.txt',
  'googlef8c159020eb311c9.html',
]

// Running under `npm run` leaves `npm_config_*` in the environment, and
// `npm_config_local_prefix` points at *this* repository. A child `npm` inherits
// it and resolves the workspace from here instead of from the checkout, which
// makes the install fail in a way that reads like a build error. Hand every
// child a clean environment.
function childEnvironment() {
  const environment = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('npm_') || key === 'INIT_CWD') continue
    environment[key] = value
  }
  // A throwaway checkout has no use for git hooks, and `husky install` is
  // deprecated in the version v1 pins.
  environment.HUSKY = '0'
  return environment
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnvironment(),
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve(output)
      const tail = output.split(/\r?\n/).slice(-40).join('\n')
      reject(new Error(
        `\`${command} ${args.join(' ')}\` failed in ${cwd} (exit code ${code}).\n`
        + `--- Last output ---\n${tail}`,
      ))
    })
  })
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

async function isPopulated(directory) {
  try {
    const entries = await fs.promises.readdir(directory)
    return entries.length > 0
  } catch {
    return false
  }
}

// The v1 config has no way to set a base path from the outside, so it is
// patched in the throwaway checkout. Everything under `/v1/` has to be
// requested from `/v1/`, assets included.
async function setBasePath(checkoutDirectory) {
  const configPath = path.join(checkoutDirectory, 'docs', '.vitepress', 'config.mts')
  const config = await fs.promises.readFile(configPath, 'utf8')
  const marker = 'export default withMermaid({'
  if (!config.includes(marker)) {
    throw new Error(`Could not find \`${marker}\` in the ${V1_TAG} VitePress config.`)
  }
  await fs.promises.writeFile(
    configPath,
    config.replace(marker, `${marker}\n  base: '/v1/',`),
  )
}

async function buildIntoCache() {
  const checkoutDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'signaldb-v1-docs-'))

  try {
    // A shallow clone has no tags, and the failure that produces further down
    // reads like a git problem rather than a checkout-depth one.
    await run('git', ['rev-parse', '--verify', `${V1_TAG}^{commit}`], repoRoot).catch(() => {
      throw new Error(
        `The tag ${V1_TAG} is not present in this clone. Fetch it with `
        + '`git fetch --tags`; in CI, check out with `fetch-depth: 0`.',
      )
    })

    console.log(`Checking out ${V1_TAG} …`)
    await run('git', ['worktree', 'add', '--detach', checkoutDirectory, V1_TAG], repoRoot)

    await setBasePath(checkoutDirectory)

    console.log(`Installing dependencies for ${V1_TAG} …`)
    await run(npm, ['install', '--no-audit', '--force', '--loglevel=error', '--no-update-notifier'], checkoutDirectory)

    console.log(`Building the ${V1_TAG} documentation …`)
    await run(npm, ['run', 'docs:build'], checkoutDirectory)

    const built = path.join(checkoutDirectory, 'docs', '.vitepress', 'dist')
    await fs.promises.rm(cacheDirectory, { recursive: true, force: true })
    await fs.promises.mkdir(path.dirname(cacheDirectory), { recursive: true })
    await fs.promises.cp(built, cacheDirectory, { recursive: true })

    await Promise.all(DROP_FROM_OUTPUT.map(entry =>
      fs.promises.rm(path.join(cacheDirectory, entry), { recursive: true, force: true })))
  } finally {
    await run('git', ['worktree', 'remove', '--force', checkoutDirectory], repoRoot).catch(() => {})
    await fs.promises.rm(checkoutDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

;(async function main() {
  if (await isPopulated(cacheDirectory)) {
    console.log(`Reusing the cached ${V1_TAG} documentation.`)
  } else {
    await buildIntoCache()
  }

  await fs.promises.rm(outputDirectory, { recursive: true, force: true })
  await fs.promises.mkdir(path.dirname(outputDirectory), { recursive: true })
  await fs.promises.cp(cacheDirectory, outputDirectory, { recursive: true })

  console.log(`✅ v1 documentation placed at ${path.relative(repoRoot, outputDirectory)}`)
})().catch((error) => {
  console.error('❌ build-v1-docs failed:\n', error && error.stack ? error.stack : error)
  process.exit(1)
})
