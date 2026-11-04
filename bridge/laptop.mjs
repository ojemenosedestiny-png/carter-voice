/**
 * The laptop link, cloud side.
 *
 * The founder's laptop runs `npm run laptop` (bridge/laptop-link.mjs), which
 * dials out to this brain on /laptop and waits for work. Carter — asked by
 * voice on the phone, or on WhatsApp — hands it a task with `laptop_do`, the
 * laptop's own Carter carries it out with full access to that machine (files,
 * programs, VS Code, Chrome) and reports back.
 *
 * Dialling out from the laptop means nothing on the laptop is exposed to the
 * internet, and it works through any home router. The connection carries the
 * same access key as everything else.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

let laptop = null
let laptopName = ''
const pending = new Map()
let seq = 0

export const laptopOnline = () => Boolean(laptop && laptop.readyState === 1)

/** Take a freshly connected laptop socket. A newer one replaces an older one. */
export function attachLaptop(socket, name = 'laptop') {
  if (laptop && laptop !== socket) {
    try {
      laptop.close(4000, 'replaced by a newer connection')
    } catch {
      /* already gone */
    }
  }
  laptop = socket
  laptopName = name
  console.log(`[carter] laptop linked: ${name}`)

  // Keep the connection alive through proxies that close idle sockets.
  const ping = setInterval(() => {
    try {
      socket.ping()
    } catch {
      /* closing */
    }
  }, 25_000)

  socket.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.type === 'hello' && typeof msg.name === 'string') laptopName = msg.name
    if (msg.type === 'result' && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      clearTimeout(p.timer)
      p.resolve(String(msg.text ?? '').trim() || 'Done.')
    }
  })

  socket.on('close', () => {
    clearInterval(ping)
    if (laptop !== socket) return
    laptop = null
    console.log('[carter] laptop disconnected')
    for (const [id, p] of pending) {
      clearTimeout(p.timer)
      p.resolve('The laptop disconnected before finishing. It may have gone to sleep or lost its connection.')
      pending.delete(id)
    }
  })
}

/** Send one task to the laptop and wait for its report. */
export function runOnLaptop(task, timeoutMs = 10 * 60_000) {
  if (!laptopOnline()) {
    return Promise.resolve(
      'The laptop is not connected right now. It needs to be switched on with "Link Laptop to Carter" running.',
    )
  }
  const id = `t${++seq}`
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve('The laptop is still working on it after ten minutes; it will carry on, but I stopped waiting.')
    }, timeoutMs)
    pending.set(id, { resolve, timer })
    laptop.send(JSON.stringify({ type: 'task', id, task }))
    console.log(`[carter] → laptop: ${task.slice(0, 100)}`)
  })
}

export const LAPTOP_TOOL_DESCRIPTION =
  "Do something on the founder's laptop: open or use programs, VS Code and code " +
  'projects, files and folders, the Chrome browser (signed in as the founder), ' +
  'downloads, settings, running commands. Give one complete, specific ' +
  'instruction — the laptop carries it out on its own and reports back. Use ' +
  'laptop_status first if unsure whether the laptop is on.'

export function laptopServer() {
  return createSdkMcpServer({
    name: 'carter_laptop',
    version: '1.0.0',
    alwaysLoad: true,
    tools: [
      tool(
        'laptop_do',
        LAPTOP_TOOL_DESCRIPTION,
        { task: z.string().min(3).describe('The complete instruction, e.g. "Open VS Code in the carter-voice project and show me the README".') },
        async ({ task }) => ({ content: [{ type: 'text', text: await runOnLaptop(task) }] }),
      ),
      tool(
        'laptop_status',
        "Whether the founder's laptop is connected and able to take tasks.",
        {},
        async () => ({
          content: [
            {
              type: 'text',
              text: laptopOnline()
                ? `The laptop (${laptopName}) is connected.`
                : 'The laptop is not connected (switched off, asleep, or the link is not running).',
            },
          ],
        }),
      ),
    ],
  })
}
