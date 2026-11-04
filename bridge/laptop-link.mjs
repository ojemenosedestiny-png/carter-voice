/**
 * The laptop link, laptop side — Carter's hands on the founder's laptop.
 *
 *   npm run laptop          (read-only: looks and reports, changes nothing)
 *   npm run laptop:full     (full control: programs, files, VS Code, Chrome)
 *
 * Dials out to the Carter running in the cloud (CARTER_CLOUD_URL, with
 * CARTER_ACCESS_KEY) and waits for tasks. Each task is carried out here by a
 * local Carter with access to this machine, and the result is sent back to be
 * spoken on the phone or sent on WhatsApp. Reconnects on its own if the
 * connection drops or the laptop wakes from sleep.
 */

import './env.mjs'
import WebSocket from 'ws'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { homedir, hostname, platform } from 'node:os'
import { ALLOW_WRITES, MODEL, EFFORT, MCP_SERVERS, decideTool } from './policy.mjs'
import { chromeServer } from './chrome.mjs'

const CLOUD = (process.env.CARTER_CLOUD_URL || '').replace(/\/+$/, '')
const KEY = process.env.CARTER_ACCESS_KEY || ''

if (!CLOUD || !KEY || /PASTE/i.test(KEY)) {
  console.log(
    "\n  The laptop link needs Carter's cloud address and access key. Run once in\n" +
      '  PowerShell (with your own values), then open a new window and start again:\n\n' +
      '    setx CARTER_CLOUD_URL "https://carter-yxnu.onrender.com"\n' +
      '    setx CARTER_ACCESS_KEY "your-CARTER_ACCESS_KEY-from-Render"\n',
  )
  process.exit(1)
}

const SYSTEM = `You are Carter's hands on the founder's own ${platform() === 'win32' ? 'Windows ' : ''}laptop.
Carter (their assistant, running in the cloud) has passed you one task from the
founder. Carry it out completely, on this machine, using your tools:
- Shell commands for programs, files and folders. On Windows, open things with
  \`start "" "<file or app>"\`; open VS Code with \`code "<folder or file>"\`.
- Read and edit files directly for code and documents.
- The \`chrome_*\` tools drive the founder's own Chrome (signed in as them):
  open pages, read them, and act on them.
Work quietly and efficiently. Do not ask questions — choose the sensible
interpretation. When finished, reply with a short report for Carter to speak
to the founder: what you did and the result, two or three plain sentences, no
markdown. If something could not be done, say exactly why.${
  ALLOW_WRITES
    ? ''
    : `

This link is in READ-ONLY mode: you may look at files, pages and the system,
but must not change, create, delete, send or install anything. If the task
needs that, say the laptop link must be started with full control.`
}`

let busy = Promise.resolve()

async function runTask(task) {
  let answer = ''
  try {
    for await (const msg of query({
      prompt: task,
      options: {
        model: MODEL,
        effort: EFFORT,
        maxTurns: 40,
        cwd: homedir(),
        settingSources: [],
        permissionMode: 'default',
        systemPrompt: `${SYSTEM}\n\nRight now it is ${new Date().toString()}.`,
        mcpServers: {
          ...MCP_SERVERS,
          carter_chrome: chromeServer({ allowWrites: ALLOW_WRITES }),
        },
        canUseTool: async (toolName) => {
          const ok = decideTool(toolName)
          console.log(`[laptop] tool ${toolName} -> ${ok ? 'allow' : 'deny'}`)
          return ok
            ? { behavior: 'allow' }
            : {
                behavior: 'deny',
                message:
                  'Blocked: the laptop link is in read-only mode. Report that this needs ' +
                  '"Link Laptop to Carter (full control)".',
              }
        },
      },
    })) {
      if (msg.type === 'result') {
        answer = msg.subtype === 'success' ? (msg.result ?? '') : `The laptop could not finish: ${msg.subtype}.`
      }
    }
  } catch (err) {
    answer = `The laptop hit an error: ${err?.message ?? err}`
  }
  return answer.trim() || 'Done.'
}

let delay = 2000

function connect() {
  const url = `${CLOUD.replace(/^http/, 'ws')}/laptop?key=${encodeURIComponent(KEY)}`
  const ws = new WebSocket(url, { headers: { origin: CLOUD } })

  ws.on('open', () => {
    delay = 2000
    ws.send(JSON.stringify({ type: 'hello', name: hostname() }))
    console.log(
      `[laptop] linked to Carter at ${CLOUD} — ${ALLOW_WRITES ? 'FULL CONTROL' : 'read-only'}. ` +
        'Ask Carter on your phone to do something on your laptop.',
    )
  })

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.type !== 'task' || typeof msg.task !== 'string') return
    console.log(`[laptop] ← ${msg.task}`)
    // One task at a time, in order.
    busy = busy.then(async () => {
      const text = await runTask(msg.task)
      console.log(`[laptop] → ${text.slice(0, 160)}`)
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: msg.id, text }))
    })
  })

  ws.on('unexpected-response', (_req, res) => {
    console.log(
      res.statusCode === 401
        ? '[laptop] Carter refused the access key — check CARTER_ACCESS_KEY matches Render.'
        : `[laptop] Carter answered ${res.statusCode}; retrying.`,
    )
  })
  ws.on('error', (err) => console.log(`[laptop] connection problem: ${err.message}`))
  ws.on('close', () => {
    console.log(`[laptop] not connected — trying again in ${Math.round(delay / 1000)}s`)
    setTimeout(connect, delay)
    delay = Math.min(delay * 2, 60_000)
  })
}

console.log('Carter laptop link — starting…')
connect()
