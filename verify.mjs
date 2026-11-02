import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 地面はマグマ の検証。node verify.mjs
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5397
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
  console.log(results[results.length - 1])
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
const GL = ['--use-angle=metal', '--enable-unsafe-swiftshader']
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => {
    try { localStorage.clear() } catch (e) {}
    window.__osc = 0
    const A = window.AudioContext || window.webkitAudioContext
    if (A) { const o = A.prototype.createOscillator; A.prototype.createOscillator = function () { window.__osc++; return o.call(this) } }
  })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url() + ' ' + (r.failure() && r.failure().errorText)) })
  await p.goto(URL0); await p.waitForFunction(() => window.__magmaReady, null, { timeout: 15000 })
  await p.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 15000 })
  return p
}
const fit = q => q.evaluate(() => {
  const H = innerHeight, W = document.documentElement.clientWidth, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button, main:not([hidden]) .guide-in, main:not([hidden]) .aux, main:not([hidden]) .post, main:not([hidden]) .stick, main:not([hidden]) a, main:not([hidden]) .warn:not([hidden]), main:not([hidden]) .tsu')) {
    if (el.closest('[hidden]') || !el.getClientRects().length) continue
    const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') continue
    const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1 || r.right > W + 1 || r.left < -1) over.push((el.id || el.className) + ':' + Math.round(r.left) + ',' + Math.round(r.top) + '-' + Math.round(r.right) + ',' + Math.round(r.bottom))
  }
  // ボタン同士の重なり
  const bs = [...document.querySelectorAll('main:not([hidden]) button')].filter(b => b.getClientRects().length && getComputedStyle(b).display !== 'none').map(b => [b.id || b.className, b.getBoundingClientRect(), b.closest('main')])
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { if (bs[i][2] !== bs[j][2]) continue; const a = bs[i][1], b = bs[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) over.push('overlap ' + bs[i][0] + '/' + bs[j][0]) }
  return { H, over: over.slice(0, 6) }
})
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]

const browser = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, ...GL] })
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r))
})
await t('OGP 一式がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')))
  expect(r.every(Boolean), JSON.stringify(r))
})
await t('巻取ボタンが無い（本人 2026-11-02「巻き取りって言うボタンいらん」）', async () => {
  const r = await p.evaluate(() => ({ reel: !!document.querySelector('[data-k=boost],#btnReel'), text: /巻取|巻き取り/.test(document.body.innerText) }))
  expect(!r.reel && !r.text, JSON.stringify(r))
})
await t('始まりの演出: 振り返って津波を見せる間は操作が効かず、津波も止まっている（初回は飛ばせない）', async () => {
  await p.click('#btnStart')
  const r = await p.evaluate(async () => {
    const g = magma.g, z0 = g.p.z, w0 = g.waveZ, mode0 = magma.mode, long = magma.intro.long, D = magma.intro.D
    const t0 = performance.now()
    await new Promise(r => setTimeout(r, 300))
    // 操作してみる（キー・ボタン・画面タップ・スティック）
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    document.getElementById('btnWire').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.getElementById('btnJump').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 300 }))
    const skipped = magma.mode !== 'intro'
    await new Promise(r => setTimeout(r, 900))
    const mid = { mode: magma.mode, rope: !!g.p.rope, dz: +(g.p.z - z0).toFixed(3), dw: +(g.waveZ - w0).toFixed(3), t: g.t, warn: document.getElementById('warn').hidden ? '' : document.getElementById('warnText').textContent, ctrlOpacity: getComputedStyle(document.getElementById('btnWire')).opacity, camZ: +magma.camera.position.z.toFixed(1), front: +magma.front.toFixed(1) }
    while (magma.mode === 'intro' && performance.now() - t0 < 6000) await new Promise(r => setTimeout(r, 50))
    const dur = (performance.now() - t0) / 1000
    for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r))
    // 演出のあとは効く
    magma.input.jump = true; await new Promise(r => setTimeout(r, 250)); magma.input.wire = true; await new Promise(r => setTimeout(r, 120))
    const rumble = Snd.played.rumble || 0
    return { mode0, long, D, skipped, mid, rumble, dur: +dur.toFixed(2), after: magma.mode, roped: !!g.p.rope, moved: g.t > 0.2 }
  })
  // 演出の間: 津波は人の後ろ（カメラは人より後ろ＝津波側を向いて前に出ている）
  expect(r.mode0 === 'intro' && r.long && !r.skipped && r.mid.mode === 'intro' && !r.mid.rope && r.mid.dz === 0 && r.mid.dw === 0 && r.mid.t === 0 && r.mid.warn && r.mid.ctrlOpacity === '0' && r.mid.camZ > 3 && r.mid.front < -45, JSON.stringify(r))
  expect(r.dur > 3 && r.dur < 4 && r.after === 'play' && r.roped && r.moved, JSON.stringify(r))
  expect(r.rumble >= 1, 'rumble ' + r.rumble)
  return { dur: r.dur, warn: r.mid.warn, front: r.mid.front, camZ: r.mid.camZ, rumble: r.rumble }
})
await t('2回目からは演出が短く、タップで飛ばせる', async () => {
  await p.evaluate(() => magma.start(12, { intro: true }))
  const r = await p.evaluate(async () => {
    const long = magma.intro.long, D = magma.intro.D
    await new Promise(r => setTimeout(r, 400))
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 300 }))
    const after = magma.mode
    await new Promise(r => setTimeout(r, 200))
    return { long, D, after, wire: magma.g.p.rope, skipShown: !document.getElementById('warnSkip').hidden }
  })
  await p.evaluate(() => magma.showResult()); await p.waitForFunction(() => magma.mode === 'result'); await p.click('#btnTitle')
  expect(!r.long && r.D < 2 && r.after === 'play' && !r.wire, JSON.stringify(r)); return r
})
await t('音の素材が全部読める・合成音を使っていない', async () => {
  const files = readdirSync(ROOT + '/snd')
  const r = await p.evaluate(async fs => { const bad = []; for (const f of fs) { const x = await fetch('snd/' + f); if (!x.ok) bad.push(f) } return bad }, files)
  expect(r.length === 0, r.join(','))
  await p.click('#btnStart'); await p.waitForTimeout(600)
  await p.evaluate(() => { magma.input.wire = true }); await p.waitForTimeout(800)
  const osc = await p.evaluate(() => window.__osc)
  expect(osc === 0, 'createOscillator ' + osc)
  return { files: files.length, osc }
})
await t('遊びの通し: 跳んでワイヤーを掛け、離して進む', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => {
    magma.dbg.pause(true)
    const g = magma.g
    magma.setStick(0, 1); magma.dbg.step(50)
    magma.input.jump = true; magma.dbg.step(12)
    magma.input.wire = true; magma.dbg.step(1)
    const roped = !!g.p.rope
    magma.dbg.step(70)
    const z1 = g.p.z
    magma.input.wire = true; magma.dbg.step(1)
    const released = !g.p.rope
    magma.dbg.step(30)
    magma.setStick(0, 0); magma.dbg.pause(false)
    return { roped, released, z1: Math.round(z1), z2: Math.round(g.p.z), over: g.over }
  })
  expect(r.roped && r.released && r.z2 > 25, JSON.stringify(r)); return r
})
await t('ワイヤーは一直線に引き寄せない（掛けた直後は重力で落ちながら振れる）', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => {
    magma.dbg.pause(true)
    const g = magma.g, p = g.p
    const h = g.C.hooks.find(h => h.z > 70 && !g.C.boxes.some(b => h.z - 33 > b.z0 - 3 && h.z - 33 < b.z1 + 3))
    Object.assign(p, { x: h.x, y: h.y - 9, z: h.z - 33, vx: 0, vy: 0, vz: 0, grounded: false })
    g.waveZ = p.z - 200
    { const dx = h.x - p.x, dy = h.y - p.y - 1.5, dz = h.z - p.z, l = Math.hypot(dx, dy, dz); magma.input.aim = { ox: p.x, oy: p.y + 1.5, oz: p.z, dx: dx / l, dy: dy / l, dz: dz / l } }
    magma.dbg.step(1)
    const L0 = p.rope && p.rope.len, y0 = p.y
    let minY = 1e9, maxRate = 0, prev = L0
    for (let i = 0; i < 30; i++) { magma.dbg.step(1); minY = Math.min(minY, p.y); if (p.rope) { maxRate = Math.max(maxRate, (prev - p.rope.len) * 60); prev = p.rope.len } }
    magma.dbg.pause(false)
    return { L0: L0 && +L0.toFixed(1), dropped: +(y0 - minY).toFixed(2), maxRate: +maxRate.toFixed(1), d: Math.round(L0) }
  })
  // 落ちている（直線で上へ引かれていない）・縮む速さが一気でない
  expect(r.L0 > 30 && r.dropped > 1 && r.maxRate < 20, JSON.stringify(r)); return r
})
await t('届かない所は × が出る', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => {
    magma.dbg.pause(true)
    const g = magma.g, p = g.p
    Object.assign(p, { x: 0, y: 12, z: -60, vx: 0, vy: 0, vz: 0, grounded: false })
    g.waveZ = -300
    // 画面のまん中から前上へ向けた光線（遠いフックを狙う）
    const far = g.C.hooks.find(h => h.z > 60)
    const dx = far.x - p.x, dy = far.y - p.y, dz = far.z - p.z, l = Math.hypot(dx, dy, dz)
    magma.input.aim = { ox: p.x, oy: p.y + 1.5, oz: p.z, dx: dx / l, dy: dy / l, dz: dz / l }
    magma.dbg.step(1)
    const roped = !!p.rope
    magma.dbg.pause(false)
    return { roped, dist: Math.round(l), miss: !document.getElementById('miss').hidden, toast: document.getElementById('toast').textContent }
  })
  expect(!r.roped && r.miss && r.dist > 50, JSON.stringify(r)); return r
})
await t('画面をタッチしたフックにワイヤーが掛かる', async () => {
  await p.evaluate(() => magma.start(11))
  await p.waitForTimeout(500)
  const r = await p.evaluate(() => {
    magma.dbg.pause(true)
    const g = magma.g, h = g.C.hooks[0]
    magma.dbg.step(1)
    const v = new magma.camera.position.constructor(h.x, h.y, h.z).project(magma.camera)
    const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight
    magma.aimAt(sx, sy); magma.dbg.step(1)
    const ok = g.p.rope && g.p.rope.h === h.i
    magma.dbg.pause(false)
    return { ok: !!ok, sx: Math.round(sx), sy: Math.round(sy) }
  })
  expect(r.ok, JSON.stringify(r)); return r
})
await t('壁に張り付いて上下左右に這える', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => {
    magma.dbg.pause(true)
    const g = magma.g, p = g.p
    const b = g.C.boxes.find(b => !b.start)
    g.waveZ = b.z0 - 300
    Object.assign(p, { x: (b.x0 + b.x1) / 2, y: b.y1 - 4, z: b.z0 - 1.2, vx: 0, vy: 0, vz: 8, grounded: false })
    magma.dbg.step(8)
    const cling = !!p.cling
    const y0 = p.y; magma.setStick(0, 1); magma.dbg.step(30); const up = p.y - y0
    const y1 = p.y; magma.setStick(0, -1); magma.dbg.step(30); const down = y1 - p.y
    const x0 = p.x; magma.setStick(1, 0); magma.dbg.step(30); const right = p.x - x0
    const x1 = p.x; magma.setStick(-1, 0); magma.dbg.step(30); const left = p.x - x1
    magma.setStick(0, 1); magma.dbg.step(120); const topped = p.grounded
    magma.setStick(0, 0); magma.dbg.pause(false)
    return { cling, up: +up.toFixed(2), down: +down.toFixed(2), right: +right.toFixed(2), left: +left.toFixed(2), topped }
  })
  expect(r.cling && r.up > 1 && r.down > 1 && Math.abs(r.right) > 1 && Math.abs(r.left) > 1 && Math.sign(r.right) !== Math.sign(r.left) && r.topped, JSON.stringify(r)); return r
})
await t('掛けられるフックには必ず見える物がある（番号の重なりで見えないフックができていた・2026-11-02 本人「何もない所に掛かる」）', async () => {
  const r = await p.evaluate(async () => {
    const m = magma.sim; magma.start(5); const g = magma.g, B = m.makeBot(1, 5)
    m.K.WIRE0 = 999; g.p.left = 999
    magma.dbg.pause(true); let bad = 0, checked = 0, ids = new Set(), dup = 0
    for (let i = 0; i < 60 * 70; i++) {
      if (g.over) break
      m.step(g, m.botInput(g, B)); g.events.length = 0
      if (i % 60 === 0) {
        magma.dbg.step(0)
        for (const h of g.C.hooks) {
          if (!ids.has(h)) { for (const o of ids) if (o.i === h.i) dup++; ids.add(h) }
          checked++
          const vis = magma.scene.children.some(o => o.isGroup && Math.abs(o.position.x - h.x) < 0.01 && Math.abs(o.position.z - h.z) < 0.01 && o.children.some(c => c.isMesh && c.geometry.type === 'TorusGeometry' && Math.abs(c.position.y - h.y) < 0.01))
          if (!vis) bad++
        }
      }
    }
    magma.dbg.pause(false); m.K.WIRE0 = 10
    return { checked, bad, dup, z: Math.round(g.p.maxZ) }
  })
  expect(r.checked > 200 && r.bad === 0 && r.dup === 0 && r.z > 600, JSON.stringify(r)); return r
})
await t('ワイヤーは有限: 掛けると1本減り、0本だと掛からない。リールを拾うと増える', async () => {
  const r = await p.evaluate(async () => {
    const m = magma.sim; magma.start(6); const g = magma.g; magma.dbg.pause(true)
    const p0 = g.p.left
    g.p.grounded = false; g.p.y = 12; g.p.z = 20; g.p.x = g.C.hooks[1].x
    m.step(g, { wire: true }); const afterWire = g.p.left, roped = !!g.p.rope
    m.step(g, { wire: true })   // 離す
    g.p.left = 0; m.step(g, { wire: true }); const emptyMiss = g.events.some(e => e.t === 'miss' && e.empty), ropedEmpty = !!g.p.rope
    const it = g.C.items.find(q => !q.taken); g.events.length = 0
    Object.assign(g.p, { x: it.x, y: it.y - 1, z: it.z, vx: 0, vy: 0, vz: 0, rope: null })
    m.step(g, {}); const afterPick = g.p.left, pickEv = g.events.some(e => e.t === 'pick')
    magma.dbg.step(0); const hud = document.querySelector('#reel b').textContent
    magma.dbg.pause(false)
    return { p0, afterWire, roped, emptyMiss, ropedEmpty, afterPick, pickEv, hud }
  })
  expect(r.p0 === 10 && r.afterWire === 9 && r.roped && r.emptyMiss && !r.ropedEmpty && r.afterPick === 2 && r.pickEv, JSON.stringify(r)); return r
})
await t('マグマと津波は軽い作り（シェーダ・点光源を使わない・津波の頂点は千未満）', async () => {
  const r = await p.evaluate(() => {
    let sh = 0, pl = 0; magma.scene.traverse(o => { if (o.isPointLight) pl++; if (o.material && o.material.isShaderMaterial && o.geometry && (o.name === 'tsunami' || (o.geometry.parameters && o.geometry.parameters.width === 700))) sh++ })
    const ts = magma.scene.getObjectByName('tsunami'), pts = magma.scene.children.filter(o => o.isPoints)
    return { sh, pl, verts: ts.geometry.attributes.position.count, points: pts.length, pointN: pts.reduce((a, o) => a + o.geometry.attributes.position.count, 0) }
  })
  expect(r.sh === 0 && r.pl === 0 && r.verts < 1000 && r.points === 2 && r.pointN <= 200, JSON.stringify(r)); return r
})
await t('津波に追いつかれるとゲームオーバー（飲まれる演出のあと結果）', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(async () => {
    const g = magma.g; magma.dbg.step(30)
    g.waveZ = g.p.z - 0.4
    const t0 = performance.now(); let engulfMax = 0, hidden = false, frontPassed = false
    while (magma.mode !== 'result' && performance.now() - t0 < 5000) {
      await new Promise(r => requestAnimationFrame(r))
      engulfMax = Math.max(engulfMax, +document.getElementById('engulf').style.opacity || 0)
      if (magma.mode === 'over' && magma.front > g.p.z) frontPassed = true
      if (frontPassed && !magma.scene.children.some(o => o.isGroup && o.visible && Math.abs(o.position.z - g.p.z) < 0.5 && o.children.some(c => c.isSkinnedMesh || c.type === 'Group'))) hidden = true
    }
    return { why: g.p.dead, mode: magma.mode, engulfMax, frontPassed, hidden, ms: Math.round(performance.now() - t0), resWhy: document.getElementById('resWhy').textContent, line: document.getElementById('resLine').textContent }
  })
  expect(r.why === 'wave' && r.mode === 'result' && r.engulfMax > 0.9 && r.frontPassed && r.resWhy === 'マグマの津波に飲まれた' && r.line.length > 0 && r.ms > 1500, JSON.stringify(r)); return r
})
await t('津波が遠ければ屋上で止まっていても大丈夫', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => { magma.dbg.pause(true); const g = magma.g; g.waveZ = g.p.z - 60; magma.dbg.step(60 * 3); magma.dbg.pause(false); return { over: g.over, gap: +(g.p.z - g.waveZ).toFixed(1), grounded: g.p.grounded } })
  expect(!r.over && r.gap > 30 && r.grounded, JSON.stringify(r)); return r
})
await t('津波までの距離の表示が正しい・近いと点滅', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => {
    magma.dbg.pause(true); const g = magma.g, out = []
    for (const gap of [87.4, 41.6, 29.4, 3.2]) { g.waveZ = g.p.z - gap; magma.dbg.step(0); out.push([gap, document.getElementById('tsuM').textContent, document.getElementById('tsu').classList.contains('near')]) }
    magma.dbg.pause(false); return out
  })
  const ok = r.every(([gap, txt, near]) => Number(txt) === Math.round(gap) && near === (Math.round(gap) < 30))
  expect(ok, JSON.stringify(r)); return r.map(x => x.join(':')).join(' ')
})
await t('迫力: 速いと速さの線・視野が広がる・風の音が大きく、遅いと出ない（空中しっぽ取り v5 から）', async () => {
  await p.evaluate(() => magma.start(12))
  const r = await p.evaluate(() => {
    magma.dbg.pause(true); const g = magma.g, out = {}
    for (const [k, v] of [['slow', 8], ['fast', 36]]) {
      Object.assign(g.p, { grounded: false, y: 14, vx: 0, vy: 0, vz: v }); g.waveZ = g.p.z - 100
      for (let i = 0; i < 40; i++) { Object.assign(g.p, { y: 14, vy: 0, vz: v }); magma.dbg.step(0) }
      const c = document.getElementById('speedfx'), cx = c.getContext('2d')
      let lit = 0; if (c.width) { const d = cx.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) lit++ }
      const al = Snd.loops.air; out[k] = { ...magma.dbg.fx(), lit, air: al && al.g ? al.g.gain.value : -1 }
    }
    magma.dbg.pause(false); return { slowK: out.slow.speedK, fastK: +out.fast.speedK.toFixed(2), slowLit: out.slow.lit, fastLit: out.fast.lit, fovSlow: +out.slow.fov.toFixed(1), fovFast: +out.fast.fov.toFixed(1), airSlow: +out.slow.air.toFixed(2), airFast: +out.fast.air.toFixed(2) }
  })
  expect(r.slowK === 0 && r.slowLit === 0 && r.fastK > 0.8 && r.fastLit > 50 && r.fovFast - r.fovSlow > 8 && r.fovFast <= 62 + 18 + 7 && r.airFast > r.airSlow + 0.3, JSON.stringify(r)); return r
})
await t('迫力: リール・屋上に着いた・津波を振り切った瞬間に一瞬止まって光る。カメラの傾きは0.1rad以内', async () => {
  await p.evaluate(() => magma.start(13))
  const r = await p.evaluate(async () => {
    const g = magma.g, m = magma.sim, out = {}
    magma.dbg.pause(true)
    // リール
    const it = g.C.items.find(q => !q.taken); Object.assign(g.p, { x: it.x, y: it.y - 1, z: it.z, vx: 0, vy: 0, vz: 0, rope: null, grounded: false }); g.waveZ = g.p.z - 100
    magma.dbg.step(1); out.pick = { ...magma.dbg.fx() }
    // 津波を振り切る: 20m まで寄られてから 80m 離す
    g.waveZ = g.p.z - 20; magma.dbg.step(0); g.waveZ = g.p.z - 80; magma.dbg.step(0); out.esc = { ...magma.dbg.fx(), toast: document.getElementById('toast').textContent }
    // 実時間でヒットストップ中は sim が止まる
    magma.dbg.pause(false); const t0 = g.t; await new Promise(r => setTimeout(r, 50)); const tStop = g.t - t0
    await new Promise(r => setTimeout(r, 400)); const after = magma.dbg.fx()
    // ワイヤーで振れている間の傾き
    let maxBank = 0; magma.dbg.pause(true)
    const h = g.C.hooks.find(q => q.z > g.p.z + 8) || g.C.hooks[3]
    Object.assign(g.p, { x: h.x + 8, y: h.y - 14, z: h.z - 6, vx: -30, vy: 0, vz: 10, grounded: false, cling: null, rope: { x: h.x, y: h.y, z: h.z, len: 18, t: 0, h: h.i } }); g.waveZ = g.p.z - 100
    for (let i = 0; i < 90; i++) { magma.dbg.step(1); maxBank = Math.max(maxBank, Math.abs(magma.dbg.fx().bank)) }
    magma.dbg.pause(false)
    return { pick: +out.pick.hitStop.toFixed(2), pickFlash: +out.pick.flashA.toFixed(2), esc: +out.esc.hitStop.toFixed(2), escFlash: +out.esc.flashA.toFixed(2), toast: out.esc.toast, tStop: +tStop.toFixed(3), afterStop: +after.hitStop.toFixed(2), afterFlash: +after.flashA.toFixed(2), maxBank: +maxBank.toFixed(3) }
  })
  expect(r.pick > 0.02 && r.pickFlash > 0.2 && r.esc >= 0.1 && r.escFlash > 0.9 && r.toast === '振り切った！' && r.tStop < 0.02 && r.afterStop <= 0 && r.afterFlash < 0.05 && r.maxBank > 0.02 && r.maxBank <= 0.1001, JSON.stringify(r)); return r
})
await t('迫力: 屋上に着地すると一瞬止まって揺れる', async () => {
  await p.evaluate(() => magma.start(14))
  const r = await p.evaluate(() => {
    const g = magma.g; magma.dbg.pause(true)
    const b = g.C.boxes.find(q => !q.start) || g.C.boxes[0]; g.waveZ = b.z0 - 100
    Object.assign(g.p, { x: (b.x0 + b.x1) / 2, y: b.y1 + 0.3, z: (b.z0 + b.z1) / 2, vx: 0, vy: -14, vz: 18, grounded: false, rope: null, cling: null })
    for (let i = 0; i < 4 && !g.p.grounded; i++) magma.dbg.step(1)
    const f = magma.dbg.fx(); magma.dbg.pause(false); return { grounded: g.p.grounded, hitStop: +f.hitStop.toFixed(2), kick: +f.kick.toFixed(2) }
  })
  expect(r.grounded && r.hitStop > 0.04 && r.kick > 0.1, JSON.stringify(r)); return r
})
await t('スイングは少しだけ速い（ワイヤー中だけ重力1.07倍・空気抵抗0.0035）', async () => {
  const r = await p.evaluate(() => ({ g: magma.sim.K.ROPEG, d: magma.sim.K.DRAG }))
  expect(r.g === 1.07 && r.d === 0.0035, JSON.stringify(r)); return r
})
await t('津波は130mより後ろに離れない（休み続けると追いつかれる）', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => { magma.dbg.pause(true); const g = magma.g; Object.assign(g.p, { z: 900, y: 30, vz: 0 }); g.waveZ = -45; magma.dbg.step(1); const gap = g.p.z - g.waveZ; magma.dbg.pause(false); return { gap: +gap.toFixed(1) } })
  expect(r.gap <= 130.01 && r.gap > 120, JSON.stringify(r)); return r
})
await t('マグマに落ちたら終わり、結果に距離と自己ベストが出る', async () => {
  await p.evaluate(() => magma.start(11))
  await p.evaluate(() => { const g = magma.g; Object.assign(g.p, { x: 0, y: 2, z: 120, vx: 0, vy: -3, vz: 0, grounded: false }); g.p.maxZ = 120; g.waveZ = -100 })
  await p.waitForFunction(() => magma.mode === 'result', null, { timeout: 6000 })
  const r = await p.evaluate(() => ({ why: document.getElementById('resWhy').textContent, m: document.getElementById('resM').textContent, best: localStorage.getItem('ms.best'), res: window.__lastResult }))
  expect(r.why === 'マグマに着地' && r.m === '120' && r.best === '120', JSON.stringify(r)); return r
})
await t('何もしないとマグマの津波に飲まれて最低の結果', async () => {
  await p.evaluate(() => { localStorage.setItem('ms.tut', '1'); magma.start(11) })
  const r = await p.evaluate(() => { magma.dbg.pause(true); magma.dbg.step(60 * 40); magma.dbg.pause(false); return { over: magma.g.over, why: magma.g.p.dead, m: Math.round(magma.g.p.maxZ), t: Math.round(magma.g.t) } })
  await p.waitForTimeout(1500)
  expect(r.over && r.why === 'wave' && r.m < 5, JSON.stringify(r)); return r
})
await t('片手: 押している間つかみ、離すと放す', async () => {
  await p.evaluate(() => magma.start(11, { easy: true }))
  const r = await p.evaluate(() => {
    magma.dbg.pause(true); const g = magma.g
    magma.setHold(true); magma.dbg.step(20); const roped = !!g.p.rope
    magma.dbg.step(40); magma.setHold(false); magma.dbg.step(1); const released = !g.p.rope
    magma.dbg.pause(false)
    return { roped, released, easy: g.easy, stickHidden: getComputedStyle(document.getElementById('stick')).display === 'none' }
  })
  await p.evaluate(() => magma.start(11, { easy: false }))
  expect(r.roped && r.released && r.easy && r.stickHidden, JSON.stringify(r)); return r
})
await t('長く進んでからやり直しても、スタートの周りに街がある（後ろにも）', async () => {
  await p.evaluate(() => magma.start(11))
  const r = await p.evaluate(() => {
    const near = () => { let f = 0, bk = 0; for (const im of magma.scene.children.filter(o => o.isInstancedMesh)) for (let i = 0; i < im.count; i++) { const z = im.instanceMatrix.array[i * 16 + 14]; if (z > -20 && z < 200) f++; if (z < -60 && z > -240) bk++ } return [f, bk] }
    magma.dbg.pause(true); const g = magma.g
    for (let z = 0; z <= 4000; z += 50) { g.p.z = z; magma.dbg.step(0) }
    const far = near()
    magma.start(12); magma.dbg.step(0); const again = near(); magma.dbg.pause(false)
    return { far, again }
  })
  expect(r.far[0] === 0 && r.again[0] > 10 && r.again[1] > 10, JSON.stringify(r)); return r
})
await t('進むと昼から夜へ暗くなる', async () => {
  await p.evaluate(() => magma.start(11))
  const a = await p.evaluate(() => window.__night)
  await p.evaluate(() => { magma.g.p.maxZ = 1700 }); await p.waitForTimeout(2500)
  const b = await p.evaluate(() => window.__night)
  expect(a < 0.1 && b > 0.85, JSON.stringify({ a, b })); return { start: +a.toFixed(2), late: +b.toFixed(2) }
})
await t('英語に切り替わる', async () => {
  await p.evaluate(() => magma.showResult()); await p.waitForTimeout(1500)
  await p.click('#btnTitle'); await p.waitForTimeout(300)
  await p.click('#btnLang')
  const r = await p.evaluate(() => ({ logo: document.querySelector('.g-logo').textContent, lang: document.documentElement.lang }))
  await p.click('#btnLang')
  expect(r.logo === 'MAGMA SWING' && r.lang === 'en', JSON.stringify(r))
})
await t('結果を画像で保存できる', async () => {
  await p.evaluate(() => magma.start(11)); await p.evaluate(() => magma.showResult())
  await p.waitForFunction(() => magma.mode === 'result')
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#btnSave')])
  return dl.suggestedFilename()
})
await t('テスト中は実際に無音', async () => { const r = await p.evaluate(() => window.__muteOk()); expect(r === true, String(r)) })
await t('通しでエラーが出ていない', async () => { expect(p.errs.length === 0, p.errs.slice(0, 3).join('|')) })
await p.close()

// 6サイズ × 全画面
for (const [w, h, name] of SIZES) {
  const touch = w < 1000
  const q = await open(browser, { viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch })
  const views = {}
  await q.waitForTimeout(600)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#btnHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('#btnHowClose')
  await q.click('#btnStart'); await q.waitForTimeout(2200); views.intro = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-intro.png` })
  await q.waitForFunction(() => magma.mode === 'play', null, { timeout: 6000 }); await q.evaluate(() => { magma.g.waveZ = magma.g.p.z - 18 }); await q.waitForTimeout(500)
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.evaluate(() => magma.showResult()); await q.waitForFunction(() => magma.mode === 'result'); await q.waitForTimeout(300)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  await t(`一画面に収まり重ならない ${name} ${w}x${h}`, async () => {
    const bad = Object.entries(views).filter(([, v]) => v.over.length).map(([k, v]) => k + ':' + v.over.join(','))
    expect(bad.length === 0 && q.errs.length === 0, bad.join(' | ') + q.errs.join('|'))
  })
  await q.close()
}
await browser.close()

// WebKit（iPhone の Safari 相当）
const wk = await webkit.launch()
const wp = await open(wk, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: タップで出発・演出のあとワイヤーボタン・スティック', async () => {
  await wp.tap('#btnStart'); await wp.waitForTimeout(300)
  const intro = await wp.evaluate(() => magma.mode)
  await wp.waitForFunction(() => magma.mode === 'play', null, { timeout: 6000 })
  const r0 = await wp.evaluate(() => magma.mode)
  expect(intro === 'intro', 'intro ' + intro)
  const box = await wp.locator('#stick').boundingBox()
  await wp.evaluate(({ x, y }) => {
    const el = document.getElementById('stick')
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, clientX: x, clientY: y, bubbles: true }))
    el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 5, clientX: x, clientY: y - 60, bubbles: true }))
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await wp.waitForTimeout(400)
  const moved = await wp.evaluate(() => magma.g.p.z)
  await wp.tap('#btnJump'); await wp.waitForTimeout(150); await wp.tap('#btnWire'); await wp.waitForTimeout(100)
  const roped = await wp.evaluate(() => !!magma.g.p.rope)
  expect(r0 === 'play' && moved > 0.5 && roped, JSON.stringify({ r0, moved, roped })); return { moved: +moved.toFixed(1), roped }
})
await t('WebKit: 無音・エラーなし', async () => { const m = await wp.evaluate(() => window.__muteOk()); expect(m === true && wp.errs.length === 0, m + ' ' + wp.errs.join('|')) })
await wk.close()
server.kill()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
