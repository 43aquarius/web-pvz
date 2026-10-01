// ============================================================
// screens.js — 原版界面系统 (reanim 驱动)
// 主菜单: SelectorScreen.reanim 完整移植 (GameSelector.cpp)
//   anim_open 滑入(30fps) → anim_sign 木牌落下 → 静止
//   云×6 独立实例漂移 | 草叶 anim_grass 循环摇摆 | 花×3 静态
//   按钮位置 = 轨道变换 (TrackButton) | 悬停 = setImageOverride 高亮
// 标题屏: titlescreen.jpg + 载入草条 | 奖励/纸条/失败/选项: 原版素材
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, SEED_ORDER, SHOP_ITEMS, availablePlants, awardPlantForLevel } = require('./data');
const RE = require('./reanim');
const __getUI = () => { const m = (window.__mods && window.__mods['ui']) || require('./ui'); return m && m.UI; };

const img = (name) => Assets.image(name);

// 按钮判定
function inRect(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; }

// 阴影文字
function pvzText(ctx, text, x, y, size, fill, opts = {}) {
  ctx.save();
  ctx.font = `bold ${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.strokeStyle = opts.stroke || 'rgba(20,12,0,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const Screens = {
  t: 0,
  mouse: { x: 400, y: 300 },
  hover: null,

  update(dt) {
    this.t += dt;
    if (this.game && this.game.state === 'shop' && this.shop && this.shop.update) {
      this.shop.update(dt);
    }
  },
};

// ================================================================
// 标题屏 — titlescreen.jpg + 闪烁开始提示
// ================================================================
Screens.title = {
  started: false,
  draw(ctx) {
    const bg = img('titlescreen.jpg');
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#20300a'; ctx.fillRect(0, 0, 800, 600); }
    const t = Screens.t;
    // 标题 logo (文字版, 原版风格: 蓬松绿+描边+高光)
    ctx.save();
    const bob = Math.sin(t * 1.2) * 3;
    ctx.translate(400, 148 + bob);
    ctx.font = 'bold 82px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 16; ctx.strokeStyle = '#1d3b06'; ctx.lineJoin = 'round';
    ctx.strokeText('植物大战僵尸', 0, 0);
    const g = ctx.createLinearGradient(0, -72, 0, 12);
    g.addColorStop(0, '#f4ff9a'); g.addColorStop(0.45, '#a8e23c'); g.addColorStop(0.8, '#5cb516'); g.addColorStop(1, '#2e7a0a');
    ctx.fillStyle = g;
    ctx.fillText('植物大战僵尸', 0, 0);
    // 高光
    ctx.save();
    ctx.beginPath(); ctx.rect(-400, -78, 800, 34); ctx.clip();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('植物大战僵尸', 0, 0);
    ctx.restore();
    ctx.font = 'bold 26px "Noto Sans SC", sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = '#1d3b06';
    ctx.strokeText('Web 原版复刻', 0, 38);
    ctx.fillStyle = '#cfe89a';
    ctx.fillText('Web 原版复刻', 0, 38);
    ctx.restore();
    // 点击开始 (闪烁)
    const a = 0.55 + 0.45 * Math.sin(t * 3.2);
    ctx.save(); ctx.globalAlpha = a; ctx.restore();
    pvzText(ctx, '点 击 开 始', 400, 480, 34, '#ffe9a8', { stroke: 'rgba(30,18,0,0.9)' });
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3.2);
    pvzText(ctx, '点 击 屏 幕 任 意 处', 400, 520, 22, '#ffffff');
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.75;
    pvzText(ctx, '素材音乐来自原版 PvZ · 仅供学习交流', 400, 580, 13, '#d8cfa8');
    ctx.restore();
  },
  click(p, game) {
    game.audio.play('gravebutton');
    game.audio.playBGM('start_menu');
    game.state = 'menu';
    Screens.menu.enter();
  },
};

// ================================================================
// 主菜单 — SelectorScreen.reanim 完整移植
// ================================================================
Screens.menu = {
  inst: null, leafInst: null, clouds: [], flowers: [],
  buttons: [],
  state: 'open',       // open(滑入) → sign(木牌) → idle
  hover: null,

  // ---- 初始化 reanim 实例 (原版 GameSelector 构造) ----
  enter() {
    if (this.inst) { this.resetAnims(); return; }
    if (!RE.hasDef('SelectorScreen')) return;
    // 主实例: anim_open 30fps
    const inst = Assets.reanim('SelectorScreen');
    inst.x = 0.5; inst.y = 0.5;
    inst.play('anim_open', RE.PLAY_ONCE_HOLD, 30);
    // 隐藏主实例中的花/叶 (原版 AssignRenderGroupToPrefix)
    inst.showPrefix('flower', false);
    inst.showPrefix('leaf', false);
    // 隐藏天空轨 (天空单独画, 保证云在天空之上、主景之下)
    this._skyTrackIdx = inst.trackIndex('SelectorScreen_BG');
    this.inst = inst;
    // 草叶实例: anim_grass 循环 (原版 6fps)
    const leaf = Assets.reanim('SelectorScreen');
    leaf.x = 0.5; leaf.y = 0.5;
    leaf.play('anim_grass', RE.LOOP, 6);
    leaf.showPrefix('flower', false);
    this.leafInst = leaf;
    // 云×6: anim_cloud{1,2,4,5,6,7} (原版随机延迟启动)
    this.clouds = [];
    const cloudAnims = ['anim_cloud1', 'anim_cloud2', 'anim_cloud4', 'anim_cloud5', 'anim_cloud6', 'anim_cloud7'];
    for (let i = 0; i < 6; i++) {
      const c = Assets.reanim('SelectorScreen');
      c.x = 0.5; c.y = 0.5;
      c.play(cloudAnims[i], RE.PLAY_ONCE_HOLD, 0);
      const counter = -6000 + Math.floor(Math.random() * 8000); // -6000..2000
      if (counter < 0) { c.animTime = -counter / 6000; c.animRate = 0.5; }
      else { c.animRate = 0; c._counter = counter; }
      this.clouds.push(c);
    }
    // 花×3: 静态 (原版 rate=0)
    this.flowers = [];
    for (let i = 1; i <= 3; i++) {
      const f = Assets.reanim('SelectorScreen');
      f.x = 0.5; f.y = 0.5;
      f.play(`anim_flower${i}`, RE.PLAY_ONCE_HOLD, 0);
      f.animRate = 0;
      this.flowers.push(f);
    }
    this.state = 'open';
  },

  resetAnims() {
    if (!this.inst) return;
    this.inst.play('anim_open', RE.PLAY_ONCE_HOLD, 30);
    this.inst.showPrefix('flower', false);
    this.inst.showPrefix('leaf', false);
    if (this.leafInst) this.leafInst.play('anim_grass', RE.LOOP, 6);
    for (const c of this.clouds) { c.animTime = Math.random() * 0.5; c.animRate = 0.5; }
    this.state = 'open';
  },

  // ---- 每帧更新 ----
  update2(dt) {
    if (!this.inst) return;
    this.inst.update(dt);
    // anim_open 完成 → anim_sign (木牌落下)
    if (this.state === 'open' && this.inst.loopCount > 0) {
      this.inst.play('anim_sign', RE.PLAY_ONCE_HOLD, 30);
      this.state = 'sign';
    } else if (this.state === 'sign' && this.inst.loopCount > 0) {
      this.state = 'idle';
    }
    if (this.leafInst) this.leafInst.update(dt);
    // 草叶跟随 BG_Right 位置 (原版: transform - (71,41))
    if (this.leafInst && this.inst) {
      const ti = this.inst.trackIndex('SelectorScreen_BG_Right');
      const tr = this.inst.curTransform(ti);
      this.leafInst.x = 0.5 + tr.x - 71;
      this.leafInst.y = 0.5 + tr.y - 41;
    }
    // 云: 播完等待随机时间再播
    for (const c of this.clouds) {
      if (c._counter > 0) {
        c._counter -= dt * 100;
        if (c._counter <= 0) { c.loopCount = 0; c.animTime = 0; c.animRate = 0.5; }
      } else if (c.loopCount > 0) {
        c.animRate = 0;
        c._counter = 200 + Math.random() * 200;
      }
      c.update(dt);
    }
  },

  // ---- 按钮区 (原版 TrackButton: 轨道变换 + 偏移) ----
  computeButtons() {
    if (!this.inst) return [];
    const inst = this.inst;
    const trackPos = (name) => {
      const ti = inst.trackIndex(name);
      const tr = inst.curTransform(ti);
      return [tr.x, tr.y];
    };
    const bgR = trackPos('SelectorScreen_BG_Right');
    const B = [];
    // 冒险模式大按钮
    const [ax, ay] = trackPos('SelectorScreen_StartAdventure_button');
    B.push({ k: 'adventure', x: ax, y: ay, w: 331, h: 146, track: 'SelectorScreen_StartAdventure_button', hl: 'selectorscreen_startadventure_highlight.png' });
    // 墓碑三按钮 (原版 GameSelector: 顶=Minigame 中=Puzzle 底=Survival)
    const [mx, my] = trackPos('SelectorScreen_Survival_button');
    B.push({ k: 'minigames', x: mx, y: my, w: 313, h: 133 });
    const [px, py] = trackPos('SelectorScreen_Challenges_button');
    B.push({ k: 'puzzle', x: px, y: py, w: 286, h: 122 });
    const [vx, vy] = trackPos('SelectorScreen_ZenGarden_button');
    B.push({ k: 'survival', x: vx, y: vy, w: 266, h: 123 });
    // 图鉴 (原版: BG_Right + (256,387))
    B.push({ k: 'almanac', x: bgR[0] + 256, y: bgR[1] + 387, w: 99, h: 99, hl: 'selectorscreen_almanachighlight.png' });
    // 选项/帮助/退出 (原版: BG_Right 偏移)
    B.push({ k: 'options', x: bgR[0] + 494, y: bgR[1] + 434, w: 81, h: 31, img: 'selectorscreen_options1.png', img2: 'selectorscreen_options2.png' });
    B.push({ k: 'help', x: bgR[0] + 576, y: bgR[1] + 458, w: 48, h: 22, img: 'selectorscreen_help1.png', img2: 'selectorscreen_help2.png' });
    B.push({ k: 'quit', x: bgR[0] + 644, y: bgR[1] + 469, w: 47, h: 27, img: 'selectorscreen_quit1.png', img2: 'selectorscreen_quit2.png' });
    // 更换用户/僵尸形象 (锁定木牌)
    const [w2x, w2y] = trackPos('woodsign2');
    B.push({ k: 'locked', x: w2x + 24, y: w2y + 10, w: 240, h: 56 });
    return B;
  },

  // ---- 兜底菜单 (弱网素材缺失时也能进入游戏) ----
  fallbackButtons() {
    const game = Screens.game;
    const btns = [
      { k: 'adventure', x: 234, y: 170, w: 332, h: 82, label: '冒 险 模 式' },
      { k: 'minigames', x: 234, y: 262, w: 332, h: 66, label: '玩 玩 小 游 戏' },
      { k: 'puzzle', x: 234, y: 328, w: 332, h: 62, label: '解 谜 模 式' },
      { k: 'survival', x: 234, y: 396, w: 332, h: 62, label: '生 存 模 式' },
      { k: 'almanac', x: 234, y: 414, w: 155, h: 60, label: '图 鉴' },
      { k: 'options', x: 411, y: 414, w: 155, h: 60, label: '选　项' },
    ];
    if (game && game.shopUnlocked && game.shopUnlocked()) {
      btns.push({ k: 'shop', x: 411, y: 330, w: 155, h: 60, label: '戴夫商店' });
    }
    return btns;
  },

  drawFallback(ctx) {
    this.buttons = this.fallbackButtons();
    const hover = Screens.hover;
    // 天空+草地背景
    const grad = ctx.createLinearGradient(0, 0, 0, 600);
    grad.addColorStop(0, '#123a6d');
    grad.addColorStop(0.62, '#2f9be0');
    grad.addColorStop(0.62, '#3c8a2a');
    grad.addColorStop(1, '#2a6b1e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 600);
    // 标题 (呼吸浮动)
    const bob = Math.sin(Screens.t * 1.2) * 3;
    pvzText(ctx, '植物大战僵尸', 400, 118 + bob, 72, '#c8f542');
    pvzText(ctx, '素材加载不完整 · 已切换简化菜单', 400, 156, 14, '#ffe9a8');
    // 文字按钮
    for (const b of this.buttons) {
      const h = hover === b.k;
      ctx.save();
      ctx.fillStyle = h ? 'rgba(90,208,74,0.95)' : 'rgba(42,72,28,0.92)';
      ctx.strokeStyle = h ? '#c8f542' : '#7ea85e';
      ctx.lineWidth = 3;
      const r = 14, x = b.x, y = b.y, w = b.w, hh = b.h;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + hh, r);
      ctx.arcTo(x + w, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      pvzText(ctx, b.label, x + w / 2, y + hh / 2 + 10, 26, h ? '#ffffff' : '#dff7b8');
    }
  },

  draw(ctx) {
    // 素材缺失兜底: reanim 或关键背景图缺失 → 简化菜单 (仍可点击进入游戏)
    if (!this.inst || !img('selectorscreen_bg.jpg')) {
      this.drawFallback(ctx);
      return;
    }
    this.update2(1 / 60);
    const inst = this.inst;
    // ---- 1. 天空 (仅 BG 轨道: 快照分组 → 全隐藏 → 只显天空 → 绘制 → 还原) ----
    ctx.save();
    const snap = inst.tracks.map(t => t.renderGroup);
    for (let i = 0; i < inst.tracks.length; i++) inst.tracks[i].renderGroup = (i === this._skyTrackIdx) ? 0 : -1;
    inst.draw(ctx);
    for (let i = 0; i < inst.tracks.length; i++) inst.tracks[i].renderGroup = snap[i];
    ctx.restore();
    // ---- 2. 云 ----
    for (const c of this.clouds) c.draw(ctx);
    // ---- 3. 主景 (隐藏天空轨道后绘制) ----
    const skyTr = inst.tracks[this._skyTrackIdx];
    const skySaved = skyTr.renderGroup;
    skyTr.renderGroup = -1;
    inst.draw(ctx);
    skyTr.renderGroup = skySaved;
    // ---- 4. 草叶 (anim_grass) ----
    if (this.leafInst) this.leafInst.draw(ctx);
    // ---- 5. 花 ----
    for (const f of this.flowers) f.draw(ctx);
    // ---- 6. 附加元素 (图鉴书/小按钮/悬停高亮) ----
    this.buttons = this.computeButtons();
    const hover = Screens.hover;
    // 图鉴书 (原版: 按钮图片 99x99 画在轨道位置)
    const alm = this.buttons.find(b => b.k === 'almanac');
    if (alm) {
      const isH = hover === 'almanac';
      const aimg = img(isH ? 'selectorscreen_almanachighlight.png' : 'selectorscreen_almanac.png');
      if (aimg) ctx.drawImage(aimg, alm.x, alm.y);
    }
    // 冒险按钮高亮 (轨道 override)
    const adv = this.buttons.find(b => b.k === 'adventure');
    if (adv) {
      if (hover === 'adventure') inst.setImageOverride('SelectorScreen_StartAdventure_button', 'selectorscreen_startadventure_highlight.png');
      else inst.setImageOverride('SelectorScreen_StartAdventure_button', null);
      // 等级数字 (原版 LevelNumbers cel: BG_Right+(486,47) 主关, (509,50) 子关)
      const game = Screens.game;
      if (game) {
        const lv = Math.min(game.progress.unlocked, 50);
        const stage = Math.min(6, Math.floor((lv - 1) / 10) + 1);
        const sub = lv - (stage - 1) * 10;
        const nums = img('selectorscreen_levelnumbers.png');
        if (nums) {
          const ti = inst.trackIndex('SelectorScreen_BG_Right');
          const tr = inst.curTransform(ti);
          const colorize = hover === 'adventure' ? 1 : 0;
          ctx.save();
          if (colorize) { ctx.filter = 'brightness(1.35)'; }
          ctx.drawImage(nums, stage * 12, 0, 12, 17, tr.x + 486, tr.y + 47, 12, 17);
          if (sub < 10) {
            ctx.drawImage(nums, sub * 12, 0, 12, 17, tr.x + 509, tr.y + 50, 12, 17);
          } else {
            ctx.drawImage(nums, 1 * 12, 0, 12, 17, tr.x + 509, tr.y + 50, 12, 17);
            ctx.drawImage(nums, 0 * 12, 0, 12, 17, tr.x + 518, tr.y + 51, 12, 17);
          }
          ctx.restore();
        }
      }
    }
    // 小按钮 (选项/帮助/退出)
    for (const b of this.buttons) {
      if (!b.img) continue;
      const isH = hover === b.k;
      const bimg = img(isH ? b.img2 : b.img);
      if (bimg) ctx.drawImage(bimg, b.x, b.y);
    }
    // ---- 7. 玩家名 (原版: woodsign1 轨道 + (170.5-w/2, 102.5)) ----
    const game = Screens.game;
    if (game) {
      const name = '玩家';
      ctx.save();
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      const w = ctx.measureText(name + '!').width;
      const ti = inst.trackIndex('woodsign1');
      const tr = inst.curTransform(ti);
      ctx.fillStyle = 'rgb(255,245,200)';
      ctx.textAlign = 'left';
      ctx.fillText(name + '!', tr.x + 170.5 - w / 2, tr.y + 102.5);
      ctx.restore();
      // 冒险进度提示 (中文化增强)
      const lv = Math.min(game.progress.unlocked, 50);
      const label = lv > 50 ? '冒险模式已通关' : `冒险进度 ${LEVELS[lv - 1].label}`;
      pvzText(ctx, label, 232, 232, 17, '#ffe9a8');
    }
    // 墓碑三按钮中文标注 (原版: 玩玩小游戏 / 解谜模式 / 生存模式)
    const lbls = { minigames: '玩 玩 小 游 戏', puzzle: '解 谜 模 式', survival: '生 存 模 式' };
    const needLv = { minigames: 22, puzzle: 36, survival: 44 };
    for (const b of this.buttons) {
      if (!lbls[b.k]) continue;
      const isH = hover === b.k;
      const locked = game && game.progress.unlocked < needLv[b.k] && !game.debugUnlocked;
      pvzText(ctx, lbls[b.k], b.x + b.w / 2, b.y + b.h / 2 + 8, 24, locked ? '#8a8a8a' : (isH ? '#ffffff' : '#ffe9a8'));
      if (locked) {
        pvzText(ctx, `冒险 ${Math.ceil(needLv[b.k] / 10)}-${needLv[b.k] % 10} 后开放`, b.x + b.w / 2, b.y + b.h / 2 + 38, 13, '#a8a8a8');
      }
    }
    // ---- 戴夫的车 → 商店 (#11: 通关 3-4 后解锁) ----
    if (game && game.shopUnlocked && game.shopUnlocked()) {
      const cx = 92, cy = 386, cw2 = 130, ch2 = 96;
      this.shopRect = { x: cx, y: cy, w: cw2, h: ch2 };
      const hov2 = inRect(Screens.mouse || { x: -1, y: -1 }, cx, cy, cw2, ch2);
      // 车 (程序化: 车身+车顶+轮子)
      ctx.save();
      ctx.translate(cx + cw2 / 2, cy + ch2 / 2);
      const bump = Math.sin(Screens.t * 2.2) * 2;
      ctx.translate(0, bump * 0.4);
      ctx.fillStyle = hov2 ? '#d94f3a' : '#b23a28';
      ctx.beginPath(); ctx.roundRect(-cw2 / 2 + 8, -18, cw2 - 22, 34, 7); ctx.fill();  // 车身
      ctx.fillStyle = hov2 ? '#e88a70' : '#c86a52';
      ctx.beginPath(); ctx.roundRect(-cw2 / 2 + 26, -38, 44, 24, 6); ctx.fill();       // 车顶
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(-cw2 / 2 + 24, 20, 11, 0, Math.PI * 2); ctx.arc(cw2 / 2 - 22, 20, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(-cw2 / 2 + 24, 20, 5, 0, Math.PI * 2); ctx.arc(cw2 / 2 - 22, 20, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      pvzText(ctx, '戴夫商店', cx + cw2 / 2, cy + ch2 - 8, 17, hov2 ? '#ffffff' : '#ffe9a8');
      // 金币余额角标
      pvzText(ctx, '◆ ' + (game.coins || 0), cx + cw2 / 2, cy - 12, 15, '#ffd34d');
    } else {
      this.shopRect = null;
    }
  },

  click(p, game) {
    // 戴夫商店入口
    if (this.shopRect && inRect(p, this.shopRect.x, this.shopRect.y, this.shopRect.w, this.shopRect.h)) {
      game.audio.play('gravebutton');
      game.state = 'shop';
      Screens.shop.enter();
      return;
    }
    for (const b of (this.buttons || [])) {
      if (!inRect(p, b.x, b.y, b.w, b.h)) continue;
      if (b.k === 'adventure') {
        game.audio.play('gravebutton');
        this.inst && this.inst.setImageOverride('SelectorScreen_StartAdventure_button', null);
        game.startAdventure();
      } else if (b.k === 'minigames') {
        // 原版解锁: 通关2-2后掉落小游戏礼物
        if (game.progress.unlocked < 22 && !game.debugUnlocked) { game.audio.play('buzzer'); return; }
        game.audio.play('gravebutton');
        game.state = 'modeselect';
        Screens.modeSelect.enter('challenge');
      } else if (b.k === 'puzzle') {
        // 原版解锁: 通关3-6后掉落解谜礼物
        if (game.progress.unlocked < 36 && !game.debugUnlocked) { game.audio.play('buzzer'); return; }
        game.audio.play('gravebutton');
        game.state = 'modeselect';
        Screens.modeSelect.enter('puzzle');
      } else if (b.k === 'survival') {
        // 原版解锁: 通关4-4后掉落生存礼物
        if (game.progress.unlocked < 44 && !game.debugUnlocked) { game.audio.play('buzzer'); return; }
        game.audio.play('gravebutton');
        game.state = 'modeselect';
        Screens.modeSelect.enter('survival');
      } else if (b.k === 'shop') {
        game.audio.play('gravebutton');
        game.state = 'shop';
        Screens.shop.enter();
      } else if (b.k === 'almanac') {
        game.audio.play('gravebutton');
        game.state = 'almanac'; game.almanac.selected = null;
      } else if (b.k === 'options') {
        game.audio.play('buttonclick');
        game.state = 'options';
      } else if (b.k === 'help') {
        game.audio.play('buttonclick');
        game.state = 'help';
      } else if (b.k === 'quit') {
        game.audio.play('buttonclick');
        window.close();
      } else if (b.k === 'locked') {
        game.audio.play('buzzer');
      }
      return;
    }
  },
};

// ================================================================
// 选项 — 原版 option_dialog + 滑块/复选框 + 调试解锁
// ================================================================
Screens.options = {
  rects: {},
  unlockFlash: 0,
  draw(ctx) {
    const game = Screens.game;
    this.unlockFlash = Math.max(0, this.unlockFlash - 1 / 60);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
    const dlg = img('option_dialog.png');
    const dw = 500, dh = 470, dx = 150, dy = 90;
    if (dlg) ctx.drawImage(dlg, dx, dy, dw, dh);
    else { ctx.fillStyle = '#c8b28a'; ctx.fillRect(dx, dy, dw, dh); }
    pvzText(ctx, '选  项', 400, dy + 52, 30, '#4a2f10');
    const vol = game.audio.master !== undefined ? game.audio.master : 0.8;
    const sx = dx + 70, sy = dy + 130, sw = 260;
    const slot = img('options_sliderslot.png');
    if (slot) ctx.drawImage(slot, sx, sy, sw, 18);
    else { ctx.fillStyle = '#7a5a30'; ctx.fillRect(sx, sy, sw, 18); }
    const knob = img('options_sliderknob2.png');
    const kx = sx + vol * (sw - 30);
    if (knob) ctx.drawImage(knob, kx, sy - 8, 30, 34);
    else { ctx.fillStyle = '#e8d9a0'; ctx.fillRect(kx, sy - 8, 30, 34); }
    pvzText(ctx, '音乐音量', sx - 10, sy + 14, 16, '#4a2f10', { align: 'right' });
    this.rects.vol = { x: sx, y: sy - 12, w: sw, h: 40 };
    const cbY = dy + 190;
    for (let i = 0; i < 2; i++) {
      const cbox = img(`options_checkbox${game.audio.sfxOn ? 1 : 0}.png`);
      const cy = cbY + i * 44;
      if (cbox) ctx.drawImage(cbox, sx, cy, 22, 22);
      pvzText(ctx, i === 0 ? '音效' : '全屏', sx + 36, cy + 18, 16, '#4a2f10', { align: 'left' });
      this.rects[`cb${i}`] = { x: sx, y: cy, w: 120, h: 26 };
    }
    // ---- 调试: 一键解锁全部关卡/小游戏 (方便查看所有内容) ----
    const ubY = cbY + 108;
    const uRect = { x: dx + 80, y: ubY, w: dw - 160, h: 46 };
    this.rects.unlock = uRect;
    ctx.save();
    const allOpen = game.progress.unlocked > 50;
    const hov = Screens.hover === 'unlock';
    // 按钮底色
    const g2 = ctx.createLinearGradient(0, ubY, 0, ubY + 46);
    if (allOpen) { g2.addColorStop(0, '#7a8a4a'); g2.addColorStop(1, '#4a5a2a'); }
    else { g2.addColorStop(0, hov ? '#d4a430' : '#b8891e'); g2.addColorStop(1, hov ? '#a67a1a' : '#8a6410'); }
    ctx.fillStyle = g2;
    ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(uRect.x, ubY, uRect.w, 46, 10);
    ctx.fill(); ctx.stroke();
    if (this.unlockFlash > 0) {
      ctx.globalAlpha = Math.min(1, this.unlockFlash * 2);
      ctx.fillStyle = '#fff8c0';
      ctx.beginPath(); ctx.roundRect(uRect.x, ubY, uRect.w, 46, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.font = 'bold 18px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineJoin = 'round';
    const uLabel = allOpen ? '已解锁全部内容 ✓ (再次点击重新锁定)'
      : '解锁全部关卡与小游戏 (调试)';
    ctx.strokeText(uLabel, 400, ubY + 29);
    ctx.fillStyle = '#fff4d0';
    ctx.fillText(uLabel, 400, ubY + 29);
    ctx.restore();
    pvzText(ctx, '解锁后点主菜单"冒险模式"可选择任意关卡', 400, ubY + 74, 13, '#6a4a20');
    pvzText(ctx, '点击此处返回', 400, dy + dh - 40, 20, '#6b1c04');
    this.rects.back = { x: dx + 120, y: dy + dh - 70, w: 260, h: 50 };
  },
  click(p, game) {
    const r = this.rects;
    if (r.vol && inRect(p, r.vol.x, r.vol.y, r.vol.w, r.vol.h)) {
      game.audio.setMaster(Math.max(0, Math.min(1, (p.x - r.vol.x) / r.vol.w)));
      game.audio.play('tap');
      return;
    }
    if (r.cb0 && inRect(p, r.cb0.x, r.cb0.y, r.cb0.w, r.cb0.h)) {
      game.audio.sfxOn = !game.audio.sfxOn; game.audio.play('tap'); return;
    }
    if (r.cb1 && inRect(p, r.cb1.x, r.cb1.y, r.cb1.w, r.cb1.h)) {
      game.audio.play('tap');
      const c = document.documentElement;
      if (!document.fullscreenElement) { if (c.requestFullscreen) c.requestFullscreen(); }
      else if (document.exitFullscreen) document.exitFullscreen();
      return;
    }
    // 一键解锁/重锁定
    if (r.unlock && inRect(p, r.unlock.x, r.unlock.y, r.unlock.w, r.unlock.h)) {
      if (game.progress.unlocked > 50) {
        game.progress.unlocked = 1;
        game.debugUnlocked = false;
        try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: 1 })); } catch (e) { }
        game.audio.play('buzzer');
      } else {
        game.progress.unlocked = 51;
        game.debugUnlocked = true;
        try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: 51, debugUnlocked: true })); } catch (e) { }
        game.audio.play('points');
        this.unlockFlash = 1.2;
      }
      return;
    }
    if (r.back && inRect(p, r.back.x, r.back.y, r.back.w, r.back.h)) {
      game.audio.play('buttonclick');
      game.state = 'menu';
    }
  },
};

// ================================================================
// 帮助
// ================================================================
Screens.help = {
  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
    const dlg = img('option_dialog.png');
    if (dlg) ctx.drawImage(dlg, 130, 70, 540, 470);
    pvzText(ctx, '怎 么 玩', 400, 120, 30, '#4a2f10');
    const lines = [
      ['· 收集阳光, 种植植物防守草坪', '#4a2f10'],
      ['· 点击种子卡再点击草坪即可种植', '#4a2f10'],
      ['· 铲子可以移除植物', '#4a2f10'],
      ['· 收集阳光: 天上掉的 + 向日葵产出', '#4a2f10'],
      ['', ''],
      ['· 僵尸走到最左侧会触发割草机', '#4a2f10'],
      ['· 割草机只能用一次, 失守即输', '#4a2f10'],
      ['', ''],
      ['· 冒险模式按原版顺序 1-1 → 5-10', '#6b1c04'],
      ['· 每关解锁新植物, X-5/X-10 有惊喜', '#6b1c04'],
    ];
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '17px "Noto Sans SC", sans-serif';
    let y = 165;
    for (const [txt, col] of lines) { if (txt) { ctx.fillStyle = col; ctx.fillText(txt, 175, y); } y += 30; }
    ctx.restore();
    pvzText(ctx, '点击返回', 400, 505, 20, '#6b1c04');
  },
  click(p, game) { game.audio.play('buttonclick'); game.state = 'menu'; },
};

// ================================================================
// 奖励屏 — 通关后展示新植物 (原版 AwardScreen 风格)
// ================================================================
Screens.award = {
  draw(ctx, game) {
    ctx.fillStyle = 'rgba(6,20,4,0.92)'; ctx.fillRect(0, 0, 800, 600);
    const t = Screens.t;
    ctx.save();
    ctx.translate(400, 250);
    ctx.rotate(t * 0.3);
    const rays = img('awardrays.png') || img('awardrays1.png');
    if (rays) { ctx.globalAlpha = 0.5; ctx.drawImage(rays, -260, -260, 520, 520); }
    ctx.restore();
    const type = game.justUnlocked;
    pvzText(ctx, '通 关 奖 励 !', 400, 120, 42, '#ffe36a');
    if (type) {
      const packet = img('seedpacket_larger.png');
      ctx.save();
      const bob = Math.sin(t * 2) * 5;
      ctx.translate(400, 265 + bob);
      if (packet) ctx.drawImage(packet, -80, -100, 160, 200);
      const thumb = __getUI() ? __getUI().getThumb(type) : null;
      if (thumb) ctx.drawImage(thumb, -50, -78, 100, 140);
      ctx.restore();
      pvzText(ctx, '你获得了新植物!', 400, 420, 26, '#b8ff7a');
      pvzText(ctx, PLANTS[type] ? PLANTS[type].cn : type, 400, 458, 34, '#ffffff');
    } else {
      pvzText(ctx, '你击败了所有僵尸!', 400, 300, 30, '#b8ff7a');
      const trophy = img('trophy_hi_res.png');
      if (trophy) ctx.drawImage(trophy, 400 - 83, 200, 166, 136);
    }
    const a = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '点 击 继 续', 400, 540, 24, '#ffe9a8');
    ctx.restore();
  },
  click(p, game) { game.afterAward(); },
};

// ================================================================
// 纸条屏 — X-5 / X-10 僵尸纸条
// ================================================================
Screens.note = {
  draw(ctx) {
    ctx.fillStyle = '#0a0805'; ctx.fillRect(0, 0, 800, 600);
    const t = Screens.t;
    const note = img('zombienote.jpg');
    if (note) {
      const w = 560, h = w * 427 / 654;
      ctx.save();
      ctx.translate(400, 300);
      ctx.rotate(Math.sin(t * 0.8) * 0.012);
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 30;
      ctx.drawImage(note, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#d8cfa0'; ctx.fillRect(200, 140, 400, 300);
    }
    pvzText(ctx, '僵尸留下了奇怪的纸条…', 400, 60, 24, '#c8b28a');
    const a = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '点 击 继 续', 400, 560, 22, '#ffe9a8');
    ctx.restore();
  },
  click(p, game) { game.afterAward(); },
};

// ================================================================
// 失败屏 — 原版 ZombiesWon 大图
// ================================================================
Screens.lose = {
  draw(ctx) {
    ctx.fillStyle = '#050604'; ctx.fillRect(0, 0, 800, 600);
    const t = Screens.t;
    const won = img('zombieswon.png');
    if (won) {
      ctx.save();
      const sc = 1 + Math.max(0, 0.25 - t * 0.18);
      ctx.translate(400, 280);
      ctx.scale(sc, sc);
      ctx.drawImage(won, -282, -234, 564, 468);
      ctx.restore();
    }
    const brain = img('brain.png');
    if (brain) {
      ctx.save();
      ctx.translate(400 + Math.sin(t * 9) * 4, 520 + Math.cos(t * 7) * 3);
      ctx.drawImage(brain, -30, -24, 60, 48);
      ctx.restore();
    }
    const a = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '再 试 一 次', 400, 575, 26, '#ff8a6a');
    ctx.restore();
  },
  click(p, game) { game.retryLevel(); },
};

// ================================================================
// 关卡选择屏 (调试: 解锁全部后, 主菜单冒险按钮进入)
// 5 世界 × 10 关 网格, 点击直接跳转
// ================================================================
Screens.levelSelect = {
  hover: null,
  enter() { this.scroll = 0; },
  cells() {
    // 5 世界各 10 关, 每行一世界
    const cells = [];
    const x0 = 60, y0 = 86, cw = 66, ch = 66, gap = 4;
    for (let lv = 1; lv <= 50; lv++) {
      const world = Math.floor((lv - 1) / 10);   // 0..4
      const sub = (lv - 1) % 10;
      cells.push({
        lv, x: x0 + sub * (cw + gap), y: y0 + world * (ch + gap),
        w: cw, h: ch, label: `${world + 1}-${sub + 1}`,
      });
    }
    return cells;
  },
  draw(ctx) {
    // 背景: 菜单背景图 + 半透明遮罩
    const bg = img('background1.jpg');
    ctx.fillStyle = '#1a1206'; ctx.fillRect(0, 0, 800, 600);
    if (bg) { ctx.globalAlpha = 0.25; ctx.drawImage(bg, -220, 0); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(10,6,2,0.72)'; ctx.fillRect(0, 0, 800, 600);
    pvzText(ctx, '选择关卡 (调试模式)', 400, 46, 30, '#ffe36a');
    pvzText(ctx, '已解锁全部关卡与小游戏 · 点击任意关卡直接开始', 400, 74, 14, '#d8cfa8');
    const cells = this.cells();
    const game = Screens.game;
    const cur = game.levelId;
    for (const c of cells) {
      const hov = Screens.hover === 'lv' + c.lv;
      const isCur = c.lv === cur;
      ctx.save();
      // 关卡卡片
      const g1 = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
      if (isCur) { g1.addColorStop(0, '#c8a028'); g1.addColorStop(1, '#8a6410'); }
      else if (hov) { g1.addColorStop(0, '#5a9a3a'); g1.addColorStop(1, '#2a6a1a'); }
      else { g1.addColorStop(0, '#4a3720'); g1.addColorStop(1, '#2a1f10'); }
      ctx.fillStyle = g1;
      ctx.strokeStyle = hov || isCur ? '#ffe9a8' : '#1a1208';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, 8);
      ctx.fill(); ctx.stroke();
      ctx.font = 'bold 17px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff4d0';
      ctx.fillText(c.label, c.x + c.w / 2, c.y + c.h / 2 + 6);
      ctx.restore();
    }
    // 世界标签
    const names = ['白天草坪', '夜晚墓园', '泳池派对', '浓雾迷局', '屋顶决战'];
    names.forEach((n, i) => {
      pvzText(ctx, n, 390, 86 + 35 + i * 70, 15, '#c8b28a');
    });
    // 返回按钮
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    ctx.beginPath(); ctx.roundRect(700, 548, 84, 34, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('返 回', 742, 570);
    ctx.restore();
    this._back = { x: 700, y: 548, w: 84, h: 34 };
    this._cells = cells;
  },
  click(p, game) {
    if (this._back && inRect(p, this._back.x, this._back.y, this._back.w, this._back.h)) {
      game.audio.play('buttonclick');
      game.state = 'menu';
      return;
    }
    for (const c of (this._cells || [])) {
      if (inRect(p, c.x, c.y, c.w, c.h)) {
        game.audio.play('gravebutton');
        game.startLevel(c.lv);
        return;
      }
    }
  },
};

// ================================================================
// 模式选择屏 (玩玩小游戏 / 解谜 / 生存) — 原版 ChallengeScreen 风格
// ================================================================
// ================================================================
// 模式选择屏 (原版 ChallengeScreen — 三页: 小游戏/解谜/生存)
// 布局: 挑战/解谜页 (38+col*155, 93+row*119, 104x115) 4行5列
//       生存页     (38+col*155, 125+row*145, 104x115) 3行
// 返回按钮 (18,568,111,26); 缩略图 cel表; 锁定显示 "?"
// ================================================================
// 挑战定义 (原版 gChallengeDefs 精简: 去掉limbo页隐藏项)
const CHALLENGE_DEFS = [
  // ---- 小游戏页 (CHALLENGE) row0-3 ----
  { key: 'war_and_peas',    page: 'challenge', row: 0, col: 0, icon: 0,  label: '豌豆大战' },
  { key: 'bowling',         page: 'challenge', row: 0, col: 1, icon: 6,  label: '坚果保龄球' },
  { key: 'slotmachine',     page: 'challenge', row: 0, col: 2, icon: 2,  label: '老虎机' },
  { key: 'raining',         page: 'challenge', row: 0, col: 3, icon: 3,  label: '天降种子' },
  { key: 'beghouled',       page: 'challenge', row: 0, col: 4, icon: 1,  label: '宝石僵尸' },
  { key: 'invisighoul',     page: 'challenge', row: 1, col: 0, icon: 8,  label: '隐形僵尸' },
  { key: 'seeingstars',     page: 'challenge', row: 1, col: 1, icon: 5,  label: '看星星' },
  { key: 'zombiquarium',    page: 'challenge', row: 1, col: 2, icon: 7,  label: '僵尸水族馆' },
  { key: 'beghouled_twist', page: 'challenge', row: 1, col: 3, icon: 20, label: '宝石僵尸旋转' },
  { key: 'little_trouble',  page: 'challenge', row: 1, col: 4, icon: 12, label: '小麻烦' },
  { key: 'portal_combat',   page: 'challenge', row: 2, col: 0, icon: 15, label: '传送门大战' },
  { key: 'column',          page: 'challenge', row: 2, col: 1, icon: 4,  label: '列队来袭' },
  { key: 'bobsled',         page: 'challenge', row: 2, col: 2, icon: 17, label: '雪橇车大赛' },
  { key: 'speed',           page: 'challenge', row: 2, col: 3, icon: 18, label: '极速僵尸' },
  { key: 'whack',           page: 'challenge', row: 2, col: 4, icon: 16, label: '打僵尸' },
  { key: 'last_stand',      page: 'challenge', row: 3, col: 0, icon: 21, label: '坚不可摧' },
  { key: 'war_and_peas_2',  page: 'challenge', row: 3, col: 1, icon: 0,  label: '豌豆大战2' },
  { key: 'bowling2',        page: 'challenge', row: 3, col: 2, icon: 6,  label: '保龄球·极限' },
  { key: 'pogo_party',      page: 'challenge', row: 3, col: 3, icon: 14, label: '跳跳派对' },
  { key: 'final_boss',      page: 'challenge', row: 3, col: 4, icon: 19, label: '僵王博士' },
  // ---- 解谜页 (PUZZLE) row0-3 ----
  { key: 'vase_1',  page: 'puzzle', row: 0, col: 0, icon: 10, label: '罐子1' },
  { key: 'vase_2',  page: 'puzzle', row: 0, col: 1, icon: 10, label: '罐子2' },
  { key: 'vase_3',  page: 'puzzle', row: 0, col: 2, icon: 10, label: '罐子3' },
  { key: 'vase_4',  page: 'puzzle', row: 0, col: 3, icon: 10, label: '罐子4' },
  { key: 'vase_5',  page: 'puzzle', row: 0, col: 4, icon: 10, label: '罐子5' },
  { key: 'vase_6',  page: 'puzzle', row: 1, col: 0, icon: 10, label: '罐子6' },
  { key: 'vase_7',  page: 'puzzle', row: 1, col: 1, icon: 10, label: '罐子7' },
  { key: 'vase_8',  page: 'puzzle', row: 1, col: 2, icon: 10, label: '罐子8' },
  { key: 'vase_9',  page: 'puzzle', row: 1, col: 3, icon: 10, label: '罐子9' },
  { key: 'vase_endless', page: 'puzzle', row: 1, col: 4, icon: 10, label: '罐子无尽' },
  { key: 'izombie_1', page: 'puzzle', row: 2, col: 0, icon: 11, label: '我是僵尸1' },
  { key: 'izombie_2', page: 'puzzle', row: 2, col: 1, icon: 11, label: '我是僵尸2' },
  { key: 'izombie_3', page: 'puzzle', row: 2, col: 2, icon: 11, label: '我是僵尸3' },
  { key: 'izombie_4', page: 'puzzle', row: 2, col: 3, icon: 11, label: '我是僵尸4' },
  { key: 'izombie_5', page: 'puzzle', row: 2, col: 4, icon: 11, label: '我是僵尸5' },
  { key: 'izombie_6', page: 'puzzle', row: 3, col: 0, icon: 11, label: '我是僵尸6' },
  { key: 'izombie_7', page: 'puzzle', row: 3, col: 1, icon: 11, label: '我是僵尸7' },
  { key: 'izombie_8', page: 'puzzle', row: 3, col: 2, icon: 11, label: '我是僵尸8' },
  { key: 'izombie_9', page: 'puzzle', row: 3, col: 3, icon: 11, label: '我是僵尸9' },
  { key: 'izombie_endless', page: 'puzzle', row: 3, col: 4, icon: 11, label: '我是僵尸无尽' },
  // ---- 生存页 (SURVIVAL) row0-2 ----
  { key: 'survival_day_n',   page: 'survival', row: 0, col: 0, icon: 0, label: '生存 白天' },
  { key: 'survival_night_n', page: 'survival', row: 0, col: 1, icon: 1, label: '生存 黑夜' },
  { key: 'survival_pool_n',  page: 'survival', row: 0, col: 2, icon: 2, label: '生存 泳池' },
  { key: 'survival_fog_n',   page: 'survival', row: 0, col: 3, icon: 3, label: '生存 浓雾' },
  { key: 'survival_roof_n',  page: 'survival', row: 0, col: 4, icon: 4, label: '生存 屋顶' },
  { key: 'survival_day_h',   page: 'survival', row: 1, col: 0, icon: 5, label: '困难 白天' },
  { key: 'survival_night_h', page: 'survival', row: 1, col: 1, icon: 6, label: '困难 黑夜' },
  { key: 'survival_pool_h',  page: 'survival', row: 1, col: 2, icon: 7, label: '困难 泳池' },
  { key: 'survival_fog_h',   page: 'survival', row: 1, col: 3, icon: 8, label: '困难 浓雾' },
  { key: 'survival_roof_h',  page: 'survival', row: 1, col: 4, icon: 9, label: '困难 屋顶' },
  { key: 'survival_pool_e',  page: 'survival', row: 2, col: 2, icon: 10, label: '无尽 泳池' },
];

Screens.modeSelect = {
  page: 'challenge',       // challenge | puzzle | survival
  hover: null,
  _cells: null,
  enter(page) { this.page = page || 'challenge'; },
  // 解锁需求 (原版 MoreTrophiesNeeded 简化: 用冒险进度)
  trophiesNeeded(def) {
    const game = Screens.game;
    if (!game) return 0;
    const lv = Math.min(game.progress.unlocked, 51);
    const finished = lv >= 51 || game.debugUnlocked;
    if (def.page === 'challenge' || def.page === 'survival') {
      if (finished) {
        // 通关后: 按完成个数逐个解锁 (简化: 前3直接开, 之后每赢一个开一个)
        const idx = def.row * 5 + def.col;
        const won = (game.modeWins || []).length;
        return idx < 3 ? 0 : Math.max(0, idx - 2 - won);
      }
      const idx = def.row * 5 + def.col;
      return idx < 3 ? 0 : idx === 3 ? 1 : 2;
    }
    if (def.page === 'puzzle') {
      // 解谜: 通关4-5后开放罐子, 通关后开放全部 (简化: 进度≥35开)
      return lv >= 35 || game.debugUnlocked ? 0 : 2;
    }
    return 0;
  },
  draw(ctx) {
    const game = Screens.game;
    // 背景 (原版 Challenge_Background.jpg)
    const bg = img('challenge_background.jpg');
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#2a1f10'; ctx.fillRect(0, 0, 800, 600); }
    // 标题 (页签)
    const titles = { challenge: '玩玩小游戏', puzzle: '解谜模式', survival: '生存模式' };
    const subs = { challenge: '赢得奖杯解锁更多玩法', puzzle: '砸罐子与指挥僵尸', survival: '守旗挑战, 永不放弃' };
    pvzText(ctx, titles[this.page], 400, 46, 34, '#ffe36a');
    pvzText(ctx, subs[this.page], 400, 74, 13, '#d8cfa8');
    // 网格按钮
    const thumbs = img('challenge_thumbnails.jpg');
    const window1 = img('challenge_window.png');
    const windowH = img('challenge_window_highlight.png');
    const blank = img('challenge_blank.png');
    const tW = 80, tH = 65;   // 缩略图cel
    this._cells = [];
    const hover = Screens.hover;
    const defs = CHALLENGE_DEFS.filter(d => d.page === this.page);
    defs.forEach((def) => {
      const y0 = this.page === 'survival' ? 125 : 93;
      const dy = this.page === 'survival' ? 145 : 119;
      const x = 38 + def.col * 155, y = y0 + def.row * dy;
      const w = 104, h = 115;
      this._cells.push({ ...def, x, y, w, h });
      const idx = this._cells.length - 1;
      const need = this.trophiesNeeded(def);
      const hov = hover === 'mode' + idx;
      // 缩略图 (锁定→灰)
      ctx.save();
      if (need >= 1) { ctx.globalAlpha = 0.5; ctx.filter = 'grayscale(1)'; }
      if (thumbs) {
        ctx.drawImage(thumbs, def.icon * tW, 0, tW, tH, x + 13, y + 4, tW, tH);
      } else {
        ctx.fillStyle = '#555'; ctx.fillRect(x + 13, y + 4, tW, tH);
      }
      ctx.restore();
      // 按钮框 (原版: window@(-6,-2), 悬停用highlight)
      const frame = hov && need < 1 ? windowH : window1;
      if (frame) ctx.drawImage(frame, x - 6, y - 2);
      // 名称 (锁定→"?")
      ctx.save();
      ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = hov ? '#fa2828' : '#2a2a5a';
      const label = need >= 1 ? '?' : def.label;
      if (need >= 1) { ctx.font = 'bold 34px "Noto Sans SC", sans-serif'; ctx.fillStyle = '#2a2a5a'; }
      // 两行显示 (原版按长度折行)
      if (label.length > 7 && need < 1) {
        const mid = label.lastIndexOf(' ', label.length - 1) > 3 ? label.lastIndexOf(' ') : Math.ceil(label.length / 2);
        ctx.fillText(label.slice(0, mid), x + 52, y + 92);
        ctx.fillText(label.slice(mid).trim(), x + 52, y + 106);
      } else {
        ctx.fillText(label, x + 52, y + 96);
      }
      ctx.restore();
      // 锁定提示 (奖杯数)
      if (need >= 1) {
        ctx.save();
        ctx.font = 'bold 11px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a03030';
        ctx.fillText('需奖杯 ×' + need, x + 52, y + 108);
        ctx.restore();
      }
    });
    // 返回按钮 (原版 (18,568,111,26) SeedChooser button)
    const backBtn = img('seedchooser_button2.png') || img('seedchooser_button.png');
    ctx.save();
    if (backBtn) ctx.drawImage(backBtn, 18, 568, 111, 26);
    else {
      ctx.fillStyle = '#8a6642';
      ctx.beginPath(); ctx.roundRect(18, 568, 111, 26, 5); ctx.fill();
    }
    ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#2a2a5a';
    ctx.fillText('返回菜单', 73, 586);
    ctx.restore();
    this._back = { x: 18, y: 568, w: 111, h: 26 };
    // 页面切换 (三页快捷)
    const pages = [['challenge', '小游戏'], ['puzzle', '解谜'], ['survival', '生存']];
    this._pageTabs = [];
    pages.forEach(([pg, label], i) => {
      const px = 600 + i * 66, py = 566;
      ctx.save();
      const cur = this.page === pg;
      ctx.fillStyle = cur ? '#c8a028' : '#5a4a2a';
      ctx.beginPath(); ctx.roundRect(px, py, 60, 28, 5); ctx.fill();
      ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText(label, px + 30, py + 19);
      ctx.restore();
      this._pageTabs.push({ page: pg, x: px, y: py, w: 60, h: 28 });
    });
  },
  click(p, game) {
    if (this._back && inRect(p, this._back.x, this._back.y, this._back.w, this._back.h)) {
      game.audio.play('buttonclick');
      game.state = 'menu';
      return;
    }
    for (const t of (this._pageTabs || [])) {
      if (inRect(p, t.x, t.y, t.w, t.h)) {
        game.audio.play('buttonclick');
        this.page = t.page;
        return;
      }
    }
    for (let i = 0; i < (this._cells || []).length; i++) {
      const c = this._cells[i];
      if (inRect(p, c.x, c.y, c.w, c.h)) {
        if (this.trophiesNeeded(c) >= 1) {
          game.audio.play('buzzer');
          return;
        }
        game.audio.play('gravebutton');
        game.startMode(c.key);
        return;
      }
    }
  },
};

// ================================================================
// 戴夫商店 (#11: 原版 StoreScreen — 通关 3-4 后从主菜单的车进入)
// ================================================================
Screens.shop = {
  page: 0,
  hatchTimer: 0,       // 翻页后备箱关→抖→开
  hatchOpen: true,
  daveInst: null,       // 戴夫 reanim
  bubble: null,         // 气泡 {text, t}
  _cells: null,
  _confirm: null,       // 购买确认 {item}
  enter() {
    this.hatchOpen = true;
    this.hatchTimer = 0;
    this._confirm = null;
    this.bubble = null;
    // 戴夫进店 (原版 CrazyDaveEnter anim_enter 24x)
    try {
      if (!this.daveInst && RE.hasDef('CrazyDave')) {
        this.daveInst = Assets.reanim('CrazyDave');
        this.daveInst.x = -42;
        this.daveInst.y = 68;
      }
      if (this.daveInst) this.daveInst.play('anim_idle', RE.LOOP, 12);
    } catch (e) { }
  },
  leave() {
    this.daveInst = null;
  },
  pageItems() {
    return SHOP_ITEMS.filter(it => it.page === this.page);
  },
  pageVisible(p) {
    const game = Screens.game;
    if (!game) return p <= 1;
    const lv = Math.min(game.progress.unlocked, 51);
    const finished = lv >= 51 || game.debugUnlocked;
    if (p === 0) return true;                       // 第一页始终可见
    if (p === 1) return finished || lv >= 42;       // 升级植物页
    if (p === 2) return finished || lv >= 45;       // 禅园页
    if (p === 3) return finished;                   // 智慧树页
    return false;
  },
  draw(ctx) {
    const game = Screens.game;
    // ---- 背景 (原版 Store_Background) ----
    const bg = img('store_background.jpg');
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#241a0c'; ctx.fillRect(0, 0, 800, 600); }
    // ---- 后备箱开/关 (原版: 关箱态 HatchbackOpen 不画商品) ----
    const showItems = this.hatchOpen && this.hatchTimer <= 0;
    if (showItems) {
      const hb = img('store_hatchbackopen.png');
      if (hb) ctx.drawImage(hb, 299, 0);
    } else {
      const cc = img('store_carclosed.png');
      if (cc) ctx.drawImage(cc, 337, 0);
    }
    // ---- 招牌 (滑入动画) ----
    const signY = Math.min(0, -150 + this._t * 60);
    const sign = img('store_sign.png');
    if (sign) ctx.drawImage(sign, 285, signY);
    // ---- 戴夫 (reanim 或程序化) ----
    if (this.daveInst) {
      this.daveInst.draw(ctx);
    } else {
      // 兜底: 画戴夫头像框
      ctx.fillStyle = 'rgba(20,14,6,0.5)';
      ctx.beginPath(); ctx.arc(60, 120, 40, 0, Math.PI * 2); ctx.fill();
      pvzText(ctx, '戴夫', 60, 128, 18, '#ffe9a8');
    }
    // ---- 商品 8 格 (原版: 第1行 422+74*i,206; 第2行 372+74*(i-4),310; 点击区50x87) ----
    this._cells = [];
    if (showItems) {
      const hover = Screens.hover;
      this.pageItems().forEach((it, i) => {
        const x = i < 4 ? 422 + 74 * i : 372 + 74 * (i - 4);
        const y = i < 4 ? 206 : 310;
        const game2 = Screens.game;
        const cost = game2 ? game2.itemCost(it) : it.cost;
        const bought = game2 && (game2.purchased[it.key] || 0) > 0 && it.type !== 'rake';
        const soldOut = cost == null || bought;
        this._cells.push({ x, y, w: 50, h: 87, item: it, i });
        const hov = hover === 'shop' + i && !soldOut;
        // 商品图 (植物种子包 / 图标)
        ctx.save();
        if (soldOut) ctx.globalAlpha = 0.45;
        this.drawItemIcon(ctx, it, x, y, hov);
        ctx.restore();
        // 价格标签 (原版 PriceTag @ (x-3,y+70))
        const tag = img('store_pricetag.png');
        if (!soldOut) {
          if (tag) ctx.drawImage(tag, x - 3, y + 70);
          ctx.save();
          ctx.font = 'bold 12px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center'; ctx.fillStyle = '#000';
          const costStr = cost >= 10000 ? (cost / 10000) + '万' : String(cost);
          ctx.fillText(costStr, x + 23, y + 86);
          ctx.restore();
        } else {
          // 售罄红字
          pvzText(ctx, '售罄', x + 23, y + 84, 13, '#d03030');
        }
        // 悬停发光 (原版 seedpacketflash / additive)
        if (hov) {
          const flash = img('seedpacketflash.png');
          if (flash) { ctx.globalAlpha = 0.5; ctx.drawImage(flash, x - 5, y - 5, 60, 92); ctx.globalAlpha = 1; }
        }
      });
    }
    // ---- 金币栏 (原版 CoinBank @ (650,559)) ----
    ctx.save();
    const cbImg = img('coinbank.png');
    if (cbImg) ctx.drawImage(cbImg, 650, 559);
    else {
      ctx.fillStyle = 'rgba(60,44,16,0.92)';
      ctx.beginPath(); ctx.roundRect(650, 559, 148, 38, 6); ctx.fill();
      ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.font = 'bold 17px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right'; ctx.fillStyle = '#b4ff5a';
    ctx.fillText(String(game ? game.coins : 0), 770, 584);
    ctx.restore();
    // ---- 页码 + 翻页按钮 (原版 (252,402)prev (596,402)next) ----
    const nPages = [0, 1, 2, 3].filter(p => this.pageVisible(p)).length;
    if (nPages > 1) {
      const prevImg = img(this.page > 0 ? 'store_prevbuttonhighlight.png' : 'store_prevbuttondisabled.png') || img('store_prevbutton.png');
      const nextImg = img(this.page < 3 && this.pageVisible(this.page + 1) ? 'store_nextbuttonhighlight.png' : 'store_nextbuttondisabled.png') || img('store_nextbutton.png');
      if (prevImg) ctx.drawImage(prevImg, 252, 402);
      if (nextImg) ctx.drawImage(nextImg, 596, 402);
    }
    this._prev = { x: 252, y: 402, w: 60, h: 60 };
    this._next = { x: 596, y: 402, w: 60, h: 60 };
    // 页码文字 (原版 (470,500))
    ctx.save();
    ctx.font = '13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgb(80,80,80)';
    ctx.fillText(`第 ${this.page + 1} / 4 页`, 470, 505);
    ctx.restore();
    // ---- 返回按钮 (原版 (366,512)) ----
    const backImg = img(Screens.hover === 'shopback' ? 'store_mainmenubuttonhighlight.png' : 'store_mainmenubutton.png');
    if (backImg) ctx.drawImage(backImg, 366, 512);
    else {
      ctx.fillStyle = '#6f5233';
      ctx.beginPath(); ctx.roundRect(366, 512, 120, 40, 8); ctx.fill();
    }
    pvzText(ctx, '返回主菜单', 426, 538, 15, '#62a9eb');
    this._back = { x: 366, y: 512, w: 120, h: 40 };
    // ---- 戴夫气泡 ----
    if (this.bubble) {
      this.bubble.t -= 1 / 60;
      if (this.bubble.t <= 0) this.bubble = null;
      else {
        const bub = img('store_speechbubble.png');
        if (bub) {
          ctx.drawImage(bub, 63, 10);
          ctx.save();
          ctx.font = '13px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'left'; ctx.fillStyle = '#222';
          this.wrapText(ctx, this.bubble.text, 92, 40, 220, 17);
          ctx.restore();
        }
      }
    }
    // ---- 购买确认对话框 ----
    if (this._confirm) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = '#e8d9b5';
      ctx.beginPath(); ctx.roundRect(220, 220, 360, 160, 12); ctx.fill();
      ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 3; ctx.stroke();
      pvzText(ctx, '购买这件商品？', 400, 262, 22, '#4a3010');
      pvzText(ctx, this._confirm.item.label + ' — ' + this._confirm.cost + ' 金币', 400, 296, 15, '#6a4a20');
      // 是/否
      const hovY = Screens.hover === 'confirmyes', hovN = Screens.hover === 'confirmno';
      ctx.fillStyle = hovY ? '#5a9a3a' : '#3a6a2a';
      ctx.beginPath(); ctx.roundRect(250, 330, 130, 34, 6); ctx.fill();
      ctx.fillStyle = hovN ? '#a03a3a' : '#7a3030';
      ctx.beginPath(); ctx.roundRect(420, 330, 130, 34, 6); ctx.fill();
      pvzText(ctx, '是', 315, 353, 16, '#fff');
      pvzText(ctx, '否', 485, 353, 16, '#fff');
      ctx.restore();
      this._confirmRects = {
        yes: { x: 250, y: 330, w: 130, h: 34 },
        no: { x: 420, y: 330, w: 130, h: 34 },
      };
    } else {
      this._confirmRects = null;
    }
    // 提示
    pvzText(ctx, '击败僵尸获得金币 · 翻页查看更多商品', 426, 480, 12, 'rgba(200,178,138,0.75)');
  },
  drawItemIcon(ctx, it, x, y, hov) {
    if (it.type === 'plant') {
      // 植物种子包 (原版 DrawSeedPacket)
      const UIm = __getUI();
      if (UIm && UIm.drawSeedCard) UIm.drawSeedCard(ctx, it.key, x, y, {});
      return;
    }
    if (it.type === 'slots') {
      // 种子槽升级图 (原版 Store_PacketUpgrade + x N)
      const pu = img('store_packetupgrade.png');
      const game = Screens.game;
      const n = (game && game.purchased['packetUpgrade'] || 0);
      if (pu) ctx.drawImage(pu, x - 4, y + 6, 58, 56);
      pvzText(ctx, 'x' + (7 + n), x + 23, y + 78, 13, '#2a2a5a');
      return;
    }
    if (it.type === 'rake') {
      const rk = img('icon_rake.png');
      if (rk) ctx.drawImage(rk, x, y + 8, 50, 50);
      else pvzText(ctx, '耙', x + 25, y + 40, 26, '#ffe9a8');
      return;
    }
    if (it.type === 'mower') {
      const key = it.key === 'poolcleaner' ? 'icon_poolcleaner.png' : 'icon_roofcleaner.png';
      const ic = img(key);
      if (ic) ctx.drawImage(ic, x, y + 8, 50, 50);
      else pvzText(ctx, it.key === 'poolcleaner' ? '泳池' : '屋顶', x + 25, y + 40, 18, '#8fd4ff');
      return;
    }
    if (it.type === 'firstaid') {
      const fa = img('store_firstaidwallnuticon.png');
      if (fa) ctx.drawImage(fa, x - 4, y + 4, 58, 62);
      else pvzText(ctx, '急救', x + 25, y + 40, 20, '#ff9a5a');
      return;
    }
    if (it.type === 'marigold') {
      const UIm = __getUI();
      if (UIm && UIm.drawSeedCard) UIm.drawSeedCard(ctx, 'MARIGOLD', x, y, {});
      return;
    }
    // 禅园/树
    const zenIcon = {
      FERTILIZER: 'zengarden_fertilizer_seed1.png',
      BUG_SPRAY: 'zengarden_bugspray.png',
      MUSHROOM_GARDEN: 'store_mushroomgardenicon.png',
      WHEEL_BARROW: 'zengarden_wheelbarrow.png',
      STINKY: 'zengarden_stinky.png',
      TREE_OF_WISDOM: 'store_treeofwisdomicon.png',
    }[it.key];
    const zi = zenIcon && img(zenIcon);
    if (zi) ctx.drawImage(zi, x, y + 8, 50, 55);
    else {
      const label = it.label.slice(0, 3);
      pvzText(ctx, label, x + 25, y + 40, 16, '#c8f542');
    }
  },
  wrapText(ctx, text, x, y, maxW, lineH) {
    let line = '', yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, x, yy);
        line = ch; yy += lineH;
      } else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
  },
  update(dt) {
    this._t = (this._t || 0) + dt;
    if (this.hatchTimer > 0) {
      this.hatchTimer -= dt;
      if (this.hatchTimer <= 0) { this.hatchTimer = 0; this.hatchOpen = true; }
    }
    if (this.daveInst) this.daveInst.update(dt);
  },
  click(p, game) {
    // 购买确认对话框优先
    if (this._confirm && this._confirmRects) {
      const r = this._confirmRects;
      if (inRect(p, r.yes.x, r.yes.y, r.yes.w, r.yes.h)) {
        const { item, cost } = this._confirm;
        this._confirm = null;
        if (game.coins >= cost) {
          game.buyItem(item.key);
          this.bubble = { text: '成交！这正是最好的选择！', t: 2.5 };
        } else {
          game.audio.play('buzzer');
          this.bubble = { text: '钱不够呀邻居, 去打僵尸赚金币吧！', t: 2.5 };
        }
        return;
      }
      if (inRect(p, r.no.x, r.no.y, r.no.w, r.no.h)) {
        this._confirm = null;
        return;
      }
      return;   // 对话框模态
    }
    if (this._back && inRect(p, this._back.x, this._back.y, this._back.w, this._back.h)) {
      game.audio.play('buttonclick');
      game.state = 'menu';
      this.leave();
      return;
    }
    // 翻页 (原版: 关箱→抖→开箱 50帧)
    if (this._prev && inRect(p, this._prev.x, this._prev.y, this._prev.w, this._prev.h)) {
      if (this.page > 0) {
        this.page--;
        this.hatchTimer = 0.5; this.hatchOpen = false;
        game.audio.play('tap');
      }
      return;
    }
    if (this._next && inRect(p, this._next.x, this._next.y, this._next.w, this._next.h)) {
      if (this.page < 3 && this.pageVisible(this.page + 1)) {
        this.page++;
        this.hatchTimer = 0.5; this.hatchOpen = false;
        game.audio.play('tap');
      }
      return;
    }
    // 商品点击 → 确认框
    for (const c of (this._cells || [])) {
      if (inRect(p, c.x, c.y, c.w, c.h)) {
        const it = c.item;
        const cost = game.itemCost(it);
        const consumable = it.type === 'rake' || it.type === 'zen' || it.type === 'marigold';
        const bought = (game.purchased[it.key] || 0) > 0 && !consumable;
        if (cost == null || bought) { game.audio.play('buzzer'); return; }
        this._confirm = { item: it, cost };
        game.audio.play('seedlift');
        return;
      }
    }
  },
};


// ================================================================
// 模式胜利屏 (小游戏/解谜/生存通关结算)
// ================================================================
Screens.modeWin = {
  draw(ctx, game) {
    const t = Screens.t;
    ctx.fillStyle = '#0a0f05'; ctx.fillRect(0, 0, 800, 600);
    // 奖杯
    const trophy = img('trophy_hi_res.png') || img('sunflower_trophy.png');
    const sc = 0.9;
    const y = 130 + Math.sin(t * 2) * 6;
    if (trophy) ctx.drawImage(trophy, 400 - trophy.width * sc / 2, y, trophy.width * sc, trophy.height * sc);
    pvzText(ctx, '挑战成功！', 400, 90, 46, '#ffe36a');
    const st = game.winStats || {};
    if (st.mode && st.mode.startsWith('survival')) {
      pvzText(ctx, `坚持到了第 ${st.waves || 1} 波`, 400, 420, 26, '#ffe9a8');
    } else if (st.mode === 'whack') {
      pvzText(ctx, `击杀了 ${st.score || 0} 只僵尸`, 400, 420, 26, '#ffe9a8');
    } else {
      pvzText(ctx, '完成挑战！', 400, 420, 26, '#ffe9a8');
    }
    const a = 0.55 + 0.45 * Math.sin(t * 3);
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '点 击 继 续', 400, 520, 24, '#c8f542');
    ctx.restore();
  },
  click(p, game) {
    game.audio.play('buttonclick');
    game.state = 'modeselect';
    Screens.modeSelect.enter(game.modeKey && game.modeKey.startsWith('survival') ? 'survival' : 'challenge');
    game.audio.playBGM('start_menu');
  },
};

// 悬停检测 (主循环调用)
Screens.updateHover = function (mouse) {
  if (!mouse) return;
  this.hover = null;
  const g = this.game;
  if (g && g.state === 'menu' && this.menu.buttons) {
    for (const b of this.menu.buttons) {
      if (inRect(mouse, b.x, b.y, b.w, b.h)) { this.hover = b.k; break; }
    }
  }
  if (g && g.state === 'levelselect' && this.levelSelect._cells) {
    for (const c of this.levelSelect._cells) {
      if (inRect(mouse, c.x, c.y, c.w, c.h)) { this.hover = 'lv' + c.lv; break; }
    }
  }
  if (g && g.state === 'modeselect' && this.modeSelect._cells) {
    this.modeSelect._cells.forEach((c, i) => {
      if (inRect(mouse, c.x, c.y, c.w, c.h)) this.hover = 'mode' + i;
    });
  }
  if (g && g.state === 'shop' && this.shop._cells) {
    this.shop._cells.forEach((c, i) => {
      if (inRect(mouse, c.x, c.y, c.w, c.h)) this.hover = 'shop' + i;
    });
  }
  if (g && g.state === 'options' && this.options.rects && this.options.rects.unlock) {
    const u = this.options.rects.unlock;
    if (inRect(mouse, u.x, u.y, u.w, u.h)) this.hover = 'unlock';
  }
};

if (typeof module !== 'undefined') module.exports = { Screens, pvzText, inRect };
