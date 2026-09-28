/* web-pvz — sprites.js
 * 程序化矢量绘制：场景背景、植物、阳光、子弹、割草机、UI 元素
 * 所有图形运行时用 Canvas 2D 绘制，无外部素材
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});
  const { U, G, PLANTS } = PVZ;
  const SP = {};

  /* ============ 背景 ============ */
  SP.drawBackground = (ctx) => {
    const W = G.W, H = G.H;
    /* 天空 */
    let sky = ctx.createLinearGradient(0, 0, 0, G.GRID_Y + 40);
    sky.addColorStop(0, '#7EC8E8');
    sky.addColorStop(1, '#C8E8F5');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, G.GRID_Y + 40);

    /* 云 */
    ctx.save();
    ctx.globalAlpha = 0.85;
    const cloud = (x, y, s) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
      ctx.arc(x + 22 * s, y - 8 * s, 22 * s, 0, Math.PI * 2);
      ctx.arc(x + 48 * s, y, 16 * s, 0, Math.PI * 2);
      ctx.arc(x + 26 * s, y + 8 * s, 18 * s, 0, Math.PI * 2);
      ctx.fill();
    };
    cloud(240, 42, 1);
    cloud(560, 30, 0.8);
    cloud(800, 55, 0.6);
    ctx.restore();

    /* 远处树篱 */
    ctx.fillStyle = '#3E7A2E';
    ctx.fillRect(0, G.GRID_Y - 46, W, 26);
    SP._bushes(ctx, 0, G.GRID_Y - 30, W, '#4E8C3A');

    /* 草坪格子 */
    for (let r = 0; r < G.ROWS; r++) {
      for (let c = 0; c < G.COLS; c++) {
        const x = G.GRID_X + c * G.CELL_W, y = G.GRID_Y + r * G.CELL_H;
        const light = (r + c) % 2 === 0;
        ctx.fillStyle = light ? '#6FBF44' : '#5FA83A';
        ctx.fillRect(x, y, G.CELL_W, G.CELL_H);
      }
    }
    /* 草坪顶部与底部边缘阴影 */
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(G.GRID_X, G.GRID_Y, G.GRID_W, 6);
    ctx.fillRect(G.GRID_X, G.GRID_Y + G.GRID_H - 6, G.GRID_W, 6);

    /* 草坪外围泥土 */
    ctx.fillStyle = '#8A6B4A';
    ctx.fillRect(0, G.GRID_Y, G.GRID_X, G.GRID_H);
    ctx.fillRect(G.GRID_X + G.GRID_W, G.GRID_Y, W - G.GRID_X - G.GRID_W, G.GRID_H);
    ctx.fillRect(0, G.GRID_Y + G.GRID_H, W, H - G.GRID_Y - G.GRID_H);
    /* 泥土颗粒 */
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 60; i++) {
      const rx = ((i * 137) % 977) / 977 * W;
      const ry = G.GRID_Y + G.GRID_H + ((i * 61) % 89) / 89 * (H - G.GRID_Y - G.GRID_H);
      ctx.fillRect(rx, ry, 4, 3);
    }
    /* 右侧小路（僵尸入场） */
    ctx.fillStyle = '#9A8B70';
    ctx.fillRect(G.GRID_X + G.GRID_W, G.GRID_Y - 10, 40, G.GRID_H + 20);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(G.GRID_X + G.GRID_W + 34, G.GRID_Y - 10, 6, G.GRID_H + 20);

    /* 房子（最后绘制，覆盖左侧泥地，形成砖墙立面） */
    SP._house(ctx);
  };

  SP._bushes = (ctx, x0, y, w, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let x = x0; x < x0 + w; x += 34) {
      ctx.moveTo(x, y + 20);
      ctx.arc(x + 17, y + 6, 15 + ((x / 34) % 3) * 2, 0, Math.PI * 2);
    }
    ctx.fill();
  };

  SP._house = (ctx) => {
    const x = -4;
    const y = G.GRID_Y - 60;
    const wallW = 108;
    const wallH = H_TOTAL();
    function H_TOTAL() { return G.H - (y + 40) + 60; }
    /* 墙（覆盖左侧全高） */
    ctx.fillStyle = '#D9C6A5';
    ctx.fillRect(x, y + 40, wallW, wallH);
    /* 砖纹 */
    ctx.strokeStyle = 'rgba(160,130,95,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let by = y + 56; by < G.H + 30; by += 14) {
      ctx.moveTo(x, by); ctx.lineTo(x + wallW - 4, by);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let by = y + 56, k = 0; by < G.H + 30; by += 14, k++) {
      const off = (k % 2) * 26 + 13;
      ctx.moveTo(x + off, by - 14); ctx.lineTo(x + off, by);
    }
    ctx.stroke();
    /* 屋顶（下移至种子栏以下可见） */
    ctx.fillStyle = '#8C5A3C';
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 78);
    ctx.lineTo(x + 54, y + 18);
    ctx.lineTo(x + 122, y + 78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7A4C32';
    ctx.fillRect(x - 14, y + 72, 148, 10);
    /* 门 */
    ctx.fillStyle = '#6B4226';
    U.rr(ctx, x + 30, y + 116, 46, 84, 6);
    ctx.fill();
    ctx.fillStyle = '#D9C6A5';
    ctx.fillRect(x + 40, y + 116, 26, 84);
    ctx.fillStyle = '#6B4226';
    ctx.beginPath();
    ctx.arc(x + 68, y + 158, 3, 0, Math.PI * 2);
    ctx.fill();
    /* 窗 */
    ctx.fillStyle = '#5A7A9A';
    U.rr(ctx, x + 20, y + 92, 68, 36, 5);
    ctx.fill();
    ctx.strokeStyle = '#8C5A3C';
    ctx.lineWidth = 3;
    U.rr(ctx, x + 20, y + 92, 68, 36, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 54, y + 92); ctx.lineTo(x + 54, y + 128);
    ctx.moveTo(x + 20, y + 110); ctx.lineTo(x + 88, y + 110);
    ctx.stroke();
  };

  /* ============ 通用植物部件 ============ */
  const leafPair = (ctx, s = 1, sway = 0) => {
    ctx.save();
    ctx.rotate(sway * 0.1);
    ctx.fillStyle = '#3E9A2E';
    ctx.beginPath();
    ctx.ellipse(-16 * s, -6 * s, 14 * s, 6 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(16 * s, -6 * s, 14 * s, 6 * s, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2E7A20';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(-24 * s, -8 * s); ctx.lineTo(-8 * s, -4 * s);
    ctx.moveTo(24 * s, -8 * s); ctx.lineTo(8 * s, -4 * s);
    ctx.stroke();
    ctx.restore();
  };

  const stem = (ctx, h, sway) => {
    ctx.strokeStyle = '#3E9A2E';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(sway * 6, -h * 0.55, sway * 10, -h);
    ctx.stroke();
  };

  const face = (ctx, x, y, s, opt = {}) => {
    /* 眼睛 */
    const ew = opt.eyes || 5;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x - 8 * s, y, ew * s, ew * 1.25 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 8 * s, y, ew * s, ew * 1.25 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = opt.pupil || '#222';
    const px = (opt.look || 0) * 2 * s;
    ctx.beginPath();
    ctx.arc(x - 8 * s + px, y + 1 * s, ew * 0.45 * s, 0, Math.PI * 2);
    ctx.arc(x + 8 * s + px, y + 1 * s, ew * 0.45 * s, 0, Math.PI * 2);
    ctx.fill();
    /* 嘴 */
    ctx.strokeStyle = opt.mouth || '#3A2A1A';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    if (opt.smile) {
      ctx.arc(x, y + 10 * s, 6 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      ctx.moveTo(x - 5 * s, y + 12 * s);
      ctx.lineTo(x + 5 * s, y + 12 * s);
    }
    ctx.stroke();
  };

  SP.face = face;
  SP.leafPair = leafPair;
  SP.stem = stem;

  /* ============ 植物绘制 ============ */
  /* 每个函数锚点：(0,0) = 格子底部中心；p = plant 实例（含 anim 状态） */
  const P = {};

  P.sunflower = (ctx, p) => {
    const t = p.anim.t;
    const sway = Math.sin(t * 2.2 + p.seed * 7);
    const glow = p.anim.sunGlow || 0;
    stem(ctx, 42, sway);
    leafPair(ctx, 1, sway);
    ctx.save();
    ctx.translate(sway * 10, -50);
    ctx.rotate(sway * 0.06);
    /* 发光 */
    if (glow > 0) {
      ctx.save();
      const r = 42 + glow * 10;
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r);
      g.addColorStop(0, `rgba(255,220,80,${0.55 * glow})`);
      g.addColorStop(1, 'rgba(255,220,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    /* 花瓣 */
    ctx.fillStyle = '#FFC726';
    ctx.strokeStyle = '#E8A010';
    ctx.lineWidth = 1.5;
    const petals = 12;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + Math.sin(t * 1.1) * 0.03;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(19, 0, 12, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    /* 脸盘 */
    ctx.fillStyle = '#B8761A';
    ctx.beginPath(); ctx.arc(0, 0, 15.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D8901F';
    ctx.beginPath(); ctx.arc(-3, -3, 12, 0, Math.PI * 2); ctx.fill();
    face(ctx, 0, -2, 0.9, { smile: true, look: Math.sin(t * 0.7) });
    ctx.restore();
  };

  const shooterHead = (ctx, p, palette, opts = {}) => {
    const t = p.anim.t;
    const recoil = p.anim.recoil || 0;
    const headY = -52;
    ctx.save();
    ctx.translate(recoil * -5, headY + Math.sin(t * 2 + p.seed * 5) * 1.5);
    /* 后脑勺叶芽 */
    ctx.fillStyle = palette.dark;
    ctx.beginPath();
    ctx.ellipse(-12, -16, 9, 4.5, -0.7, 0, Math.PI * 2);
    ctx.fill();
    /* 头球 */
    const g = ctx.createRadialGradient(-6, -8, 4, 0, 0, 24);
    g.addColorStop(0, palette.light);
    g.addColorStop(1, palette.base);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill();
    /* 嘴筒 */
    const rl = 22 - recoil * 6;
    ctx.fillStyle = palette.base;
    U.rr(ctx, 8, -10, rl, 20, 9);
    ctx.fill();
    ctx.fillStyle = palette.dark;
    U.rr(ctx, 8 + rl - 8, -12, 9, 24, 4);
    ctx.fill();
    /* 筒口内暗 */
    ctx.fillStyle = palette.mouth || '#1E3A10';
    ctx.beginPath();
    ctx.ellipse(8 + rl - 3, 0, 4.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (opts.frost) {
      /* 冰晶 */
      ctx.fillStyle = 'rgba(230,248,255,0.9)';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + 0.4;
        const cx = Math.cos(a) * 17, cy = Math.sin(a) * 15 - 3;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -5); ctx.lineTo(2.5, 0); ctx.lineTo(0, 5); ctx.lineTo(-2.5, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    /* 眼 */
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-4, -6, 5, 6.5, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -6, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-3, -5, 2.3, 0, Math.PI * 2);
    ctx.arc(7, -5, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  P.peashooter = (ctx, p) => {
    const sway = Math.sin(p.anim.t * 2 + p.seed * 5);
    stem(ctx, 40, sway);
    leafPair(ctx, 1, sway);
    shooterHead(ctx, p, { light: '#9FE86A', base: '#5DC53E', dark: '#3E9A2E' });
  };

  P.snowpea = (ctx, p) => {
    const sway = Math.sin(p.anim.t * 2 + p.seed * 5);
    stem(ctx, 40, sway);
    leafPair(ctx, 0.9, sway);
    shooterHead(ctx, p, { light: '#D8F4FF', base: '#9ADCF0', dark: '#6BB8D8', mouth: '#1A3A50' }, { frost: true });
  };

  P.repeater = (ctx, p) => {
    const sway = Math.sin(p.anim.t * 2 + p.seed * 5);
    stem(ctx, 42, sway);
    leafPair(ctx, 1, sway);
    /* 后头 */
    ctx.save();
    ctx.translate(-14, -64);
    ctx.fillStyle = '#4EB534';
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3E9A2E';
    U.rr(ctx, 6, -8, 14, 16, 7); ctx.fill();
    ctx.restore();
    shooterHead(ctx, p, { light: '#9FE86A', base: '#5DC53E', dark: '#3E9A2E' });
  };

  const nutBody = (ctx, p, tall) => {
    const t = p.anim.t;
    const ratio = p.hp / p.maxHp;
    const h = tall ? 74 : 52, w = tall ? 40 : 40;
    ctx.save();
    ctx.translate(0, tall ? -4 : -2);
    /* 身体 */
    const g = ctx.createLinearGradient(-w / 2, -h, w / 2, 0);
    g.addColorStop(0, '#D8B878');
    g.addColorStop(1, '#B8905A');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -h / 2 + 4, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9A7040';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* 裂纹 */
    ctx.strokeStyle = '#7A5230';
    ctx.lineWidth = 2.2;
    if (ratio < 0.66) {
      ctx.beginPath();
      ctx.moveTo(-8, -h + 12);
      ctx.lineTo(-4, -h + 24); ctx.lineTo(-10, -h + 34);
      ctx.stroke();
    }
    if (ratio < 0.33) {
      ctx.beginPath();
      ctx.moveTo(12, -h + 10);
      ctx.lineTo(8, -h + 22); ctx.lineTo(14, -h + 32);
      ctx.moveTo(-2, -h + 6); ctx.lineTo(2, -h + 18);
      ctx.stroke();
    }
    /* 表情 */
    const blink = Math.sin(t * 0.8 + p.seed * 3) > 0.96;
    if (!blink) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-9, -h * 0.62, 5.5, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(9, -h * 0.62, 5.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-8, -h * 0.62 + 1, 2.6, 0, Math.PI * 2);
      ctx.arc(10, -h * 0.62 + 1, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#5A4020';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, -h * 0.62); ctx.lineTo(-5, -h * 0.62);
      ctx.moveTo(5, -h * 0.62); ctx.lineTo(13, -h * 0.62);
      ctx.stroke();
    }
    /* 担忧的嘴 */
    ctx.strokeStyle = '#5A4020';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    const worried = ratio < 0.5;
    if (worried) {
      ctx.arc(0, -h * 0.36, 7, 1.15 * Math.PI, 1.85 * Math.PI);
    } else {
      ctx.arc(0, -h * 0.44, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();
    ctx.restore();
  };

  P.wallnut = (ctx, p) => nutBody(ctx, p, false);
  P.tallnut = (ctx, p) => nutBody(ctx, p, true);

  P.cherrybomb = (ctx, p) => {
    const t = p.anim.t;
    const fuse = p.anim.fuse != null ? p.anim.fuse : 0;
    const pulse = fuse > 0 ? 1 + Math.sin(t * 20) * 0.08 * (1.2 - fuse) : 1;
    ctx.save();
    ctx.scale(pulse, pulse);
    /* 茎 */
    ctx.strokeStyle = '#4E8C3A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-14, -44); ctx.quadraticCurveTo(-6, -62, -2, -70);
    ctx.moveTo(12, -46); ctx.quadraticCurveTo(8, -60, -2, -70);
    ctx.stroke();
    /* 火花 */
    if (fuse > 0) {
      ctx.fillStyle = '#FFD800';
      ctx.beginPath();
      const s = 3 + Math.sin(t * 30) * 2;
      ctx.arc(-2, -72, s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FF7800';
      ctx.beginPath(); ctx.arc(-2, -72, s * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    /* 双果 */
    const cherry = (x, y, r, exp) => {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, exp ? '#FF8A80' : '#E84848');
      g.addColorStop(1, '#B01818');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      /* 怒眉 */
      ctx.strokeStyle = '#5A0A0A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 7); ctx.lineTo(x - 3, y - 4);
      ctx.moveTo(x + 9, y - 7); ctx.lineTo(x + 3, y - 4);
      ctx.stroke();
      /* 眼 */
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x - 5, y, 3.5, 4.5, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 5, y, 3.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(x - 5, y + 1, 1.8, 0, Math.PI * 2);
      ctx.arc(x + 5, y + 1, 1.8, 0, Math.PI * 2);
      ctx.fill();
    };
    cherry(-14, -32, 16, fuse > 0);
    cherry(13, -26, 17, fuse > 0);
    ctx.restore();
  };

  P.potatomine = (ctx, p) => {
    const t = p.anim.t;
    if (!p.armed) {
      /* 埋土中：土堆 + 天线尖 */
      ctx.fillStyle = '#7A5A3A';
      ctx.beginPath();
      ctx.ellipse(0, -6, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8A6B4A';
      ctx.beginPath();
      ctx.ellipse(0, -8, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      const rise = p.anim.armProgress || 0;
      ctx.fillStyle = '#C8A86A';
      ctx.beginPath();
      ctx.ellipse(0, -10, 5, 4 + rise * 4, 0, 0, Math.PI * 2);
      ctx.fill();
      /* 进度微光 */
      ctx.fillStyle = `rgba(120,255,120,${0.2 + rise * 0.4})`;
      ctx.beginPath(); ctx.arc(0, -14, 1.8, 0, Math.PI * 2); ctx.fill();
    } else {
      /* 已武装 */
      ctx.fillStyle = '#C8A86A';
      ctx.strokeStyle = '#9A7848';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -14, 22, 16, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      /* 土痕 */
      ctx.fillStyle = '#B89458';
      ctx.beginPath(); ctx.ellipse(-6, -18, 5, 3, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, -10, 4, 2.5, -0.3, 0, Math.PI * 2); ctx.fill();
      /* 眼 */
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-8, -16, 4.5, 5.5, 0, 0, Math.PI * 2);
      ctx.ellipse(8, -16, 4.5, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-7, -15, 2.2, 0, Math.PI * 2);
      ctx.arc(9, -15, 2.2, 0, Math.PI * 2);
      ctx.fill();
      /* 警报灯 */
      const blinkOn = Math.sin(t * 8) > 0;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, -36); ctx.stroke();
      if (blinkOn) {
        ctx.fillStyle = '#FF3030';
        ctx.beginPath(); ctx.arc(0, -38, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.globalAlpha = 0.35;
        const g = ctx.createRadialGradient(0, -38, 2, 0, -38, 14);
        g.addColorStop(0, 'rgba(255,60,60,0.8)');
        g.addColorStop(1, 'rgba(255,60,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, -38, 14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#901818';
        ctx.beginPath(); ctx.arc(0, -38, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  P.squash = (ctx, p) => {
    const t = p.anim.t;
    const look = p.anim.squashLook || 0;
    ctx.save();
    ctx.translate(0, -2);
    /* 身体 */
    const g = ctx.createLinearGradient(-22, -46, 22, 0);
    g.addColorStop(0, '#C8E890');
    g.addColorStop(1, '#9AC858');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-22, -6);
    ctx.bezierCurveTo(-26, -34, -14, -48, 0, -48);
    ctx.bezierCurveTo(16, -48, 26, -32, 22, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78A040';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* 疙瘩 */
    ctx.fillStyle = '#B8D870';
    ctx.beginPath(); ctx.ellipse(-10, -36, 4, 3, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -28, 5, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
    /* 顶芽 */
    ctx.strokeStyle = '#6A9038';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.quadraticCurveTo(3, -56, -2, -58); ctx.stroke();
    /* 怒眉 + 眼 */
    ctx.strokeStyle = '#3A5A18';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -34); ctx.lineTo(-4, -30);
    ctx.moveTo(14, -34); ctx.lineTo(4, -30);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-8, -26, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -26, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-8 + look * 2, -25, 2.2, 0, Math.PI * 2);
    ctx.arc(8 + look * 2, -25, 2.2, 0, Math.PI * 2);
    ctx.fill();
    /* 嘴 */
    ctx.strokeStyle = '#3A5A18';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -16, 6, 1.2 * Math.PI, 1.8 * Math.PI);
    ctx.stroke();
    ctx.restore();
  };

  P.jalapeno = (ctx, p) => {
    const t = p.anim.t;
    const fuse = p.anim.fuse != null ? p.anim.fuse : 1;
    const shake = fuse < 1 ? Math.sin(t * 40) * 2 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    /* 身体（红辣椒） */
    const g = ctx.createLinearGradient(-16, -56, 16, -4);
    g.addColorStop(0, '#FF6A50');
    g.addColorStop(1, '#C81818');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.bezierCurveTo(-24, -18, -20, -48, 0, -56);
    ctx.bezierCurveTo(20, -48, 24, -18, 4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#901010';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* 茎 */
    ctx.strokeStyle = '#4E8C3A';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -56); ctx.quadraticCurveTo(2, -64, 6, -66); ctx.stroke();
    /* 怒容 */
    ctx.strokeStyle = '#5A0808';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -40); ctx.lineTo(-4, -36);
    ctx.moveTo(12, -40); ctx.lineTo(4, -36);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-7, -31, 4, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(7, -31, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-7, -30, 2, 0, Math.PI * 2);
    ctx.arc(7, -30, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5A0808';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -22, 5, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
  };

  P.torchwood = (ctx, p) => {
    const t = p.anim.t;
    /* 树桩 */
    const g = ctx.createLinearGradient(-24, -50, 24, 0);
    g.addColorStop(0, '#B08050');
    g.addColorStop(1, '#7A5030');
    ctx.fillStyle = g;
    U.rr(ctx, -22, -50, 44, 50, 10);
    ctx.fill();
    ctx.strokeStyle = '#5A3820';
    ctx.lineWidth = 2;
    U.rr(ctx, -22, -50, 44, 50, 10);
    ctx.stroke();
    /* 年轮顶 */
    ctx.fillStyle = '#C89868';
    ctx.beginPath();
    ctx.ellipse(0, -50, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9A7040';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, -50, 14, 5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -50, 7, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
    /* 树皮纹 */
    ctx.strokeStyle = 'rgba(90,56,32,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -40); ctx.quadraticCurveTo(-16, -25, -13, -10);
    ctx.moveTo(13, -38); ctx.quadraticCurveTo(15, -22, 12, -8);
    ctx.stroke();
    /* 火焰 */
    const fx = Math.sin(t * 9) * 2, fy = Math.cos(t * 7) * 2;
    ctx.fillStyle = 'rgba(255,120,20,0.85)';
    ctx.beginPath();
    ctx.moveTo(-13, -52);
    ctx.quadraticCurveTo(-16 + fx, -70, 0 + fx, -78 + fy);
    ctx.quadraticCurveTo(15 + fx, -68, 13, -52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,60,0.95)';
    ctx.beginPath();
    ctx.moveTo(-7, -53);
    ctx.quadraticCurveTo(-8 + fx * 0.6, -63, 0 + fx * 0.6, -68 + fy * 0.6);
    ctx.quadraticCurveTo(8 + fx * 0.6, -62, 7, -53);
    ctx.closePath();
    ctx.fill();
    /* 眼 */
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-8, -32, 4, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -32, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-8, -31, 2, 0, Math.PI * 2);
    ctx.arc(8, -31, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4A2A14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -22, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  };

  P.chomper = (ctx, p) => {
    const t = p.anim.t;
    const state = p.anim.state || 'idle';
    stem(ctx, 36, Math.sin(t * 2));
    leafPair(ctx, 0.9, Math.sin(t * 2));
    ctx.save();
    ctx.translate(0, -46 + Math.sin(t * 2.4) * 2);
    if (state === 'chewing') {
      /* 咀嚼：闭嘴 + 鼓包 */
      ctx.fillStyle = '#9A5AB8';
      ctx.beginPath(); ctx.ellipse(0, -4, 22, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7A3A98';
      ctx.beginPath(); ctx.ellipse(0, 6, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
      const chew = Math.sin(t * 12) * 2;
      ctx.strokeStyle = '#5A2A72';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, -6, 6, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-12 + chew, -2); ctx.stroke();
    } else {
      const open = state === 'biting' ? 1 : 0.35 + Math.sin(t * 2) * 0.1;
      /* 下颚 */
      ctx.fillStyle = '#8A4AA8';
      ctx.save();
      ctx.rotate(open * 0.45);
      ctx.beginPath();
      ctx.moveTo(-20, -2);
      ctx.quadraticCurveTo(0, 2, 22, -8);
      ctx.quadraticCurveTo(10, 12, -14, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      /* 上颚头 */
      ctx.save();
      ctx.rotate(-open * 0.55);
      const g = ctx.createLinearGradient(0, -26, 0, 0);
      g.addColorStop(0, '#B86AD8');
      g.addColorStop(1, '#8A4AA8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.quadraticCurveTo(-26, -26, 0, -26);
      ctx.quadraticCurveTo(26, -26, 24, -2);
      ctx.quadraticCurveTo(10, 6, -22, 0);
      ctx.closePath();
      ctx.fill();
      /* 斑点 */
      ctx.fillStyle = '#6A2A88';
      ctx.beginPath(); ctx.ellipse(-12, -16, 3.5, 3, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, -20, 3, 2.5, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(16, -10, 3, 2.5, 0.5, 0, Math.PI * 2); ctx.fill();
      /* 牙齿 */
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(20, -4); ctx.lineTo(26, -2); ctx.lineTo(22, 2);
      ctx.moveTo(12, -3); ctx.lineTo(17, -1); ctx.lineTo(13, 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      /* 下颚牙 */
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(18, 4); ctx.lineTo(24, 2); ctx.lineTo(20, 7);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  SP.plant = (ctx, type, p) => {
    const fn = P[type];
    if (fn) fn(ctx, p);
  };

  /* ============ 卡片图标 ============ */
  SP.drawCard = (ctx, type, x, y, w, h, opts = {}) => {
    const def = PLANTS[type];
    ctx.save();
    /* 卡底 */
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, opts.selected ? '#F8E8B0' : '#E8D8A8');
    g.addColorStop(1, opts.selected ? '#E0C070' : '#C8B078');
    ctx.fillStyle = g;
    U.rr(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = opts.selected ? '#FFF090' : '#8A7040';
    ctx.lineWidth = opts.selected ? 2.5 : 1.5;
    U.rr(ctx, x, y, w, h, 7);
    ctx.stroke();
    /* 植物图标 */
    ctx.save();
    ctx.translate(x + w / 2, y + h - 20);
    ctx.scale(0.52, 0.52);
    const fake = { anim: { t: 0 }, seed: 1, hp: 1, maxHp: 1, armed: true };
    SP.plant(ctx, type, fake);
    ctx.restore();
    /* 阳光费用 */
    ctx.save();
    ctx.translate(x + 13, y + h - 10);
    SP.sunIcon(ctx, 0, 0, 8);
    ctx.restore();
    U.text(ctx, String(def.cost), x + w - 12, y + h - 10, { size: 13, fill: '#2A2A2A', align: 'center' });
    /* 冷却遮罩 */
    if (opts.cooldown > 0) {
      ctx.fillStyle = 'rgba(20,20,20,0.62)';
      const ch = h * U.clamp(opts.cooldown, 0, 1);
      U.rr(ctx, x, y, w, ch, 7);
      ctx.fill();
    }
    /* 不可用（阳光不足） */
    if (opts.disabled) {
      ctx.fillStyle = 'rgba(40,40,60,0.45)';
      U.rr(ctx, x, y, w, h, 7);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ============ 阳光 ============ */
  SP.sunIcon = (ctx, x, y, r) => {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.15);
    g.addColorStop(0, '#FFF8C8');
    g.addColorStop(0.6, '#FFD838');
    g.addColorStop(1, '#F8B820');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#E8A010';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  SP.drawSun = (ctx, s) => {
    const t = s.anim.t;
    ctx.save();
    ctx.translate(s.x, s.y);
    const r = s.r || 26;
    /* 光晕 */
    const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.6);
    halo.addColorStop(0, 'rgba(255,230,110,0.5)');
    halo.addColorStop(1, 'rgba(255,230,110,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
    /* 光芒 */
    ctx.save();
    ctx.rotate(t * 0.8);
    ctx.fillStyle = 'rgba(255,214,64,0.85)';
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i / 8) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(r * 0.55, -r * 0.28);
      ctx.quadraticCurveTo(r * 1.05, 0, r * 0.55, r * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    /* 核心 */
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r * 0.72);
    g.addColorStop(0, '#FFFEE8');
    g.addColorStop(0.55, '#FFE060');
    g.addColorStop(1, '#FFC018');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#F0A818';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  /* ============ 子弹 ============ */
  SP.drawPea = (ctx, b) => {
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.type === 'fire') {
      /* 火焰尾迹 */
      ctx.fillStyle = 'rgba(255,120,20,0.5)';
      ctx.beginPath();
      ctx.ellipse(-14, 0, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, 10);
      g.addColorStop(0, '#FFE080');
      g.addColorStop(0.6, '#FF8828');
      g.addColorStop(1, '#E04808');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    } else if (b.type === 'snow') {
      const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, 10);
      g.addColorStop(0, '#E8FAFF');
      g.addColorStop(0.6, '#A8DCF8');
      g.addColorStop(1, '#68A8D8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, 10);
      g.addColorStop(0, '#B8F080');
      g.addColorStop(0.6, '#78C840');
      g.addColorStop(1, '#489020');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  /* ============ 割草机 ============ */
  SP.drawMower = (ctx, m) => {
    ctx.save();
    ctx.translate(m.x, m.y);
    if (m.state === 'running') {
      ctx.translate(0, Math.sin(m.anim.t * 40) * -1.5);
    }
    /* 把手 */
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, -14); ctx.lineTo(-26, -34);
    ctx.moveTo(-12, -14); ctx.lineTo(-20, -36);
    ctx.stroke();
    /* 机身 */
    const g = ctx.createLinearGradient(0, -22, 0, -4);
    g.addColorStop(0, '#E85838');
    g.addColorStop(1, '#B03018');
    ctx.fillStyle = g;
    U.rr(ctx, -18, -22, 38, 16, 5);
    ctx.fill();
    ctx.strokeStyle = '#802010';
    ctx.lineWidth = 1.5;
    U.rr(ctx, -18, -22, 38, 16, 5);
    ctx.stroke();
    /* 滚刀罩 */
    ctx.fillStyle = '#909090';
    U.rr(ctx, 14, -18, 12, 14, 4);
    ctx.fill();
    /* 轮子 */
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(-10, -4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, -4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(-10, -4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, -4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ============ 铲子 ============ */
  SP.drawShovel = (ctx, x, y, s = 1, angle = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    /* 木柄 */
    ctx.strokeStyle = '#A07040';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 6); ctx.stroke();
    /* 柄端横把 */
    ctx.strokeStyle = '#8A5A30';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-6, -22); ctx.lineTo(6, -22); ctx.stroke();
    /* 铲头 */
    const g = ctx.createLinearGradient(-8, 6, 8, 22);
    g.addColorStop(0, '#C8C8D0');
    g.addColorStop(1, '#8888A0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.lineTo(8, 6);
    ctx.quadraticCurveTo(8, 18, 0, 24);
    ctx.quadraticCurveTo(-8, 18, -8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#606068';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  /* ============ 进度条僵尸头标记 ============ */
  SP.zombieHeadIcon = (ctx, x, y, s = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#9BB058';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6A7A38';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    /* 眼窝 */
    ctx.fillStyle = '#3A4A20';
    ctx.beginPath();
    ctx.ellipse(-3.5, -2, 2.2, 2.8, 0, 0, Math.PI * 2);
    ctx.ellipse(3.5, -2, 2.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    /* 嘴 */
    ctx.beginPath();
    ctx.arc(0, 4, 3, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.restore();
  };

  SP.flagIcon = (ctx, x, y, s = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = '#8A5A30';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -10); ctx.stroke();
    ctx.fillStyle = '#D83020';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(11, -6.5);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  PVZ.SP = SP;
})(window);
