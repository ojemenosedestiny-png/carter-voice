/**
 * JARVIS configuration.
 *
 * Everything here is read from Vite env vars (.env.local) so no secrets are
 * committed. See .env.example for the full list.
 */

/**
 * Vite inlines a blank `.env` entry as an empty string, not as undefined, so
 * `??` never falls through to the default — and .env.example ships every
 * optional key blank, which is exactly the shape that used to bite. A blank
 * VITE_BACKEND silently selected the direct path and then complained about a
 * missing API key. Treat whitespace-only as unset everywhere in this file.
 */
function str(raw: unknown): string | undefined {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value === '' ? undefined : value
}

/**
 * Fixed-choice options. An unrecognised value is nearly always a typo, and
 * quietly falling back to the default hides it until it costs you a take.
 */
function choice<T extends string>(
  name: string,
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = str(raw)
  if (value === undefined) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  console.warn(
    `[carter] ${name}="${value}" is not one of ${allowed.join(' | ')} — using "${fallback}".`,
  )
  return fallback
}

/** Same, for the on/off options. Accepts true/false and 1/0. */
function flag(name: string, raw: unknown, fallback: boolean): boolean {
  const value = str(raw)?.toLowerCase()
  if (value === undefined) return fallback
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  console.warn(`[carter] ${name}="${value}" is not true or false — using ${fallback}.`)
  return fallback
}

/**
 * Which brain to use.
 *
 *   'bridge' — run `npm run bridge` alongside the app. Authenticates off your
 *              existing Claude Code login (no API key), and every MCP server in
 *              your Claude Code config is available to JARVIS, including local
 *              ones like higgsfield, elevenlabs, android and playwright.
 *
 *   'direct' — the browser calls the Claude API itself. Nothing to run and it
 *              deploys as a static site, but it needs VITE_ANTHROPIC_API_KEY in
 *              the bundle and only reaches remote HTTP MCP servers.
 */
export const BACKEND: 'bridge' | 'direct' = choice(
  'VITE_BACKEND',
  import.meta.env.VITE_BACKEND,
  ['bridge', 'direct'] as const,
  'bridge',
)

/**
 * Where the bridge lives. Derived once here rather than in each of the three
 * places that talk to it, so moving off the default port is a single edit.
 * `wss://` maps to `https://` on its own, which is why this is a prefix swap
 * rather than a hardcoded scheme.
 */
/**
 * Remote use (the founder's phone): the phone link carries where Carter's
 * brain is and the secret key, as #bridge=wss://…&key=…  They are saved on
 * this device so the plain address works afterwards, and wiped from the
 * address bar so the key is not left on screen. Opening the site with
 * #local resets it to this computer.
 */
function remote(): { bridge?: string; key?: string } {
  if (typeof window === 'undefined') return {}
  const store = {
    get: (k: string) => {
      try {
        return localStorage.getItem(k) ?? undefined
      } catch {
        return undefined
      }
    },
    set: (k: string, v: string | null) => {
      try {
        if (v === null) localStorage.removeItem(k)
        else localStorage.setItem(k, v)
      } catch {
        /* storage blocked — the link still works for this visit */
      }
    },
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  let bridge = store.get('carter.bridge')
  let key = store.get('carter.key')
  if (hash.has('local')) {
    store.set('carter.bridge', null)
    store.set('carter.key', null)
    bridge = key = undefined
  }
  if (hash.get('bridge')) {
    bridge = hash.get('bridge')!
    // "self": this page was served by Carter's brain itself (phone mode), so
    // the brain is at this very address.
    if (bridge === 'self') {
      bridge = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    }
    store.set('carter.bridge', bridge)
  }
  if (hash.get('key')) {
    key = hash.get('key')!
    store.set('carter.key', key)
  }
  if (hash.has('bridge') || hash.has('key') || hash.has('local')) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return { bridge, key }
}
const REMOTE = remote()
// A new phone link (or #local) opened while the page is already showing only
// changes the address bar's hash; reload so it takes effect.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (/(^|[#&])(bridge|key|local)\b/.test(window.location.hash)) window.location.reload()
  })
}

export const BRIDGE_KEY = REMOTE.key ?? ''

/**
 * Opened from anywhere but this computer (e.g. carter-xxxx.onrender.com, or a
 * home-screen icon that has no saved link), the brain is the very site the
 * page came from — never "localhost", which on a phone means the phone.
 */
const servedRemotely =
  typeof window !== 'undefined' &&
  !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) &&
  !/\.vercel\.app$/.test(window.location.hostname)
const sameSite = () =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`

export const BRIDGE_WS_URL =
  REMOTE.bridge ??
  str(import.meta.env.VITE_BRIDGE_URL) ??
  (servedRemotely ? sameSite() : 'ws://localhost:8788')

/** True when this page is talking to a brain that is not on this computer. */
export const BRIDGE_IS_REMOTE = !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(BRIDGE_WS_URL)
export const BRIDGE_HTTP_URL = BRIDGE_WS_URL.replace(/^ws/, 'http')

/** Add the access key to a bridge URL (needed only when used remotely). */
export const withKey = (url: string) =>
  BRIDGE_KEY ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(BRIDGE_KEY)}` : url

/**
 * Speech output engine.
 *
 * false (default) — the browser's own speechSynthesis. Runs on-device, so
 *   speech starts on the next frame with no request and no download. This is
 *   the fastest option that exists and it's why it's the default.
 *
 * true — ElevenLabs. Noticeably better voice, but every sentence costs a
 *   round trip plus generation, which is the difference between a conversation
 *   and a walkie-talkie. Turn it on when you want the voice more than the pace.
 */
export const USE_ELEVENLABS = flag(
  'VITE_USE_ELEVENLABS',
  import.meta.env.VITE_USE_ELEVENLABS,
  false,
)

/**
 * Speech engine.
 *
 *   'system' — the browser's own speechSynthesis. Starts on the next frame,
 *     costs nothing, but is capped by whatever voices the OS ships; on macOS
 *     the British male option is compact Daniel.
 *
 *   'kokoro' — an 82M-parameter neural TTS running entirely in the browser via
 *     ONNX. Four proper British male voices and far better sound, nothing
 *     leaving the machine. MEASURED ON THIS MACHINE at q8/WebGPU it generates
 *     about 2.2x slower than realtime — "Yes, sir?" took 3.3 seconds and a
 *     thirteen-word sentence took nine. That is not a conversation, so it is
 *     not the default. Try `fp32` (see kokoro.ts) before enabling it; int8
 *     quantisation often silently falls back to CPU on WebGPU, which is the
 *     likely cause.
 */
export const TTS_ENGINE: 'kokoro' | 'system' = choice(
  'VITE_TTS_ENGINE',
  import.meta.env.VITE_TTS_ENGINE,
  ['kokoro', 'system'] as const,
  'system',
)

/**
 * Which Kokoro voice. All four are British male:
 *   bm_george — measured RP baritone, closest to the character
 *   bm_fable  — warmer
 *   bm_lewis  — lower
 *   bm_daniel — brighter
 */
export const KOKORO_VOICE = choice(
  'VITE_KOKORO_VOICE',
  import.meta.env.VITE_KOKORO_VOICE,
  ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel'] as const,
  'bm_george',
)

export const env = {
  anthropicKey: str(import.meta.env.VITE_ANTHROPIC_API_KEY) ?? '',
  elevenKey: str(import.meta.env.VITE_ELEVENLABS_API_KEY) ?? '',
  elevenVoiceId:
    str(import.meta.env.VITE_ELEVENLABS_VOICE_ID) ?? 'CwhRBWXzGAHq8TQ4Fs17',
  porcupineKey: str(import.meta.env.VITE_PICOVOICE_ACCESS_KEY) ?? '',
}

/** `claude-opus-5` is the strongest model; `claude-sonnet-5` trades a little
 *  quality for lower latency if you find responses feel slow on camera. */
export const MODEL = 'claude-opus-5'

/**
 * Fast mode runs the same Opus 5 at up to 2.5x output speed. It is a research
 * preview on the Claude API and costs $10/$50 per Mtok instead of $5/$25.
 * For a recorded demo the snappiness is worth it; flip to false to save money.
 */
export const FAST_MODE = true

/**
 * Wake-word engine.
 *   'speech'    — zero setup, uses the browser's SpeechRecognition to listen for
 *                 "hey jarvis". Chrome/Edge only, audio goes to Google.
 *   'porcupine' — recommended. Runs offline in WASM, "Jarvis" is a built-in
 *                 keyword, far fewer false triggers. Needs a free AccessKey
 *                 from console.picovoice.ai.
 */
export const WAKE_ENGINE: 'speech' | 'porcupine' = env.porcupineKey
  ? 'porcupine'
  : 'speech'

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

export type McpServer = {
  /** Stable id used as the tool namespace. Lowercase, no spaces. */
  name: string
  /** Human label for the HUD. */
  label: string
  /** Remote MCP endpoint. Must be reachable from Anthropic's servers, not yours. */
  url: string
  /** Bearer token, if the server wants one. Many put the secret in the URL instead. */
  token?: string
  enabled: boolean
}

/**
 * These are passed to the Messages API `mcp_servers` parameter. Anthropic dials
 * the servers itself, so there is no CORS to fight and no local bridge to run —
 * which is what makes a backend-free JARVIS possible.
 *
 * Only *remote HTTP* MCP servers work here. Local stdio servers (filesystem,
 * Blender, Playwright) need a machine to run on and are out of scope for a
 * browser-only build.
 *
 * READ THIS BEFORE FILLING ANY OF THESE IN. Every one of them ships to the
 * browser. In direct mode Vite inlines each token below into the JavaScript
 * bundle, and the Zapier and Pipedream URLs *are* secrets — the URL is the
 * credential. Anyone who opens devtools on a deployed build gets your Notion,
 * Linear, GitHub, Stripe, Sentry and Home Assistant access, not just the
 * Anthropic key. This is fine for a demo on your own machine or a recording;
 * it is not fine for anything public. The bridge backend (the default) reads
 * none of this — it uses your Claude Code MCP config, where the secrets stay on
 * your machine — so if you want these integrations without the exposure, run
 * `npm run bridge` instead of filling in this block.
 */
export const MCP_SERVERS: McpServer[] = [
  // The single highest-leverage integration: one URL, ~8,000 apps, managed
  // OAuth. Wire up Gmail, Google Calendar, Spotify, Slack, Notion and Sheets in
  // the Zapier dashboard and they all arrive through this one endpoint.
  // Get yours at https://mcp.zapier.com -> New MCP Server.
  {
    name: 'zapier',
    label: 'Zapier',
    url: str(import.meta.env.VITE_ZAPIER_MCP_URL) ?? '',
    enabled: Boolean(str(import.meta.env.VITE_ZAPIER_MCP_URL)),
  },

  // Alternative/complementary gateway: ~3,000 apps, free for personal use.
  {
    name: 'pipedream',
    label: 'Pipedream',
    url: str(import.meta.env.VITE_PIPEDREAM_MCP_URL) ?? '',
    enabled: Boolean(str(import.meta.env.VITE_PIPEDREAM_MCP_URL)),
  },

  // Official first-party servers. Each needs its own OAuth token pasted in.
  {
    name: 'notion',
    label: 'Notion',
    url: 'https://mcp.notion.com/mcp',
    token: str(import.meta.env.VITE_NOTION_TOKEN),
    enabled: Boolean(str(import.meta.env.VITE_NOTION_TOKEN)),
  },
  {
    name: 'linear',
    label: 'Linear',
    url: 'https://mcp.linear.app/mcp',
    token: str(import.meta.env.VITE_LINEAR_TOKEN),
    enabled: Boolean(str(import.meta.env.VITE_LINEAR_TOKEN)),
  },
  {
    name: 'github',
    label: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp/',
    token: str(import.meta.env.VITE_GITHUB_TOKEN),
    enabled: Boolean(str(import.meta.env.VITE_GITHUB_TOKEN)),
  },
  {
    name: 'stripe',
    label: 'Stripe',
    url: 'https://mcp.stripe.com',
    token: str(import.meta.env.VITE_STRIPE_TOKEN),
    enabled: Boolean(str(import.meta.env.VITE_STRIPE_TOKEN)),
  },
  {
    name: 'sentry',
    label: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
    token: str(import.meta.env.VITE_SENTRY_TOKEN),
    enabled: Boolean(str(import.meta.env.VITE_SENTRY_TOKEN)),
  },
  // Home Assistant is self-hosted, so this needs a publicly reachable URL
  // (Nabu Casa Cloud, or a Cloudflare tunnel). Worth the setup — "Jarvis, dim
  // the lights" with the room actually dimming is the best shot in the video.
  // Both halves are required: an instance reachable from Anthropic's servers
  // with no bearer token attached is one that answers 401 to every tool call,
  // which reads on the HUD as connected and behaves as broken.
  {
    name: 'home',
    label: 'Home',
    url: str(import.meta.env.VITE_HOMEASSISTANT_MCP_URL) ?? '',
    token: str(import.meta.env.VITE_HOMEASSISTANT_TOKEN),
    enabled: Boolean(
      str(import.meta.env.VITE_HOMEASSISTANT_MCP_URL) &&
        str(import.meta.env.VITE_HOMEASSISTANT_TOKEN),
    ),
  },
]

export const activeServers = () => MCP_SERVERS.filter((s) => s.enabled && s.url)

/**
 * The persona for the browser-direct path only. The bridge carries its own,
 * fuller version in bridge/server.mjs — that's the one that gets used by
 * default, and the one worth editing.
 */
export const SYSTEM_PROMPT = `You are CARTER, the personal assistant of the founder you serve. You are speaking out loud.

THE HARD RULE: your entire reply must be under 60 words. This is not a style
preference — every word is read aloud by a speech synthesiser and the user is
waiting in silence while it plays. A four-paragraph answer is a failure, however
good the content. If a question genuinely needs more, give the headline in two
sentences and offer the detail: "There's more if you want it."

Voice:
- Dry, precise, quietly amused. Understated competence, never fawning.
- Call them "founder" at most once per exchange, and not in every exchange.
- Plain spoken prose only. No markdown, no bullet points, no headings, no code,
  no emoji, no asterisks, no numbered lists.
- Write numbers, dates and times the way you'd say them: "eight fifteen",
  "the first of August", not "8:15" or "2026-08-01".

Using tools:
- You have live tools. Use them rather than guessing.
- Never narrate that you're about to use one. No "Let me search for that" or
  "I'll check that now" — go silent, use it, then answer. The user sees a
  spinner; they don't need commentary.
- Never speak a URL, ID or raw JSON aloud unless asked. Summarise.
- If a tool fails or isn't connected, one plain sentence saying so.
- For anything outward-facing or destructive (sending mail, posting, paying,
  deleting) say exactly what you're about to do and wait for confirmation.
- If you don't know, say you don't know.`
