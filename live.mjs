import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
import { chromium, webkit } from 'playwright'
import { execSync } from 'node:child_process'
// 個人のアカウント名は公開リポジトリに書かない。実行時に gh から取る
const OWNER = (() => { try { return execSync('gh api user -q .login', { encoding: 'utf8' }).trim().toLowerCase() } catch { return '' } })()
const URL0 = 'https://tom3games.github.io/magma-swing/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(bt === chromium ? { ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] } : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => { if (!/fonts\./.test(r.url())) errs.push('fail ' + r.url()) })
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__magmaReady && document.getElementById('loading').hidden, null, { timeout: 20000 })
  if (opts.hasTouch) await p.tap('#btnStart'); else await p.click('#btnStart')
  await p.waitForTimeout(800)
  // 遊びの通し: 跳ぶ → ワイヤー → 離す → マグマに落ちて結果
  const flow = await p.evaluate(() => {
    magma.dbg.pause(true); const g = magma.g
    magma.setStick(0, 1); magma.dbg.step(50); magma.input.jump = true; magma.dbg.step(12)
    magma.input.wire = true; magma.dbg.step(1); const roped = !!g.p.rope
    magma.dbg.step(60); magma.input.wire = true; magma.dbg.step(1); const released = !g.p.rope
    magma.setStick(0, 0)
    Object.assign(g.p, { y: 1, vy: -5, rope: null, grounded: false }); magma.dbg.step(10); magma.dbg.pause(false)
    return { roped, released, over: g.over, z: Math.round(g.p.maxZ) }
  })
  await p.waitForTimeout(2500)
  const res = await p.evaluate(() => ({ mode: magma.mode, result: window.__lastResult, mute: window.__muteOk() }))
  out.push(`${name}: flow=${JSON.stringify(flow)} result=${JSON.stringify(res)}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
const b = await chromium.launch(MUTE_LAUNCH), p = await b.newPage()
for (const u of ['https://github.com/tom3games/magma-swing', 'https://github.com/tom3games/magma-swing/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${OWNER && (await p.content()).toLowerCase().includes(OWNER) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
