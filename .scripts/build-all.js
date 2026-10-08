#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const os = require('os')

// --- Helpers ---------------------------------------------------------------
function runNpmBuild(cwd) {
  const isVerbose = process.env.BUILD_VERBOSE === '1' || process.env.BUILD_VERBOSE === 'true'
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const args = ['run', '-s', 'build'] // -s/--silent to quiet npm itself

    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''

    child.stdout.on('data', (chunk) => {
      if (isVerbose) {
        process.stdout.write(chunk)
      } else {
        stdoutBuffer += chunk.toString()
      }
    })

    child.stderr.on('data', (chunk) => {
      if (isVerbose) {
        process.stderr.write(chunk)
      } else {
        stderrBuffer += chunk.toString()
      }
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve()
      const tail = (stdoutBuffer + '\n' + stderrBuffer)
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
async function main() {
  const repositoryRoot = path.resolve(__dirname, '..')

  // 1) Build base/core first
  const coreDirectory = path.join(repositoryRoot, 'packages', 'base', 'core')
  await runNpmBuild(coreDirectory)
  console.log(`Built ${path.relative(repositoryRoot, coreDirectory)}`)

  // 2) Build storage-adapters/generic-fs second
  const genericFsDirectory = path.join(
    repositoryRoot,
    'packages',
    'storage-adapters',
    'generic-fs',
  )
  await runNpmBuild(genericFsDirectory)
  console.log(`Built ${path.relative(repositoryRoot, genericFsDirectory)}`)

  // 3) Build everything else in parallel
  const groups = [
    { dir: path.join(repositoryRoot, 'packages', 'base'), exclude: new Set(['core']) },
    { dir: path.join(repositoryRoot, 'packages', 'devtools'), exclude: new Set() },
    { dir: path.join(repositoryRoot, 'packages', 'integrations'), exclude: new Set() },
    {
      dir: path.join(repositoryRoot, 'packages', 'storage-adapters'),
      exclude: new Set(['generic-fs']),
    },
    { dir: path.join(repositoryRoot, 'packages', 'reactivity-adapters'), exclude: new Set() },
  ]

  /**
  Collect package directories that actually have a build script
   */
  const directoriesToBuild = []
  for (const g of groups) {
    const subdirs = await listSubdirs(g.dir)
    for (const d of subdirs) {
      const name = path.basename(d)
      if (g.exclude.has(name)) continue
      if (await hasBuildScript(d)) {
        directoriesToBuild.push(d)
      } else {
        console.log(`[skip] ${path.relative(repositoryRoot, d)} (no npm run build)`)
      }
    }
  }

  if (directoriesToBuild.length === 0) {
    console.log('Nothing else to build.')
    return
  }

  const cpuCount = os.cpus ? os.cpus().length : 1
  const maxConcurrency = Math.max(1, Math.trunc(Number(process.env.BUILD_CONCURRENCY || '')) || cpuCount)

  console.log(`Building ${directoriesToBuild.length} packages in parallel (up to ${maxConcurrency} workers)`)
  await runInPool(
    directoriesToBuild,
    async (directory) => {
      await runNpmBuild(directory)
      console.log(`Built ${path.relative(repositoryRoot, directory)}`)
    },
    maxConcurrency,
  )

  console.log('✅ All builds completed successfully.')
}

void (async () => {
  try {
    await main()
  } catch (error) {
    console.error('❌ build-all failed:\n', error && error.stack ? error.stack : error)
    process.exit(1)
  }
})()
