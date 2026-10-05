// ============================================================
// reanim.js — PopCap 原版 Reanimator.cpp 完整移植 (Web Canvas)
// 移植自 PvZ-Portable: src/PvzpLib/Reanimator.cpp + Reanimator.h
//  - ReanimatorTrackInstance: blend/shake/attachment/imageOverride/renderGroup/trackColor
//  - Reanimation: animTime(0..1归一化) / frameStart+frameCount / overlayMatrix(3x3)
//  - DrawTrack: 图像中心对齐矩阵原点 (M = overlay ∘ transform ∘ T_center)
//    => 图像左上角 == 轨道变换点 (经 BltMatrixHelper -w/2..w/2 验证)
//  - 渲染分组: HIDDEN=-1, NORMAL=0, SHIELD=1, ARMS=2, OVER_SHIELD=3, ...MAX=17
//  - 附件: overlay = (O_body ∘ T_cur) ∘ T_base⁻¹ ∘ mOffset (完整矩阵跟随)
//  - 100Hz 逻辑语义: SECONDS_PER_UPDATE = 0.01
// 数据格式(保持兼容): {fps, n, anims:{name:[start,count]}, images:[], tracks:[[name,kfs]]}
// ============================================================
'use strict';

const RE = (function () {

  const LOOP = 0, PLAY_ONCE = 1, PLAY_ONCE_HOLD = 2, LOOP_FULL_LAST = 3, PLAY_ONCE_FULL_LAST_HOLD = 4;
  // 渲染分组 (原版枚举)
  const RENDER_GROUP_HIDDEN = -1, RENDER_GROUP_NORMAL = 0, RENDER_GROUP_MAX = 17;

  const SECONDS_PER_UPDATE = 0.01;
  const NO_BASE_POSE = -2;

  // ---------- 仿射矩阵工具 (canvas 布局 [a,b,c,d,e,f]) ----------
  const MAT = {
    id: () => [1, 0, 0, 1, 0, 0],
    mul(A, B) { // A ∘ B (先B后A)
      return [
        A[0] * B[0] + A[2] * B[1],
        A[1] * B[0] + A[3] * B[1],
        A[0] * B[2] + A[2] * B[3],
        A[1] * B[2] + A[3] * B[3],
        A[0] * B[4] + A[2] * B[5] + A[4],
        A[1] * B[4] + A[3] * B[5] + A[5],
      ];
    },
    inv(m) {
      const det = m[0] * m[3] - m[1] * m[2];
      if (Math.abs(det) < 1e-12) return [0, 0, 0, 0, m[4], m[5]];
      const id = 1 / det;
      return [
        m[3] * id, -m[1] * id,
        -m[2] * id, m[0] * id,
        (m[2] * m[5] - m[3] * m[4]) * id,
        (m[1] * m[4] - m[0] * m[5]) * id,
      ];
    },
    trans(x, y) { return [1, 0, 0, 1, x, y]; },
    scaleRot(x, y, rad, sx, sy) { // PvzpScaleRotateTransformMatrix
      return [Math.cos(rad) * sx, -Math.sin(rad) * sx, Math.sin(rad) * sy, Math.cos(rad) * sy, x, y];
    },
  };

  // ---------- 定义 (静态) ----------
  const defs = {};
  let images = null;
  function setImages(map) { images = map; }

  function resolveImage(key) {
    if (!key) return null;
    let k = key.toLowerCase();
    if (k.startsWith('images/')) k = k.slice(7);   // setImageOverride 带目录前缀容错
    if (k.endsWith('.jpg')) {
      const png = images.get(k.slice(0, -4) + '.png');
      if (png) return png;
    }
    return images.get(k) || null;
  }

  function buildDef(name, json) {
    if (!json || !Array.isArray(json.tracks)) return null;
    const n = json.n, nt = json.tracks.length;
    const tracks = new Array(nt);
    for (let ti = 0; ti < nt; ti++) {
      const [tname, kfs] = json.tracks[ti];
      const F = new Float32Array(n * 8);
      const IM = new Int32Array(n).fill(-1);
      // fill-in 语义 (ReanimationFillInMissingData)
      let x = 0, y = 0, kx = 0, ky = 0, sx = 1, sy = 1, f = 0, a = 1;
      let img = -1;
      const kfMap = new Map();
      for (const kf of kfs) kfMap.set(kf[0], kf);
      for (let i = 0; i < n; i++) {
        const kf = kfMap.get(i);
        if (kf) {
          if (kf[1] != null) x = kf[1];
          if (kf[2] != null) y = kf[2];
          if (kf[3] != null) kx = kf[3];
          if (kf[4] != null) ky = kf[4];
          if (kf[5] != null) sx = kf[5];
          if (kf[6] != null) sy = kf[6];
          if (kf[7] != null) f = kf[7];
          if (kf[8] != null) a = kf[8];
          if (kf[9] != null && kf[9] >= 0) img = kf[9];
        }
        const o = i * 8;
        F[o] = x; F[o + 1] = y; F[o + 2] = kx; F[o + 3] = ky;
        F[o + 4] = sx; F[o + 5] = sy; F[o + 6] = f; F[o + 7] = a;
        IM[i] = img;
      }
      tracks[ti] = { name: tname, F, IM };
    }
    const d = { fps: json.fps || 12, n, anims: json.anims || {}, images: json.images || [], tracks };
    d.trackIdx = {};
    for (let ti = 0; ti < nt; ti++) d.trackIdx[tracks[ti].name.toLowerCase()] = ti;
    defs[name.toLowerCase()] = d;
    return d;
  }

  function getDef(name) { return defs[name.toLowerCase()]; }
  function hasDef(name) { return !!defs[name.toLowerCase()]; }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------- Reanimator 轨道实例 ----------
  class TrackInstance {
    constructor() {
      this.blendCounter = 0;
      this.blendTime = 0;
      this.blendTransform = null;      // {x,y,kx,ky,sx,sy,f,a}
      this.shakeOverride = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.attachments = [];           // AttachEffect 列表 {reanim?, particle?, offset:[mat], dead}
      this.imageOverride = null;       // 图片key
      this.renderGroup = RENDER_GROUP_NORMAL;
      this.trackColor = [255, 255, 255, 255];
      this.ignoreClipRect = false;
      this.truncateDisappearingFrames = true;
    }
  }

  // ---------- Reanimation ----------
  class Reanimation {
    constructor(defName) {
      const d = getDef(defName);
      this.def = d;
      this.name = defName;
      this.reanimType = defName;
      // 播放状态
      this.animTime = 0;
      this.animRate = d ? d.fps : 12;
      this.loopType = LOOP;
      this.loopCount = 0;
      this.dead = false;
      this.frameStart = 0;
      this.frameCount = d && d.n ? d.n : 0;
      this.frameBasePose = -1;          // -1 = 用 frameStart; NO_BASE_POSE=-2 = 无
      this.lastFrameTime = -1;
      // 变换 (3x3 overlay, canvas布局)
      this.overlay = MAT.id();
      this.colorOverride = [255, 255, 255, 255];
      this.extraAdditiveColor = [255, 255, 255, 255];
      this.enableExtraAdditiveDraw = false;
      this.isAttachment = false;
      this.renderOrder = 0;
      // 兼容访问器: x/y/scale 直接同步 overlay 矩阵 (旧代码 r.x=.. 仍有效)
      Object.defineProperties(this, {
        x: { get() { return this.overlay[4]; }, set(v) { this.overlay[4] = v; } },
        y: { get() { return this.overlay[5]; }, set(v) { this.overlay[5] = v; } },
        scale: { get() { return this.overlay[0]; }, set(v) { this.overlay[0] = v; this.overlay[3] = v; } },
      });
      // 轨道实例
      const nt = d ? d.tracks.length : 0;
      this.tracks = new Array(nt);
      for (let i = 0; i < nt; i++) this.tracks[i] = new TrackInstance();
      // 绘制开关 (兼容)
      this.shown = true;
    }

    // ---- 轨道查找 (def 未加载时空安全) ----
    trackIndex(name) { return this.def ? (this.def.trackIdx[name.toLowerCase()] ?? 0) : 0; }
    trackExists(name) { return !!this.def && this.def.trackIdx[name.toLowerCase()] !== undefined; }
    animExists(name) { return !!this.def && this.def.anims[name] !== undefined; }

    // ---- 动画区间 ----
    getAnimRange(animName) {
      if (!this.def) return [0, 0];
      const r = this.def.anims[animName];
      if (!r) return [0, 0];
      return r;
    }
    // GetFramesForLayer: 也可由轨道数据推导 (控制轨道不在 anims 表时的回退)
    framesForLayer(name) {
      if (!this.def) return [0, 0];
      const r = this.def.anims[name];
      if (r) return r;
      // 按 animName 匹配同名轨道, 找非空白帧区间
      const ti = this.def.trackIdx[name.toLowerCase()];
      if (ti === undefined) return [0, 0];
      const IM = this.def.tracks[ti].IM;
      let start = 0, count = 1;
      for (let i = 0; i < IM.length; i++) if (IM[i] >= 0) { start = i; break; }
      for (let j = start; j < IM.length; j++) if (IM[j] >= 0) count = j - start + 1;
      return [start, count];
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
    playReanim(animName, loopType, blendTime, rate) { // PlayReanim
      if (blendTime > 0) this.startBlend(blendTime);
      if (rate !== 0) this.animRate = rate;
      this.loopType = loopType;
      this.loopCount = 0;
      this.setFramesForLayer(animName);
    }
    isPlaying(animName) {
      const [s, c] = this.framesForLayer(animName);
      return this.frameStart === s && this.frameCount === c;
    }
    animDuration(animName) {
      const [, c] = this.getAnimRange(animName);
      return c / Math.abs(this.animRate || this.def.fps);
    }

    // ---- 更新 (dt 秒; 内部按100Hz语义) ----
    update(dt) {
      if (this.frameCount <= 0 || this.dead || !this.def) return;
      const ticks = Math.max(1, Math.round(dt / SECONDS_PER_UPDATE));
      this.updateTicks(ticks);
    }
    updateTicks(ticks) {
      if (this.frameCount <= 0 || this.dead) return;
      this.lastFrameTime = this.animTime;
      this.animTime += SECONDS_PER_UPDATE * ticks * this.animRate / this.frameCount;
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
      // 轨道实例维护
      if (!this.def) return;
      const nt = this.tracks.length;
      for (let ti = 0; ti < nt; ti++) {
        const t = this.tracks[ti];
        if (t.blendCounter > 0) t.blendCounter = Math.max(0, t.blendCounter - ticks);
        if (t.shakeOverride !== 0) {
          t.shakeX = (Math.random() * 2 - 1) * t.shakeOverride;
          t.shakeY = (Math.random() * 2 - 1) * t.shakeOverride;
        }
        // 附件更新
        if (t.attachments.length) {
          const om = this.getAttachmentOverlayMatrix(ti);
          for (const att of t.attachments) {
            if (att.dead) continue;
            if (att.reanim) {
              att.reanim.overlay = MAT.mul(om, att.offset);
              att.reanim.x = att.reanim.overlay[4];
              att.reanim.y = att.reanim.overlay[5];
            } else if (att.particle) {
              // 粒子附件: 更新位置
              const m = MAT.mul(om, att.offset);
              att.particle.x = m[4]; att.particle.y = m[5];
            }
          }
        }
      }
    }

    // ---- 时间事件 ----
    shouldTrigger(t) {
      if (this.frameCount === 0 || this.lastFrameTime <= 0 || this.animRate <= 0) return false;
      if (this.animTime >= this.lastFrameTime) return t >= this.lastFrameTime && t < this.animTime;
      return t >= this.lastFrameTime || t < this.animTime;
    }

    // ---- 帧时间 ----
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

    // ---- 变换 (插值 + 混合) ----
    transformAt(ti, ft) {
      const [ib, ia, frac] = ft;
      const F = this.def.tracks[ti].F, o1 = ib * 8, o2 = ia * 8;
      const t = {
        x: lerp(F[o1], F[o2], frac),
        y: lerp(F[o1 + 1], F[o2 + 1], frac),
        kx: lerp(F[o1 + 2], F[o2 + 2], frac),
        ky: lerp(F[o1 + 3], F[o2 + 3], frac),
        sx: lerp(F[o1 + 4], F[o2 + 4], frac),
        sy: lerp(F[o1 + 5], F[o2 + 5], frac),
        f: F[o1 + 6],
        a: lerp(F[o1 + 7], F[o2 + 7], frac),
      };
      // 截断消失帧
      const tI = this.tracks[ti];
      if (F[o1 + 6] !== -1 && F[o2 + 6] === -1 && frac > 0 && tI.truncateDisappearingFrames) t.f = -1;
      return t;
    }
    curTransform(ti, ft) {
      const t = this.transformAt(ti, ft || this.frameTime());
      const tI = this.tracks[ti];
      if (t.f >= 0 && tI.blendCounter > 0 && tI.blendTransform) {
        const factor = tI.blendCounter / tI.blendTime;
        const b = tI.blendTransform;
        // BlendTransform (斜率差>180°忽略)
        let bkx = b.kx, bky = b.ky;
        while (bkx > t.kx + 180) bkx = t.kx;
        while (bkx < t.kx - 180) bkx = t.kx;
        while (bky > t.ky + 180) bky = t.ky;
        while (bky < t.ky - 180) bky = t.ky;
        return {
          x: lerp(t.x, b.x, factor), y: lerp(t.y, b.y, factor),
          kx: lerp(t.kx, bkx, factor), ky: lerp(t.ky, bky, factor),
          sx: lerp(t.sx, b.sx, factor), sy: lerp(t.sy, b.sy, factor),
          f: t.f, a: lerp(t.a, b.a, factor),
        };
      }
      return t;
    }
    // 变换矩阵 (MatrixFromTransform, canvas布局)
    transformMatrix(t) {
      const kx = -t.kx * Math.PI / 180, ky = -t.ky * Math.PI / 180;
      return [
        Math.cos(kx) * t.sx, -Math.sin(kx) * t.sx,
        Math.sin(ky) * t.sy, Math.cos(ky) * t.sy,
        t.x, t.y,
      ];
    }
    curImageKey(ti, ft) {
      const [ib] = ft || this.frameTime();
      const idx = this.def.tracks[ti].IM[ib];
      if (idx < 0) return null;
      return this.def.images[idx];
    }

    // ---- 速度 (GetTrackVelocity) ----
    getTrackVelocity(name) {
      if (!this.def) return 0;
      const ti = this.trackIndex(name);
      const [ib, ia] = this.frameTime();
      const F = this.def.tracks[ti].F;
      const dis = F[ia * 8] - F[ib * 8];
      return dis * SECONDS_PER_UPDATE * this.animRate;
    }
    // 行走同步支撑: _ground 在当前动画区间的总位移
    groundDist(animName) {
      if (!this.def) return null;
      const [s, c] = this.getAnimRange(animName || 'anim_walk');
      if (c <= 0) return null;
      const ti = this.def.trackIdx['_ground'];
      if (ti === undefined) return null;
      const F = this.def.tracks[ti].F;
      if (!F) return null;
      const i0 = Math.min(s, this.def.n - 1);
      const i1 = Math.min(s + c - 1, this.def.n - 1);
      return Math.abs(F[i1 * 8] - F[i0 * 8]);
    }

    // ---- 混合 ----
    startBlend(blendTime) {
      const ft = this.frameTime();
      for (let ti = 0; ti < this.tracks.length; ti++) {
        const t = this.curTransform(ti, ft);
        if (t.f >= 0) {
          const tI = this.tracks[ti];
          tI.blendTransform = { x: t.x, y: t.y, kx: t.kx, ky: t.ky, sx: t.sx, sy: t.sy, f: t.f, a: t.a };
          tI.blendTime = blendTime;
          tI.blendCounter = blendTime;
        }
      }
    }

    // ---- 渲染分组 ----
    assignRenderGroupToTrack(name, group) {
      const nl = name.toLowerCase();
      for (let i = 0; i < this.tracks.length; i++) {
        if (this.def.tracks[i].name.toLowerCase() === nl) { this.tracks[i].renderGroup = group; return; }
      }
    }
    assignRenderGroupToPrefix(prefix, group) {
      const p = prefix.toLowerCase();
      for (let i = 0; i < this.tracks.length; i++) {
        if (this.def.tracks[i].name.toLowerCase().startsWith(p)) this.tracks[i].renderGroup = group;
      }
    }
    showOnlyTrack(name) {
      const nl = name.toLowerCase();
      for (let i = 0; i < this.tracks.length; i++) {
        this.tracks[i].renderGroup = this.def.tracks[i].name.toLowerCase() === nl ? RENDER_GROUP_NORMAL : RENDER_GROUP_HIDDEN;
      }
    }
    // 兼容旧API
    showPrefix(prefix, show) { this.assignRenderGroupToPrefix(prefix, show ? RENDER_GROUP_NORMAL : RENDER_GROUP_HIDDEN); }
    showTrack(name, show) { this.assignRenderGroupToTrack(name, show ? RENDER_GROUP_NORMAL : RENDER_GROUP_HIDDEN); }
    setImageOverride(name, imgKey) { this.tracks[this.trackIndex(name)].imageOverride = imgKey; }
    getImageOverride(name) { return this.tracks[this.trackIndex(name)].imageOverride; }
    setTrackColor(name, rgba) { const t = this.tracks[this.trackIndex(name)]; t.trackColor = rgba.slice(); t.trackColor[3] = rgba[3] === undefined ? 255 : rgba[3]; }
    setTruncateDisappearingFrames(name, trunc) {
      if (name == null) { for (const t of this.tracks) t.truncateDisappearingFrames = trunc; }
      else this.tracks[this.trackIndex(name)].truncateDisappearingFrames = trunc;
    }

    // ---- 位置/缩放 ----
    setPosition(x, y) { this.overlay[4] = x; this.overlay[5] = y; this.x = x; this.y = y; }
    overrideScale(sx, sy) { this.overlay[0] = sx; this.overlay[3] = sy; }

    // ---- 附件 ----
    attachToTrack(trackName, reanim, offsetX = 0, offsetY = 0) {
      // AttachReanim(trackInstance.mAttachmentID, reanim, offX, offY)
      const ti = this.trackIndex(trackName);
      if (this.frameBasePose === -1) this.frameBasePose = this.frameStart;
      const att = { reanim, offset: MAT.trans(offsetX, offsetY), dead: false };
      reanim.isAttachment = true;
      this.tracks[ti].attachments.push(att);
      return att;
    }
    // 立即重算所有附件 overlay (供宿主位置变更后同步调用, 消除一帧滞后)
    refreshAttachments() {
      for (let ti = 0; ti < this.tracks.length; ti++) {
        const t = this.tracks[ti];
        if (!t.attachments.length) continue;
        const om = this.getAttachmentOverlayMatrix(ti);
        for (const att of t.attachments) {
          if (att.dead || !att.reanim) continue;
          att.reanim.overlay = MAT.mul(om, att.offset);
        }
      }
    }
    attachToAnotherReanimation(host, trackName) {
      return host.attachToTrack(trackName, this, 0, 0);
    }
    // 基础姿态矩阵
    getTrackBasePoseMatrix(ti) {
      if (this.frameBasePose === NO_BASE_POSE) return MAT.id();
      const basePos = this.frameBasePose === -1 ? this.frameStart : this.frameBasePose;
      const ft = [basePos, basePos + 1, 0];
      const t = this.transformAt(ti, ft);
      return this.transformMatrix(t);
    }
    // 附件 overlay 矩阵 (完整语义)
    getAttachmentOverlayMatrix(ti) {
      const t = this.curTransform(ti, this.frameTime());
      const T = this.transformMatrix(t);
      const A = MAT.mul(this.overlay, T);
      const B = this.getTrackBasePoseMatrix(ti);
      return MAT.mul(A, MAT.inv(B));
    }

    // ---- 绘制 ----
    draw(ctx) { this.drawRenderGroup(ctx, RENDER_GROUP_NORMAL); }
    drawAllRenderGroups(ctx) {
      for (let g = RENDER_GROUP_NORMAL; g <= RENDER_GROUP_MAX; g++) this.drawRenderGroup(ctx, g);
    }
    drawRenderGroup(ctx, renderGroup) {
      if (this.dead || !this.def || !this.shown) return;
      if (this.def.tracks.length === 0) return;
      const ft = this.frameTime();
      const nt = this.tracks.length;
      for (let ti = 0; ti < nt; ti++) {
        const tI = this.tracks[ti];
        if (tI.renderGroup !== renderGroup) continue;
        const drawn = this.drawTrack(ctx, ti, ft);
        if (tI.attachments.length) {
          for (const att of tI.attachments) {
            if (att.dead || !att.reanim) continue;
            // 附件按其所在组绘制; 附件自身死亡或轨道空白时仍绘制 (原版 !aTrackDrawn 语义)
            att.reanim.draw(ctx);
          }
        }
        void drawn;
      }
    }
    drawTrack(ctx, ti, ft) {
      const t = this.curTransform(ti, ft);
      if (t.f < 0) return false;
      let key = this.tracks[ti].imageOverride;
      if (!key) {
        const idx = this.def.tracks[ti].IM[ft[0]];
        if (idx < 0) return false;
        key = this.def.images[idx];
      }
      const img = resolveImage(key);
      if (!img) return false;
      // 颜色
      const tc = this.tracks[ti].trackColor, co = this.colorOverride;
      let r = (tc[0] * co[0]) / 255 | 0, g = (tc[1] * co[1]) / 255 | 0, b = (tc[2] * co[2]) / 255 | 0;
      let alpha = t.a * (tc[3] / 255) * (co[3] / 255);
      if (alpha <= 0.003) return false;
      const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      if (!w || !h) return false;
      // M = overlay ∘ transform ∘ T_center
      const T = this.transformMatrix(t);
      let M = MAT.mul(T, MAT.trans(w / 2, h / 2));
      M = MAT.mul(this.overlay, M);
      M[4] += this.tracks[ti].shakeX;
      M[5] += this.tracks[ti].shakeY;
      // 绘制: 图像quad中心对齐原点
      ctx.save();
      ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
      ctx.globalAlpha *= alpha;
      // 纯色剪影模式 (我是僵尸纸牌植物: 原版 FILTER_EFFECT_WHITE + Colorize)
      if (this.solidColor) {
        const sc = this.solidColor;
        const sil = Reanimation._silhouette(img, sc[0], sc[1], sc[2]);
        ctx.drawImage(sil, -w / 2, -h / 2);
      } else if (r !== 255 || g !== 255 || b !== 255) {
        // 主绘制 (色调覆盖: 减速蓝/魅惑紫/灼烧黑)
        const src = Reanimation._tint(img, r, g, b);
        ctx.drawImage(src, -w / 2, -h / 2);
      } else {
        ctx.drawImage(img, -w / 2, -h / 2);
      }
      // 额外加法叠加 (受击高亮/减速蓝光)
      if (this.enableExtraAdditiveDraw) {
        const ec = this.extraAdditiveColor;
        const ea = (ec[3] / 255) * alpha;
        if (ea > 0.01 && (ec[0] || ec[1] || ec[2])) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = ea;
          const src = Reanimation._tint(img, ec[0], ec[1], ec[2]);
          ctx.drawImage(src, -w / 2, -h / 2);
        }
      }
      ctx.restore();
      return true;
    }
    // 色调缓存 (同一图像+tint 复用): multiply 混色 + 恢复alpha (等价 ColorsMultiply)
    static _tint(img, r, g, b) {
      if (!img.__tints) img.__tints = {};
      const k = r + '_' + g + '_' + b;
      let c = img.__tints[k];
      if (c) return c;
      const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      cx.globalCompositeOperation = 'multiply';
      cx.fillStyle = `rgb(${r},${g},${b})`;
      cx.fillRect(0, 0, w, h);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(img, 0, 0);
      cx.globalCompositeOperation = 'source-over';
      img.__tints[k] = c;
      return c;
    }
    // 纯色剪影缓存 (我是僵尸纸牌效果: 原版 FILTER_EFFECT_WHITE + SetColorizeImages)
    static _silhouette(img, r, g, b) {
      if (!img.__sils) img.__sils = {};
      const k = r + '_' + g + '_' + b;
      let c = img.__sils[k];
      if (c) return c;
      const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = `rgb(${r},${g},${b})`;
      cx.fillRect(0, 0, w, h);
      img.__sils[k] = c;
      return c;
    }
    // 轨道当前显示状态 (IsTrackShowing)
    isTrackShowing(name) {
      const ft = this.frameTime();
      const ti = this.trackIndex(name);
      return this.def.tracks[ti].F[ft[1] * 8 + 6] >= 0;
    }
    // 轨道当前位置 (GetTrackPosition 近似)
    getTrackPosition(name) {
      const ft = this.frameTime();
      const ti = this.trackIndex(name);
      const t = this.curTransform(ti, ft);
      return [this.overlay[4] + t.x * this.overlay[0], this.overlay[5] + t.y * this.overlay[3]];
    }
    findTrackIndex(name) { return this.trackIndex(name); }
    reanimDie() {
      if (this.dead) return;
      this.dead = true;
      for (const t of this.tracks) {
        for (const att of t.attachments) {
          if (att.reanim) att.reanim.reanimDie();
          att.dead = true;
        }
      }
    }
  }

  // 便捷工厂 (AddReanimation 语义)
  function addReanim(name, x, y, renderOrder = 0) {
    const r = new Reanimation(name);
    r.setPosition(x, y);
    r.renderOrder = renderOrder;
    return r;
  }

  return {
    buildDef, getDef, hasDef, setImages, resolveImage,
    Reanimation, addReanim, MAT,
    LOOP, PLAY_ONCE, PLAY_ONCE_HOLD, LOOP_FULL_LAST, PLAY_ONCE_FULL_LAST_HOLD,
    RENDER_GROUP_HIDDEN, RENDER_GROUP_NORMAL, RENDER_GROUP_MAX,
    SECONDS_PER_UPDATE,
  };
})();

if (typeof module !== 'undefined') module.exports = RE;
