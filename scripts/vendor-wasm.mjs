// Copies the hand-tracking runtime into public/ before a production build
// (Vercel runs `npm run build`, which runs this first as `prebuild`).
import { cpSync, existsSync, mkdirSync } from 'node:fs'

const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe'
if (existsSync(from) && !existsSync(`${to}/vision_wasm_internal.wasm`)) {
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log('vendored the hand-tracking runtime into public/mediapipe')
}
