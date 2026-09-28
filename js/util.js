/* web-pvz — util.js
 * 基础工具：随机数、数学、颜色、画布辅助
 * 依据 PvZ-Portable 的 RandRangeFloat 语义实现随机区间
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});

  const U = {};

  /* ---------- 数学 ---------- */
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  /* 加权随机：items=[{w,...}] */
  U.weighted = (items) => {
    let total = 0;
    for (const it of items) total += it.w;
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };
  U.dist2 = (x1, y1, x2, y2) => {
    const dx = x1 - x2, dy = y1 - y2;
    return dx * dx + dy * dy;
  };

  /* ---------- 颜色 ---------- */
  U.shade = (hex, amt) => {
    /* hex: #rrggbb, amt: -1..1 */
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) {
      r = Math.round(r + (255 - r) * amt);
      g = Math.round(g + (255 - g) * amt);
      b = Math.round(b + (255 - b) * amt);
    } else {
      const k = 1 + amt;
      r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
    }
    return `rgb(${r},${g},${b})`;
  };
  U.rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  /* ---------- 画布辅助 ---------- */
  U.rr = (ctx, x, y, w, h, r) => {
    /* 圆角矩形路径 */
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  U.circle = (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  };
  U.ellipse = (ctx, x, y, rx, ry, rot = 0) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  };
  /* 带阴影描边填充的文本 */
  U.text = (ctx, str, x, y, opt = {}) => {
    const size = opt.size || 16;
    const font = opt.font || `'Comic Sans MS','Chalkboard SE','Microsoft YaHei UI','Segoe UI Rounded',sans-serif`;
    ctx.save();
    ctx.font = `${opt.weight || 'bold'} ${size}px ${font}`;
    ctx.textAlign = opt.align || 'center';
    ctx.textBaseline = opt.baseline || 'middle';
    if (opt.stroke) {
      ctx.lineWidth = opt.strokeW || Math.max(2, size / 8);
      ctx.strokeStyle = opt.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = opt.fill || '#fff';
    ctx.fillText(str, x, y);
    ctx.restore();
  };

  /* ---------- 时间 ---------- */
  U.now = () => performance.now();
  U.fmtTime = (s) => {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };

  /* ---------- localStorage 封装 ---------- */
  U.save = (key, val) => {
    try { localStorage.setItem('webpvz_' + key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
  };
  U.load = (key, def) => {
    try {
      const v = localStorage.getItem('webpvz_' + key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  };

  /* ---------- 事件封装（指针统一） ---------- */
  U.onPointer = (el, fn) => {
    const handler = (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (el.width / rect.width / (el._dpr || 1));
      const y = (e.clientY - rect.top) * (el.height / rect.height / (el._dpr || 1));
      e.preventDefault();
      fn({ x, y, type: e.type, button: e.button });
      return false;
    };
    el.addEventListener('pointerdown', handler);
    el.addEventListener('pointermove', handler);
    el.addEventListener('pointerup', handler);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  PVZ.U = U;
})(window);
