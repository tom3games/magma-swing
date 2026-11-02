// 地面はマグマ（MAGMA SWING）の描画と入力。中身の計算は shared/sim.js
import * as THREE from 'three'
import { T } from './data.js'
import { K, makeGame, step, pickHook, botInput, makeBot } from '../shared/sim.js'
import { CharRunnerModel, loadCharAssets, charAssets } from './charmodel.js'

const $ = id => document.getElementById(id)
const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }
const S = { lang: store.get('ms.lang') || (/^ja/.test(navigator.language || 'ja') ? 'ja' : 'en'), easy: store.get('ms.easy') === '1', best: Number(store.get('ms.best') || 0), mode: 'title', paused: false, touch: matchMedia('(pointer:coarse)').matches }
const TT = () => T[S.lang]
document.body.classList.toggle('touch', S.touch)

// ---------- 音（録音素材だけ）
Snd.muted = store.get('ms.mute') === '1'
Snd.def({
  shot: 'snd/shot.mp3', hook: ['snd/hook1.mp3', 'snd/hook2.mp3'], swish: ['snd/swish1.mp3', 'snd/swish2.mp3', 'snd/swish3.mp3', 'snd/swish5.mp3'],
  wind: 'snd/wind.mp3', land: ['snd/land1.mp3', 'snd/land2.mp3'], thud: ['snd/thud1.mp3', 'snd/thud2.mp3'], cloth: 'snd/cloth.mp3',
  splash: ['snd/splash1.mp3', 'snd/splash2.mp3'], boom: 'snd/boom.mp3', miss: 'snd/miss.mp3', click: 'snd/click.mp3', ok: 'snd/ok.mp3',
  j_over: 'snd/j_over.mp3', j_best: 'snd/j_best.mp3', reel: ['snd/reel1.mp3', 'snd/reel2.mp3'], empty: 'snd/empty.mp3',
})
const bgm = name => Snd.loop('bgm', name ? `snd/${name}.mp3` : null, name === 'bgm_play' ? 0.32 : 0.36)
function soundStart() {
  Snd.init()
  if (!Snd._beds) { Snd._beds = true; Snd.loop('lava', 'snd/lava_loop.mp3', 0.28, 1, 0.55) }
}

// ---------- 描画の土台
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer:coarse)').matches ? 1.5 : 2))   // スマホは塗る画素を減らす（2026-11-02 重いと言われた）
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
$('view').appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900)
scene.fog = new THREE.Fog(0xf2d9b0, 60, 420)
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0xff6a2a, 1.1); scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 }); sun.shadow.bias = -0.0006
scene.add(sun, sun.target)
// マグマの照り返しは半球光の地面色（橙）だけで出す。点光源は重いので使わない（2026-11-02 本人「マグマが重たい」）

// 空（上下2色のグラデーション。時間で色が変わる）
const skyU = { top: { value: new THREE.Color(0x6fa8dc) }, bot: { value: new THREE.Color(0xf2d9b0) } }
const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.,1.); gl_FragColor = vec4(mix(bot, top, h),1.); }',
}))
scene.add(sky)

// マグマ（簡易版）。2026-11-02 本人「処理重たい。簡易的なやつで、周りの雰囲気に合わせて」
// 前はノイズを10回重ねるシェーダで、ソフト描画の計測で1コマ 5.5ms。いまは小さい絵を敷いてずらすだけ。霧にも馴染む
function lavaTex() {
  // 冷えて黒くなった表面に、ところどころ赤い光がにじむだけ。線は描かない（落書きに見える）
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')
  x.fillStyle = '#4a1d12'; x.fillRect(0, 0, 256, 256)
  let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  const blob = (cx, cy, rad, col) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2) } }
  for (let i = 0; i < 40; i++) blob(r() * 256, r() * 256, 18 + r() * 40, `rgba(${10 + r() * 20 | 0},${4 + r() * 6 | 0},${3 + r() * 4 | 0},.55)`)   // むら
  for (let i = 0; i < 16; i++) blob(r() * 256, r() * 256, 16 + r() * 30, `rgba(${220 + r() * 35 | 0},${60 + r() * 60 | 0},20,.7)`)   // にじむ赤
  for (let i = 0; i < 10; i++) blob(r() * 256, r() * 256, 5 + r() * 9, 'rgba(255,200,100,.85)')   // 小さい明るい点
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); return t
}
const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex(), color: 0xffffff })
const lava = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 1, 1).rotateX(-Math.PI / 2), lavaMat)
lava.position.y = 0
scene.add(lava)

// ---------- 街（沈みかけのビル。飾り）
function windowTex(seed, lit) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256
  const x = cv.getContext('2d')
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  x.fillStyle = lit ? '#000' : ['#8d8a83', '#a39c90', '#6f7378', '#9a8c7c'][seed % 4]; x.fillRect(0, 0, 128, 256)
  for (let yy = 8; yy < 256; yy += 20) for (let xx = 8; xx < 128; xx += 18) {
    if (lit) { x.fillStyle = r() < 0.45 ? `rgba(255,${190 + r() * 50 | 0},${110 + r() * 60 | 0},1)` : '#000' }
    else x.fillStyle = r() < 0.5 ? '#3b4654' : '#56606b'
    x.fillRect(xx, yy, 11, 13)
  }
  if (!lit) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 200, 128, 56) }   // 下の方は熱で煤けている
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
}
const bMats = [0, 1, 2, 3].map(i => new THREE.MeshLambertMaterial({ map: windowTex(i + 3), emissiveMap: windowTex(i + 11, true), emissive: 0xffffff, emissiveIntensity: 0 }))   // 遠景のビルは Lambert で軽く
const unitBox = new THREE.BoxGeometry(1, 1, 1)
// 70棟を材質ごとの InstancedMesh 4つで描く（前は1棟1回で 62 回描いていて、ソフト描画の計測で 8ms かかっていた）
for (const m of bMats) m.map.repeat.set(2, 5)
const city = []   // { side, w, h, d, off, x, y, z, mat, slot }
const cityIM = bMats.map(m => { const im = new THREE.InstancedMesh(unitBox, m, 18); im.count = 0; im.frustumCulled = false; scene.add(im); return im })
const _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _p0 = new THREE.Vector3(), _s0 = new THREE.Vector3()
function putBuilding(b) { _m4.compose(_p0.set(b.x, b.y, b.z), _q0, _s0.set(b.w, b.h, b.d)); cityIM[b.mat].setMatrixAt(b.slot, _m4); cityIM[b.mat].instanceMatrix.needsUpdate = true }
{
  let r = 12345; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 70; i++) {
    const side = i % 2 ? 1 : -1, mat = i % 4
    const w = 10 + rnd() * 14, d = 10 + rnd() * 16, h = 10 + rnd() * 38
    const off = 18 + rnd() * 26 + w / 2
    const b = { side, w, h, d, off, mat, slot: cityIM[mat].count++, x: side * off, y: h / 2 - 6, z: -60 + Math.floor(i / 2) * 22 + rnd() * 6 }
    city.push(b); putBuilding(b)
  }
}
function updateCity(z) {
  for (const b of city) if (b.z < z - 80) { b.z += 35 * 22; putBuilding(b) }
}

// ---------- コースの物（フック・休める屋上）
const hookMeshes = new Map(), boxMeshes = new Map()
const steel = new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.55, metalness: 0.6 })
const concrete = new THREE.MeshStandardMaterial({ color: 0x9d968b, roughness: 0.9 })
const craneMat = new THREE.MeshStandardMaterial({ color: 0xd8a21f, roughness: 0.6, metalness: 0.2 })
const ringMat = () => new THREE.MeshStandardMaterial({ color: 0xffc04a, emissive: 0xffa21f, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 })
const ringGeo = new THREE.TorusGeometry(0.6, 0.13, 8, 20)
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,220,140,1)'); g.addColorStop(0.35, 'rgba(255,160,50,.5)'); g.addColorStop(1, 'rgba(255,120,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
function signTex(i) {
  const words = S.lang === 'ja' ? ['徐行', 'この先 溶岩', '止まれ', '足元注意', '熱い', '飛べ'] : ['SLOW', 'LAVA AHEAD', 'STOP', 'WATCH STEP', 'HOT', 'JUMP']
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')
  const red = i % 3 === 2
  x.fillStyle = red ? '#c8261d' : '#1d4f9c'; x.fillRect(0, 0, 256, 128)
  x.strokeStyle = '#f7f7f2'; x.lineWidth = 8; x.strokeRect(10, 10, 236, 108)
  x.fillStyle = '#f7f7f2'; x.font = `700 ${words[i % 6].length > 5 ? 38 : 54}px "BIZ UDPGothic", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(words[i % 6], 128, 66)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function makeHook(h) {
  const g = new THREE.Group(); g.position.set(h.x, 0, h.z)
  const top = h.y
  if (h.kind === 'crane') {
    const tx = h.x > 0 ? -5 : 5
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, top + 3, 1.4), craneMat); tower.position.set(tx, (top + 3) / 2 - 1, 0)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(tx) + 2, 0.7, 0.8), craneMat); arm.position.set(tx / 2, top + 1.9, 0)
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), steel); cable.position.set(0, top + 0.9, 0)
    g.add(tower, arm, cable)
  } else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(h.kind === 'pole' ? 0.22 : 0.16, 0.3, top + 1, 8), h.kind === 'pole' ? concrete : steel)
    pole.position.y = (top + 1) / 2 - 1.2; g.add(pole)
    if (h.kind === 'pole') {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.18), steel); arm.position.y = top - 1.3; g.add(arm)
    } else if (h.kind === 'lamp') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0 }))
      head.position.set(0, top - 1.4, 0.6); g.add(head); g.userData.lamp = head.material
    } else if (h.kind === 'sign') {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshStandardMaterial({ map: signTex(h.i), side: THREE.DoubleSide, roughness: 0.6 }))
      board.position.set(0, top - 2.6, -0.2); board.rotation.y = Math.PI; g.add(board)
    }
  }
  const ring = new THREE.Mesh(ringGeo, ringMat()); ring.position.y = top; ring.rotation.y = Math.PI / 2; g.add(ring)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }))
  glow.position.y = top; glow.scale.setScalar(3.2); g.add(glow)
  g.userData.ring = ring; g.userData.glow = glow
  scene.add(g)
  return g
}
function makeBoxMesh(b) {
  const h = b.y1 + 8, m = new THREE.Mesh(unitBox, bMats[(b.z0 | 0) % 4])
  m.scale.set(b.x1 - b.x0, h, b.z1 - b.z0); m.position.set((b.x0 + b.x1) / 2, b.y1 - h / 2, (b.z0 + b.z1) / 2)
  m.receiveShadow = true
  const roof = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.3, b.z1 - b.z0), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.95 }))
  roof.position.set(m.position.x, b.y1 - 0.12, m.position.z); roof.receiveShadow = true
  const grp = new THREE.Group(); grp.add(m, roof)
  // 屋上の小物（室外機・給水タンク・縁の立ち上がり）。当たり判定はなし
  const cx = m.position.x, cz = m.position.z, W = b.x1 - b.x0, D = b.z1 - b.z0
  const ac = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.7 })
  // 走る道（まん中）とカメラの通り道（後ろ側）を空けて、横の縁に寄せる
  const side = b.start ? 1 : (b.x0 + b.x1 > 0 ? -1 : 1)
  for (let i = 0; i < 3; i++) { const u = new THREE.Mesh(unitBox, ac); u.scale.set(0.7, 0.9, 1.1); u.position.set(cx + side * (W / 2 - 0.9), b.y1 + 0.45, cz + (i - 1) * 1.6 + D * 0.15); u.castShadow = true; grp.add(u) }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14), new THREE.MeshStandardMaterial({ color: 0x8fa3ad, roughness: 0.5, metalness: 0.3 }))
  tank.position.set(cx - side * (W / 2 - 1.4), b.y1 + 1.3, cz + D * 0.3); tank.castShadow = true; grp.add(tank)
  const legs = new THREE.Mesh(unitBox, steel); legs.scale.set(1.6, 0.6, 1.6); legs.position.set(tank.position.x, b.y1 + 0.3, tank.position.z); grp.add(legs)
  for (const [sx, sz, lx, lz] of [[0, -D / 2, W, 0.25], [0, D / 2, W, 0.25], [-W / 2, 0, 0.25, D], [W / 2, 0, 0.25, D]]) { const e = new THREE.Mesh(unitBox, concrete); e.scale.set(lx, 0.5, lz); e.position.set(cx + sx, b.y1 + 0.2, cz + sz); grp.add(e) }
  scene.add(grp)
  return grp
}
function syncCourse(g) {
  const live = new Set()
  for (const h of g.C.hooks) { live.add(h.i); if (!hookMeshes.has(h.i)) hookMeshes.set(h.i, makeHook(h)) }
  for (const [i, m] of hookMeshes) if (!live.has(i)) { scene.remove(m); m.traverse(o => { if (o.geometry && o.geometry !== ringGeo && o.geometry !== unitBox) o.geometry.dispose() }); hookMeshes.delete(i) }
  const lb = new Set(g.C.boxes)
  for (const b of g.C.boxes) if (!boxMeshes.has(b)) boxMeshes.set(b, makeBoxMesh(b))
  for (const [b, m] of boxMeshes) if (!lb.has(b)) { scene.remove(m); boxMeshes.delete(b) }
}
function clearCourse() {
  for (const m of hookMeshes.values()) scene.remove(m); hookMeshes.clear()
  for (const m of boxMeshes.values()) scene.remove(m); boxMeshes.clear()
  for (const m of reelMeshes.values()) scene.remove(m); reelMeshes.clear()
}

// ワイヤー
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.5 }))
rope.visible = false; scene.add(rope)

// 溶岩の波（後ろから来る壁）。板1枚＋縦のグラデーションの絵をずらすだけ
function waveTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, 'rgba(255,140,40,0)'); g.addColorStop(0.25, 'rgba(255,150,50,.75)'); g.addColorStop(0.55, 'rgba(230,70,20,.95)'); g.addColorStop(1, 'rgba(120,25,10,1)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 256)
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,${200 + r() * 50 | 0},120,${0.15 + r() * 0.25})`; x.fillRect(r() * 64, 60 + r() * 190, 2 + r() * 6, 10 + r() * 30) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); return t
}
const waveMat = new THREE.MeshBasicMaterial({ map: waveTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })
const wave = new THREE.Mesh(new THREE.PlaneGeometry(160, 34, 1, 1), waveMat)
wave.position.y = 15; scene.add(wave)

// 補充のリール（空中に浮かぶ）。ドラムは回転体1つ（両側の円盤と芯を1つの形に）＋光1枚。描くのは前方 140m だけ
const reelMeshes = new Map()
const reelGeo = (() => {
  const P = [[0, -0.5], [0.75, -0.5], [0.75, -0.38], [0.42, -0.38], [0.42, 0.38], [0.75, 0.38], [0.75, 0.5], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(P, 14).rotateZ(Math.PI / 2)
  const col = [], pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getY(i), pos.getZ(i)), core = r < 0.5 && Math.abs(pos.getX(i)) < 0.39; core ? col.push(0.17, 0.17, 0.17) : col.push(0.79, 0.64, 0.42) }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g
})()
const reelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x6a3a08, emissiveIntensity: 0.35 })
const reelGlowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.8 })
function makeReel(it) {
  const g = new THREE.Group()
  const d = new THREE.Mesh(reelGeo, reelMat)
  const glow = new THREE.Sprite(reelGlowMat); glow.scale.setScalar(3.2)
  g.add(d, glow); g.position.set(it.x, it.y, it.z); scene.add(g); return g
}
function syncItems(g) {
  const live = new Set(), zMax = g.p.z + 140
  for (const it of g.C.items) { if (it.taken || it.z > zMax) continue; live.add(it.i); if (!reelMeshes.has(it.i)) reelMeshes.set(it.i, makeReel(it)) }
  for (const [i, m] of reelMeshes) if (!live.has(i)) { scene.remove(m); reelMeshes.delete(i) }
}

// 火の粉・しぶき
const parts = []
const partGeo = new THREE.SphereGeometry(0.12, 5, 4)
const partMat = new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false })
function burst(x, y, z, n, sp, col) {
  for (let i = 0; i < n; i++) {
    let p = parts.find(q => !q.visible)
    if (!p) { if (parts.length > 160) break; p = new THREE.Mesh(partGeo, col ? partMat.clone() : partMat); scene.add(p); parts.push(p) }
    if (col) p.material.color.set(col)
    p.visible = true; p.position.set(x, y, z)
    p.userData = { vx: (Math.random() - 0.5) * sp, vy: Math.random() * sp * 0.9 + 2, vz: (Math.random() - 0.5) * sp, life: 0.6 + Math.random() * 0.6 }
    p.scale.setScalar(0.6 + Math.random())
  }
}
function updateParts(dt) {
  for (const p of parts) {
    if (!p.visible) continue
    const u = p.userData; u.life -= dt; u.vy -= 14 * dt
    p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt
    if (u.life <= 0 || p.position.y < -0.5) p.visible = false
  }
}

// ---------- 人物
let model = null, fallback = null
function newModel() {
  if (model) scene.remove(model.group)
  if (charAssets.ready) model = new CharRunnerModel()
  else {   // 読み込みに失敗した時だけの代わり（円柱）
    const grp = new THREE.Group(); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xc9c2b3 })); body.position.y = 0.9; grp.add(body)
    model = { group: grp, handWorld: new THREE.Vector3(), update(s) { grp.position.set(s.x, s.y, s.z); grp.rotation.y = s.yaw; this.handWorld.set(s.x, s.y + 1.6, s.z) } }
  }
  model.group.traverse(o => { if (o.isMesh) o.castShadow = true })
  scene.add(model.group)
}
const adapter = p => ({ x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz, yaw: p.yaw, grounded: p.grounded, rope: p.rope, zipping: false, wreck: p.dead ? 1 : 0, stun: 0, climbing: p.cling ? { nx: p.cling.nx, nz: p.cling.nz } : null })

// ---------- 遊びの状態
let G = null, demo = null, demoBot = null
let camYaw = 0, camUserT = 0, camPitch = 0
const cam = { pos: new THREE.Vector3(0, 14, -10), look: new THREE.Vector3() }
const tut = { on: false, stage: 0, t: 0 }

function applyLang() {
  document.documentElement.lang = S.lang
  document.title = TT().docTitle
  for (const el of document.querySelectorAll('[data-t]')) { const v = TT()[el.dataset.t]; if (typeof v === 'string') el.textContent = v }
  $('btnMute').textContent = Snd.muted ? TT().unmute : TT().mute
  $('btnMode').textContent = S.easy ? TT().modeE : TT().modeN
  $('bestM').textContent = Math.round(S.best).toLocaleString()
  const how = TT()
  $('howRules').innerHTML = how.howRules.map(s => `<li>${s}</li>`).join('')
  const ctl = S.touch ? (S.easy ? how.howTouchE : how.howTouchN) : (S.easy ? how.howPcE : how.howPcN)
  $('howCtrl').innerHTML = ctl.map(s => `<li>${s}</li>`).join('')
  document.body.classList.toggle('easy', S.easy)
}
function show(id) { for (const s of ['title', 'hud', 'result']) $(s).hidden = s !== id; $('how').hidden = true; $('pauseM').hidden = true }

function startDemo() {
  demo = makeGame(7, {}); demoBot = makeBot(1, 7); G = demo
  clearCourse(); newModelIfNeeded()
}
function newModelIfNeeded() { if (!model || (charAssets.ready && !(model instanceof CharRunnerModel))) newModel() }
function startPlay(seed) {
  soundStart()
  const first = !store.get('ms.tut')
  G = makeGame(seed == null ? (Math.random() * 1e9) | 0 : seed, { easy: S.easy, tutorial: first ? 1 : 0 })
  demo = null; clearCourse(); newModelIfNeeded()
  S.mode = 'play'; S.paused = false; tut.on = first; tut.stage = 0; tut.t = 0
  show('hud'); $('holdHint').hidden = !S.easy || !first
  bgm('bgm_play'); Snd.play('ok', { vol: 0.5 })
  window.__lastResult = null
}
function endPlay() {
  S.mode = 'over'
  const p = G.p, m = Math.round(p.maxZ)
  const isBest = m > S.best
  if (isBest) { S.best = m; store.set('ms.best', String(m)) }
  store.set('ms.tut', '1')
  setTimeout(() => {
    if (S.mode !== 'over') return
    const L = TT()
    $('resWhy').textContent = p.dead === 'wave' ? L.whyWave : L.whyLava
    $('resM').textContent = m.toLocaleString()
    let line = L.lines[0][1]; for (const [d, s] of L.lines) if (m >= d) line = s
    $('resLine').textContent = line
    $('resStats').textContent = `${L.speed} ${Math.round(p.maxV * 3.6)} km/h ・ ${L.wires} ${p.wires} ・ ${L.chain} ${p.bestChain}`
    $('resBest').textContent = isBest && m > 0 ? L.newBest : `${L.best} ${Math.round(S.best).toLocaleString()} m`
    show('result'); S.mode = 'result'
    Snd.play(isBest && m > 0 ? 'j_best' : 'j_over', { vol: 0.8, jitter: 0 })
    window.__lastResult = { m, why: p.dead, best: S.best, isBest }
  }, 1100)
  bgm(null)
}
function toTitle() { S.mode = 'title'; show('title'); startDemo(); bgm('bgm_title') }

// ---------- 入力
const keys = new Set()
const once = { wire: false, jump: false, aim: null }
let holdDown = false
addEventListener('keydown', e => {
  if (e.repeat) return
  keys.add(e.code)
  if (S.mode === 'play' && !S.paused) {
    if (e.code === 'KeyE' || e.code === 'KeyF') once.wire = true
    if (e.code === 'Space') { if (S.easy) holdDown = true; else once.jump = true; e.preventDefault() }
  }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (S.mode === 'play') setPause(!S.paused) }
  if (e.code === 'KeyM') toggleMute()
})
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space' && S.easy) holdDown = false })
// スティック
const stick = { id: null, x: 0, y: 0, cx: 0, cy: 0, r: 60 }
$('stick').addEventListener('pointerdown', e => { const r = $('stick').getBoundingClientRect(); stick.id = e.pointerId; stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; stick.r = r.width / 2; moveStick(e); try { $('stick').setPointerCapture(e.pointerId) } catch (er) {} soundStart() })
$('stick').addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e) })
const endStick = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; $('stick').firstElementChild.style.transform = '' }
$('stick').addEventListener('pointerup', endStick); $('stick').addEventListener('pointercancel', endStick)
function moveStick(e) {
  let dx = (e.clientX - stick.cx) / stick.r, dy = (e.clientY - stick.cy) / stick.r
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l }
  stick.x = dx; stick.y = -dy
  $('stick').firstElementChild.style.transform = `translate(${dx * stick.r * 0.55}px,${dy * stick.r * 0.55}px)`
}
const press = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); soundStart(); fn(); $(id).classList.add('on'); setTimeout(() => $(id).classList.remove('on'), 120) })
press('btnWire', () => { once.wire = true })
press('btnJump', () => { once.jump = true })
// 画面のタッチ: 軽く触る = そのフックへ、なぞる = カメラ。片手は押している間つかむ
const gest = new Map()
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
document.addEventListener('pointerdown', e => {
  if (S.mode !== 'play' || S.paused) return
  if (e.target.closest && e.target.closest('button, a, .stick, .aux')) return
  soundStart()
  if (S.easy) { holdDown = true; gest.set(e.pointerId, { easy: true }); return }
  gest.set(e.pointerId, { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false })
}, { capture: true })
document.addEventListener('pointermove', e => {
  const g = gest.get(e.pointerId); if (!g || g.easy) return
  const dx = e.clientX - g.lx, dy = e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY
  if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) g.moved = true
  if (g.moved) { camYaw = Math.max(-1.4, Math.min(1.4, camYaw - dx * 0.006)); camPitch = Math.max(-0.3, Math.min(0.8, camPitch + dy * 0.004)); camUserT = performance.now() }
}, { capture: true })
const endG = e => {
  const g = gest.get(e.pointerId); if (!g) return; gest.delete(e.pointerId)
  if (g.easy) { if (![...gest.values()].some(q => q.easy)) holdDown = false; return }
  if (!g.moved && performance.now() - g.t < 400 && S.mode === 'play') aimAt(e.clientX, e.clientY)
}
document.addEventListener('pointerup', endG, { capture: true }); document.addEventListener('pointercancel', endG, { capture: true })
let lastTap = null
function aimAt(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect()
  ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const o = ray.ray.origin, d = ray.ray.direction
  once.aim = { ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z }
  lastTap = { x: cx, y: cy }
}
function readInput() {
  let mx = stick.x, my = stick.y
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1
  const inp = { mx: Math.max(-1, Math.min(1, mx)), my: Math.max(-1, Math.min(1, my)), wire: once.wire, jump: once.jump, aim: once.aim, hold: holdDown }
  once.wire = once.jump = false; once.aim = null
  return inp
}
document.addEventListener('mousedown', e => { if (S.mode === 'play' && !S.touch && !S.easy && e.button === 0 && !e.target.closest('button,a')) { /* クリックは pointerup で狙う */ } })

// ---------- 画面のボタン
const click = () => { soundStart(); Snd.play('click', { vol: 0.5, jitter: 0 }) }
$('btnStart').onclick = () => { click(); startPlay() }
$('btnHow').onclick = () => { click(); applyLang(); $('how').hidden = false }
$('btnHowClose').onclick = () => { click(); $('how').hidden = true }
$('btnMode').onclick = () => { click(); S.easy = !S.easy; store.set('ms.easy', S.easy ? '1' : '0'); applyLang() }
$('btnLang').onclick = () => { click(); S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('ms.lang', S.lang); applyLang(); clearCourse() }
function toggleMute() { Snd.setMute(!Snd.muted); store.set('ms.mute', Snd.muted ? '1' : '0'); applyLang() }
$('btnMute').onclick = () => { toggleMute(); click() }
$('btnPause').onclick = () => { click(); setPause(true) }
$('btnResume').onclick = () => { click(); setPause(false) }
$('btnQuit').onclick = () => { click(); setPause(false); toTitle() }
$('btnAgain').onclick = () => { click(); startPlay() }
$('btnTitle').onclick = () => { click(); toTitle() }
$('btnPost').onclick = () => { click(); const m = window.__lastResult ? window.__lastResult.m : 0; open(`https://x.com/intent/post?text=${encodeURIComponent(TT().postText(m))}&url=${encodeURIComponent('https://tom3games.github.io/magma-swing/')}`, '_blank') }
$('btnSave').onclick = () => { click(); saveImage() }
function setPause(v) { S.paused = v; $('pauseM').hidden = !v; if (v) Snd.duck(0.35, 0.2) }
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') setPause(true) })

// 結果を1枚の画像に（SNS 用 1080x1350）
function saveImage() {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'), src = renderer.domElement
  const sc = Math.max(W / src.width, H / src.height)
  x.drawImage(src, (W - src.width * sc) / 2, (H - src.height * sc) / 2, src.width * sc, src.height * sc)
  const r = window.__lastResult || { m: 0 }
  x.fillStyle = '#1d4f9c'; x.fillRect(80, 120, 920, 470)
  x.strokeStyle = '#f7f7f2'; x.lineWidth = 12; x.strokeRect(100, 140, 880, 430)
  x.fillStyle = '#f7f7f2'; x.font = '700 52px "BIZ UDPGothic", sans-serif'; x.fillText(TT().logo, 150, 230)
  x.font = '700 200px "Barlow Condensed", sans-serif'; x.fillText(String(r.m), 150, 440)
  x.font = '600 72px "Barlow Condensed", sans-serif'; x.fillText('m', 160 + x.measureText(String(r.m)).width * 2.8, 440)
  x.font = '700 40px "BIZ UDPGothic", sans-serif'; x.fillText($('resLine').textContent, 150, 520)
  x.fillStyle = '#6c6f73'; x.fillRect(520, 590, 40, 160)
  x.fillStyle = '#f7f7f2'; x.font = '700 32px "BIZ UDPGothic", sans-serif'; x.fillText('tom3games.github.io/magma-swing', 80, H - 60)
  const a = document.createElement('a'); a.download = `magma-${r.m}m.png`; a.href = c.toDataURL('image/png'); a.click()
  window.__savedImage = a.download
}

// ---------- 出来事から音と演出
let toastT = 0
// ワイヤーの残り（ドラムに巻いたワイヤーの量＋本数）
let reelShown = -1
function drawReel(n) {
  if (n === reelShown) return; reelShown = n
  const el = $('reel'); if (!el) return
  el.querySelector('b').textContent = n
  el.querySelector('.wind').setAttribute('r', (6 + Math.min(1, n / K.WIREMAX) * 13).toFixed(1))
  el.classList.toggle('low', n <= 2); el.classList.toggle('none', n <= 0)
}
function bumpReel(up) { const el = $('reel'); if (!el) return; el.classList.remove('bump', 'up'); void el.offsetWidth; el.classList.add(up ? 'up' : 'bump') }
function toast(s) { $('toast').textContent = s; $('toast').hidden = false; toastT = 1.1 }
function handleEvents(g) {
  for (const e of g.events) {
    if (e.t === 'wire') { Snd.play('shot', { vol: 0.7 }); setTimeout(() => Snd.play('hook', { vol: 0.6 }), 60); burst(e.x, e.y, e.z, 6, 4, 0xffd27a); if (tut.on && tut.stage === 0) { tut.stage = 1; tut.t = 0 } }
    else if (e.t === 'release') { Snd.play('swish', { vol: Math.min(1, 0.4 + e.v / 30) }); if (e.v > 24) Snd.play('wind', { vol: 0.5 }); if (tut.on && tut.stage === 1) { tut.stage = 2; tut.t = 0 } }
    else if (e.t === 'miss') { if (e.empty) { Snd.play('empty', { vol: 0.6, jitter: 0 }); toast(TT().empty); bumpReel() } else { Snd.play('miss', { vol: 0.5, jitter: 0 }); showMiss(e.far) } }
    else if (e.t === 'pick') { Snd.play('reel', { vol: 0.8 }); burst(e.x, e.y, e.z, 8, 4, 0xffd27a); bumpReel(true) }
    else if (e.t === 'land') Snd.play('land', { vol: 0.7 })
    else if (e.t === 'cling') { Snd.play('thud', { vol: 0.6 }); Snd.play('cloth', { vol: 0.4 }) }
    else if (e.t === 'jump') Snd.play('cloth', { vol: 0.5 })
    else if (e.t === 'dead') {
      const p = g.p
      if (e.why === 'lava') { Snd.play('splash', { vol: 1 }); Snd.play('boom', { vol: 0.6 }); burst(p.x, 0.3, p.z, 40, 9) }
      else { Snd.play('boom', { vol: 0.9 }); burst(p.x, p.y + 1, p.z, 30, 8) }
      Snd.duck(0.2, 1.5)
      if (g === G && S.mode === 'play') endPlay()
    }
  }
  g.events.length = 0
}
function showMiss(far) {
  const el = $('miss')
  let x = innerWidth / 2, y = innerHeight * 0.35
  if (lastTap) { x = lastTap.x; y = lastTap.y; lastTap = null }
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.hidden = false
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''
  toast(far ? TT().far : TT().miss)
}

// ---------- 昼から夕方から夜（進んだ距離で）
const DAY = [
  { at: 0, top: 0x6fa8dc, bot: 0xf2d9b0, fog: 0xe9d3ae, sun: 2.3, hemi: 1.1, night: 0 },
  { at: 0.45, top: 0x3a3f7c, bot: 0xff8a45, fog: 0xd9825a, sun: 1.3, hemi: 0.75, night: 0.35 },
  { at: 1, top: 0x0a1028, bot: 0x4a1d2a, fog: 0x2a1418, sun: 0.25, hemi: 0.35, night: 1 },
]
const _c1 = new THREE.Color(), _c2 = new THREE.Color()
function applyDaytime(f) {
  let a = DAY[0], b = DAY[1]
  if (f > DAY[1].at) { a = DAY[1]; b = DAY[2] }
  const k = Math.max(0, Math.min(1, (f - a.at) / (b.at - a.at)))
  const mix = (x, y) => _c1.set(x).lerp(_c2.set(y), k)
  skyU.top.value.copy(mix(a.top, b.top)); skyU.bot.value.copy(mix(a.bot, b.bot))
  scene.fog.color.copy(mix(a.fog, b.fog))
  sun.intensity = a.sun + (b.sun - a.sun) * k; hemi.intensity = a.hemi + (b.hemi - a.hemi) * k
  sun.color.set(f > 0.3 ? 0xffb27a : 0xfff1dc)
  const night = a.night + (b.night - a.night) * k
  // マグマは昼は街の色に寄せてくすませ、夜は明るく（光源は使わず色だけ）
  lavaMat.color.setRGB(0.9 + night * 0.3, 0.8 + night * 0.1, 0.78)
  for (const m of bMats) m.emissiveIntensity = night * 0.75
  window.__night = night
}
let dayF = 0

// ---------- 毎フレーム
const _v = new THREE.Vector3(), _w = new THREE.Vector3()
let acc = 0, last = performance.now(), dbgPaused = false
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  if (!dbgPaused) {
    acc += dt
    while (acc >= K.DT) { tick(); acc -= K.DT }
  }
  draw(dt)
  requestAnimationFrame(frame)
}
function tick() {
  if (!G) return
  if (S.mode === 'play' && !S.paused) { step(G, readInput()); handleEvents(G) }
  else if (S.mode === 'over') { step(G, {}); handleEvents(G) }
  else if (demo && G === demo) {
    step(demo, botInput(demo, demoBot)); demo.events.length = 0
    if (demo.over) startDemo()
  }
}
function draw(dt) {
  if (!G) { renderer.render(scene, camera); return }
  const p = G.p
  syncCourse(G)
  syncItems(G)
  lavaMat.map.offset.x += dt * 0.004; lavaMat.map.offset.y += dt * 0.002; waveMat.map.offset.y = (waveMat.map.offset.y - dt * 0.35) % 1
  lava.position.set(p.x, 0, p.z + 100)
  updateCity(p.z)
  // 人物
  if (model && !(p.dead === 'lava' && G.t - (G.deadT || (G.deadT = G.t)) > 0.05)) model.update(adapter(p), dt)
  // ワイヤー
  if (p.dead === 'lava' && model) { model.group.position.y = Math.max(-1.6, model.group.position.y - dt * 0.8) }
  if (p.rope && model && !p.dead) {
    const hw = model.handWorld && model.handWorld.lengthSq() > 0 ? model.handWorld : _w.set(p.x, p.y + 1.6, p.z)
    _v.set(p.rope.x, p.rope.y, p.rope.z)
    rope.position.copy(hw); rope.lookAt(_v); rope.scale.set(1, 1, hw.distanceTo(_v)); rope.visible = true
  } else rope.visible = false
  // 狙えるフックを光らせる
  const pk = (S.mode === 'play' || demo) && !p.rope ? pickHook(G) : null
  const t = performance.now() / 1000
  for (const [i, m] of hookMeshes) {
    const h = G.C.hooks.find(q => q.i === i); if (!h) continue
    const d = Math.hypot(h.x - p.x, h.y - p.y - 1.5, h.z - p.z)
    const target = pk && !pk.miss && pk.h.i === i, inRange = d <= K.RANGE
    const roped = p.rope && p.rope.h === i
    m.userData.ring.material.emissiveIntensity = roped ? 2.4 : target ? 1.8 + Math.sin(t * 8) * 0.6 : inRange ? 1.0 : 0.25
    m.userData.glow.scale.setScalar(target ? 4.2 + Math.sin(t * 8) * 0.6 : inRange ? 3 : 1.6)
    m.userData.glow.material.opacity = inRange ? 1 : 0.35
    m.userData.ring.rotation.z += dt * (target ? 3 : 0.6)
    if (m.userData.lamp) m.userData.lamp.emissiveIntensity = (window.__night || 0) * 2.5
  }
  // 溶岩の波
  wave.position.set(p.x, 15, G.waveZ)
  const gapW = p.z - G.waveZ
  { const t2 = performance.now() / 1000; for (const m of reelMeshes.values()) { m.rotation.y = t2 * 1.8; m.position.y += Math.sin(t2 * 2 + m.position.z) * 0.004 } }
  const heat = Math.max(0, Math.min(1, 1 - (gapW - 6) / 40))
  $('heat').style.opacity = S.mode === 'play' ? heat.toFixed(2) : 0
  if (Snd.ctx && S.mode === 'play') { if (!Snd._fireOn) { Snd._fireOn = true; Snd.loop('fire', 'snd/fire_wave.mp3', 0.0001, 0.3) } const l = Snd.loops.fire; if (l && l.g) l.g.gain.value = 0.05 + heat * 0.7 }
  else if (Snd._fireOn && S.mode !== 'play' && S.mode !== 'over') { Snd._fireOn = false; Snd.loop('fire', null) }
  // 光
  sun.position.set(p.x + 20, p.y + 40, p.z - 10); sun.target.position.set(p.x, p.y, p.z + 4)
  dayF += ((Math.min(1, p.maxZ / 1600)) - dayF) * Math.min(1, dt * 2)
  applyDaytime(dayF)
  // カメラ（後ろから追う。なぞると回る。少しすると戻る）
  if (performance.now() - camUserT > 1800) { camYaw *= 1 - Math.min(1, dt * 1.5); camPitch *= 1 - Math.min(1, dt * 1.5) }
  const land = innerWidth > innerHeight
  const sp = Math.hypot(p.vx, p.vy, p.vz)
  const back = (land ? 9 : 10.5) + Math.min(5, sp * 0.12), up = 3.4 + camPitch * 6 + Math.min(2, sp * 0.04)
  const cy = Math.cos(camYaw), sy = Math.sin(camYaw)
  _v.set(p.x - sy * back, Math.max(1.2, p.y + up), p.z - cy * back)
  const k = 1 - Math.exp(-dt * (S.mode === 'over' ? 1.5 : 6))
  cam.pos.lerp(_v, k)
  _w.set(p.x + sy * 8, p.y + 1.6, p.z + cy * 8)
  cam.look.lerp(_w, 1 - Math.exp(-dt * 8))
  if (!window.__freeze) { camera.position.copy(cam.pos); camera.lookAt(cam.look) }
  const fov = 62 + Math.min(14, sp * 0.35)
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix()
  sky.position.copy(camera.position)
  updateParts(dt)
  // HUD
  if (S.mode === 'play') {
    $('dist').textContent = Math.round(p.maxZ).toLocaleString()
    drawReel(p.left)
    // チュートリアル（文字は1つだけ）
    if (tut.on) {
      tut.t += dt
      const L = TT(); let s = null
      if (tut.stage === 0) s = S.easy ? (S.touch ? L.tut1e : L.tut1epc) : (S.touch ? L.tut1 : L.tut1pc)
      else if (tut.stage === 1) s = L.tut2
      else if (tut.stage === 2 && tut.t < 2) s = L.tut3
      else if (tut.stage === 2) { tut.on = false; $('holdHint').hidden = true }
      $('tip').hidden = !s; if (s) $('tip').textContent = s
    } else $('tip').hidden = true
  }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').hidden = true }
  renderer.render(scene, camera)
}
function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
}
addEventListener('resize', resize); resize()

// ---------- 起動
applyLang()
show('title')
startDemo()
requestAnimationFrame(frame)
loadCharAssets().then(() => { newModel(); $('loading').hidden = true })
addEventListener('pointerdown', () => { soundStart(); if (S.mode === 'title') bgm('bgm_title') }, { once: true })

// 検証用の窓口
window.magma = {
  get g() { return G }, get mode() { return S.mode }, S, camera, scene, renderer,
  start: (seed, opts = {}) => { if (opts.easy != null) { S.easy = !!opts.easy; applyLang() } startPlay(seed) },
  showResult: () => { if (G) { G.p.dead = G.p.dead || 'lava'; G.over = true; endPlay() } },
  input: once, setHold: v => { holdDown = v }, setStick: (x, y) => { stick.x = x; stick.y = y },
  dbg: {
    pause: v => { dbgPaused = v },
    step: n => { for (let i = 0; i < n; i++) tick(); draw(K.DT) },
    teleport: (x, y, z) => { Object.assign(G.p, { x, y, z, vx: 0, vy: 0, vz: 0, grounded: false, rope: null, cling: null }) },
    tutorial: () => tut,
  },
  aimAt,
}
window.__magmaReady = true
