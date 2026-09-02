#!/usr/bin/env node
/**
 * Local development against a physical device.
 *
 * A device on Wi-Fi can reach Metro on the LAN but cannot reach the backend on localhost, so this
 * starts the backend, opens a Cloudflare quick tunnel to it, and hands the resulting public URL to
 * Expo as EXPO_PUBLIC_API_URL.
 *
 * Why the env var rather than editing .env: @expo/env loads .env files with
 * "already defined and IS NOT overwritten" semantics (see @expo/env/build/index.js), so a value in
 * the child's environment wins over frontend/.env. Nothing on disk changes, and the tunnel URL —
 * which is different every run — never gets committed by accident.
 *
 * Usage:
 *   npm run dev:device          Metro only; use when the dev client is already installed
 *   npm run dev:device -- --build   also rebuild and reinstall the native app on the device
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND_DIR = path.resolve(FRONTEND_DIR, '..', 'backend')
const PORT = Number(process.env.PORT) || 3000
const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
const BACKEND_READY_TIMEOUT_MS = 60_000
const TUNNEL_READY_TIMEOUT_MS = 45_000

const children = []
let shuttingDown = false

const log = (scope, message) => process.stdout.write(`\x1b[2m[${scope}]\x1b[0m ${message}\n`)

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  // The tunnel and the backend both outlive this process if left alone, and a stray tunnel keeps a
  // public URL pointed at a port that something else may later occupy.
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
  process.exit(code)
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(0))

function track(scope, child, { onLine } = {}) {
  children.push(child)
  child.on('error', (error) => {
    if (error.code === 'ENOENT') {
      log(scope, `\x1b[31mnot found.\x1b[0m ${scope === 'tunnel' ? 'Install it with: brew install cloudflared' : ''}`)
    } else {
      log(scope, `\x1b[31m${error.message}\x1b[0m`)
    }
    shutdown(1)
  })
  child.on('exit', (code) => {
    if (!shuttingDown) {
      log(scope, `exited with code ${code} — shutting everything down`)
      shutdown(code ?? 1)
    }
  })
  // cloudflared prints its URL to stderr, so both streams are watched.
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) log(scope, line)
        onLine?.(line)
      }
    })
  }
  return child
}

const isPortOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const done = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(1000, () => done(false))
  })

async function waitFor(label, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  log('dev', `\x1b[31mtimed out waiting for ${label} after ${timeoutMs / 1000}s\x1b[0m`)
  shutdown(1)
}

async function main() {
  const wantsBuild = process.argv.includes('--build')

  // Reuse a backend that is already up rather than racing it for the port — a second listener would
  // die on EADDRINUSE and take this script down with it.
  if (await isPortOpen(PORT)) {
    log('backend', `already listening on :${PORT}, reusing it`)
  } else {
    log('backend', `starting on :${PORT}`)
    track('backend', spawn('npm', ['run', 'dev'], { cwd: BACKEND_DIR, stdio: ['ignore', 'pipe', 'pipe'] }))
    await waitFor(`backend on :${PORT}`, () => isPortOpen(PORT), BACKEND_READY_TIMEOUT_MS)
    log('backend', 'ready')
  }

  let apiUrl = null
  log('tunnel', `opening a Cloudflare quick tunnel to :${PORT}`)
  track(
    'tunnel',
    spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    {
      onLine: (line) => {
        const match = line.match(TUNNEL_URL)
        if (match && !apiUrl) apiUrl = match[0]
      },
    },
  )
  await waitFor('the tunnel URL', () => apiUrl !== null, TUNNEL_READY_TIMEOUT_MS)

  log('dev', `EXPO_PUBLIC_API_URL=${apiUrl}`)
  log('dev', '\x1b[33mthis URL is public while the tunnel is open — anyone with it can reach your backend\x1b[0m')

  // stdio inherit: Metro's interactive keypresses (r to reload, j to debug) need a real TTY.
  const expoArgs = wantsBuild ? ['expo', 'run:ios', '--device'] : ['expo', 'start', '--dev-client']
  track(
    'expo',
    spawn('npx', expoArgs, {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
    }),
  )
}

main()
