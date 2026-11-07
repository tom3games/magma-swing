// 目で見る用の撮影。node _snap.mjs [all]
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
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
  // 始まりの演出（振り返って津波を見る）
  await p.evaluate(() => { window.__noShake = true }); await p.click('#btnStart')
  for (const [ms, tag] of [[700, 'intro1'], [1500, 'intro2'], [2300, 'intro3'], [3000, 'intro4']]) { await p.waitForTimeout(ms - (tag === 'intro1' ? 0 : [0, 700, 1500, 2300][['intro1', 'intro2', 'intro3', 'intro4'].indexOf(tag)])); await p.screenshot({ path: `shots/${n}-${tag}.png` }) }
  await p.waitForFunction(() => magma.mode === 'play', null, { timeout: 5000 })
  // 津波が迫る（20m・8m）
  for (const gap of [20, 8]) { await p.evaluate(gap => { const g = magma.g; magma.dbg.pause(true); Object.assign(g.p, { x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0, grounded: true }); g.waveZ = -gap; magma.dbg.pause(false); g.waveV = 0.01 }, gap); await p.waitForTimeout(900); await p.evaluate(gap => { magma.g.waveZ = -gap }, gap); await p.waitForTimeout(100); await p.screenshot({ path: `shots/${n}-near${gap}.png` }) }
  // 飲まれる
  await p.evaluate(() => { const g = magma.g; g.waveZ = g.p.z + 0.1 })
  for (const ms of [300, 700, 1200]) { await p.waitForTimeout(ms === 300 ? 300 : ms === 700 ? 400 : 500); await p.screenshot({ path: `shots/${n}-engulf${ms}.png` }) }
  await p.waitForFunction(() => magma.mode === 'result', null, { timeout: 5000 }); await p.waitForTimeout(400)
  await p.screenshot({ path: `shots/${n}-result-wave.png` })
  await p.evaluate(() => magma.start(3)); await p.waitForTimeout(1500)
  await p.screenshot({ path: `shots/${n}-play.png` })
  // bot に少し遊ばせて振り子の途中を撮る
  await p.evaluate(async () => { const { botInput, makeBot, step } = magma.sim; const B = makeBot(1, 3); magma.dbg.pause(true); for (let i = 0; i < 60 * 9; i++) { const g = magma.g; if (g.over) break; step(g, botInput(g, B)); g.events.length = 0; if (i % 30 === 0) magma.dbg.step(0) } magma.dbg.pause(false) })
  await p.waitForTimeout(300)
  await p.screenshot({ path: `shots/${n}-swing.png` })
  await p.evaluate(() => { const g = magma.g; g.p.maxZ = 700; }); await p.waitForTimeout(1500)
  await p.screenshot({ path: `shots/${n}-dusk.png` })
  await p.evaluate(() => { const g = magma.g; g.p.maxZ = 1500; }); await p.waitForTimeout(1500)
  await p.screenshot({ path: `shots/${n}-night.png` })
  await p.evaluate(() => magma.showResult()); await p.waitForTimeout(1800)
  await p.screenshot({ path: `shots/${n}-result.png` })
  console.log(n, 'errs', errs.slice(0, 5))
  await ctx.close()
}
await b.close(); srv.kill()
