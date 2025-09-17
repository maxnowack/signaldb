#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const os = require('os')

// --- Helpers ---------------------------------------------------------------
function runNpmBuild(cwd, options = {}) {
  const { verbose = process.env.BUILD_VERBOSE === '1' || process.env.BUILD_VERBOSE === 'true' } = options
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const args = ['run', '-s', 'build'] // -s/--silent to quiet npm itself

    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutBuf = ''
    let stderrBuf = ''

    child.stdout.on('data', (chunk) => {
      if (verbose) {
        process.stdout.write(chunk)
      } else {
        stdoutBuf += chunk.toString()
      }
    })

    child.stderr.on('data', (chunk) => {
      if (verbose) {
        process.stderr.write(chunk)
      } else {
        stderrBuf += chunk.toString()
      }
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve()
      const tail = (stdoutBuf + '\n' + stderrBuf)
        .split(/\r?\n/)
        .slice(-40)
        .join('\n')
      const error = new Error(`Build failed in ${cwd} (exit code ${code}).\n--- Last output ---\n${tail}`)
      reject(error)
    })
  })
}
async function runInPool(items, worker, concurrency) {
  const results = Array.from({ length: items.length })
  let index = 0
  const workers = []
  const errors = []
  const runWorker = async () => {
    while (true) {
      const i = index++
      if (i >= items.length) break
      try {
        results[i] = await worker(items[i], i)
      } catch (error) {
        errors.push(error)
      }
    }
  }
  const workerCount = Math.min(concurrency, items.length)
  for (let i = 0; i < workerCount; i++) {
    workers.push(runWorker())
  }
  await Promise.all(workers)
  if (errors.length > 0) throw errors[0]
  return results
}

async function listSubdirs(directory) {
  try {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(directory, entry.name))
  } catch {
    return []
  }
}

async function hasBuildScript(directory) {
  try {
    const packageJson = await fs.promises.readFile(path.join(directory, 'package.json'), 'utf8')
    const package_ = JSON.parse(packageJson)
    return Boolean(package_ && package_.scripts && package_.scripts.build)
  } catch {
    return false
  }
}

// --- Main -----------------------------------------------------------------
(async function main() {
  const repoRoot = path.resolve(__dirname, '..')

  // 1) Build base/core first
  const coreDirectory = path.join(repoRoot, 'packages', 'base', 'core')
  await runNpmBuild(coreDirectory)
  console.log(`Built ${path.relative(repoRoot, coreDirectory)}`)

  // 2) Build storage-adapters/generic-fs second
  const genericFsDirectory = path.join(
    repoRoot,
    'packages',
    'storage-adapters',
    'generic-fs',
  )
  await runNpmBuild(genericFsDirectory)
  console.log(`Built ${path.relative(repoRoot, genericFsDirectory)}`)

  // 3) Build everything else in parallel
  const groups = [
    { dir: path.join(repoRoot, 'packages', 'base'), exclude: new Set(['core']) },
    { dir: path.join(repoRoot, 'packages', 'devtools'), exclude: new Set() },
    { dir: path.join(repoRoot, 'packages', 'integrations'), exclude: new Set() },
    {
      dir: path.join(repoRoot, 'packages', 'storage-adapters'),
      exclude: new Set(['generic-fs']),
    },
    { dir: path.join(repoRoot, 'packages', 'reactivity-adapters'), exclude: new Set() },
  ]

  /** Collect package directories that actually have a build script */
  const directoriesToBuild = []
  for (const g of groups) {
    const subdirs = await listSubdirs(g.dir)
    for (const d of subdirs) {
      const name = path.basename(d)
      if (g.exclude.has(name)) continue
      if (await hasBuildScript(d)) {
        directoriesToBuild.push(d)
      } else {
        console.log(`[skip] ${path.relative(repoRoot, d)} (no npm run build)`)
      }
    }
  }

  if (directoriesToBuild.length === 0) {
    console.log('Nothing else to build.')
    return
  }

  const cpuCount = os.cpus ? os.cpus().length : 1
  const maxConcurrency = Math.max(1, Number.parseInt(process.env.BUILD_CONCURRENCY || '', 10) || cpuCount)

  console.log(`Building ${directoriesToBuild.length} packages in parallel (up to ${maxConcurrency} workers)`)
  await runInPool(
    directoriesToBuild,
    async (directory) => {
      await runNpmBuild(directory)
      console.log(`Built ${path.relative(repoRoot, directory)}`)
    },
    maxConcurrency,
  )

  console.log('✅ All builds completed successfully.')
})().catch((error) => {
  console.error('❌ build-all failed:\n', error && error.stack ? error.stack : error)
  process.exit(1)
})
