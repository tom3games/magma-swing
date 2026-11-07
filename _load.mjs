import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 読み込みの速さを測る。Fast 3G 相当（下り 1.6Mbps・遅延 150ms）。node _load.mjs [URL]
// 準備完了 = 人物の読み込みまで終わった時（__magmaLoaded、古い版は #loading が消えた時）
import { chromium } from 'playwright'
const URL0 = process.argv[2] || 'https://tom3games.github.io/magma-swing/'
const runs = Number(process.env.RUNS || 2)
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-unsafe-swiftshader'] })
const out = []
for (let r = 0; r < runs; r++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await muteContext(ctx)
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
  const req = {}
  cdp.on('Network.requestWillBeSent', e => { req[e.requestId] = { url: e.request.url, t0: e.timestamp } })
  cdp.on('Network.loadingFinished', e => { const q = req[e.requestId]; if (q) { q.bytes = e.encodedDataLength; q.t1 = e.timestamp } })
  const t0 = Date.now()
  await p.goto(URL0 + (URL0.includes('?') ? '&' : '?') + 't=' + Date.now(), { waitUntil: 'commit' })
  let firstBoot = null
  const poll = setInterval(async () => { try { if (firstBoot == null && await p.evaluate(() => { const b = document.getElementById('boot'); return !!(b && b.getBoundingClientRect().height > 0) })) firstBoot = (Date.now() - t0) / 1000 } catch {} }, 100)
  await p.waitForFunction(() => window.__magmaLoaded || (window.__magmaReady && document.getElementById('loading') && document.getElementById('loading').hidden), null, { timeout: 180000, polling: 100 })
  const sec = (Date.now() - t0) / 1000; clearInterval(poll)
  const fcp = await p.evaluate(() => { const e = performance.getEntriesByName('first-contentful-paint')[0]; return e ? +(e.startTime / 1000).toFixed(2) : null })
  const list = Object.values(req).filter(q => q.bytes).sort((a, b) => b.bytes - a.bytes)
  const total = list.reduce((s, q) => s + q.bytes, 0)
  out.push(`run${r + 1}: ready ${sec.toFixed(1)}s  firstPaint ${fcp}s  bootShown ${firstBoot}s  ${list.length} files ${(total / 1024).toFixed(0)}KB`)
  if (r === 0) for (const q of list.slice(0, 10)) out.push(`  ${(q.bytes / 1024).toFixed(0).padStart(5)}KB ${(q.t1 - q.t0).toFixed(1).padStart(5)}s ${q.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 70)}`)
  await ctx.close()
}
await b.close()
console.log(out.join('\n'))
