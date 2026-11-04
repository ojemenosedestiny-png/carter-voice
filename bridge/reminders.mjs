/**
 * Carter's reminder caller — alerts the founder when a reminder falls due, and
 * keeps alerting until it is marked done.
 *
 *   node bridge/reminders.mjs        (npm start runs this for you)
 *
 * Three ways to reach you. Turn on any of them (Windows: `setx NAME "value"`,
 * then open a new terminal); every one that is set is used each time.
 *
 * 1. Telegram call — FREE, a real ringing call in Telegram that reads the
 *    reminder aloud, through the CallMeBot service.
 *      CARTER_TELEGRAM_USER   your Telegram username, e.g. @founder
 *    First allow CallMeBot to call you: in Telegram, open @CallMeBot_txtbot
 *    and press Start (see the README).
 *
 * 2. ntfy alarm — FREE, an urgent notification from the ntfy phone app.
 *      CARTER_NTFY_TOPIC      a long secret name you invent, e.g. carter-x7k29q
 *    Install the ntfy app and subscribe to that same topic name.
 *
 * 3. Twilio phone call — paid, rings your normal phone number.
 *      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, CARTER_PHONE
 *
 * Optional:
 *   CARTER_REMIND_EVERY_MIN   minutes between repeats (default 30)
 *   CARTER_REMIND_MAX_CALLS   alerts per reminder before giving up (default 3)
 *
 * A reminder with a date but no time alerts at 9:00 that morning. Tell Carter
 * "I've done it" (by voice or WhatsApp) and the alerts stop.
 */

import './env.mjs'
import { dueReminders, markCalled } from './memory.mjs'

const env = process.env
const EVERY_MIN = Number(env.CARTER_REMIND_EVERY_MIN || 30)
const MAX_CALLS = Number(env.CARTER_REMIND_MAX_CALLS || 3)
const CHECK_MS = 60_000

const spoken = (text) =>
  `Hello founder, this is Carter with a reminder. ${text}. ` +
  `Tell me when it is done and I will stop reminding you.`

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

async function check(res, name) {
  const body = await res.text()
  if (!res.ok) throw new Error(`${name} ${res.status}: ${body.slice(0, 300)}`)
  return body
}

/** Every alert channel that is configured, by name. */
const channels = []

if (env.CARTER_TELEGRAM_USER) {
  const user = env.CARTER_TELEGRAM_USER.startsWith('@')
    ? env.CARTER_TELEGRAM_USER
    : `@${env.CARTER_TELEGRAM_USER}`
  channels.push({
    name: `Telegram call to ${user}`,
    send: async (text) => {
      const url =
        'https://api.callmebot.com/start.php?' +
        new URLSearchParams({ user, text: spoken(text), lang: 'en-GB-Standard-B', rpt: '2' })
      const body = await check(await fetch(url), 'CallMeBot')
      // CallMeBot answers 200 even when it refuses, so read what it said.
      if (/not authori[sz]ed|error|invalid/i.test(body) && !/queued|call/i.test(body)) {
        throw new Error(`CallMeBot: ${body.replace(/<[^>]+>/g, ' ').trim().slice(0, 200)}`)
      }
    },
  })
}

if (env.CARTER_NTFY_TOPIC) {
  const server = (env.CARTER_NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '')
  channels.push({
    name: `ntfy alarm on topic ${env.CARTER_NTFY_TOPIC}`,
    send: async (text) => {
      await check(
        await fetch(`${server}/${encodeURIComponent(env.CARTER_NTFY_TOPIC)}`, {
          method: 'POST',
          headers: { Title: 'Carter reminder', Priority: 'urgent', Tags: 'alarm_clock' },
          body: `${text}\n\nTell Carter when it's done to stop these alerts.`,
        }),
        'ntfy',
      )
    },
  })
}

if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM && env.CARTER_PHONE) {
  const { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN } = env
  channels.push({
    name: `Twilio call to ${env.CARTER_PHONE}`,
    send: async (text) => {
      const twiml =
        `<Response><Pause length="1"/><Say voice="Polly.Amy">${escapeXml(spoken(text))}</Say>` +
        `<Pause length="1"/><Say voice="Polly.Amy">Again: ${escapeXml(text)}.</Say></Response>`
      await check(
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: env.CARTER_PHONE, From: env.TWILIO_FROM, Twiml: twiml }),
        }),
        'Twilio',
      )
    },
  })
}

async function tick() {
  const now = Date.now()
  for (const r of dueReminders(now)) {
    const calls = r.calls ?? 0
    if (calls >= MAX_CALLS) continue
    if (r.lastCalled && now - Date.parse(r.lastCalled) < EVERY_MIN * 60_000) continue
    let reached = false
    for (const ch of channels) {
      try {
        await ch.send(r.text)
        reached = true
        console.log(`[carter:reminders] ${ch.name}: ${r.text} (${calls + 1}/${MAX_CALLS})`)
      } catch (err) {
        console.error(`[carter:reminders] ${ch.name} failed:`, err.message)
      }
    }
    if (reached) markCalled(r.id)
  }
}

/** `node bridge/reminders.mjs --test` sends one test alert on every channel. */
if (process.argv.includes('--test')) {
  if (!channels.length) console.log('[carter:reminders] no alert channel is set up yet.')
  for (const ch of channels) {
    try {
      await ch.send('This is a test. Your reminders are working')
      console.log(`[carter:reminders] test sent: ${ch.name}`)
    } catch (err) {
      console.error(`[carter:reminders] test failed: ${ch.name}:`, err.message)
    }
  }
} else if (!channels.length) {
  console.log(
    '[carter:reminders] reminder alerts are off — set CARTER_TELEGRAM_USER ' +
      '(free Telegram call) or CARTER_NTFY_TOPIC (free alarm) to turn them on.',
  )
} else {
  console.log(
    `[carter:reminders] alerts on: ${channels.map((c) => c.name).join(', ')} ` +
      `(every ${EVERY_MIN} min, up to ${MAX_CALLS} times, until marked done).`,
  )
  void tick()
  setInterval(() => void tick(), CHECK_MS)
}
