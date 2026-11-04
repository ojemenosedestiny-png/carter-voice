/**
 * Carter reads its settings as CARTER_* variables. The bridge underneath still
 * uses the original JARVIS_* names internally, so each CARTER_ variable is
 * copied across here, before anything else reads the environment. A JARVIS_
 * variable you set yourself still wins.
 */
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith('CARTER_')) continue
  const legacy = `JARVIS_${key.slice('CARTER_'.length)}`
  if (process.env[legacy] === undefined) process.env[legacy] = value
}

// `--writes` on the command line turns actions on. This works the same in
// Windows PowerShell, where the `NAME=value command` form does not.
if (process.argv.includes('--writes')) process.env.JARVIS_ALLOW_WRITES = '1'

// CARTER_WEB_URL is where the founder opens Carter's interface — for example
// https://carter-voice.vercel.app. The bridge on this machine must trust that
// exact address, so it is added to the allowed origins here.
if (process.env.CARTER_WEB_URL) {
  const web = new URL(process.env.CARTER_WEB_URL).origin
  const list = (process.env.JARVIS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)
  if (!list.includes(web)) process.env.JARVIS_ALLOWED_ORIGINS = [...list, web].join(',')
}
