// bot で遊び方ごとの距離の分布を見る。node sim.mjs
import { K, makeGame, step, botInput, botEasy, makeBot } from './shared/sim.js'
if (process.env.GAP) K.WAVEGAP = Number(process.env.GAP)
if (process.env.ROPEG) K.ROPEG = Number(process.env.ROPEG)
if (process.env.DRAG) K.DRAG = Number(process.env.DRAG)
const run = (kind, seed) => {
  const g = makeGame(seed, { easy: kind.startsWith('easy') })
  const B = makeBot(kind.endsWith('good') || kind === 'good' || kind === 'dawdle' ? 1 : 0, seed)
  let n = 0
  while (!g.over && n < 60 * 600) {
    let inp
    if (kind === 'idle') inp = {}
    else if (kind === 'runner') inp = { mx: 0, my: 1, jump: g.p.grounded && n % 30 === 0 }
    else if (kind.startsWith('easy')) inp = botEasy(g, B)
    else if (kind === 'dawdle') { inp = botInput(g, B); if (g.p.grounded && g.t > 5) { B.wait = (B.wait || 0) + 1 / 60; if (B.wait < 12) inp = {} } else B.wait = 0 }   // 上手いが屋上で12秒休む
    else inp = botInput(g, B)
    step(g, inp); g.events.length = 0; n++
  }
  return { d: Math.round(g.p.maxZ), t: Math.round(g.t), why: g.p.dead, v: Math.round(g.p.maxV * 3.6), chain: g.p.bestChain, out: g.p.left <= 0, picked: g.p.picked, wires: g.p.wires }
}
const S = Number(process.argv[2] || 12)
for (const kind of (process.env.KINDS || 'good,bad,easy-good,easy-bad,dawdle,runner,idle').split(',')) {
  const rs = Array.from({ length: S }, (_, i) => run(kind, i + 1))
  const ds = rs.map(r => r.d).sort((a, b) => a - b)
  const why = rs.reduce((m, r) => (m[r.why] = (m[r.why] || 0) + 1, m), {})
  console.log(kind.padEnd(10), 'median', ds[S >> 1], 'min', ds[0], 'max', ds[S - 1], 'time', Math.round(rs.reduce((a, r) => a + r.t, 0) / S) + 's', 'kmh', Math.round(rs.reduce((a, r) => a + r.v, 0) / S), why, '切れた', rs.filter(r => r.out).length, '拾った平均', +(rs.reduce((a, r) => a + r.picked, 0) / S).toFixed(1), '掛けた平均', Math.round(rs.reduce((a, r) => a + r.wires, 0) / S))
}
