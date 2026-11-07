// 迫力の演出のスクショ（速く飛んでいる場面と山場の瞬間）。node _shot_juice.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, PORT = 5398
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['land', { width: 844, height: 390 }]]) {
  const ctx = await b.newContext({ locale: 'ja-JP', viewport: vp, hasTouch: true }); await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.setItem('ms.tut', '1'); localStorage.setItem('ms.intro', '1') } catch (e) {} })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__magmaLoaded && document.getElementById('boot').hidden, null, { timeout: 30000 })
  await p.evaluate(() => magma.start(3))
  const info = await p.evaluate(() => {
    const m = magma.sim, g = magma.g, B = m.makeBot(1, 3); magma.dbg.pause(true)
    let best = 0
    for (let i = 0; i < 60 * 40 && !g.over; i++) { m.step(g, m.botInput(g, B)); g.events.length = 0; const v = Math.hypot(g.p.vx, g.p.vy, g.p.vz); if (i > 600 && g.p.rope && v > 34 && g.p.vy < 0) break; best = Math.max(best, v) }
    for (let i = 0; i < 30; i++) magma.dbg.step(0)
    return { v: +Math.hypot(g.p.vx, g.p.vy, g.p.vz).toFixed(1), z: Math.round(g.p.z), rope: !!g.p.rope, over: g.over, ...magma.dbg.fx() }
  })
  await p.screenshot({ path: `${ROOT}/shots/juice-${name}-fast.png` })
  const info2 = await p.evaluate(() => { const g = magma.g; g.waveZ = g.p.z - 20; magma.dbg.step(0); g.waveZ = g.p.z - 80; magma.dbg.step(0); return magma.dbg.fx() })
  await p.screenshot({ path: `${ROOT}/shots/juice-${name}-escape.png` })
  console.log(name, JSON.stringify(info), JSON.stringify(info2), errs)
  await ctx.close()
}
await b.close(); srv.kill()
