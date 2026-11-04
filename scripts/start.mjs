/**
 * One command to run Carter: the bridge (brain) and the Vite dev server (face)
 * together, so a student types `npm start` and nothing else.
 *
 * Two long-running processes normally mean two terminals. This launcher spawns
 * both as children, tags their output so you can tell them apart, and shuts
 * them down together on Ctrl-C — no extra dependency, just Node.
 *
 * Pass --writes to allow Carter to take real actions (drive the phone, the
 * browser, send things): `npm start -- --writes`.
 */

import { spawn } from 'node:child_process'
import process from 'node:process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import qrTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Put MediaPipe's WebAssembly where the page can actually load it.
 *
 * Hand tracking needs a WASM runtime, and the usual recipe fetches it from a
 * CDN. That fails here twice over. The page's CSP names no CDN in `script-src`,
 * and the runtime arrives as a script — so it is blocked, and the failure
 * surfaces as gesture control simply never starting. And a CDN import is a live
 * supply-chain dependency: executable code, re-resolved on every load, that we
 * do not control and cannot pin against being changed under us.
 *
 * Copying it out of node_modules solves both. It is served from our own origin,
 * so `'self'` covers it; and it is the exact bytes of the version in the
 * lockfile. It stays out of git — 34 MB of build output does not belong in a
 * repository — and is re-copied whenever it is missing, which costs nothing
 * after the first run.
 */
function vendorWasm() {
  const from = 'node_modules/@mediapipe/tasks-vision/wasm'
  const to = 'public/mediapipe'
  if (!existsSync(from)) return // gesture control is optional; carry on without it
  if (existsSync(`${to}/vision_wasm_internal.wasm`)) return
  try {
    mkdirSync(to, { recursive: true })
    cpSync(from, to, { recursive: true })
    console.log('  vendored the hand-tracking runtime into public/mediapipe.')
  } catch (err) {
    console.warn(`  could not vendor the hand-tracking runtime: ${err.message}`)
  }
}

const writes = process.argv.includes('--writes')

// A dim label per process, so the interleaved logs stay readable.
const paint = (tag, colour) => (line) =>
  line
    .toString()
    .split('\n')
    .filter((l) => l.length)
    .map((l) => `\x1b[${colour}m${tag}\x1b[0m ${l}`)
    .join('\n')

const children = []

function run(name, command, args, colour, env, critical = true) {
  const label = paint(name, colour)
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    shell: false,
  })
  child.stdout.on('data', (d) => process.stdout.write(label(d) + '\n'))
  child.stderr.on('data', (d) => process.stderr.write(label(d) + '\n'))
  child.on('exit', (code) => {
    if (!critical) {
      console.log(`\x1b[${colour}m${name}\x1b[0m exited (${code}); the voice interface keeps running.`)
      return
    }
    // If either half dies the other is useless, so take the whole thing down
    // rather than leave a half-running app that looks alive but cannot answer.
    console.log(`\x1b[${colour}m${name}\x1b[0m exited (${code}); stopping the rest.`)
    shutdown(code ?? 0)
  })
  children.push(child)
  return child
}

let stopping = false
function shutdown(code) {
  if (stopping) return
  stopping = true
  for (const c of children) {
    try {
      c.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

/**
 * Tell the bridge which port the face will actually be on.
 *
 * The bridge only trusts WebSocket origins on localhost:5173-5199 and
 * 4173-4199, which is the right default — a socket that any local page can open
 * is a socket that drives every MCP server on the machine. But a launcher that
 * assigns a port outside that range produces the single most confusing failure
 * this project has: the interface loads, the reactor spins, the microphone
 * hears you, and the brain answers nothing, because the handshake is being 403'd
 * somewhere neither half reports. Passing the port through closes that gap
 * without widening what the bridge trusts by default.
 */
const port = process.env.PORT
const bridgeEnv = writes ? { JARVIS_ALLOW_WRITES: '1' } : {}
if (port) {
  bridgeEnv.JARVIS_ALLOWED_ORIGINS = `http://localhost:${port},http://127.0.0.1:${port}`
  console.log(`  serving the face on port ${port}; the bridge will accept it.\n`)
}

vendorWasm()

const carterHome = process.env.CARTER_HOME || join(homedir(), '.carter')

/**
 * Phone mode (`--phone`): reach Carter from the founder's phone, anywhere.
 *
 * The interface is the Vercel site (CARTER_WEB_URL); the brain stays here. A
 * Cloudflare quick tunnel gives this PC a temporary https address, and every
 * request through it must carry the secret access key, kept in
 * ~/.carter/access-key. The phone link (printed and shown as a QR code) holds
 * both; the phone remembers them after the first visit.
 */
const phone = process.argv.includes('--phone')
let accessKey = ''
if (phone) {
  const keyFile = join(carterHome, 'access-key')
  accessKey =
    process.env.CARTER_ACCESS_KEY ||
    (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '')
  if (!accessKey) {
    accessKey = randomBytes(24).toString('base64url')
    mkdirSync(carterHome, { recursive: true })
    writeFileSync(keyFile, accessKey)
  }
  bridgeEnv.CARTER_ACCESS_KEY = accessKey
}

console.log('\nC.A.R.T.E.R. starting — the brain and the face.\n')
run('bridge', 'node', ['bridge/server.mjs'], '36', bridgeEnv)

if (phone) {
  const web = (process.env.CARTER_WEB_URL || '').replace(/\/+$/, '')
  if (!web) {
    console.log(
      '\n  Phone mode needs your Vercel address first:\n' +
        '    setx CARTER_WEB_URL "https://your-carter.vercel.app"\n' +
        '  then open a new PowerShell window and start again.\n',
    )
  } else {
    const tunnel = spawn(
      'cloudflared',
      ['tunnel', '--url', `http://localhost:8788`, '--no-autoupdate'],
      { shell: false },
    )
    children.push(tunnel)
    let shown = false
    const watch = async (d) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(d.toString())
      if (!m || shown) return
      shown = true
      const bridge = m[0].replace(/^https/, 'wss')
      const link = `${web}/#bridge=${encodeURIComponent(bridge)}&key=${encodeURIComponent(accessKey)}`
      const png = join(carterHome, 'phone-link.png')
      try {
        await QRCode.toFile(png, link, { width: 520, margin: 2 })
      } catch {
        /* the terminal code is enough */
      }
      console.log('\n  ================= CARTER ON YOUR PHONE =================')
      console.log('  Scan this with your phone camera (or open the image below):\n')
      qrTerminal.generate(link, { small: true })
      console.log(`\n  QR image: ${png}`)
      console.log(`  Link (private — it contains your key):\n  ${link}`)
      console.log('  The tunnel address changes each time Carter starts: scan again then.')
      console.log('  ===========================================================\n')
    }
    tunnel.stdout.on('data', watch)
    tunnel.stderr.on('data', watch)
    tunnel.on('error', (err) => {
      console.log(
        err.code === 'ENOENT'
          ? '\n  cloudflared is not installed. Install it once (PowerShell):\n' +
              '    winget install --id Cloudflare.cloudflared\n' +
              '  then open a new PowerShell window and start again.\n'
          : `\n  The phone tunnel failed: ${err.message}\n`,
      )
    })
  }
}
// npm is a shell script on most systems; call the vite binary directly so we do
// not need shell:true (which would break the argument handling above).
run('face', process.execPath, ['node_modules/vite/bin/vite.js'], '35', {})

// The reminder caller: phones the founder when a reminder falls due.
run('reminders', 'node', ['bridge/reminders.mjs'], '32', {}, false)

// Carter on WhatsApp starts alongside, once it has been linked to a phone with
// `npm run whatsapp`. Until then it is skipped, because linking needs the QR
// code on screen and that belongs in its own window.
if (existsSync(join(carterHome, 'whatsapp-auth', 'creds.json'))) {
  run('whatsapp', 'node', ['bridge/whatsapp.mjs'], '33', bridgeEnv, false)
} else {
  console.log('  WhatsApp not linked yet — run `npm run whatsapp` once to link your phone.\n')
}

console.log(
  '\nWhen it says the dev server is ready, open the URL it prints in Chrome,\n' +
    'click INITIALISE, and say "Hey Carter". Ctrl-C stops everything.\n',
)
