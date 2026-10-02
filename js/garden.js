// ============================================================
// garden.js — 禅镜花园 (原版 ZenGarden.cpp 移植·简化语义)
//   4x8 盆栽位 (原版 gGreenhouseGridPlacement 像素坐标)
//   盆栽从商店购买 (金盏花等), 浇水3次长大一阶, 长成后周期产金币
//   肥料: 直升一阶; 杀虫剂: 立即掉金币; Stinky 蜗牛自动捡金币
//   持久化: localStorage webpvz_garden
// ============================================================
'use strict';

const { PLANTS, GARDEN_PLANTS } = require('./data');
const RE = require('./reanim');
const { pvzText } = require('./screens');

// 原版 gGreenhouseGridPlacement (主花园 4行×8列)
const GRID = [
  [[73, 73], [155, 71], [239, 68], [321, 73], [406, 71], [484, 67], [566, 70], [648, 72]],
  [[67, 168], [150, 165], [232, 170], [314, 175], [416, 173], [497, 170], [578, 164], [660, 168]],
  [[41, 268], [130, 266], [219, 260], [310, 266], [416, 267], [504, 261], [594, 265], [684, 269]],
  [[37, 371], [124, 369], [211, 368], [302, 369], [425, 375], [512, 368], [602, 365], [691, 368]],
];

const TOOLS = [
  { k: 'water', label: '浇水壶', x: 250, y: 530 },
  { k: 'fertilizer', label: '肥料', x: 330, y: 530 },
  { k: 'spray', label: '杀虫剂', x: 410, y: 530 },
  { k: 'move', label: '移动', x: 490, y: 530 },
  { k: 'shovel', label: '铲子', x: 570, y: 530 },
];

const Garden = {
  game: null,
  plants: [],          // {type, gx, gy, stage, waterCount, lastWater, coinT, happy, bugs}
  tool: 'water',
  toolCounts: { fertilizer: 0, spray: 0 },
  coins: [],
  stinky: { x: 120, y: 420, dir: 1, t: 0 },
  t: 0,
  msg: '',
  msgT: 0,
  heldPlant: null,     // 移动工具: 拿起的盆栽
  _back: { x: 700, y: 548, w: 84, h: 34 },

  init(game) {
    this.game = game;
    this.load();
  },

  // ---------- 持久化 ----------
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem('webpvz_garden') || '{}');
      this.plants = (raw.plants || []).map(p => ({
        type: p.type, gx: p.gx, gy: p.gy, stage: p.stage || 0,
        waterCount: p.waterCount || 0, lastWater: p.lastWater || 0,
        coinT: p.coinT || 0, happy: p.happy || 0, plantedAt: p.plantedAt || 0,
      }));
      this.toolCounts = raw.toolCounts || { fertilizer: 0, spray: 0 };
    } catch (e) { this.plants = []; }
    // 首次进入送两盆金盏花 (原版: 通关 4-10 前后 Dave 送盆栽)
    if (!this.plants.length && this.game && this.game.gardenUnlocked) {
      this.addPlant('MARIGOLD', 3, 1);
      this.addPlant('MARIGOLD', 4, 2);
      this.save();
    }
  },
  save() {
    try {
      localStorage.setItem('webpvz_garden', JSON.stringify({
        plants: this.plants, toolCounts: this.toolCounts,
      }));
    } catch (e) { }
  },

  addPlant(type, gx, gy) {
    if (gx < 0 || gx > 7 || gy < 0 || gy > 3) return false;
    if (this.plants.some(p => p.gx === gx && p.gy === gy)) return false;
    this.plants.push({
      type, gx, gy, stage: 0, waterCount: 0,
      lastWater: this.t, coinT: 8 + Math.random() * 8, happy: 0, plantedAt: this.t,
    });
    return true;
  },

  enter() {
    Assets.ensureGarden && Assets.ensureGarden();
    // 首次进入赠两盆金盏花 (init 时 gardenUnlocked 可能尚未读取)
    if (!this.plants.length && this.game.gardenUnlocked) {
      this.addPlant('MARIGOLD', 3, 1);
      this.addPlant('MARIGOLD', 4, 2);
      this.save();
    }
    this.game.audio.playBGM('garden');
    this.msg = '给干渴的盆栽浇浇水吧！'; this.msgT = 4;
  },

  // ---------- 更新 ----------
  update(dt) {
    this.t += dt;
    this.msgT = Math.max(0, this.msgT - dt);
    // 盆栽需求/产出
    for (const p of this.plants) {
      p.happy = Math.max(0, p.happy - dt);
      if (p.stage >= 3) {
        p.coinT -= dt;
        if (p.coinT <= 0) {
          p.coinT = 20 + Math.random() * 15;
          const [px, py] = GRID[p.gy][p.gx];
          this.coins.push({ x: px + 20, y: py + 10, vy: -80, t: 0, taken: false });
          this.game.audio.play('coin');
        }
      }
    }
    // 金币掉落物理
    for (const c of this.coins) {
      c.t += dt;
      if (c.t < 0.6) { c.vy += 300 * dt; c.y += c.vy * dt; }
      // Stinky 蜗牛捡金币
      if (!c.taken && Math.hypot(this.stinky.x - c.x, this.stinky.y - c.y) < 34) {
        c.taken = true;
        this.game.coins += 25;
        this.game.saveShop();
        this.game.audio.play('points');
      }
    }
    this.coins = this.coins.filter(c => !c.taken && c.t < 10);
    // Stinky 游走
    const st = this.stinky;
    st.t += dt;
    if (st.t > 2.5) {
      st.t = 0;
      st.dir = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.25) st.dir = 0;
    }
    st.x += st.dir * 26 * dt;
    if (st.x < 30) { st.x = 30; st.dir = 1; }
    if (st.x > 760) { st.x = 760; st.dir = -1; }
    // 手动捡金币 (点击)
  },

  // ---------- 交互 ----------
  click(p) {
    // 返回
    if (p.x >= this._back.x && p.x <= this._back.x + this._back.w && p.y >= this._back.y && p.y <= this._back.y + this._back.h) {
      this.game.audio.play('buttonclick');
      this.save();
      this.game.state = 'menu';
      this.game.audio.playBGM('start_menu');
      return;
    }
    // 工具栏
    for (const t of TOOLS) {
      if (Math.hypot(p.x - (t.x + 34), p.y - (t.y + 17)) < 30) {
        this.tool = t.k;
        this.game.audio.play('tap');
        return;
      }
    }
    // 盆栽点击
    for (const pl of this.plants) {
      const [px, py] = GRID[pl.gy][pl.gx];
      if (p.x > px - 30 && p.x < px + 50 && p.y > py - 45 && p.y < py + 45) {
        this.useTool(pl);
        return;
      }
    }
    // 移动工具: 空格放下
    if (this.tool === 'move' && this.heldPlant) {
      const g = this.pixelToGrid(p.x, p.y);
      if (g) {
        this.heldPlant.gx = g[0]; this.heldPlant.gy = g[1];
        this.heldPlant = null;
        this.game.audio.play('plant');
        this.save();
      }
      return;
    }
    // 铲子: 点空格无操作; 点盆栽在 useTool 处理
  },

  pixelToGrid(x, y) {
    let best = null, bd = 1e9;
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const [px, py] = GRID[gy][gx];
        const d = Math.hypot(px + 10 - x, py + 10 - y);
        if (d < bd) { bd = d; best = [gx, gy]; }
      }
    }
    return best;
  },

  useTool(pl) {
    const game = this.game;
    switch (this.tool) {
      case 'water': {
        // 干渴 (距上次浇水 > 20s) 才有效; 3次 → 升一阶 (原版 UpdatePlantNeeds 语义)
        if (this.t - pl.lastWater < 2) return;
        pl.lastWater = this.t;
        pl.waterCount++;
        pl.happy = 4;
        game.audio.play('plant_water');
        if (pl.waterCount >= 3 && pl.stage < 3) {
          pl.waterCount = 0;
          pl.stage++;
          game.audio.play('plantgrow');
          this.showMsg(pl.stage >= 3 ? '盆栽完全长大了！它会为你产金币！' : '盆栽长大了！');
        }
        break;
      }
      case 'fertilizer': {
        if (this.toolCounts.fertilizer <= 0) { game.audio.play('buzzer'); this.showMsg('肥料用完了，去戴夫商店购买'); return; }
        if (pl.stage >= 3) { game.audio.play('buzzer'); return; }
        this.toolCounts.fertilizer--;
        pl.stage = 3;
        pl.happy = 6;
        game.audio.play('plantgrow');
        this.showMsg('肥料生效！盆栽瞬间长大了！');
        this.save();
        break;
      }
      case 'spray': {
        if (this.toolCounts.spray <= 0) { game.audio.play('buzzer'); this.showMsg('杀虫剂用完了，去戴夫商店购买'); return; }
        this.toolCounts.spray--;
        pl.happy = 10;
        game.audio.play('puff');
        const [px, py] = GRID[pl.gy][pl.gx];
        this.coins.push({ x: px + 20, y: py, vy: -100, t: 0, taken: false });
        this.showMsg('盆栽开心地吐出了一枚金币！');
        this.save();
        break;
      }
      case 'move': {
        if (this.heldPlant) return;
        this.heldPlant = pl;
        this.plants = this.plants.filter(q => q !== pl);
        game.audio.play('seedlift');
        break;
      }
      case 'shovel': {
        this.plants = this.plants.filter(q => q !== pl);
        game.audio.play('shovel');
        this.showMsg('移除了盆栽');
        this.save();
        break;
      }
    }
    this.save();
  },

  showMsg(m) { this.msg = m; this.msgT = 3.5; },

  // 商店购买联动
  buyGardenItem(key) {
    const it = GARDEN_PLANTS.find(g => g.key === key);
    if (!it) return false;
    if (it.plant) {
      // 盆栽: 找空位
      for (let gy = 0; gy < 4; gy++) {
        for (let gx = 0; gx < 8; gx++) {
          if (!this.plants.some(p => p.gx === gx && p.gy === gy)) {
            this.addPlant(it.plant, gx, gy);
            this.save();
            return true;
          }
        }
      }
      return false;   // 花园已满
    }
    if (key === 'g_fertilizer') this.toolCounts.fertilizer += it.count;
    if (key === 'g_bug_spray') this.toolCounts.spray += it.count;
    this.save();
    return true;
  },

  // ---------- 渲染 ----------
  draw(ctx) {
    const t = this.t;
    // 背景: 天空 + 泥土小径 + 草地 (原版 zengarden 场景氛围)
    const grad = ctx.createLinearGradient(0, 0, 0, 600);
    grad.addColorStop(0, '#8fd0e8'); grad.addColorStop(0.45, '#c8e8a0'); grad.addColorStop(0.5, '#7ab648');
    grad.addColorStop(1, '#4a8a28');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 600);
    // 草地纹理
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % 800, y = 300 + (i * 73) % 280;
      ctx.fillStyle = i % 2 ? '#2e6a16' : '#69b43e';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 9); ctx.lineTo(x + 8, y); ctx.fill();
    }
    ctx.restore();
    // 围栏
    ctx.save();
    ctx.fillStyle = '#b08a52';
    for (let x = 0; x < 800; x += 44) ctx.fillRect(x, 250, 10, 55);
    ctx.fillRect(0, 262, 800, 8); ctx.fillRect(0, 288, 800, 8);
    ctx.restore();
    // 标题
    pvzText(ctx, '禅镜花园', 400, 40, 34, '#ffe9a8');
    // 工具计数角标
    // 盆栽位泥土
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const [px, py] = GRID[gy][gx];
        ctx.save();
        ctx.fillStyle = '#6a4a24';
        ctx.beginPath(); ctx.ellipse(px + 10, py + 28, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(px + 10, py + 30, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // 盆栽 (花盆图 + 植物 reanim 缩放)
    for (const pl of this.plants) {
      const [px, py] = GRID[pl.gy][pl.gx];
      this.drawPotted(ctx, pl, px, py);
    }
    // 手持盆栽 (跟随鼠标)
    if (this.heldPlant && this.game.mouse) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      this.drawPotted(ctx, this.heldPlant, this.game.mouse.x - 10, this.game.mouse.y - 20);
      ctx.restore();
    }
    // Stinky 蜗牛
    this.drawStinky(ctx);
    // 金币
    for (const c of this.coins) {
      const coinImg = Assets.image('coin_gold_dollar');
      ctx.save();
      const sc = 0.8 + 0.15 * Math.sin(t * 6);
      if (coinImg) ctx.drawImage(coinImg, c.x - 16 * sc, c.y - 16 * sc, 32 * sc, 32 * sc);
      else { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(c.x, c.y, 12, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // 工具栏
    this.drawToolbar(ctx);
    // 金币余额
    ctx.save();
    ctx.fillStyle = 'rgba(60,44,16,0.9)';
    ctx.beginPath(); ctx.roundRect(636, 24, 152, 40, 8); ctx.fill();
    ctx.font = 'bold 22px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffd34d';
    ctx.fillText('◆ ' + (this.game.coins || 0), 776, 52);
    ctx.restore();
    // 消息
    if (this.msgT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.msgT);
      pvzText(ctx, this.msg, 400, 480, 18, '#ffe9a8');
      ctx.restore();
    }
    // 返回按钮
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    ctx.beginPath(); ctx.roundRect(this._back.x, this._back.y, this._back.w, this._back.h, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('返 回', 742, 570);
    ctx.restore();
  },

  drawPotted(ctx, pl, px, py) {
    const t = this.t;
    // 干渴提示 (叶子下垂 + 水滴)
    const thirsty = t - pl.lastWater > 25 && pl.stage < 3;
    // 花盆 (原版 pot_top/pot_bottom 两段)
    const potTop = Assets.image(pl.stage >= 2 ? 'pot_water_top' : 'pot_top');
    const potBottom = Assets.image(pl.stage >= 2 ? 'pot_water_base' : 'pot_bottom');
    const potW = 56, potH = 26;
    if (potBottom) ctx.drawImage(potBottom, px - potW / 2 + 10, py + 2, potW, potH);
    else { ctx.fillStyle = '#c86a32'; ctx.beginPath(); ctx.moveTo(px - 18, py + 4); ctx.lineTo(px + 38, py + 4); ctx.lineTo(px + 30, py + 28); ctx.lineTo(px - 10, py + 28); ctx.fill(); }
    if (potTop) ctx.drawImage(potTop, px - potW / 2 + 8, py - 6, potW - 4, 12);
    // 植物 reanim (阶段缩放: 0=芽 1=小 2=中 3=全)
    const scale = [0.35, 0.55, 0.75, 0.95][pl.stage] || 0.5;
    if (!pl._anim) {
      const def = PLANTS[pl.type];
      if (def && RE.hasDef(def.reanim)) {
        const r = Assets.reanim(def.reanim);
        r.play(def.anim || 'anim_idle', RE.LOOP, 10);
        pl._anim = r;
      }
    }
    if (pl._anim) {
      pl._anim.update(1 / 60);
      const sway = thirsty ? Math.sin(t * 2) * 0.06 - 0.12 : Math.sin(t * 1.4 + pl.gx) * 0.02;
      ctx.save();
      ctx.translate(px + 10, py + 2);
      ctx.rotate(sway);
      ctx.scale(scale, scale * (thirsty ? 0.92 : 1));
      pl._anim.setPosition(0, 0);
      pl._anim.draw(ctx);
      ctx.restore();
    } else {
      // 芽 (无素材兜底)
      ctx.save();
      ctx.translate(px + 10, py);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#4aa02c';
      ctx.beginPath(); ctx.ellipse(0, -30, 10, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 开心特效 (浇水/施肥后发光)
    if (pl.happy > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, pl.happy / 6);
      const glow = Assets.image('glow_particle2');
      if (glow) ctx.drawImage(glow, px - 26, py - 60, 72, 72);
      ctx.restore();
    }
    // 干渴水滴
    if (thirsty) {
      ctx.save();
      const bob = Math.sin(t * 3) * 2;
      ctx.fillStyle = '#5ab8ff';
      ctx.beginPath();
      ctx.moveTo(px + 34, py - 26 + bob);
      ctx.quadraticCurveTo(px + 39, py - 18 + bob, px + 34, py - 13 + bob);
      ctx.quadraticCurveTo(px + 29, py - 18 + bob, px + 34, py - 26 + bob);
      ctx.fill();
      ctx.restore();
    }
  },

  drawStinky(ctx) {
    const st = this.stinky;
    const shell = Assets.image('stinky_shell');
    const body = Assets.image('stinky_body');
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.scale(st.dir < 0 ? -1 : 1, 1);
    if (body) ctx.drawImage(body, -18, -8, 36, 20);
    if (shell) ctx.drawImage(shell, -14, -16, 28, 16);
    const ant = Assets.image('stinky_antenna');
    if (ant) ctx.drawImage(ant, 4, -24, 12, 10);
    ctx.restore();
  },

  drawToolbar(ctx) {
    for (const t of TOOLS) {
      const sel = this.tool === t.k;
      const count = t.k === 'fertilizer' ? this.toolCounts.fertilizer : t.k === 'spray' ? this.toolCounts.spray : -1;
      ctx.save();
      ctx.fillStyle = sel ? '#c8a028' : 'rgba(60,44,20,0.9)';
      ctx.beginPath(); ctx.roundRect(t.x, t.y, 68, 34, 8); ctx.fill();
      ctx.strokeStyle = sel ? '#ffe9a8' : '#8a6a3a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText(t.label, t.x + 34, t.y + 22);
      if (count >= 0) {
        ctx.fillStyle = '#ffd34d';
        ctx.fillText('×' + count, t.x + 60, t.y + 14);
      }
      ctx.restore();
    }
  },
};

if (typeof module !== 'undefined') module.exports = { Garden };
