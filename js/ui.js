// ============================================================
// ui.js — HUD / 种子银行 / 选卡 / 菜单 / 图鉴 / 关卡选择
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, MUSHROOMS, UPGRADES, availablePlants } = require('./data');
const RE = require('./reanim');

const UI = {
  init(game) {
    this.game = game;
    this.cardThumbs = new Map();   // 植物名 -> canvas缩略图
    this.sunPulse = 0;
    this.hoverCard = -1;
    this.selectedCard = -1;
    this.seedFlash = 0;
  },

  // ---------- 植物缩略图 (种子卡用, 渲染reanim首帧) ----------
  getThumb(type) {
    if (this.cardThumbs.has(type)) return this.cardThumbs.get(type);
    const def = PLANTS[type];
    const cv = document.createElement('canvas');
    cv.width = 100; cv.height = 120;
    const c = cv.getContext('2d');
    try {
      // 分层渲染 (与游戏内一致)
      const layerList = def.layers || [[def.anim || 'anim_idle']];
      const layers = layerList.map(([layerAnim]) => {
        const r = Assets.reanim(def.reanim);
        r.play(layerAnim, RE.LOOP, 12);
        return r;
      });
      // 计算所有层合并包围盒
      let minX = 999, minY = 999, maxX = -999, maxY = -999;
      for (const r of layers) {
        r.animTime = 0.15;
        const ft = r.frameTime();
        for (let ti = 0; ti < r.def.tracks.length; ti++) {
          const t = r.curTransform(ti, ft);
          if (t.f < 0) continue;
          const idx = r.def.tracks[ti].IM[ft[0]];
          const key = idx >= 0 ? r.def.images[idx] : null;
          const img = key ? Assets.image(key.toLowerCase()) : null;
          if (!img) continue;
          const w = img.width * t.sx, h = img.height * t.sy;
          minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
          maxX = Math.max(maxX, t.x + w); maxY = Math.max(maxY, t.y + h);
        }
      }
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      const sc = Math.min(86 / bw, 96 / bh, 1.3);
      for (const r of layers) {
        r.x = 50 - (minX + maxX) / 2 * sc;
        r.y = 58 - (minY + maxY) / 2 * sc;
        r.scale = sc;
        r.animTime = 0.15;
        r.draw(c);
      }
    } catch (e) { console.warn('缩略图失败', type, e); }
    this.cardThumbs.set(type, cv);
    return cv;
  },

  // ---------- 种子卡绘制 ----------
  drawSeedCard(ctx, type, x, y, w, h, opts = {}) {
    const def = PLANTS[type];
    // 包底
    const packet = Assets.image('seedpacket_larger');
    if (packet) {
      ctx.drawImage(packet, 0, 0, packet.width, packet.height, x, y, w, h);
    } else {
      ctx.fillStyle = '#c9a86b'; ctx.fillRect(x, y, w, h);
    }
    // 缩略图
    const thumb = this.getThumb(type);
    if (thumb) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 4, y + 4, w - 8, h * 0.62); ctx.clip();
      ctx.drawImage(thumb, x + 4 + (w - 8 - 90) / 2, y + 4, 90, 100);
      ctx.restore();
    }
    // 费用
    ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(String(def.cost), x + w / 2 + 1, y + h - 7);
    ctx.fillStyle = def.cost > 99 ? '#333' : '#222';
    ctx.fillText(String(def.cost), x + w / 2, y + h - 8);
    // 冷却遮罩
    if (opts.cooldown > 0) {
      const cd = opts.cooldown / (def.cd / 1000);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,30,0.55)';
      ctx.beginPath();
      const ch = h * cd;
      ctx.rect(x, y, w, ch);
      ctx.fill();
      ctx.restore();
    }
    // 不可用(阳光不足)
    if (opts.disabled) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,20,40,0.45)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    // 选中高亮
    if (opts.selected) {
      ctx.save();
      ctx.strokeStyle = '#ffef7a'; ctx.lineWidth = 3;
      ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
      ctx.restore();
    }
  },

  // ---------- 游戏内HUD ----------
  drawGameHUD(ctx, board) {
    const game = this.game;
    // 种子银行
    const nCards = board.seedCards.length;
    const bankW = Math.min(480, 80 + nCards * 55 + 60);
    // 手绘银行底
    ctx.save();
    ctx.fillStyle = 'rgba(70,50,25,0.92)';
    roundRect(ctx, 4, 4, bankW, 88, 8); ctx.fill();
    ctx.strokeStyle = '#2d1f0e'; ctx.lineWidth = 2;
    roundRect(ctx, 4, 4, bankW, 88, 8); ctx.stroke();
    ctx.restore();
    // 阳光计数
    const sunIcon = Assets.image('seedbank'); // 占位
    ctx.save();
    // 画个小太阳
    const sunR = 1 + this.sunPulse * 0.15;
    this.sunPulse = Math.max(0, this.sunPulse - 0.05);
    ctx.translate(42, 46); ctx.scale(sunR, sunR);
    drawMiniSun(ctx, board.time);
    ctx.restore();
    ctx.font = 'bold 18px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(String(board.sun), 43, 78);
    ctx.fillStyle = '#ffe92e'; ctx.fillText(String(board.sun), 42, 77);
    // 卡片
    const cards = board.seedCards;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const x = 80 + i * 55, y = 6, w = 52, h = 80;
      this.drawSeedCard(ctx, c.type, x, y, w, h, {
        cooldown: c.cd,
        disabled: board.sun < PLANTS[c.type].cost || c.cd > 0,
        selected: game.selectedCard === i,
      });
    }
    // 铲子
    const shovel = Assets.image('shovel');
    const sx = 80 + cards.length * 55 + 6;
    ctx.save();
    ctx.fillStyle = 'rgba(70,50,25,0.92)';
    roundRect(ctx, sx, 6, 56, 80, 6); ctx.fill();
    ctx.restore();
    if (shovel) ctx.drawImage(shovel, sx + 8, 10, 44, 64);
    if (game.shovelMode) {
      ctx.strokeStyle = '#ffef7a'; ctx.lineWidth = 3;
      ctx.strokeRect(sx - 2, 4, 60, 84);
    }
    // 进度条
    this.drawProgressBar(ctx, board);
    // 菜单按钮
    ctx.save();
    ctx.fillStyle = 'rgba(70,50,25,0.9)';
    roundRect(ctx, 745, 6, 50, 26, 5); ctx.fill();
    ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#ffe'; ctx.textAlign = 'center';
    ctx.fillText('菜单', 770, 24);
    ctx.restore();
    // 加速按钮
    ctx.save();
    ctx.fillStyle = 'rgba(70,50,25,0.9)';
    roundRect(ctx, 745, 36, 50, 26, 5); ctx.fill();
    ctx.fillStyle = '#ffe'; ctx.textAlign = 'center';
    ctx.fillText(board.speed > 1 ? '快进' + board.speed + 'x' : '▶1x', 770, 54);
    ctx.restore();
    // 开场提示
    if (board.state === 'intro') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, board.waveTimer);
      ctx.font = 'bold 40px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = '#3a2a10';
      const t = Math.ceil(board.waveTimer);
      const txt = t > 2 ? '准备种植！' : '僵尸来了！';
      ctx.strokeText(txt, 400, 250);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(txt, 400, 250);
      ctx.restore();
    }
    // 暂停
    if (board.paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, 800, 600);
      ctx.font = 'bold 46px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('已暂停', 400, 280);
      ctx.font = '20px "Noto Sans SC", sans-serif';
      ctx.fillText('点击任意处继续', 400, 330);
      ctx.restore();
    }
  },

  drawProgressBar(ctx, board) {
    const x = 260, y = 575, w = 330, h = 18;
    ctx.save();
    // 底
    ctx.fillStyle = 'rgba(40,30,15,0.85)';
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
    // 进度
    const total = board.totalWaves;
    const done = Math.min(total, board.wave);
    const p = done / total;
    if (p > 0) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#5ad04a'); g.addColorStop(1, '#8ce85d');
      ctx.fillStyle = g;
      roundRect(ctx, x + 2, y + 2, Math.max(6, (w - 4) * p), h - 4, 6); ctx.fill();
    }
    // 旗子标记
    const parts = Assets.image('flagmeterparts');
    for (let i = 1; i * 10 <= total; i++) {
      const fx = x + 2 + (w - 4) * (i * 10 / total);
      ctx.fillStyle = '#d43a2a';
      ctx.fillRect(fx - 1, y - 4, 2, h + 8);
      if (parts) {
        // 旗帜头
        ctx.drawImage(parts, 0, 0, 30, 60, fx - 8, y - 16, 16, 30);
      }
    }
    // 僵尸头当前进度
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(`第 ${Math.min(board.wave + 1, total)}/${total} 波`, x + w / 2, y + 13);
    ctx.restore();
  },

  // ---------- 选卡界面 ----------
  drawSeedSelect(ctx, board) {
    ctx.fillStyle = '#4a3720'; ctx.fillRect(0, 0, 800, 600);
    const bg = Assets.image('background1.jpg');
    if (bg) { ctx.globalAlpha = 0.25; ctx.drawImage(bg, 0, 0, 800, 600); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 800, 600);
    // 标题
    ctx.font = 'bold 34px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
    ctx.fillText('选择你的植物', 400, 60);
    ctx.font = '15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#e8d9b5';
    ctx.fillText(`可用卡槽: ${board.seedSlots} / 已选 ${board.chosenSeeds.length}`, 400, 88);
    // 可选网格
    const pool = availablePlants(this.game.levelId);
    const cols = 10, cw = 62, chh = 90;
    pool.forEach((type, i) => {
      const gx = 60 + (i % cols) * 70, gy = 110 + Math.floor(i / cols) * 100;
      const chosen = board.chosenSeeds.includes(type);
      this.drawSeedCard(ctx, type, gx, gy, 58, 84, { selected: chosen });
      if (chosen) {
        ctx.fillStyle = 'rgba(80,255,80,0.25)';
        ctx.fillRect(gx, gy, 58, 84);
      }
    });
    // 已选栏
    ctx.fillStyle = 'rgba(70,50,25,0.95)';
    roundRect(ctx, 40, 540, 640, 52, 8); ctx.fill();
    board.chosenSeeds.forEach((type, i) => {
      this.drawSeedCard(ctx, type, 50 + i * 55, 544, 50, 44, {});
    });
    // 开始按钮
    ctx.save();
    ctx.fillStyle = '#5ad04a';
    roundRect(ctx, 660, 470, 110, 50, 10); ctx.fill();
    ctx.strokeStyle = '#2c6e22'; ctx.lineWidth = 3; roundRect(ctx, 660, 470, 110, 50, 10); ctx.stroke();
    ctx.font = 'bold 22px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('开始!', 715, 502);
    ctx.restore();
    // 随机按钮
    ctx.save();
    ctx.fillStyle = '#c9a23b';
    roundRect(ctx, 660, 530, 110, 36, 8); ctx.fill();
    ctx.font = '16px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('随机选择', 715, 554);
    ctx.restore();
  },

  // ---------- 主菜单 ----------
  drawMenu(ctx) {
    const bg = Assets.image('background1.jpg');
    if (bg) { ctx.drawImage(bg, -210, 0); ctx.fillStyle = 'rgba(0,0,20,0.35)'; ctx.fillRect(0, 0, 800, 600); }
    // 大标题
    ctx.save();
    ctx.font = 'bold 64px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 10; ctx.strokeStyle = '#2a1a05';
    ctx.strokeText('植物大战僵尸', 400, 200);
    const g = ctx.createLinearGradient(0, 150, 0, 210);
    g.addColorStop(0, '#c8f542'); g.addColorStop(0.5, '#5ab520'); g.addColorStop(1, '#2c6e12');
    ctx.fillStyle = g;
    ctx.fillText('植物大战僵尸', 400, 200);
    ctx.font = '26px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#e8d9b5';
    ctx.fillText('Web 原版素材复刻版', 400, 245);
    ctx.restore();
    // 按钮
    const btns = [
      ['开始冒险', 400, 320, '#5ad04a'],
      ['植物图鉴', 400, 390, '#c9a23b'],
      ['无尽模式', 400, 460, '#b05ad0'],
    ];
    this.menuButtons = btns.map(([txt, x, y, col]) => ({ txt, x, y, w: 220, h: 54, col }));
    for (const b of this.menuButtons) {
      ctx.save();
      ctx.fillStyle = b.col;
      roundRect(ctx, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
      roundRect(ctx, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 12); ctx.stroke();
      ctx.font = 'bold 24px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(b.txt, b.x, b.y + 9);
      ctx.restore();
    }
    ctx.font = '14px "Noto Sans SC", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText('素材与音乐来自原版 PvZ · 仅供学习交流', 400, 580);
  },

  // ---------- 关卡选择 ----------
  drawLevelSelect(ctx) {
    const game = this.game;
    const bg = Assets.image('background1.jpg');
    if (bg) { ctx.drawImage(bg, -210, 0); ctx.fillStyle = 'rgba(0,0,20,0.5)'; ctx.fillRect(0, 0, 800, 600); }
    ctx.font = 'bold 32px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
    ctx.fillText('选择关卡', 400, 55);
    const unlocked = game.progress.unlocked;
    this.levelButtons = [];
    for (let lv = 1; lv <= 50; lv++) {
      const stage = Math.ceil(lv / 10);
      const sub = ((lv - 1) % 10) + 1;
      const gx = 90 + (sub - 1) * 68;
      const gy = 100 + (stage - 1) * 95;
      const isUnlocked = lv <= unlocked;
      const isCleared = lv < unlocked;
      this.levelButtons.push({ lv, x: gx, y: gy, w: 58, h: 58 });
      ctx.save();
      const scene = LEVELS[lv - 1].scene;
      const cols = { day: '#7ab544', night: '#3b5aa8', pool: '#3aa8a0', fog: '#6a7a9a', roof: '#a86a3b' };
      ctx.fillStyle = isUnlocked ? cols[scene] : '#555';
      roundRect(ctx, gx, gy, 58, 58, 8); ctx.fill();
      if (isCleared) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(ctx, gx, gy, 58, 58, 8); ctx.fill();
      }
      ctx.strokeStyle = isUnlocked ? '#fff' : '#333'; ctx.lineWidth = 2;
      roundRect(ctx, gx, gy, 58, 58, 8); ctx.stroke();
      ctx.font = 'bold 20px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(String(sub), gx + 29, gy + 36);
      if (!isUnlocked) {
        ctx.font = '20px sans-serif';
        ctx.fillText('🔒', gx + 29, gy + 36);
      }
      ctx.restore();
    }
    // 阶段标签
    const stageNames = ['白天草坪', '黑夜庭院', '泳池派对', '浓雾迷踪', '屋顶决战'];
    for (let s = 0; s < 5; s++) {
      ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'left';
      ctx.fillText(stageNames[s], 90, 92 + s * 95);
    }
    // 返回
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    roundRect(ctx, 660, 545, 110, 40, 8); ctx.fill();
    ctx.font = 'bold 18px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('返回', 715, 571);
    ctx.restore();
    this.backButton = { x: 660, y: 545, w: 110, h: 40 };
  },

  // ---------- 图鉴 ----------
  drawAlmanac(ctx) {
    const game = this.game;
    const a = game.almanac;
    const bg = Assets.image('background1.jpg');
    if (bg) { ctx.drawImage(bg, -210, 0); ctx.fillStyle = 'rgba(30,20,5,0.82)'; ctx.fillRect(0, 0, 800, 600); }
    ctx.font = 'bold 30px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
    ctx.fillText(a.tab === 'plants' ? '植物图鉴' : '僵尸图鉴', 400, 42);
    // 标签切换
    ctx.save();
    ctx.fillStyle = a.tab === 'plants' ? '#5ad04a' : '#777';
    roundRect(ctx, 300, 55, 90, 30, 6); ctx.fill();
    ctx.fillStyle = a.tab === 'zombies' ? '#a03a3a' : '#777';
    roundRect(ctx, 410, 55, 90, 30, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('植物', 345, 75);
    ctx.fillText('僵尸', 455, 75);
    ctx.restore();
    this.almanacTabs = [{ x: 300, y: 55, w: 90, h: 30 }, { x: 410, y: 55, w: 90, h: 30 }];
    // 网格 (13列×4行单页显示全部)
    this.almanacCells = [];
    const entries = a.tab === 'plants' ? Object.keys(PLANTS) : Object.keys(ZOMBIES);
    const shown = entries;
    shown.forEach((key, i) => {
      const gx = 26 + (i % 13) * 58, gy = 98 + Math.floor(i / 13) * 88;
      const sel = a.selected === key;
      this.almanacCells.push({ key, x: gx, y: gy, w: 52, h: 80 });
      ctx.save();
      ctx.fillStyle = sel ? 'rgba(255,240,140,0.9)' : 'rgba(255,255,255,0.12)';
      roundRect(ctx, gx, gy, 52, 80, 5); ctx.fill();
      if (a.tab === 'plants') {
        ctx.save();
        ctx.beginPath(); ctx.rect(gx + 1, gy + 1, 50, 66); ctx.clip();
        const th = this.getThumb(key);
        ctx.drawImage(th, gx + 1, gy - 2, 50, 72);
        ctx.restore();
      } else {
        // 僵尸缩略
        ctx.save();
        ctx.beginPath(); ctx.rect(gx + 1, gy + 1, 50, 66); ctx.clip();
        const r = this.getZombieThumb(key);
        if (r) ctx.drawImage(r, gx + 1, gy + 1, 50, 70);
        ctx.restore();
      }
      ctx.restore();
    });
    // 详情面板
    if (a.selected) {
      const isPlant = a.tab === 'plants';
      const def = isPlant ? PLANTS[a.selected] : ZOMBIES[a.selected];
      ctx.save();
      ctx.fillStyle = 'rgba(20,14,4,0.92)';
      roundRect(ctx, 20, 500, 760, 84, 8); ctx.fill();
      // 图
      if (isPlant) {
        const th = this.getThumb(a.selected);
        ctx.drawImage(th, 28, 502, 70, 80);
      } else {
        const th = this.getZombieThumb(a.selected);
        if (th) ctx.drawImage(th, 18, 502, 90, 80);
      }
      ctx.font = 'bold 22px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'left';
      ctx.fillText(def.cn, 120, 528);
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#e8d9b5';
      ctx.fillText(def.desc || '', 120, 552);
      ctx.fillStyle = '#a8d0ff';
      const stats = isPlant
        ? `阳光: ${def.cost}  血量: ${def.hp}  冷却: ${(def.cd / 1000).toFixed(0)}s`
        : `血量: ${def.body}${def.helm ? ` + 护甲${def.helm}` : ''}${def.shield ? ` + 盾${def.shield}` : ''}`;
      ctx.fillText(stats, 120, 574);
      ctx.restore();
    }
    // 返回
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    roundRect(ctx, 700, 8, 84, 32, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('返回', 742, 29);
    ctx.restore();
    this.backButton = { x: 700, y: 8, w: 84, h: 32 };
  },

  getZombieThumb(type) {
    if (!this._zThumbs) this._zThumbs = new Map();
    if (this._zThumbs.has(type)) return this._zThumbs.get(type);
    const def = ZOMBIES[type];
    const cv = document.createElement('canvas');
    cv.width = 90; cv.height = 80;
    const c = cv.getContext('2d');
    try {
      const r = Assets.reanim(def.reanim);
      const anim = type === 'POGO' ? 'anim_pogo' : type === 'POLEVAULTER' ? 'anim_walk' : 'anim_idle';
      r.play(anim, RE.LOOP, 12);
      if (type === 'CONE' || type === 'BUCKET' || type === 'DOOR' || type === 'DUCKY' || type === 'FLAG' || type === 'NORMAL') {
        // 应用变体层
        r.showPrefix('anim_cone', false); r.showPrefix('anim_bucket', false); r.showPrefix('anim_screendoor', false);
        r.showPrefix('Zombie_flaghand', false); r.showPrefix('Zombie_duckytube', false);
        if (type === 'CONE') { r.showPrefix('anim_cone', true); r.setImageOverride('anim_cone', 'zombie_cone1'); }
        if (type === 'BUCKET') { r.showPrefix('anim_bucket', true); r.setImageOverride('anim_bucket', 'zombie_bucket1'); }
        if (type === 'DUCKY') r.showPrefix('Zombie_duckytube', true);
      }
      r.animTime = 0.4;
      // 包围盒
      let minX = 999, minY = 999, maxX = -999, maxY = -999;
      const ft = r.frameTime();
      for (let ti = 0; ti < r.def.tracks.length; ti++) {
        const t = r.curTransform(ti, ft);
        if (t.f < 0) continue;
        const idx = r.def.tracks[ti].IM[ft[0]];
        const key = idx >= 0 ? r.def.images[idx] : null;
        const img = key ? Assets.image(key.toLowerCase()) : null;
        if (!img) continue;
        const w = img.width * t.sx, h = img.height * t.sy;
        minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + w); maxY = Math.max(maxY, t.y + h);
      }
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      const sc = Math.min(86 / bw, 76 / bh, 1);
      r.x = 45 - (minX + maxX) / 2 * sc;
      r.y = 40 - (minY + maxY) / 2 * sc;
      r.scale = sc;
      r.draw(c);
    } catch (e) { console.warn('僵尸缩略图失败', type, e); }
    this._zThumbs.set(type, cv);
    return cv;
  },

  // ---------- 结算 ----------
  drawWin(ctx, board) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
    ctx.font = 'bold 52px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
    ctx.fillText('关卡完成！', 400, 240);
    const lv = this.game.levelId;
    if (LEVELS[lv - 1].unlock && this.game.justUnlocked) {
      ctx.font = '22px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#a8f542';
      ctx.fillText(`获得新植物: ${PLANTS[LEVELS[lv - 1].unlock].cn}`, 400, 300);
    }
    ctx.font = '20px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#e8d9b5';
    ctx.fillText('点击任意处返回', 400, 360);
  },
  drawLose(ctx, board) {
    ctx.fillStyle = 'rgba(20,0,0,0.6)'; ctx.fillRect(0, 0, 800, 600);
    ctx.font = 'bold 52px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a5a';
    ctx.fillText('僵尸吃掉了你的脑子！', 400, 280);
    ctx.font = '20px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#e8d9b5';
    ctx.fillText('点击任意处返回', 400, 340);
  },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMiniSun(ctx, t) {
  ctx.save();
  const r = 16;
  ctx.fillStyle = '#ffd800';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffef7a';
  ctx.beginPath(); ctx.arc(-4, -4, r * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

if (typeof module !== 'undefined') module.exports = { UI, roundRect };
