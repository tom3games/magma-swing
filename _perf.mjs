// 重さの計測。node _perf.mjs [label]  スマホサイズ・CPU 4倍スロットルで、マグマの部品を1つずつ切ってフレーム時間とドローコールを測る
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname, PORT = 5397
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, ...(process.env.GL === 'metal' ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
await muteContext(ctx)
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__magmaReady, null, { timeout: 30000 })
await p.evaluate(() => magma.start(3)); await p.waitForTimeout(1500)
// bot に遊ばせ続ける（振り子中の普通の場面を測る）
await p.evaluate(async () => { const m = await import('./shared/sim.js'); const B = m.makeBot(1, 3); window.__botOn = true; const loop = () => { const g = magma.g; if (window.__botOn && g && !g.over) { magma.S.mode = 'play'; } requestAnimationFrame(loop) }; window.__B = B; window.__sim = m })
const cases = process.argv[2] === 'quick' ? ['all'] : ['all', '-lavaShader', '-wave', '-pointLights', '-shadow', '-allLava', '-reels', '-city']
const out = []
for (const c of cases) {
  const r = await p.evaluate(async (c) => {
    const S = magma.scene, R = magma.renderer
    const lava = S.children.find(o => o.geometry && o.geometry.parameters && o.geometry.parameters.width === 700)
    const wave = S.children.find(o => o.geometry && o.geometry.parameters && o.geometry.parameters.width === 160)
    const pls = S.children.filter(o => o.isPointLight)
    const save = { lv: lava && lava.visible, wv: wave && wave.visible, pl: pls.map(l => l.visible), sh: R.shadowMap.enabled }
    if (c === '-lavaShader' || c === '-allLava') lava && (lava.visible = false)
    if (c === '-wave' || c === '-allLava') wave && (wave.visible = false)
    if (c === '-pointLights' || c === '-allLava') pls.forEach(l => l.visible = false)
    if (c === '-shadow') { R.shadowMap.enabled = false; S.traverse(o => { if (o.material) o.material.needsUpdate = true }) }
    const reels = S.children.filter(o => o.isGroup && o.children.length === 2 && o.children[1].isSprite && o.children[0].geometry && o.children[0].geometry.type === 'LatheGeometry')
    const city = S.children.filter(o => o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.scale.y > 9)
    if (c === '-reels') reels.forEach(o => o.visible = false)
    if (c === '-city') city.forEach(o => o.visible = false)
    // 振り子中にする
    const g = magma.g; magma.dbg.pause(true); for (let i = 0; i < 240; i++) { if (g.over) break; window.__sim.step(g, window.__sim.botInput(g, window.__B)); g.events.length = 0 } magma.dbg.pause(false)
    await new Promise(r => setTimeout(r, 600))
    const ts = []; let calls = 0, tris = 0, n = 0
    await new Promise(res => { const t0 = performance.now(); const f = (t) => { ts.push(t); calls += R.info.render.calls; tris += R.info.render.triangles; n++; if (t - t0 < 4000) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b)
    // 元に戻す
    lava && (lava.visible = save.lv); wave && (wave.visible = save.wv); pls.forEach((l, i) => l.visible = save.pl[i])
    if (R.shadowMap.enabled !== save.sh) { R.shadowMap.enabled = save.sh; S.traverse(o => { if (o.material) o.material.needsUpdate = true }) }
    reels.forEach(o => o.visible = true); city.forEach(o => o.visible = true)
    const avg = d.reduce((a, b) => a + b, 0) / d.length
    return { c, ms: +avg.toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1), fps: +(1000 / avg).toFixed(0), calls: Math.round(calls / n), tris: Math.round(tris / n), found: { lava: !!lava, wave: !!wave, pl: pls.length } }
  }, c)
  // 毎回やり直し（死んでいたら）
  await p.evaluate(() => { if (magma.g.over) magma.start(3) })
  out.push(r); console.log(JSON.stringify(r))
}
await b.close(); srv.kill()
