/**
 * Carter's reminder caller — phones the founder when a reminder falls due, and
 * keeps calling until it is marked done.
 *
 *   node bridge/reminders.mjs        (npm start runs this for you)
 *
 * Calls go through Twilio, which can ring any phone in the world. Set these
 * once (Windows: `setx NAME "value"`, then open a new terminal):
 *
 *   TWILIO_ACCOUNT_SID   from console.twilio.com
 *   TWILIO_AUTH_TOKEN    from console.twilio.com
 *   TWILIO_FROM          your Twilio phone number, e.g. +15551234567
 *   CARTER_PHONE         YOUR phone number, e.g. +2348012345678
 *
 * Optional:
 *   CARTER_REMIND_EVERY_MIN   minutes between repeat calls (default 30)
 *   CARTER_REMIND_MAX_CALLS   calls per reminder before giving up (default 3)
 *
 * A reminder with a date but no time is called at 9:00 that morning. Tell
 * Carter "I've done it" (by voice or WhatsApp) and the calls stop.
 */

import './env.mjs'
import { dueReminders, markCalled } from './memory.mjs'

const SID = process.env.TWILIO_ACCOUNT_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = process.env.TWILIO_FROM
const TO = process.env.CARTER_PHONE
const EVERY_MIN = Number(process.env.CARTER_REMIND_EVERY_MIN || 30)
const MAX_CALLS = Number(process.env.CARTER_REMIND_MAX_CALLS || 3)
const CHECK_MS = 60_000

const configured = Boolean(SID && TOKEN && FROM && TO)

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

async function call(text) {
  const say = escapeXml(text)
  const twiml =
    `<Response><Pause length="1"/>` +
    `<Say voice="Polly.Amy">Hello founder, this is Carter with a reminder. ${say}.</Say>` +
    `<Pause length="1"/>` +
    `<Say voice="Polly.Amy">Again: ${say}. Tell me when it is done and I will stop calling.</Say>` +
    `</Response>`
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: TO, From: FROM, Twiml: twiml }),
    },
  )
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

async function tick() {
  const now = Date.now()
  for (const r of dueReminders(now)) {
    const calls = r.calls ?? 0
    if (calls >= MAX_CALLS) continue
    if (r.lastCalled && now - Date.parse(r.lastCalled) < EVERY_MIN * 60_000) continue
    try {
      await call(r.text)
      markCalled(r.id)
      console.log(`[carter:reminders] called about: ${r.text} (call ${calls + 1}/${MAX_CALLS})`)
    } catch (err) {
      console.error('[carter:reminders] call failed:', err.message)
    }
  }
}

if (!configured) {
  console.log(
    '[carter:reminders] phone calls are off — set TWILIO_ACCOUNT_SID, ' +
      'TWILIO_AUTH_TOKEN, TWILIO_FROM and CARTER_PHONE to turn them on.',
  )
} else {
  console.log(
    `[carter:reminders] will call ${TO} when reminders fall due ` +
      `(every ${EVERY_MIN} min, up to ${MAX_CALLS} calls, until marked done).`,
  )
  void tick()
  setInterval(() => void tick(), CHECK_MS)
}
