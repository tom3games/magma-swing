// 人物の見た目（ボーン入りの CC0 キャラ）
// 主人公: KayKit Adventurers 2.0 の Ranger（CC0）。耐熱服っぽい色に塗り替え、Rig_Medium のアニメを当てる
// 空中出前（sky-delivery）の charmodel.js から。岡持ちと窓の客を外した
import * as THREE from 'three'
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js'
import { clone as skClone } from '../vendor/jsm/utils/SkeletonUtils.js'

const BASE = 'assets/chars/'
const A = { ready: false, failed: false, ranger: null, clips: {}, custs: [] }
export const charAssets = A

// 色見本（8x4 のグラデーションの升）を塗り替える。升の位置は ranger_texture.png を見て決めた
function recolor(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const x = c.getContext('2d'); x.drawImage(img, 0, 0)
  const cw = img.width / 8, ch = img.height / 4
  const grad = (col, row, top, bot, cols = 1) => { const g = x.createLinearGradient(0, row * ch, 0, (row + 1) * ch); g.addColorStop(0, top); g.addColorStop(1, bot); x.fillStyle = g; x.fillRect(col * cw, row * ch, cw * cols, ch) }
  grad(5, 0, '#e7e2d6', '#a9a397', 2)   // 上着から耐熱服の銀灰
  grad(2, 2, '#e7e2d6', '#a9a397')
  grad(0, 1, '#e2a23a', '#a5621a')      // スカーフからからし色
  grad(1, 2, '#e2a23a', '#a5621a')
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false
  return t
}

export function loadCharAssets() {
  if (A.loading) return A.loading
  const L = new GLTFLoader()
  const pre = window.__bootGlb || {}   // 読み込み中の画面が先に取っている（進み具合を出すため）
  const get = f => pre[f] ? pre[f].then(ab => new Promise((ok, ng) => L.parse(ab, BASE, ok, ng))) : new Promise((ok, ng) => L.load(BASE + f, ok, undefined, ng))
  A.loading = Promise.all([get('Ranger.glb'), get('Rig_Medium_General.glb'), get('Rig_Medium_MovementBasic.glb')])
    .then(([r, g1, g2]) => {
      r.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.frustumCulled = false
          if (/Quiver|Cape/.test(o.name)) o.visible = false
          if (o.material && o.material.map && !A._tex) A._tex = recolor(o.material.map.image)
          if (o.material && A._tex) { o.material = o.material.clone(); o.material.map = A._tex; o.material.roughness = 0.7; o.material.metalness = 0 }
        }
      })
      A.ranger = r.scene
      for (const cl of [...g1.animations, ...g2.animations]) A.clips[cl.name] = cl
      A.ready = true
      return A
    }).catch(e => { A.failed = true; console.warn('char load failed', e); return A })
  return A.loading
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3()
// 骨を、子の骨が target の方を向くように回す（w は効き具合 0〜1）
function aimBone(bone, child, target, w) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b)
  _c.subVectors(_b, _a).normalize(); _d.subVectors(target, _a).normalize()
  if (_c.lengthSq() < 1e-6 || _d.lengthSq() < 1e-6) return
  _q.setFromUnitVectors(_c, _d)
  bone.getWorldQuaternion(_q2)
  _q2.premultiply(_q)                      // 新しい世界の向き
  const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq)
  _q2.premultiply(pq.invert())             // 親から見た向きに直す
  bone.quaternion.slerp(_q2, w)
  bone.updateMatrixWorld(true)
}

export class CharRunnerModel {
  constructor() {
    this.group = new THREE.Group()
    this.tilt = new THREE.Group(); this.group.add(this.tilt)   // 腰を中心に傾ける枠
    const ch = this.char = skClone(A.ranger)
    // 背の高さを 1.8m にそろえる
    const box = new THREE.Box3().setFromObject(ch); const hgt = box.max.y - box.min.y
    this.k = 1.8 / hgt; ch.scale.setScalar(this.k)
    this.hipY = 0.85
    this.tilt.position.y = this.hipY; ch.position.y = -this.hipY - box.min.y * this.k
    this.tilt.add(ch)
    this.bones = {}; ch.traverse(o => { if (o.isBone) this.bones[o.name] = this.bones[o.name.replace(/([lr])$/, '.$1')] = o })   // GLTFLoader は名前の . を消す（upperarm.lからupperarml）。両方で引けるようにする
    this.mixer = new THREE.AnimationMixer(ch)
    this.acts = {}
    for (const n of ['Idle_A', 'Running_A', 'Walking_A', 'Jump_Idle', 'Jump_Start', 'Jump_Land', 'Hit_A', 'Death_A', 'Throw', 'Interact']) {
      if (!A.clips[n]) continue
      const a = this.mixer.clipAction(A.clips[n]); this.acts[n] = a
      if (/Death|Jump_Land|Jump_Start|Throw|Hit/.test(n)) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true }
    }
    this.cur = null; this.play('Idle_A')
    // 手首の作業用ワイヤー射出機（橙）
    this.guns = []
    for (const side of ['l', 'r']) {
      const w = this.bones['wrist.' + side]; if (!w) continue
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), new THREE.MeshStandardMaterial({ color: 0xd9772a, emissive: 0xd9772a, emissiveIntensity: 0.3 }))
      gun.scale.setScalar(1 / this.k); w.add(gun); this.guns.push(gun)
    }
    this.handWorld = new THREE.Vector3(); this.state = 'idle'; this.phase = 0; this.lastThrow = 0
    this._t = new THREE.Vector3()
  }
  play(name, fade = 0.18) {
    const a = this.acts[name]; if (!a || this.cur === a) return
    a.reset().setEffectiveWeight(1).fadeIn(fade).play()
    if (this.cur) this.cur.fadeOut(fade)
    this.cur = a
  }
  update(s, dt) {
    const g = this.group
    g.position.set(s.x, s.y, s.z)
    const v = Math.hypot(s.vx, s.vz)
    let pitch = 0, roll = 0, st
    if (s.wreck > 0) st = 'down'
    else if (s.climbing) st = 'climb'
    else if (s.rope) st = s.zipping ? 'zip' : 'swing'
    else if (!s.grounded) st = 'air'
    else if (v > 0.6) st = 'run'
    else st = 'idle'
    if (st !== this.state && this.state === 'air' && (st === 'run' || st === 'idle')) this.play('Jump_Land', 0.08)
    const landing = this.cur === this.acts.Jump_Land && this.cur.time < 0.35
    this.state = st
    let yaw = s.yaw
    if (st === 'down') { this.play('Death_A', 0.15) }
    else if (st === 'climb') { yaw = Math.atan2(-s.climbing.nx, -s.climbing.nz); this.play('Running_A'); this.acts.Running_A.timeScale = 0.55; pitch = 0.1 }
    else if (st === 'swing' || st === 'zip' || st === 'air') { this.play('Jump_Idle', 0.2) }
    else if (st === 'run' && !landing) { this.play('Running_A'); this.acts.Running_A.timeScale = Math.min(1.5, 0.55 + v * 0.09); pitch = Math.min(0.2, v * 0.015) }
    else if (st === 'idle' && !landing) this.play('Idle_A')
    g.rotation.set(0, yaw, 0)
    if (st === 'swing' || st === 'zip') {
      const dx = s.rope.x - s.x, dy = s.rope.y - (s.y + 1.2), dz = s.rope.z - s.z
      const cy = Math.cos(yaw), sy = Math.sin(yaw)
      const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy
      pitch = Math.atan2(lz, Math.max(0.5, dy)) * 0.8
      roll = -Math.atan2(lx, Math.max(0.5, dy)) * 0.8
    }
    if (s.stun > 0 && st === 'air') { this.phase += dt * 14; roll = Math.sin(this.phase) * 0.8; pitch = Math.cos(this.phase * 0.7) * 0.9 }
    const kk = 1 - Math.exp(-dt * 10)
    this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * kk
    this.tilt.rotation.z += (roll - this.tilt.rotation.z) * kk
    this.mixer.update(dt)
    g.updateMatrixWorld(true)
    // ワイヤーの腕: 掛けた点へまっすぐ伸ばす
    const B = this.bones
    if (s.rope && B['upperarm.l']) {
      this._t.set(s.rope.x, s.rope.y, s.rope.z)
      B['upperarm.l'].getWorldPosition(_a); B['upperarm.r'].getWorldPosition(_b)
      const left = _a.distanceToSquared(this._t) <= _b.distanceToSquared(this._t)
      const sd = left ? 'l' : 'r'
      aimBone(B['upperarm.' + sd], B['lowerarm.' + sd], this._t, 1)
      aimBone(B['lowerarm.' + sd], B['wrist.' + sd], this._t, 1)
      B['hand.' + sd].getWorldPosition(this.handWorld)
    } else if (st === 'climb' && B['upperarm.l']) {
      // 壁を登る: 両腕を上へ交互に伸ばす
      this.phase += dt * 9
      for (const [sd, ph] of [['l', 0], ['r', Math.PI]]) {
        const up = 0.5 + 0.5 * Math.sin(this.phase + ph)
        B['upperarm.' + sd].getWorldPosition(_a)
        this._t.set(_a.x, _a.y + 1, _a.z).addScaledVector(_c.set(Math.sin(yaw), 0, Math.cos(yaw)), 0.25 + up * 0.15)
        this._t.y += up * 0.3
        aimBone(B['upperarm.' + sd], B['lowerarm.' + sd], this._t, 0.9)
      }
    }
  }
  updateParts() { return [] }
  applyDents() {}
  resetParts() {}
  dispose() { this.mixer.stopAllAction(); this.group.traverse(o => { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose() }) }
}

