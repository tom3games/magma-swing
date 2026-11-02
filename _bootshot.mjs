import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// ロード画面のスクショ。node _bootshot.mjs（人物の 3D を止めて、読み込み途中の画面を撮る）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const PORT = 5398, server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] })
for (const [w, h, name] of [[390, 844, 'phone'], [844, 390, 'land'], [360, 640, 'small'], [1440, 900, 'pc']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP' }); await muteContext(ctx); const p = await ctx.newPage()
  await p.route(/Ranger\.glb/, async r => { await new Promise(z => setTimeout(z, 4000)); r.continue().catch(() => {}) })
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'commit' }); await p.waitForTimeout(1500)
  await p.screenshot({ path: `shots/boot-${name}.png` }); await ctx.close()
}
await b.close(); server.kill()
