// ============================================================
// reanim.js — PopCap 原版骨骼动画引擎 (Web Canvas 实现)
// 精确复刻 Reanimator.cpp 语义: fill-in / 帧区间 / 插值 / 轨道组
// 图像锚点: 左上角对齐平移点 (经 DrawTrack 基点与 BltTransformed 居中抵消验证)
// ============================================================
'use strict';

const RE = (function () {

  const LOOP = 0, PLAY_ONCE = 1, PLAY_ONCE_HOLD = 2, LOOP_FULL_LAST = 3, PLAY_ONCE_FULL_LAST_HOLD = 4;

  // ---------- 定义 (静态, 由 JSON 构建) ----------
  // json: {fps, n, anims:{name:[start,count]}, images:[文件名], tracks:[[name, kfs]]}
  // kf: [帧号, x,y,kx,ky,sx,sy,f,a, imgIdx, text?]
  const defs = {};          // name -> Def
  let images = null;        // Map: 小写key -> HTMLImageElement/Canvas

  function setImages(map) { images = map; }

  function buildDef(name, json) {
    const n = json.n, nt = json.tracks.length;
    const tracks = new Array(nt);
    // 每轨道: Float32Array(8*n) + Int32Array(n) 图索引
    for (let ti = 0; ti < nt; ti++) {
      const [tname, kfs] = json.tracks[ti];
      const F = new Float32Array(n * 8);
      const IM = new Int32Array(n).fill(-1);
      const TX = new Array(n).fill(null);
      // fill-in 语义
      let x = 0, y = 0, kx = 0, ky = 0, sx = 1, sy = 1, f = 0, a = 1;
      let img = -1;
      // 关键帧索引
      const kfMap = new Map();
      for (const kf of kfs) kfMap.set(kf[0], kf);
      for (let i = 0; i < n; i++) {
        const kf = kfMap.get(i);
        if (kf) {
          if (kf[1] !== null && kf[1] !== undefined) x = kf[1];
          if (kf[2] !== null && kf[2] !== undefined) y = kf[2];
          if (kf[3] !== null && kf[3] !== undefined) kx = kf[3];
          if (kf[4] !== null && kf[4] !== undefined) ky = kf[4];
          if (kf[5] !== null && kf[5] !== undefined) sx = kf[5];
          if (kf[6] !== null && kf[6] !== undefined) sy = kf[6];
          if (kf[7] !== null && kf[7] !== undefined) f = kf[7];
          if (kf[8] !== null && kf[8] !== undefined) a = kf[8];
          if (kf[9] !== null && kf[9] !== undefined && kf[9] >= 0) img = kf[9];
          if (kf.length > 10) TX[i] = kf[10];
        }
        const o = i * 8;
        F[o] = x; F[o + 1] = y; F[o + 2] = kx; F[o + 3] = ky;
        F[o + 4] = sx; F[o + 5] = sy; F[o + 6] = f; F[o + 7] = a;
        IM[i] = img;
      }
      tracks[ti] = { name: tname, F, IM, TX };
    }
    const d = { fps: json.fps || 12, n, anims: json.anims, images: json.images, tracks };
    // 轨道名->索引
    d.trackIdx = {};
    for (let ti = 0; ti < nt; ti++) d.trackIdx[tracks[ti].name.toLowerCase()] = ti;
    defs[name.toLowerCase()] = d;
    return d;
  }

  function getDef(name) { return defs[name.toLowerCase()]; }
  function hasDef(name) { return !!defs[name.toLowerCase()]; }

  // ---------- 实例 ----------
  class Reanim {
    constructor(defName) {
      const d = getDef(defName);
      this.def = d;
      this.name = defName;
      this.frameStart = 0;
      this.frameCount = d && d.n ? d.n : 0;
      this.animTime = 0;
      this.lastFrameTime = -1;
      this.animRate = d ? d.fps : 12;
      this.loopType = LOOP;
      this.loopCount = 0;
      this.dead = false;
      // 轨道实例
      const nt = d ? d.tracks.length : 0;
      this.group = new Uint8Array(nt);          // 0=normal 1=hidden 2=front
      this.imgOverride = new Array(nt).fill(null); // 图片key(小写)
      this.trackColor = new Array(nt).fill(null);  // [r,g,b,a] 覆盖色
      this.shown = true;
      this.attach = new Array(nt).fill(null);   // 轨道挂载的子reanim
      this.attachOffset = new Array(nt).fill(null);
      // 绘制状态
      this.x = 0; this.y = 0; this.scale = 1;
      this.flip = false;
      this.color = null;     // 整体色覆盖 [r,g,b,a]
      this.additive = false; // 叠加绘制(发光)
    }

    trackIndex(name) { return this.def.trackIdx[name.toLowerCase()] ?? 0; }
    trackExists(name) { return this.def.trackIdx[name.toLowerCase()] !== undefined; }

    // 动画控制
    getAnimRange(animName) {
      const r = this.def.anims[animName];
      if (!r) { return [0, 0]; }
      // anim轨道若含绘制数据(如anim_head1), 其区间由fill-in语义决定
      return r;
    }
    setFramesForLayer(animName) {
      const [s, c] = this.getAnimRange(animName);
      this.frameStart = s; this.frameCount = Math.max(1, c);
      if (this.animRate >= 0) this.animTime = 0; else this.animTime = 0.9999999;
      this.lastFrameTime = -1;
    }
    play(animName, loopType = LOOP, rate = 0) {
      if (rate !== 0) this.animRate = rate;
      this.loopType = loopType;
      this.loopCount = 0;
      this.setFramesForLayer(animName);
    }
    isPlaying(animName) {
      const [s, c] = this.getAnimRange(animName);
      return this.frameStart === s && this.frameCount === c;
    }
    animDuration(animName) {
      const [s, c] = this.getAnimRange(animName);
      return (c / Math.abs(this.animRate || this.def.fps));
    }

    // 每帧推进 (dt 秒)
    update(dt) {
      if (this.frameCount <= 0 || this.dead) return;
      this.lastFrameTime = this.animTime;
      this.animTime += dt * this.animRate / this.frameCount;
      if (this.animRate > 0) {
        switch (this.loopType) {
          case LOOP: case LOOP_FULL_LAST:
            while (this.animTime >= 1) { this.loopCount++; this.animTime -= 1; }
            break;
          case PLAY_ONCE: case PLAY_ONCE_FULL_LAST_HOLD:
            if (this.animTime >= 1) { this.loopCount = 1; this.animTime = 1; this.dead = true; }
            break;
          case PLAY_ONCE_HOLD:
            if (this.animTime >= 1) { this.loopCount = 1; this.animTime = 1; }
            break;
        }
      } else if (this.animTime < 0) {
        switch (this.loopType) {
          case LOOP: case LOOP_FULL_LAST:
            while (this.animTime < 0) { this.loopCount++; this.animTime += 1; }
            break;
          default:
            this.animTime = 0; this.dead = true;
        }
      }
    }

    // 触发时间事件 (0..1)
    shouldTrigger(t) {
      if (this.frameCount === 0 || this.lastFrameTime <= 0 || this.animRate <= 0) return false;
      if (this.animTime >= this.lastFrameTime) return t >= this.lastFrameTime && t < this.animTime;
      return t >= this.lastFrameTime || t < this.animTime;
    }

    // 帧时间
    frameTime() {
      let fc = this.frameCount;
      if (this.loopType !== PLAY_ONCE_FULL_LAST_HOLD && this.loopType !== LOOP_FULL_LAST) fc = this.frameCount - 1;
      if (fc < 1) fc = 1;
      const pos = this.frameStart + this.animTime * fc;
      let before = Math.floor(pos);
      const frac = pos - before;
      let after = before + 1;
      const last = this.frameStart + this.frameCount - 1;
      if (before >= last) { before = last; after = last; }
      if (before < 0) { before = 0; after = 1; }
      return [before, after, frac];
    }

    // 当前轨道变换 (插值)
    curTransform(ti, ft) {
      const [ib, ia, frac] = ft || this.frameTime();
      const F = this.def.tracks[ti].F, o1 = ib * 8, o2 = ia * 8;
      return {
        x: F[o1] + (F[o2] - F[o1]) * frac,
        y: F[o1 + 1] + (F[o2 + 1] - F[o1 + 1]) * frac,
        kx: F[o1 + 2] + (F[o2 + 2] - F[o1 + 2]) * frac,
        ky: F[o1 + 3] + (F[o2 + 3] - F[o1 + 3]) * frac,
        sx: F[o1 + 4] + (F[o2 + 4] - F[o1 + 4]) * frac,
        sy: F[o1 + 5] + (F[o2 + 5] - F[o1 + 5]) * frac,
        f: F[o1 + 6],
        a: F[o1 + 7] + (F[o2 + 7] - F[o1 + 7]) * frac,
      };
    }
    curImageKey(ti, ft) {
      const [ib] = ft || this.frameTime();
      const idx = this.def.tracks[ti].IM[ib];
      if (idx < 0) return null;
      return this.def.images[idx];
    }

    // ---- 轨道可见性 ----
    showPrefix(prefix, show) {
      const p = prefix.toLowerCase();
      for (let i = 0; i < this.group.length; i++) {
        if (this.def.tracks[i].name.toLowerCase().startsWith(p)) this.group[i] = show ? 0 : 1;
      }
    }
    showTrack(name, show) {
      const ti = this.trackIndex(name);
      this.group[ti] = show ? 0 : 1;
    }
    setImageOverride(name, imgKey) {
      this.imgOverride[this.trackIndex(name)] = imgKey;
    }
    setTrackColor(name, rgba) {
      this.trackColor[this.trackIndex(name)] = rgba;
    }

    // ---- 绘制 ----
    draw(ctx) {
      if (!this.def || !this.shown) return;
      const ft = this.frameTime();
      const d = this.def;
      const ntracks = d.tracks.length;
      for (let ti = 0; ti < ntracks; ti++) {
        if (this.group[ti] === 1) { // hidden — 但仍更新挂载
          continue;
        }
        const t = this.curTransform(ti, ft);
        if (t.f < 0) continue;
        let key = this.imgOverride[ti];
        if (!key) {
          const idx = d.tracks[ti].IM[ft[0]];
          if (idx >= 0) key = d.images[idx];
        }
        const img = key ? (images.get(key.toLowerCase()) || null) : null;
        // 挂载的子动画在轨道位置绘制
        const att = this.attach[ti];
        if (!img && !att) continue;
        const tc = this.trackColor[ti] || this.color;
        {
          const px = this.x + (this.flip ? -t.x * this.scale : t.x * this.scale);
          const py = this.y + t.y * this.scale;
          if (att) {
            att.x = px; att.y = py;
            att.scale = this.scale * (this.flip ? -t.sx : t.sx);
            att.draw(ctx);
          }
          if (img) {
            const kx = -t.kx * Math.PI / 180, ky = -t.ky * Math.PI / 180;
            const m00 = Math.cos(kx) * t.sx, m10 = -Math.sin(kx) * t.sx;
            const m01 = Math.sin(ky) * t.sy, m11 = Math.cos(ky) * t.sy;
            const sc = this.scale;
            let alpha = t.a;
            if (tc) alpha *= (tc[3] !== undefined ? tc[3] : 1);
            if (alpha <= 0.01) continue;
            ctx.save();
            ctx.globalAlpha *= alpha;
            if (this.additive) ctx.globalCompositeOperation = 'lighter';
            if (tc && tc.filter) ctx.filter = tc.filter;
            ctx.translate(px, py);
            if (this.flip) ctx.scale(-1, 1);
            ctx.transform(m00 * sc, m10 * sc, m01 * sc, m11 * sc, 0, 0);
            ctx.drawImage(img, 0, 0);
            ctx.restore();
          }
        }
      }
    }
  }

  return { buildDef, getDef, hasDef, setImages, Reanim, LOOP, PLAY_ONCE, PLAY_ONCE_HOLD, LOOP_FULL_LAST, PLAY_ONCE_FULL_LAST_HOLD };
})();

if (typeof module !== 'undefined') module.exports = RE;
