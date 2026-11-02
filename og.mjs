// SNS 用の画像 og.png（1200x630）。振り子で飛ぶ人と、すぐ後ろに迫るマグマの津波＋案内標識のタイトル。node og.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { muteContext, MUTE_LAUNCH } from './mute.mjs'
const srv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '5394' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] })
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 1200, height: 630 } }); await muteContext(ctx)
const p = await ctx.newPage()
await p.goto('http://localhost:5394/'); await p.waitForFunction(() => window.__magmaReady, null, { timeout: 20000 })
await p.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 20000 })
await p.evaluate(() => { localStorage.setItem('ms.tut', '1'); magma.start(5) }); await p.waitForTimeout(600)
await p.evaluate(async () => {
  const { botInput, makeBot, step } = magma.sim
  const B = makeBot(1, 5); magma.dbg.pause(true)
  const g = magma.g
  // 夕方まで進めて、振り子の一番速い所で止める
  for (let i = 0; i < 60 * 40 && !g.over; i++) { step(g, botInput(g, B)); g.events.length = 0; if (g.p.maxZ > 520 && g.p.rope && g.p.y < g.p.rope.y - 9 && g.p.vz > 14) break; if (i % 6 === 0) magma.dbg.step(0) }
  for (let i = 0; i < 90; i++) magma.dbg.step(0)
  window.__freeze = true
  const c = magma.camera, P = g.p
  // 前から振り返って、すぐ後ろに迫るマグマの津波と人を一緒に撮る
  g.waveZ = P.z - 16; window.__noShake = true
  for (let i = 0; i < 40; i++) magma.dbg.step(0)
  c.position.set(P.x + 4, P.y + 0.5, P.z + 6.5); c.lookAt(P.x - 3.5, P.y + 4.5, P.z - 9); c.fov = 62; c.updateProjectionMatrix()
  magma.dbg.step(0)
  for (const id of ['hud', 'title']) document.getElementById(id).hidden = true
  document.getElementById('heat').style.opacity = 0
  const d = document.createElement('div')
  d.innerHTML = `<div style="position:fixed;left:40px;top:40px;width:470px;z-index:30;font-family:'BIZ UDPGothic',sans-serif">
    <div style="background:#1d4f9c;border-radius:12px;padding:22px 26px;box-shadow:inset 0 0 0 5px #1d4f9c,inset 0 0 0 9px #f7f7f2,0 12px 30px rgba(0,0,0,.4);color:#f7f7f2">
      <div style="font-weight:700;font-size:22px;letter-spacing:.1em">この先 溶岩</div>
      <div style="font-weight:700;font-size:66px;line-height:1.1;margin-top:6px">地面はマグマ</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:24px;letter-spacing:.18em;opacity:.85">MAGMA SWING</div>
    </div>
    <div style="width:18px;height:40px;margin-left:226px;background:linear-gradient(90deg,#6c6f73,#b9bcc0 45%,#55585c)"></div>
    <div style="font-weight:700;font-size:30px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.9);line-height:1.45">後ろからマグマの津波。<br>ワイヤーで逃げ切れ。</div></div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(700)
await p.screenshot({ path: 'og.png' })
await b.close(); srv.kill()
console.log('og.png')
