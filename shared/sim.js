// 地面はマグマ の中身（描画なし。ブラウザと node の bot で同じ物を動かす）
// 座標: +z が前（進む向き）、y が上、画面の右は -x。足もとの高さ y が 0.25 を切ったらマグマ
// ワイヤー（本人の好み 2026-11-02）: 巻取ボタンは無い。掛けた長さから、重力を残したまま振り子として縮める
//   - 掛けた直後: マグマに届かない長さ（フックの高さ−4.5m）まで 9m/秒 で縮める（引き寄せではなく振り子が短くなる）
//   - そのあと: 7m まで 1.2m/秒 でゆっくり縮める
//   - 掛けられるのは光るフックだけ。届く距離 RANGE を超えたら ×
export const K = {
  G: 20,            // 重力
  RANGE: 50,        // ワイヤーが届く距離
  RUN: 7,           // 屋上を走る速さ（飛ぶ方がずっと速い）
  JUMP: 8.5,
  CLIMB: 3.6,       // 壁を這う速さ（上下左右）
  AIR: 5,           // 空中でスティックが効く加速
  PUMP: 3.2,        // 振り子をこぐ加速（スティック前）
  TUG: 9, REEL: 1.2, MINLEN: 7, SAFE: 4.5,
  LAVA: 0.25,
  DRAG: 0.004,
  WAVE0: 6, WAVEA: 0.09, WAVEMAX: 30,   // 後ろから来る溶岩の波（m/秒、毎秒これだけ速くなる、上限）
  DT: 1 / 60,
}

export function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647 }

// コースを前へ伸ばす（無限）。フックの間隔は進むほど広がる
export function makeCourse(seed) {
  const r = rng(seed)
  const C = { r, hooks: [], boxes: [], hz: 0, hx: 0, bz: 0, seed }
  C.boxes.push({ x0: -6, x1: 6, z0: -10, z1: 9, y1: 10, start: true })   // スタートの屋上
  C.hz = 4; C.bz = 170
  extend(C, 300)
  return C
}
const KINDS = ['pole', 'lamp', 'sign', 'pole', 'crane', 'sign', 'lamp']
export function extend(C, toZ) {
  const r = C.r
  while (C.hz < toZ) {
    const z = C.hz
    const gap = (z < 40 ? 15 : 15 + Math.min(13, z * 0.006)) + r() * 4
    C.hz += gap
    C.hx = Math.max(-9, Math.min(9, C.hx + (r() - 0.5) * 11))
    const kind = KINDS[Math.floor(r() * KINDS.length)]
    const y = (kind === 'crane' ? 22 : 18) + r() * 5 + Math.min(3, z * 0.002)
    C.hooks.push({ x: C.hx, y, z: C.hz, kind, i: C.hooks.length })
  }
  while (C.bz < toZ) {
    // 休める屋上（沈みかけのビル）。壁に張り付ける
    const w = 10 + r() * 5, d = 12 + r() * 8, cx = (r() - 0.5) * 10
    C.boxes.push({ x0: cx - w / 2, x1: cx + w / 2, z0: C.bz, z1: C.bz + d, y1: 6.5 + r() * 3.5 })
    C.bz += 190 + r() * 90
  }
}
// 後ろの、もう使わない物を捨てる（無限に増えないように）
export function trim(C, z) {
  while (C.hooks.length > 4 && C.hooks[0].z < z - 60) C.hooks.shift()
  while (C.boxes.length > 1 && C.boxes[0].z1 < z - 80) C.boxes.shift()
}

export function makePlayer() {
  return { x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, grounded: true, rope: null, cling: null, dead: null, wreck: 0, stun: 0,
    maxZ: 0, maxV: 0, wires: 0, chain: 0, bestChain: 0, airT: 0, lastHook: -1 }
}

export function makeGame(seed = 1, opts = {}) {
  const g = { C: makeCourse(seed), p: makePlayer(), t: 0, waveZ: -45, waveV: K.WAVE0, events: [], easy: !!opts.easy, over: false, tutorial: opts.tutorial || 0 }
  return g
}

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z)

// 狙うフックを選ぶ。aim があれば（画面のタップ）その光線にいちばん近いフック
export function pickHook(g, aim) {
  const p = g.p, hy = p.y + 1.5
  let best = null, bs = 1e9
  for (const h of g.C.hooks) {
    const dx = h.x - p.x, dy = h.y - hy, dz = h.z - p.z, d = len3(dx, dy, dz)
    if (h.y < p.y + 2.2 || dz < -4) continue
    const reach = Math.min(K.RANGE, (h.y - K.SAFE - 1.5) + 24)   // 長すぎて振り子がマグマに届く物は届かない扱い
    if (aim) {
      // 光線 o + t*dir と点の距離
      const ox = h.x - aim.ox, oy = h.y - aim.oy, oz = h.z - aim.oz
      const t = ox * aim.dx + oy * aim.dy + oz * aim.dz; if (t < 0) continue
      const px = ox - aim.dx * t, py = oy - aim.dy * t, pz = oz - aim.dz * t
      const perp = len3(px, py, pz)
      if (perp > 4 + t * 0.12) continue
      // 届くフックを先に。その中で光線に近い物
      const s = perp / (1 + t * 0.04) + (d > reach ? 1000 : 0)
      if (s < bs) { bs = s; best = { h, d, reach } }
    } else {
      if (d > reach) continue
      // 前にあって、近すぎず、まだ使っていないフックを好む
      const s = (dz < 3 ? 40 : 0) + Math.abs(d - 22) * 0.6 + Math.abs(dx) * 0.4 + (h.i <= p.lastHook ? 25 : 0)
      if (s < bs) { bs = s; best = { h, d } }
    }
  }
  if (best && best.d > (best.reach || K.RANGE)) return { miss: 'far', h: best.h }
  return best
}

function attach(g, aim) {
  const p = g.p
  const pk = pickHook(g, aim)
  if (!pk || pk.miss) { g.events.push({ t: 'miss', far: !!(pk && pk.miss), h: pk && pk.h }); return false }
  if (p.grounded) { p.vy = K.JUMP * 0.8; p.grounded = false; p.y += 0.05 }
  p.cling = null
  const h = pk.h
  p.rope = { x: h.x, y: h.y, z: h.z, len: pk.d, h: h.i, t: 0 }
  p.wires++; if (h.i !== p.lastHook) { p.chain++; p.bestChain = Math.max(p.bestChain, p.chain) }
  p.lastHook = h.i
  g.events.push({ t: 'wire', x: h.x, y: h.y, z: h.z, d: pk.d })
  return true
}
function release(g, byJump) {
  const p = g.p; if (!p.rope) return
  p.rope = null
  // 離した瞬間の小さな後押し（気持ちよさ）
  if (p.vy > -3) p.vy += byJump ? 4 : 2.5
  if (p.vz > 2) p.vz += 1.2
  g.events.push({ t: 'release', v: Math.hypot(p.vx, p.vy, p.vz) })
}

function boxHit(b, p) { return p.x > b.x0 - 0.4 && p.x < b.x1 + 0.4 && p.z > b.z0 - 0.4 && p.z < b.z1 + 0.4 && p.y < b.y1 && p.y + 1.7 > 0 }

// 入力 inp: { mx, my（スティック -1..1、my 上が前）, wire（押した瞬間 true）, jump（押した瞬間）, hold（かんたん: 押している間 true）, aim }
export function step(g, inp = {}) {
  const p = g.p, dt = K.DT
  g.t += dt
  if (g.over) return
  // 溶岩の波
  g.waveV = Math.min(K.WAVEMAX, K.WAVE0 + g.t * K.WAVEA)
  if (g.tutorial && g.t < 12) g.waveV = 2.5
  g.waveZ += g.waveV * dt
  extend(g.C, p.z + 260); trim(g.C, Math.min(p.z, g.waveZ))

  let mx = inp.mx || 0, my = inp.my || 0
  // かんたん: 押している間つかむ、離すと放す。左右は次のフックへ自動で寄る
  if (g.easy) {
    const nh = g.C.hooks.find(h => h.z > p.z + 3)
    if (nh) mx = Math.max(-1, Math.min(1, -(nh.x - p.x) * 0.25))
    if (p.grounded) my = 1
    g._holdCd = (g._holdCd || 0) - dt
    if (inp.hold && !p.rope && g._holdCd <= 0 && (!g._holdUsed || !p.grounded)) { g._holdUsed = true; if (!attach(g)) g._holdCd = 0.3 }
    if (!inp.hold) { g._holdUsed = false; if (p.rope) release(g) }
  } else {
    if (inp.wire) { if (p.rope) release(g); else attach(g, inp.aim) }
    if (inp.aim && !inp.wire && !p.rope) attach(g, inp.aim)
  }
  if (inp.jump) {
    if (p.rope) release(g, true)
    else if (p.cling) { const c = p.cling; p.vx = c.nx * 7; p.vz = c.nz * 7 + 3; p.vy = K.JUMP; p.cling = null; g.events.push({ t: 'jump' }) }
    else if (p.grounded) { p.vy = K.JUMP; p.grounded = false; g.events.push({ t: 'jump' }) }
  }
  // 画面の右は -x
  const ax = -mx, az = my

  if (p.cling) {
    // 壁に張り付き中: 上下左右に這う
    const c = p.cling, b = c.b
    const rx = c.nz, rz = -c.nx   // 壁を向いた時の画面の右
    p.y += my * K.CLIMB * dt
    p.x += rx * mx * K.CLIMB * dt; p.z += rz * mx * K.CLIMB * dt
    p.vx = p.vy = p.vz = 0
    if (p.y + 0.3 >= b.y1) { p.y = b.y1; p.grounded = true; p.cling = null; p.x -= c.nx * 0.8; p.z -= c.nz * 0.8; g.events.push({ t: 'land' }) }
    else if (p.y < K.LAVA + 0.4) p.y = K.LAVA + 0.4
    const along = c.nx !== 0 ? (p.z < b.z0 - 0.2 || p.z > b.z1 + 0.2) : (p.x < b.x0 - 0.2 || p.x > b.x1 + 0.2)
    if (along) { p.cling = null; g.events.push({ t: 'unclng' }) }
  } else if (p.grounded) {
    const sp = K.RUN
    const tvx = ax * sp, tvz = az * sp
    const k = 1 - Math.exp(-dt * 10)
    p.vx += (tvx - p.vx) * k; p.vz += (tvz - p.vz) * k; p.vy = 0
    p.x += p.vx * dt; p.z += p.vz * dt
    // 屋上から外れたら落ちる
    const on = g.C.boxes.find(b => p.x > b.x0 - 0.3 && p.x < b.x1 + 0.3 && p.z > b.z0 - 0.3 && p.z < b.z1 + 0.3 && Math.abs(p.y - b.y1) < 0.2)
    if (!on) p.grounded = false
  } else {
    // 空中
    p.vy -= K.G * dt
    p.vx += ax * K.AIR * dt; p.vz += az * K.AIR * dt * (p.rope ? 0 : 1)
    // 空気の抵抗（速さの2乗）。気持ちいい速さは残しつつ、際限なく速くならない
    const sp = Math.hypot(p.vx, p.vy, p.vz), dk = Math.max(0, 1 - K.DRAG * sp * dt)
    p.vx *= dk; p.vy *= dk; p.vz *= dk
    if (p.rope) {
      const R = p.rope
      R.t += dt
      // こぐ: スティック前で、振り子の進む向きに少し足す
      const dx = p.x - R.x, dy = p.y + 1.5 - R.y, dz = p.z - R.z, d = len3(dx, dy, dz)
      if (d < R.len) R.len = Math.max(K.MINLEN, d)   // たるみは巻き取るだけ（引っぱらない）
      if (my > 0.2 && dy < 0) { p.vz += K.PUMP * my * dt }
      // 縮める（重力は残す）
      const safe = R.y - K.SAFE - 1.5
      if (R.len > safe) {
        // 真下を通るまでにマグマに届かない長さになる速さで縮める（止まっていればゆっくり、速く振れていれば速く）
        const hx = R.x - p.x, hz = R.z - p.z, horiz = Math.max(0.5, Math.hypot(hx, hz))
        const toward = Math.max(4, (p.vx * hx + p.vz * hz) / horiz)
        const tb = Math.max(0.35, horiz / toward + 0.25)
        R.len = Math.max(safe, R.len - Math.max(K.TUG, Math.min(34, (R.len - safe) / tb)) * dt)
      }
      else if (R.len > K.MINLEN && dy < 0) R.len = Math.max(K.MINLEN, R.len - K.REEL * dt)
      void d
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
    if (p.rope) {
      const R = p.rope
      const dx = p.x - R.x, dy = p.y + 1.5 - R.y, dz = p.z - R.z, d = len3(dx, dy, dz)
      if (d > R.len) {
        const nx = dx / d, ny = dy / d, nz = dz / d
        p.x = R.x + nx * R.len; p.y = R.y + ny * R.len - 1.5; p.z = R.z + nz * R.len
        const vr = p.vx * nx + p.vy * ny + p.vz * nz
        if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; p.vz -= vr * nz }
      }
    }
    // 建物
    for (const b of g.C.boxes) {
      if (!boxHit(b, p)) continue
      const pen = [
        ['top', b.y1 - p.y], ['x0', p.x - (b.x0 - 0.4)], ['x1', (b.x1 + 0.4) - p.x], ['z0', p.z - (b.z0 - 0.4)], ['z1', (b.z1 + 0.4) - p.z],
      ].sort((a, c) => a[1] - c[1])[0]
      if (pen[0] === 'top' || (p.vy < 0 && b.y1 - p.y < 0.6)) {
        p.y = b.y1; p.vy = 0; p.grounded = true; if (p.rope) p.rope = null
        p.chain = 0
        g.events.push({ t: 'land', v: Math.hypot(p.vx, p.vz) })
      } else {
        const n = { x0: [-1, 0], x1: [1, 0], z0: [0, -1], z1: [0, 1] }[pen[0]]
        if (n[0] < 0) p.x = b.x0 - 0.41; if (n[0] > 0) p.x = b.x1 + 0.41; if (n[1] < 0) p.z = b.z0 - 0.41; if (n[1] > 0) p.z = b.z1 + 0.41
        p.cling = { b, nx: n[0], nz: n[1] }; p.rope = null; p.vx = p.vy = p.vz = 0
        g.events.push({ t: 'cling' })
      }
    }
  }
  const v = Math.hypot(p.vx, p.vy, p.vz)
  p.maxV = Math.max(p.maxV, v)
  p.maxZ = Math.max(p.maxZ, p.z)
  if (Math.hypot(p.vx, p.vz) > 0.8 && !p.cling) p.yaw = Math.atan2(p.vx, p.vz)
  else if (p.cling) p.yaw = Math.atan2(-p.cling.nx, -p.cling.nz)
  p.airT = p.grounded || p.cling ? 0 : p.airT + dt
  // 終わり
  if (p.y < K.LAVA) { p.dead = 'lava'; g.over = true; g.events.push({ t: 'dead', why: 'lava' }) }
  else if (p.z < g.waveZ) { p.dead = 'wave'; g.over = true; g.events.push({ t: 'dead', why: 'wave' }) }
}

// bot（検証用）。skill: 1=上手い 0=下手。返すのは入力
export function botInput(g, B) {
  const p = g.p, r = B.r
  const inp = { mx: 0, my: 1 }
  B.cool = (B.cool || 0) - K.DT
  const nh = g.C.hooks.find(h => h.z > p.z + 4)
  if (nh) inp.mx = Math.max(-1, Math.min(1, -(nh.x - p.x) * 0.3 + (B.skill < 1 ? (r() - 0.5) * 0.8 : 0)))
  const late = B.skill < 1 ? B.delay : 0
  if (p.cling) { inp.my = 1; if (p.cling.b.y1 - p.y > 5 && B.cool <= 0) { inp.jump = true; B.cool = 0.5 } return inp }
  if (p.grounded) {
    // 屋上の前の端まで走って跳ぶ（跳んだら掛ける）
    const b = g.C.boxes.find(b => p.z >= b.z0 - 0.5 && p.z <= b.z1 + 0.5)
    if (!b || p.z > b.z1 - 1.5 - (B.skill < 1 ? r() * 3 : 0)) { inp.jump = true; B.wantWire = 0.15 + late }
    return inp
  }
  if (!p.rope) {
    B.wantWire = (B.wantWire == null ? 0 : B.wantWire) - K.DT
    const falling = p.vy < 1 || p.y < 9
    if (falling && B.wantWire <= 0 && B.cool <= 0) {
      if (B.pendWire == null) B.pendWire = late
      B.pendWire -= K.DT
      if (B.pendWire <= 0) { inp.wire = true; B.pendWire = null; B.cool = 0.25 }
    }
  } else {
    const R = p.rope
    // 振り子が前へ上がっていく途中で離す（上手いほど良い角度）
    const ang = Math.atan2(p.z - R.z, R.y - (p.y + 1.5))
    const want = B.skill >= 1 ? 0.55 : 0.55 + B.err
    if (R.t > 0.35 && p.vz > 2 && ang > want && p.vy > 0) {
      if (B.pendRel == null) B.pendRel = late
      B.pendRel -= K.DT
      if (B.pendRel <= 0) { inp.wire = true; B.pendRel = null; B.cool = 0.3; B.wantWire = 0.25 + (B.skill < 1 ? r() * 0.4 : 0); if (B.skill < 1) { B.err = (r() - 0.5) * 0.9; B.delay = 0.12 + r() * 0.45 } }
    }
    // 振り子が止まりかけたら（後ろへ戻る）離して次へ
    if (R.t > 4 && Math.abs(p.vz) < 1) { inp.wire = true; B.wantWire = 0 }
  }
  return inp
}
export function makeBot(skill, seed) { const r = rng(seed * 7 + 3); return { skill, r, err: skill < 1 ? (r() - 0.5) * 0.9 : 0, delay: skill < 1 ? 0.12 + r() * 0.45 : 0 } }

// かんたん操作の bot（押す・離すだけ）
export function botEasy(g, B) {
  const p = g.p, inp = { hold: !!B.holding }
  if (p.grounded) { const b = g.C.boxes.find(b => p.z >= b.z0 - 0.5 && p.z <= b.z1 + 0.5); if (!b || p.z > b.z1 - 2) inp.hold = B.holding = true; return inp }
  if (!p.rope && !B.holding) { if (p.vy < 1 || p.y < 9) inp.hold = B.holding = true }
  else if (p.rope) {
    const R = p.rope, ang = Math.atan2(p.z - R.z, R.y - (p.y + 1.5))
    if (R.t > 0.35 && p.vz > 2 && ang > 0.55 + (B.err || 0) && p.vy > 0) { inp.hold = B.holding = false; if (B.skill < 1) B.err = (B.r() - 0.5) * 0.9 }
    if (R.t > 4 && Math.abs(p.vz) < 1) inp.hold = B.holding = false
  } else if (!p.rope && B.holding) { inp.hold = B.holding = false }
  return inp
}
