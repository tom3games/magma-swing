// GLB を軽くする。node _strip_glb.mjs 入力 出力 [--anims A,B,...] [--no-mesh] [--drop-mesh 名前の正規表現]
// 2026-11-03: 読み込みが遅いと言われ、動きだけ借りる Rig_Medium_*.glb からマネキンの体（使っていない）と使わない動きを外した
// 元の素材は ~/Desktop/claudecode/_assets/kaykit_character-animations ほか（KayKit CC0）
import { readFileSync, writeFileSync } from 'node:fs'
const [src, dst, ...rest] = process.argv.slice(2)
const opt = k => { const i = rest.indexOf(k); return i < 0 ? null : (rest[i + 1] || true) }
const b = readFileSync(src), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString())
const binStart = 20 + jl + 8, bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jl))
const keepA = opt('--anims'), noMesh = !!opt('--no-mesh'), dropRe = opt('--drop-mesh') ? new RegExp(opt('--drop-mesh')) : null
if (keepA) { const ks = keepA.split(','); j.animations = (j.animations || []).filter(a => ks.includes(a.name)); const miss = ks.filter(k => !j.animations.some(a => a.name === k)); if (miss.length) console.warn('no anim', miss) }
for (const n of j.nodes) if (n.mesh != null && (noMesh || (dropRe && dropRe.test(j.meshes[n.mesh].name || n.name || '')))) { delete n.mesh; delete n.skin }
// 残る物から使っている所を集める
const usedMesh = new Set(j.nodes.filter(n => n.mesh != null).map(n => n.mesh)), usedSkin = new Set(j.nodes.filter(n => n.skin != null).map(n => n.skin))
const acc = new Set(), mat = new Set()
const mmap = new Map(); j.meshes = (j.meshes || []).filter((m, i) => usedMesh.has(i) && (mmap.set(i, mmap.size), true))
for (const n of j.nodes) if (n.mesh != null) n.mesh = mmap.get(n.mesh)
for (const m of j.meshes) for (const p of m.primitives) { Object.values(p.attributes).forEach(a => acc.add(a)); if (p.indices != null) acc.add(p.indices); (p.targets || []).forEach(t => Object.values(t).forEach(a => acc.add(a))); if (p.material != null) mat.add(p.material) }
const smap = new Map(); j.skins = (j.skins || []).filter((s, i) => usedSkin.has(i) && (smap.set(i, smap.size), true))
for (const n of j.nodes) if (n.skin != null) n.skin = smap.get(n.skin)
for (const s of j.skins) if (s.inverseBindMatrices != null) acc.add(s.inverseBindMatrices)
for (const a of j.animations || []) for (const s of a.samplers) { acc.add(s.input); acc.add(s.output) }
// 材質・絵
const matMap = new Map(); j.materials = (j.materials || []).filter((m, i) => mat.has(i) && (matMap.set(i, matMap.size), true))
for (const m of j.meshes) for (const p of m.primitives) if (p.material != null) p.material = matMap.get(p.material)
const tex = new Set(); const walk = o => { if (o && typeof o === 'object') { if (typeof o.index === 'number' && ('texCoord' in o || 'scale' in o || 'strength' in o || Object.keys(o).length <= 3)) tex.add(o.index); Object.values(o).forEach(walk) } }
j.materials.forEach(walk)
const texMap = new Map(); j.textures = (j.textures || []).filter((t, i) => tex.has(i) && (texMap.set(i, texMap.size), true))
const remapTex = o => { if (o && typeof o === 'object') { if (typeof o.index === 'number' && texMap.has(o.index)) o.index = texMap.get(o.index); Object.values(o).forEach(remapTex) } }
j.materials.forEach(remapTex)
const img = new Set(j.textures.map(t => t.source)); const imgMap = new Map(); j.images = (j.images || []).filter((m, i) => img.has(i) && (imgMap.set(i, imgMap.size), true))
j.textures.forEach(t => t.source = imgMap.get(t.source))
if (!j.textures.length) { delete j.textures; delete j.samplers; delete j.images }
if (!j.materials.length) delete j.materials
// 使っている accessor と bufferView だけで詰め直す
const accMap = new Map(), accs = []; (j.accessors || []).forEach((a, i) => { if (acc.has(i)) { accMap.set(i, accs.length); accs.push(a) } })
const remapAcc = i => accMap.get(i)
for (const m of j.meshes) for (const p of m.primitives) { for (const k in p.attributes) p.attributes[k] = remapAcc(p.attributes[k]); if (p.indices != null) p.indices = remapAcc(p.indices); (p.targets || []).forEach(t => { for (const k in t) t[k] = remapAcc(t[k]) }) }
for (const s of j.skins) if (s.inverseBindMatrices != null) s.inverseBindMatrices = remapAcc(s.inverseBindMatrices)
for (const a of j.animations || []) for (const s of a.samplers) { s.input = remapAcc(s.input); s.output = remapAcc(s.output) }
j.accessors = accs
const bvUsed = new Set(accs.map(a => a.bufferView).concat((j.images || []).map(m => m.bufferView)).filter(v => v != null))
const parts = [], bvMap = new Map(), bvs = []; let off = 0
j.bufferViews.forEach((v, i) => { if (!bvUsed.has(i)) return; const d = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); const pad = (4 - off % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad } bvMap.set(i, bvs.length); bvs.push({ ...v, byteOffset: off }); parts.push(d); off += d.length })
accs.forEach(a => { if (a.bufferView != null) a.bufferView = bvMap.get(a.bufferView) }); (j.images || []).forEach(m => { if (m.bufferView != null) m.bufferView = bvMap.get(m.bufferView) })
j.bufferViews = bvs; const pad = (4 - off % 4) % 4; if (pad) parts.push(Buffer.alloc(pad)); const nb = Buffer.concat(parts); j.buffers = [{ byteLength: nb.length }]
let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)])
const h = Buffer.alloc(12); h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + nb.length, 8)
const c = (len, type) => { const x = Buffer.alloc(8); x.writeUInt32LE(len, 0); x.writeUInt32LE(type, 4); return x }
writeFileSync(dst, Buffer.concat([h, c(js.length, 0x4E4F534A), js, c(nb.length, 0x004E4942), nb]))
console.log(dst, (b.length / 1024).toFixed(0) + 'KB ->', ((12 + 16 + js.length + nb.length) / 1024).toFixed(0) + 'KB', 'anims', (j.animations || []).map(a => a.name).join(','))
