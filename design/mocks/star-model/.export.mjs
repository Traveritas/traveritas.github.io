/* 导出：node design/mocks/star-model/.export.mjs [--w=] [--prof=] [--fillet=] [--tip=] [--shade=]
   产出 star.glb（glTF 二进制）。三个旋钮都可以从命令行改，不写就是采用的那一档。

   GLTFExporter 在 Node 里缺 FileReader（three 0.186 的导出在最后一步把 ArrayBuffer 包进 Blob
   再读回来）。这里补一个最小的 FileReader，只实现 readAsArrayBuffer / readAsDataURL；
   它只在本进程里补，不碰 node_modules。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argOf = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

globalThis.FileReader = class FileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
    this.onerror = null;
  }
  _done(fn, blob) {
    Promise.resolve(blob[fn]()).then(
      (v) => {
        this.result = v;
        if (this.onloadend) this.onloadend();
      },
      (e) => {
        if (this.onerror) this.onerror(e);
      },
    );
  }
  readAsArrayBuffer(blob) {
    this._done('arrayBuffer', blob);
  }
  readAsDataURL(blob) {
    Promise.resolve(blob.arrayBuffer()).then((buf) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      if (this.onloadend) this.onloadend();
    });
  }
};

const M = await import('./src.js');

const cfg = {
  ...M.WIN,
  w: Number(argOf('w', M.WIN.w)),
  prof: argOf('prof', M.WIN.prof),
  fillet: Number(argOf('fillet', M.WIN.fillet)),
  tipR: Number(argOf('tip', M.WIN.tipR)),
  shade: argOf('shade', M.WIN.shade),
};

const t0 = performance.now();
const { buf, stats, tris, geo } = await M.glbOf(cfg, { ground: 'light' });
const ms = Math.round(performance.now() - t0);
const out = path.join(HERE, 'star.glb');
fs.writeFileSync(out, Buffer.from(buf));

/* ── 自检：把写出去的文件读回来（不靠 three 的 loader，自己解容器） ── */
const b = fs.readFileSync(out);
const magic = b.readUInt32LE(0);
const version = b.readUInt32LE(4);
const total = b.readUInt32LE(8);
let off = 12;
const chunks = [];
while (off < total) {
  const len = b.readUInt32LE(off);
  const type = b.readUInt32LE(off + 4);
  chunks.push({ type: type === 0x4e4f534a ? 'JSON' : type === 0x004e4942 ? 'BIN' : String(type), len, at: off + 8 });
  off += 8 + len;
}
const jsonChunk = chunks.find((c) => c.type === 'JSON');
const doc = JSON.parse(b.slice(jsonChunk.at, jsonChunk.at + jsonChunk.len).toString('utf8'));
const prim = doc.meshes?.[0]?.primitives?.[0];
const posAcc = doc.accessors[prim.attributes.POSITION];
const idxAcc = prim.indices != null ? doc.accessors[prim.indices] : null;

/* 包围盒：直接解 BIN 里的 POSITION 缓冲，比一遍与几何比 */
const bin = chunks.find((c) => c.type === 'BIN');
const bv = doc.bufferViews[posAcc.bufferView];
const start = bin.at + (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
const vals = new Float32Array(b.byteLength >= start ? 0 : 0);
const nVerts = posAcc.count;
const rePos = new Float32Array(nVerts * 3);
for (let i = 0; i < nVerts * 3; i++) rePos[i] = b.readFloatLE(start + i * 4);
let lo = [Infinity, Infinity, Infinity];
let hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < nVerts; i++) {
  for (let k = 0; k < 3; k++) {
    const v = rePos[i * 3 + k];
    if (v < lo[k]) lo[k] = v;
    if (v > hi[k]) hi[k] = v;
  }
}
/* 与内存里的几何比：包围盒应当逐轴一致（导出不改坐标） */
const bb = geo.boundingBox;
const bbDiff = Math.max(
  ...[0, 1, 2].map((k) => Math.abs(lo[k] - bb.min.getComponent(k))),
  ...[0, 1, 2].map((k) => Math.abs(hi[k] - bb.max.getComponent(k))),
);
/* 三角形数：索引 / 3（有索引就是它，没有就是顶点 / 3） */
const triCount = idxAcc ? idxAcc.count / 3 : nVerts / 3;
/* 法线是不是单位长度（抽样） */
const norAcc = doc.accessors[prim.attributes.NORMAL];
const norBv = doc.bufferViews[norAcc.bufferView];
const norStart = bin.at + (norBv.byteOffset || 0) + (norAcc.byteOffset || 0);
let norWorst = 0;
for (let i = 0; i < Math.min(norAcc.count, 400); i++) {
  const x = b.readFloatLE(norStart + i * 12);
  const y = b.readFloatLE(norStart + i * 12 + 4);
  const z = b.readFloatLE(norStart + i * 12 + 8);
  norWorst = Math.max(norWorst, Math.abs(Math.hypot(x, y, z) - 1));
}

const report = {
  at: new Date().toISOString(),
  cfg,
  file: path.relative(path.resolve(HERE, '../../..'), out).replace(/\\/g, '/'),
  bytes: b.length,
  kb: +(b.length / 1024).toFixed(1),
  magic: magic === 0x46546c67 ? 'glTF' : String(magic),
  version,
  declaredLength: total,
  lengthMatches: total === b.length,
  chunks: chunks.map((c) => ({ type: c.type, len: c.len })),
  meshes: (doc.meshes || []).length,
  nodes: (doc.nodes || []).length,
  materials: (doc.materials || []).length,
  material: doc.materials?.[0] || null,
  vCount: nVerts,
  triCount,
  trisFromBuild: tris,
  indexed: !!idxAcc,
  bbox: { lo, hi },
  bboxDiff: +bbDiff.toFixed(9),
  normalUnitWorst: +norWorst.toFixed(6),
  accessors: posAcc,
  buildMs: ms,
  buildStats: {
    tris: stats.tris,
    verts: stats.verts,
    rings: stats.rings,
    section: stats.section,
    wEff: stats.wEff,
    sc: stats.sc,
  },
};
fs.writeFileSync(path.join(HERE, '.shots', 'glb.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));