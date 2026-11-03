/**
 * Carter's memory: notes, facts and reminders the founder asks it to keep.
 *
 * Everything is stored in one JSON file on this machine — by default
 * ~/.carter/memory.json, or $CARTER_HOME/memory.json — so the data is the
 * founder's own and never leaves the computer except as context in a
 * conversation with Carter. Open the file in any text editor to read or back
 * it up.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

export const CARTER_HOME =
  process.env.CARTER_HOME || join(homedir(), '.carter')
const FILE = join(CARTER_HOME, 'memory.json')

function load() {
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf8'))
    return Array.isArray(data.items) ? data : { items: [] }
  } catch {
    return { items: [] }
  }
}

function save(data) {
  mkdirSync(CARTER_HOME, { recursive: true })
  // Write to a temp file and rename, so a crash mid-write can never leave a
  // half-written memory file behind.
  const tmp = `${FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, FILE)
}

const newId = () =>
  `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2)

/** Simple keyword scoring — plenty for a personal notebook. */
function search(items, query) {
  const q = words(query)
  if (!q.length) return items
  return items
    .map((item) => {
      const hay = words(`${item.text} ${item.kind} ${(item.tags ?? []).join(' ')}`)
      const score = q.reduce(
        (n, w) => n + (hay.some((h) => h.startsWith(w) || w.startsWith(h)) ? 1 : 0),
        0,
      )
      return { item, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item)
}

const format = (items) =>
  items
    .map(
      (m) =>
        `[${m.id}] (${m.kind}${m.due ? `, due ${m.due}` : ''}, saved ${m.created.slice(0, 10)}) ${m.text}`,
    )
    .join('\n')

const ok = (text) => ({ content: [{ type: 'text', text }] })

/** Open reminders, soonest first — used by the daily briefing. */
export function openReminders() {
  return load()
    .items.filter((m) => m.kind === 'reminder' && !m.done)
    .sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')))
}

/**
 * When a reminder is due, as epoch ms. "YYYY-MM-DD" alone means 9:00 that
 * morning; "YYYY-MM-DDTHH:MM" (or with a space) is taken as local time.
 */
export function dueAt(due) {
  if (!due) return null
  const s = String(due).trim().replace(' ', 'T')
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T09:00` : s)
  return Number.isFinite(t) ? t : null
}

/** Reminders that are due now and not done — for the reminder caller. */
export function dueReminders(now = Date.now()) {
  return load().items.filter((m) => {
    if (m.kind !== 'reminder' || m.done) return false
    const t = dueAt(m.due)
    return t !== null && t <= now
  })
}

/** Record that the founder was called about a reminder. */
export function markCalled(id) {
  const data = load()
  const item = data.items.find((m) => m.id === id)
  if (!item) return
  item.calls = (item.calls ?? 0) + 1
  item.lastCalled = new Date().toISOString()
  save(data)
}

export function memoryServer() {
  return createSdkMcpServer({
    name: 'carter_memory',
    version: '1.0.0',
    instructions:
      "Carter's long-term memory, stored on the founder's own computer. Save " +
      'anything the founder asks you to remember, and look things up here ' +
      'before saying you do not know something about them or their business.',
    alwaysLoad: true,
    tools: [
      tool(
        'remember',
        'Save a note, fact or reminder for the founder. Reminders with a due ' +
          'time trigger a phone call to the founder. Use when they say ' +
          '"remember", "note that", "remind me", or tell you something about ' +
          'themselves or their business worth keeping.',
        {
          text: z.string().min(1).describe('What to remember, as a full sentence.'),
          kind: z
            .enum(['note', 'fact', 'reminder', 'idea', 'contact'])
            .default('note')
            .describe('reminder for anything with a deadline or follow-up.'),
          due: z
            .string()
            .optional()
            .describe(
              'For reminders: local date and time as YYYY-MM-DDTHH:MM ' +
                '(e.g. 2026-11-06T14:30). Date alone means 9:00 that morning. ' +
                'Carter phones the founder at this time until it is marked done.',
            ),
          tags: z.array(z.string()).optional(),
        },
        async (args) => {
          const data = load()
          const item = {
            id: newId(),
            kind: args.kind ?? 'note',
            text: args.text.trim(),
            ...(args.due ? { due: args.due } : {}),
            ...(args.tags?.length ? { tags: args.tags } : {}),
            created: new Date().toISOString(),
          }
          data.items.push(item)
          save(data)
          return ok(`Saved as ${item.id}.`)
        },
      ),
      tool(
        'recall',
        'Search what the founder has asked you to remember. Leave the query ' +
          'empty to list the most recent memories.',
        {
          query: z.string().optional().describe('Keywords to look for.'),
          kind: z.enum(['note', 'fact', 'reminder', 'idea', 'contact']).optional(),
          limit: z.number().int().min(1).max(50).default(15),
        },
        async (args) => {
          let items = load().items.filter((m) => !m.done)
          if (args.kind) items = items.filter((m) => m.kind === args.kind)
          items = args.query ? search(items, args.query) : [...items].reverse()
          items = items.slice(0, args.limit ?? 15)
          return ok(items.length ? format(items) : 'Nothing saved matches that.')
        },
      ),
      tool(
        'forget',
        'Delete a memory, or mark a reminder done. Use the id from recall.',
        {
          id: z.string().describe('The memory id, like m1abc2.'),
          mode: z.enum(['delete', 'done']).default('delete'),
        },
        async (args) => {
          const data = load()
          const item = data.items.find((m) => m.id === args.id)
          if (!item) return ok(`No memory with id ${args.id}.`)
          if (args.mode === 'done') item.done = new Date().toISOString()
          else data.items = data.items.filter((m) => m.id !== args.id)
          save(data)
          return ok(args.mode === 'done' ? 'Marked done.' : 'Deleted.')
        },
      ),
    ],
  })
}
