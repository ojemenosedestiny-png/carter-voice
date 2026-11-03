/**
 * Carter on WhatsApp — control Carter from your phone, anywhere.
 *
 *   npm run whatsapp
 *
 * This links Carter to YOUR WhatsApp account as a linked device (the same way
 * WhatsApp Web works). The first run shows a QR code: on your phone open
 * WhatsApp → Settings → Linked devices → Link a device, and scan it.
 *
 * Then open the "Message yourself" chat on your phone (tap New chat → your own
 * name at the top) and type to Carter there. Carter only ever reads and
 * answers that one chat, so nobody else who messages you can command it. To
 * also allow other numbers, set CARTER_WHATSAPP_ALLOW to a comma-separated
 * list of numbers in international format without "+" (e.g. 2348012345678).
 *
 * Commands in the chat:  /new  starts a fresh conversation.
 *                        /help shows what Carter can do.
 *
 * Note: this uses an unofficial WhatsApp Web client (Baileys). Using it only
 * for your own self-chat is low-risk, but WhatsApp does not officially
 * support it, so never use it to send bulk or unsolicited messages.
 */

import './env.mjs'
import {
  makeWASocket,
  useMultiFileAuthState as loadWhatsAppAuth,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  Browsers,
} from 'baileys'
import { query } from '@anthropic-ai/claude-agent-sdk'
import qrTerminal from 'qrcode-terminal'
import pino from 'pino'
import QRCode from 'qrcode'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { ALLOW_WRITES, MODEL, EFFORT, MCP_SERVERS, decideTool } from './policy.mjs'
import { memoryServer, CARTER_HOME } from './memory.mjs'

const AUTH_DIR = join(CARTER_HOME, 'whatsapp-auth')
const QR_FILE = join(CARTER_HOME, 'whatsapp-qr.png')
mkdirSync(AUTH_DIR, { recursive: true })

const ALLOW = new Set(
  (process.env.CARTER_WHATSAPP_ALLOW ?? '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean),
)

const PREFIX = '🟡 *Carter*\n'
const MAX_CHUNK = 3500

const SYSTEM_PROMPT = `You are CARTER, a private assistant built for and owned by
one person: the founder. They are messaging you on WhatsApp from their phone.

Style: short, clear chat messages. Lead with the answer. A few sentences, or a
short list when there are several items. WhatsApp formatting only: *bold*,
_italic_, and simple "- " lists. No markdown headings, no tables. Never pad,
never apologise, no filler like "Great question" or "Sure!".

You have tools: web search and fetch, the founder's memory (carter_memory),
and any connected services such as Gmail and Google Calendar. Use them rather
than guessing, and do not narrate that you are using them.

Memory: save anything the founder asks you to remember, any reminder, and any
decision or fact about them or their business, with \`remember\`. Before saying
you do not know something about them, \`recall\` it first.

Reminders: a reminder with a due time (local YYYY-MM-DDTHH:MM) makes Carter
PHONE the founder at that time and keep calling until it is done. When they say
they have done something, \`recall\` the reminder and \`forget\` it with mode
"done" so the calls stop.

Daily briefing, when asked ("briefing", "good morning", "what's my day"):
today's date, today's calendar events with times, unread email from real people
that needs them, and open reminders. Skip any source that is not connected.

Research: search several sources, then give a tight summary with the key
findings and one line of source names. Remember the conclusion if it concerns
their business.

Before anything that sends, deletes, buys or posts on their behalf, state in
one line exactly what you are about to do.${
  ALLOW_WRITES
    ? ''
    : `

Read-only mode is on: you can look things up and remember things, but you
cannot send email, change the calendar or take other actions. If asked, say
that actions are switched off on the computer.`
}`

/** One running conversation per chat, continued with the SDK's resume. */
const sessions = new Map()
/** Ids of messages Carter itself sent, so its own replies are never answered. */
const sentByCarter = new Set()
/** One answer at a time per chat, in order. */
const queues = new Map()

async function askCarter(chat, text) {
  const options = {
    model: MODEL,
    effort: EFFORT,
    maxTurns: 24,
    cwd: homedir(),
    settingSources: [],
    permissionMode: 'default',
    systemPrompt: `${SYSTEM_PROMPT}\n\nRight now it is ${new Date().toString()}.`,
    mcpServers: { ...MCP_SERVERS, carter_memory: memoryServer() },
    canUseTool: async (toolName) => {
      const ok = decideTool(toolName)
      console.log(`[carter:whatsapp] tool ${toolName} -> ${ok ? 'allow' : 'deny'}`)
      return ok
        ? { behavior: 'allow' }
        : {
            behavior: 'deny',
            message:
              'Blocked: Carter is in read-only mode. Tell the founder this ' +
              'action is switched off on the computer.',
          }
    },
  }
  const previous = sessions.get(chat)
  if (previous) options.resume = previous

  let answer = ''
  for await (const msg of query({ prompt: text, options })) {
    if (msg.session_id) sessions.set(chat, msg.session_id)
    if (msg.type === 'result') {
      if (msg.subtype === 'success') answer = msg.result ?? ''
      else {
        console.error('[carter:whatsapp] turn failed:', msg.subtype, msg.errors ?? '')
        answer = 'I could not finish that one. Please try again, or send /new to start fresh.'
      }
    }
  }
  return answer.trim() || 'Done.'
}

function chunks(text) {
  const out = []
  let rest = text
  while (rest.length > MAX_CHUNK) {
    let cut = rest.lastIndexOf('\n', MAX_CHUNK)
    if (cut < MAX_CHUNK / 2) cut = MAX_CHUNK
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  out.push(rest)
  return out
}

const textOf = (m) =>
  m.message?.conversation ??
  m.message?.extendedTextMessage?.text ??
  m.message?.imageMessage?.caption ??
  m.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
  m.message?.ephemeralMessage?.message?.conversation ??
  null

const HELP = `${PREFIX}Here is what I can do from your phone:
- Ask me anything, or say *research …* for a short report
- *briefing* — today's calendar, important email and reminders
- *remember …* / *remind me …* — I keep it on your computer
- *what do you remember about …*
- */new* — start a fresh conversation`

async function start() {
  const { state, saveCreds } = await loadWhatsAppAuth(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}))

  const sock = makeWASocket({
    auth: state,
    ...(version ? { version } : {}),
    browser: Browsers.windows('Carter'),
    // Baileys logs every frame by default; keep only real problems.
    logger: pino({ level: process.env.CARTER_DEBUG === '1' ? 'debug' : 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u) => {
    if (u.qr) {
      console.log('\nScan this QR code with WhatsApp on your phone:')
      console.log('  WhatsApp → Settings → Linked devices → Link a device\n')
      qrTerminal.generate(u.qr, { small: true })
      try {
        await QRCode.toFile(QR_FILE, u.qr, { width: 420, margin: 2 })
        console.log(`\nIf the code above is hard to scan, open this image instead:\n  ${QR_FILE}\n`)
      } catch {
        /* the terminal code is enough */
      }
    }
    if (u.connection === 'open') {
      const me = sock.user
      console.log(`[carter:whatsapp] connected as ${me?.name ?? ''} ${me?.id ?? ''}`)
      console.log('[carter:whatsapp] message Carter in your "Message yourself" chat.')
      console.log(
        `[carter:whatsapp] model ${MODEL} · ${ALLOW_WRITES ? 'actions ENABLED' : 'read-only'}`,
      )
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        console.log(
          '[carter:whatsapp] this device was logged out. Delete the folder ' +
            `${AUTH_DIR} and run npm run whatsapp again to re-link.`,
        )
        process.exit(1)
      }
      const why = u.lastDisconnect?.error?.message ?? 'unknown reason'
      console.log(`[carter:whatsapp] connection closed (${why}), reconnecting…`)
      setTimeout(() => void start(), 3000)
    }
  })

  const isSelfChat = (jid) => {
    const me = sock.user
    if (!me || !jid) return false
    const n = jidNormalizedUser(jid)
    return n === jidNormalizedUser(me.id) || (me.lid && n === jidNormalizedUser(me.lid))
  }

  const isAllowed = (m) => {
    const jid = m.key.remoteJid
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return false
    if (m.key.fromMe) return isSelfChat(jid)
    if (!ALLOW.size) return false
    const number = (m.key.senderPn ?? m.key.remoteJidAlt ?? jid).split('@')[0].split(':')[0]
    return ALLOW.has(number)
  }

  const reply = async (jid, text) => {
    for (const part of chunks(text)) {
      const sent = await sock.sendMessage(jid, { text: PREFIX + part })
      if (sent?.key?.id) sentByCarter.add(sent.key.id)
    }
  }

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      if (!m.message || sentByCarter.has(m.key.id)) continue
      const text = textOf(m)?.trim()
      if (!text || text.startsWith(PREFIX.trim())) continue
      if (!isAllowed(m)) continue

      const jid = m.key.remoteJid
      console.log(`[carter:whatsapp] ← ${text.slice(0, 80)}`)

      const run = async () => {
        if (/^\/new\b/i.test(text)) {
          sessions.delete(jid)
          return reply(jid, 'Fresh conversation started.')
        }
        if (/^\/help\b/i.test(text)) {
          const sent = await sock.sendMessage(jid, { text: HELP })
          if (sent?.key?.id) sentByCarter.add(sent.key.id)
          return
        }
        await sock.sendPresenceUpdate('composing', jid).catch(() => {})
        try {
          const answer = await askCarter(jid, text)
          await reply(jid, answer)
          console.log(`[carter:whatsapp] → ${answer.slice(0, 80)}`)
        } catch (err) {
          console.error('[carter:whatsapp] error:', err)
          await reply(jid, 'Something went wrong on the computer. Check the Carter window.')
        } finally {
          await sock.sendPresenceUpdate('paused', jid).catch(() => {})
        }
      }
      const prev = queues.get(jid) ?? Promise.resolve()
      queues.set(jid, prev.then(run, run))
    }
  })
}

console.log('Carter WhatsApp channel — starting…')
start().catch((err) => {
  console.error('[carter:whatsapp] failed to start:', err)
  process.exit(1)
})
