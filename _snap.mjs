// 目で見る用の撮影。node _snap.mjs [all]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname; mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5396
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
const sizes = process.argv[2] === 'all' ? [['phone', 390, 844, true], ['pc', 1440, 900, false], ['land', 844, 390, true]] : [['phone', 390, 844, true]]
for (const [n, w, h, touch] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 })
  await muteContext(ctx)
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__magmaReady, null, { timeout: 20000 })
  await p.waitForTimeout(4000)
  await p.screenshot({ path: `shots/${n}-title.png` })
  await p.evaluate(() => magma.start(3)); await p.waitForTimeout(1500)
  await p.screenshot({ path: `shots/${n}-play.png` })
  // bot に少し遊ばせて振り子の途中を撮る
  await p.evaluate(async () => { const { botInput, makeBot, step } = await import('./shared/sim.js'); const B = makeBot(1, 3); magma.dbg.pause(true); for (let i = 0; i < 60 * 9; i++) { const g = magma.g; if (g.over) break; step(g, botInput(g, B)); g.events.length = 0; if (i % 30 === 0) magma.dbg.step(0) } magma.dbg.pause(false) })
  await p.waitForTimeout(300)
  await p.screenshot({ path: `shots/${n}-swing.png` })
  await p.evaluate(() => { const g = magma.g; g.p.maxZ = 1500; }); await p.waitForTimeout(1500)
  await p.screenshot({ path: `shots/${n}-night.png` })
  await p.evaluate(() => magma.showResult()); await p.waitForTimeout(1800)
  await p.screenshot({ path: `shots/${n}-result.png` })
  console.log(n, 'errs', errs.slice(0, 5))
  await ctx.close()
}
await b.close(); srv.kill()
