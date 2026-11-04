#!/usr/bin/env node
/**
 * Carter in the cloud (Render, or any always-on server).
 *
 *   npm run cloud
 *
 * One process for the platform to watch, running:
 *   - the brain, which also serves Carter's screen, on the platform's $PORT
 *   - WhatsApp (shows its linking QR code at /whatsapp-qr?key=…)
 *   - the reminder caller
 *
 * Needs, as environment variables: ANTHROPIC_API_KEY (Carter's brain) and
 * CARTER_ACCESS_KEY (the secret in your phone link). Keep CARTER_HOME on a
 * persistent disk so memory and the WhatsApp link survive restarts.
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import process from 'node:process'

const env = { ...process.env, CARTER_CLOUD: '1' }

if (!env.CARTER_ACCESS_KEY || env.CARTER_ACCESS_KEY.length < 16) {
  console.error(
    '[carter:cloud] CARTER_ACCESS_KEY is missing or too short (use at least 16 random\n' +
      'characters). Without it nobody could use Carter remotely. Set it in the\n' +
      "service's Environment settings and redeploy.",
  )
  process.exit(1)
}
if (!env.ANTHROPIC_API_KEY) {
  console.warn('[carter:cloud] ANTHROPIC_API_KEY is not set — Carter will not be able to think.')
}
if (env.CARTER_HOME) mkdirSync(env.CARTER_HOME, { recursive: true })

const children = []
let stopping = false

function run(name, script, critical) {
  const start = () => {
    const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    const tag = (d) =>
      d
        .toString()
        .split('\n')
        .filter(Boolean)
        .map((l) => `${name} ${l}`)
        .join('\n')
    child.stdout.on('data', (d) => console.log(tag(d)))
    child.stderr.on('data', (d) => console.error(tag(d)))
    child.on('exit', (code) => {
      if (stopping) return
      if (critical) {
        // Let the platform restart the whole service.
        console.error(`[carter:cloud] ${name} exited (${code}) — stopping so the service restarts.`)
        shutdown(1)
      } else {
        console.error(`[carter:cloud] ${name} exited (${code}) — restarting it in 10 seconds.`)
        setTimeout(start, 10_000)
      }
    })
    children.push(child)
  }
  start()
}

function shutdown(code) {
  if (stopping) return
  stopping = true
  for (const c of children) {
    try {
      c.kill('SIGTERM')
    } catch {
      /* gone */
    }
  }
  setTimeout(() => process.exit(code), 500)
}

process.on('SIGTERM', () => shutdown(0))
process.on('SIGINT', () => shutdown(0))

console.log(`[carter:cloud] starting Carter on port ${env.PORT ?? 8788}`)
run('brain', 'bridge/server.mjs', true)
if (env.CARTER_WHATSAPP !== 'off') run('whatsapp', 'bridge/whatsapp.mjs', false)
// The reminder caller only has work to do once an alert channel is set up.
if (env.CARTER_TELEGRAM_USER || env.CARTER_NTFY_TOPIC || env.TWILIO_ACCOUNT_SID) {
  run('reminders', 'bridge/reminders.mjs', false)
} else {
  console.log('[carter:cloud] reminder calls are off (no Twilio / Telegram / ntfy settings).')
}
