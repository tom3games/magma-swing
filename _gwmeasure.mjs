// 地面ワイヤーの数字を測る。node _gwmeasure.mjs（25m/秒までの秒・掛けている間の最高速・外れた後に上がる高さ）
import { K, makeGame, step } from './shared/sim.js'
const aimTo = (p, x, y, z) => { const ox = p.x, oy = p.y + 4, oz = p.z - 6, dx = x - ox, dy = y - oy, dz = z - oz, l = Math.hypot(dx, dy, dz); return { ox, oy, oz, dx: dx / l, dy: dy / l, dz: dz / l } }
const out = []
for (const [name, h, back, tz] of [['高い所から屋上の手前', 12, 26, 3], ['低い所から屋上の奥', 5, 20, 10], ['遠くから', 16, 40, 4]]) {
  for (const seed of [1, 2, 3]) {
    const g = makeGame(seed), p = g.p, b = g.C.boxes.find(b => !b.start), cx = (b.x0 + b.x1) / 2
    Object.assign(p, { x: cx, y: b.y1 + h, z: b.z0 - back, vx: 0, vy: 0, vz: 12, grounded: false }); g.waveZ = p.z - 100
    step(g, { aim: aimTo(p, cx, b.y1, b.z0 + tz) })
    if (!p.rope || !p.rope.ground) { out.push(name + ' 掛からず'); continue }
    let t = 0, t25 = null, vmax = 0, relY = null, rise = 0, landVy = 0, landed = false, cling = false
    for (let i = 0; i < 400 && !g.over; i++) {
      const roped = p.rope && p.rope.ground
      step(g, {}); t += K.DT
      const v = Math.hypot(p.vx, p.vy, p.vz)
      if (roped) { vmax = Math.max(vmax, v); if (t25 == null && v >= 25) t25 = t }
      if (roped && !p.rope) relY = p.y
      if (relY != null) rise = Math.max(rise, p.y - relY)
      if (p.cling) cling = true
      if (p.grounded) { landed = true; landVy = Math.max(landVy, p.vy); break }
    }
    out.push(`${name} s${seed}: 25m/s ${t25 == null ? '届かず' : t25.toFixed(2) + '秒'} 最高速 ${vmax.toFixed(1)} 外れた後に上がる ${rise.toFixed(2)}m 着地 ${landed} 壁 ${cling}`)
  }
}
console.log(out.join('\n'))
