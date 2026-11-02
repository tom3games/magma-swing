import { makeGame, step, botInput, makeBot } from './shared/sim.js'
const g = makeGame(Number(process.argv[2]||1)); const B = makeBot(Number(process.argv[3]??1), 1); let n = 0
while (!g.over && n < 60 * 60) { const inp = botInput(g, B); step(g, inp)
  for (const e of g.events) if (e.t !== 'land' || 1) console.log(g.t.toFixed(2), e.t, JSON.stringify(e).slice(0,80), 'p', g.p.x.toFixed(1), g.p.y.toFixed(1), g.p.z.toFixed(1), 'v', g.p.vy.toFixed(1), g.p.vz.toFixed(1), g.p.rope ? 'L' + g.p.rope.len.toFixed(1) : '')
  g.events.length = 0; n++
  if (n % 30 === 0) console.log('  ', g.t.toFixed(1), 'p', g.p.x.toFixed(1), g.p.y.toFixed(1), g.p.z.toFixed(1), 'v', g.p.vx.toFixed(1), g.p.vy.toFixed(1), g.p.vz.toFixed(1), g.p.rope ? 'rope ' + g.p.rope.len.toFixed(1) + ' a' + g.p.rope.y.toFixed(1) + '@' + g.p.rope.z.toFixed(0) : '', g.p.grounded ? 'G' : '', g.p.cling ? 'C' : '')
}
console.log(g.p.dead, g.p.maxZ)
