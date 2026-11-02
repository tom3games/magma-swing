import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const { MUTE_LAUNCH, muteContext } = await import(ROOT + '/mute.mjs')
const PORT = 5398
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
await muteContext(ctx)
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__magmaReady, null, { timeout: 30000 })
for (const [label, setup] of (process.env.CASES ? process.env.CASES.split(',').map(c => [c, c]) : [['intro(津波を正面に)', 'intro'], ['津波10m', 'near']])) {
  const r = await p.evaluate(async (setup) => {
    window.__noEmbers = /noEmb/.test(setup); document.getElementById('heat').style.display = /noHeat/.test(setup) ? 'none' : ''; const tsu = magma.scene.getObjectByName('tsunami'); if (tsu) tsu.visible = !/noTsu/.test(setup)
    magma.start(3, { intro: setup === 'intro' })
    let hold = true
    const keep = () => { if (!hold) return; if (setup === 'intro') magma.intro.t = 2.0 * magma.intro.D / 3.2; else { magma.g.waveZ = magma.g.p.z - (/far/.test(setup) ? 80 : 10) } requestAnimationFrame(keep) }; keep()
    await new Promise(r => setTimeout(r, 1200))
    const ts = []; let calls = 0, n = 0
    await new Promise(res => { const t0 = performance.now(); const f = t => { ts.push(t); calls += magma.renderer.info.render.calls; n++; if (t - t0 < 4000) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    hold = false
    const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); const avg = d.reduce((a, c) => a + c, 0) / d.length
    return { ms: +avg.toFixed(1), fps: Math.round(1000 / avg), calls: Math.round(calls / n) }
  }, setup)
  console.log(label, JSON.stringify(r))
}
await b.close(); srv.kill()
