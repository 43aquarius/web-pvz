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

  update(dt) { this.t += dt; },
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
    // (背景 PNG 双胞胎已入 boot 包 — 结构性消除首次菜单黑块; ui 包进关卡时按需加载)
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
    // 小游戏/解谜 (解锁: 玩玩小游戏+解谜模式) / 生存
    const [mx, my] = trackPos('SelectorScreen_Survival_button');
    B.push({ k: 'survival', x: mx, y: my, w: 313, h: 133 });
    const [px, py] = trackPos('SelectorScreen_Challenges_button');
    B.push({ k: 'challenges', x: px, y: py, w: 286, h: 122 });
    const [vx, vy] = trackPos('SelectorScreen_ZenGarden_button');
    B.push({ k: 'zengarden', x: vx, y: vy, w: 266, h: 123 });
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
      { k: 'challenges', x: 234, y: 262, w: 332, h: 66, label: '玩玩小游戏 · 解谜' },
      { k: 'survival', x: 234, y: 338, w: 332, h: 66, label: '生 存 模 式' },
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
    // 冒险按钮高亮 (轨道 override) + 开始/继续状态切换 (原版 mShowStartButton)
    const adv = this.buttons.find(b => b.k === 'adventure');
    if (adv) {
      const game = Screens.game;
      const showStart = !game || game.progress.unlocked < 2;   // 原版: 无存档/level<2 → 开始冒险吧!
      if (hover === 'adventure') {
        inst.setImageOverride('SelectorScreen_StartAdventure_button',
          showStart ? 'selectorscreen_startadventure_highlight.png' : 'selectorscreen_adventure_highlight.png');
      } else {
        inst.setImageOverride('SelectorScreen_StartAdventure_button',
          showStart ? null : 'selectorscreen_adventure_button.png');
      }
      // 等级数字 (原版 LevelNumbers cel: BG_Right+(486,47) 主关, (509,50) 子关) — 仅继续状态显示
      if (game && !showStart) {
        const lv = Math.min(game.progress.unlocked, 50);
        if (lv <= 50) {
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
    }
    // 锁定按钮提示 (悬停)
    if (hover === 'locked') {
      pvzText(ctx, '尚未开放', 400, 240, 18, '#cfcfcf');
    }
    // ---- 戴夫的车 → 商店 (原版素材 Store_HatchbackOpen; 通关 3-4 后解锁) ----
    if (game && game.shopUnlocked && game.shopUnlocked()) {
      const cx = 60, cy = 330, cw2 = 200, ch2 = 110;
      this.shopRect = { x: cx, y: cy, w: cw2, h: ch2 };
      const hov2 = inRect(Screens.mouse || { x: -1, y: -1 }, cx, cy, cw2, ch2);
      const carImg = img('store_hatchbackopen.png');
      if (carImg) {
        ctx.save();
        const bob = Math.sin(Screens.t * 2.2) * 2;
        ctx.translate(cx + cw2 / 2, cy + ch2 / 2 + bob * 0.3);
        const sc = hov2 ? 1.04 : 1;
        ctx.scale(sc, sc);
        ctx.drawImage(carImg, -carImg.width / 2, -carImg.height / 2);
        ctx.restore();
      } else {
        // 兜底: 程序化车
        ctx.save();
        ctx.translate(cx + cw2 / 2, cy + ch2 / 2);
        const bump = Math.sin(Screens.t * 2.2) * 2;
        ctx.translate(0, bump * 0.4);
        ctx.fillStyle = hov2 ? '#d94f3a' : '#b23a28';
        ctx.beginPath(); ctx.roundRect(-cw2 / 2 + 8, -18, cw2 - 22, 34, 7); ctx.fill();
        ctx.fillStyle = hov2 ? '#e88a70' : '#c86a52';
        ctx.beginPath(); ctx.roundRect(-cw2 / 2 + 26, -38, 44, 24, 6); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(-cw2 / 2 + 24, 20, 11, 0, Math.PI * 2); ctx.arc(cw2 / 2 - 22, 20, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(-cw2 / 2 + 24, 20, 5, 0, Math.PI * 2); ctx.arc(cw2 / 2 - 22, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // 金币余额角标 (悬停时显示)
      if (hov2) {
        pvzText(ctx, '◆ ' + (game.coins || 0), cx + cw2 / 2, cy - 12, 15, '#ffd34d');
      }
    } else {
      this.shopRect = null;
    }
  },

  click(p, game) {
    // 戴夫商店入口
    if (this.shopRect && inRect(p, this.shopRect.x, this.shopRect.y, this.shopRect.w, this.shopRect.h)) {
      game.audio.play('gravebutton');
      game.state = 'shop'; Screens.shop.enter();
      return;
    }
    for (const b of (this.buttons || [])) {
      if (!inRect(p, b.x, b.y, b.w, b.h)) continue;
      if (b.k === 'adventure') {
        game.audio.play('gravebutton');
        this.inst && this.inst.setImageOverride('SelectorScreen_StartAdventure_button', null);
        game.startAdventure();
      } else if (b.k === 'challenges') {
        game.audio.play('gravebutton');
        game.state = 'modeselect';
        Screens.modeSelect.enter('challenge');
      } else if (b.k === 'survival') {
        game.audio.play('gravebutton');
        game.state = 'modeselect';
        Screens.modeSelect.enter('survival');
      } else if (b.k === 'zengarden') {
        // 禅镜花园: 通关 5-4 解锁 (原版 level 44 送洒水壶)
        if (game.zenGardenUnlocked && game.zenGardenUnlocked()) {
          game.audio.play('gravebutton');
          game.state = 'zengarden';
          Screens.zengarden.enter();
          Screens.zengarden.refreshNeeds && Screens.zengarden.refreshNeeds();
        } else {
          game.audio.play('buzzer');
        }
      } else if (b.k === 'shop') {
        game.audio.play('gravebutton');
        game.state = 'shop'; Screens.shop.enter();
      } else if (b.k === 'almanac') {
        game.audio.play('gravebutton');
        game.state = 'almanac'; game.almanac.selected = null; game.almanac.tab = 'index';
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
// 帮助 — 覆盖全部玩法 (#13: 小游戏/解谜/生存/商店/禅园说明)
// ================================================================
Screens.help = {
  page: 0,
  PAGES() {
    return [
      {
        title: '怎 么 玩',
        lines: [
          ['· 收集阳光, 种植植物防守草坪', '#4a2f10'],
          ['· 点击种子卡再点击草坪即可种植', '#4a2f10'],
          ['· 铲子可以移除植物 (南瓜内植物: 点上半格铲)', '#4a2f10'],
          ['· 收集阳光: 天上掉的 + 向日葵产出', '#4a2f10'],
          ['', ''],
          ['· 僵尸走到最左侧会触发割草机', '#4a2f10'],
          ['· 割草机只能用一次, 失守即输', '#4a2f10'],
          ['', ''],
          ['· 冒险模式按原版顺序 1-1 → 5-10', '#6b1c04'],
          ['· X-4 关给道具, X-9 关有僵尸纸条', '#6b1c04'],
          ['· 通关 3-4 获得车钥匙 → 戴夫商店开业', '#6b1c04'],
          ['· 通关 5-4 获得洒水壶 → 禅镜花园开启', '#6b1c04'],
        ],
      },
      {
        title: '玩玩小游戏 · 解谜',
        lines: [
          ['【坚果保龄球】传送带送坚果, 种在左三列', '#4a2f10'],
          ['  滚动的坚果会撞飞一排僵尸, 红线后不许种', '#6a4a20'],
          ['【打僵尸】墓碑里冒头就点击锤击, 敲够数量过关', '#4a2f10'],
          ['【雨天种子】种子包从天而降, 点击拾取种植', '#4a2f10'],
          ['', ''],
          ['【花瓶终结者】砸罐子放出植物或僵尸', '#4a2f10'],
          ['  绿罐=植物, 灰罐=僵尸, 打完所有罐子且', '#6a4a20'],
          ['  清场即胜; 砸出的植物卡免费种植', '#6a4a20'],
          ['', ''],
          ['【我是僵尸】指挥僵尸吃掉每行的脑子', '#4a2f10'],
          ['  僵尸卡种在红线右侧; 吃向日葵掉阳光,', '#6a4a20'],
          ['  吃满5个脑子获胜, 没僵尸没阳光就输了', '#6a4a20'],
        ],
      },
      {
        title: '生存模式 · 戴夫商店',
        lines: [
          ['【生存】5种场景各一关, 无尽波次挑战', '#4a2f10'],
          ['  每波僵尸越来越强, 看你能撑多少波', '#6a4a20'],
          ['', ''],
          ['【戴夫商店】通关3-4后从主菜单的汽车进入', '#4a2f10'],
          ['  击杀僵尸掉金币, 商店共4页:', '#6a4a20'],
          ['  页1: 耙子/种子槽/清洁车/升级植物', '#6a4a20'],
          ['  页2: 地刺王/吸金磁/冰西瓜/加农炮等', '#6a4a20'],
          ['  页3: 花园用品(金水壶/肥料/杀虫剂…)', '#6a4a20'],
          ['  页4: 蘑菇园/水族馆/手推车/臭臭蜗牛', '#6a4a20'],
          ['', ''],
          ['【禅镜花园】通关5-4后从主菜单进入', '#4a2f10'],
          ['  浇水施肥养植物, 成熟后掉金币可出售', '#6a4a20'],
        ],
      },
    ];
  },
  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
    const dlg = img('option_dialog.png');
    if (dlg) ctx.drawImage(dlg, 130, 70, 540, 470);
    const pages = this.PAGES();
    const pg = pages[this.page] || pages[0];
    pvzText(ctx, pg.title, 400, 120, 30, '#4a2f10');
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '15px "Noto Sans SC", sans-serif';
    let y = 165;
    for (const [txt, col] of pg.lines) { if (txt) { ctx.fillStyle = col; ctx.fillText(txt, 165, y); } y += 28; }
    ctx.restore();
    // 翻页
    pvzText(ctx, `(${this.page + 1}/${pages.length})  点击翻页 · 点击右侧返回`, 400, 540, 15, '#8a6a3a');
    this._nextPage = { x: 470, y: 515, w: 200, h: 40 };
    this._back = { x: 160, y: 515, w: 140, h: 40 };
  },
  click(p, game) {
    if (this._nextPage && inRect(p, this._nextPage.x, this._nextPage.y, this._nextPage.w, this._nextPage.h)) {
      this.page = (this.page + 1) % this.PAGES().length;
      game.audio.play('tap');
      return;
    }
    game.audio.play('buttonclick');
    this.page = 0;
    game.state = 'menu';
  },
};
Screens.award = {
  // 原版 AwardScreen: 按奖励类型展示 (种子包/铲子/图鉴/车钥匙/玉米卷/洒水壶/奖杯)
  AWARD_IMG: {
    seed: null,          // 种子包 (动态 thumb)
    shovel: 'shovel_hi_res.png',
    almanac: 'selectorscreen_almanac.png',
    carkeys: 'carkeys.png',
    taco: 'taco.png',
    wateringcan: 'wateringcan.png',
    trophy: 'sunflower_trophy.png',
    moneybag: 'moneybag.png',
  },
  AWARD_TITLE: {
    seed: '你获得了新植物!',
    shovel: '你得到一把铁铲!',
    almanac: '你发现了大图鉴!',
    carkeys: '你发现了疯子戴夫的车钥匙!',
    taco: '你发现了一个玉米卷!',
    wateringcan: '你发现了一个洒水壶!',
    trophy: '你击败了所有僵尸!',
    moneybag: '你得到了一大袋金币!',
  },
  draw(ctx, game) {
    const t = Screens.t;
    ctx.fillStyle = 'rgba(6,20,4,0.92)'; ctx.fillRect(0, 0, 800, 600);
    // 光芒旋转 (原版 awardrays)
    ctx.save();
    ctx.translate(400, 250);
    ctx.rotate(t * 0.3);
    const rays = img('awardrays.png') || img('awardrays1.png');
    if (rays) { ctx.globalAlpha = 0.5; ctx.drawImage(rays, -260, -260, 520, 520); }
    ctx.restore();
    const award = game.levelAward || { type: 'seed', plant: game.justUnlocked };
    const type = award.type || 'seed';
    // 标题
    pvzText(ctx, '通 关 奖 励 !', 400, 120, 42, '#ffe36a');
    // 奖励图 (居中浮动)
    ctx.save();
    const bob = Math.sin(t * 2) * 5;
    ctx.translate(400, 265 + bob);
    let drawn = false;
    if (type === 'seed' && award.plant) {
      const packet = img('seedpacket_larger.png');
      if (packet) {
        ctx.drawImage(packet, -80, -100, 160, 200);
        drawn = true;
      }
      const thumb = __getUI() ? __getUI().getThumb(award.plant) : null;
      if (thumb) ctx.drawImage(thumb, -50, -78, 100, 140);
    } else {
      const im = img(this.AWARD_IMG[type]);
      if (im) {
        const s = Math.min(220 / im.width, 220 / im.height);
        ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s);
        drawn = true;
      }
    }
    if (!drawn && type !== 'seed') {
      // 兜底: 金色问号
      ctx.font = 'bold 90px sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffe36a';
      ctx.fillText('?', 0, 30);
    }
    ctx.restore();
    // 底部文案 (原版 DrawBottom: 标题行 + 名称行 + 描述行)
    pvzText(ctx, this.AWARD_TITLE[type] || '你获得了奖励!', 400, 420, 26, '#b8ff7a');
    if (type === 'seed' && award.plant && PLANTS[award.plant]) {
      pvzText(ctx, PLANTS[award.plant].cn, 400, 462, 34, '#ffffff');
      pvzText(ctx, PLANTS[award.plant].desc || '', 400, 496, 14, '#c8e8a8');
    } else if (type === 'trophy') {
      pvzText(ctx, '向日葵奖杯', 400, 462, 30, '#ffffff');
      pvzText(ctx, '你完成了整个冒险模式!', 400, 496, 16, '#c8e8a8');
    } else if (type === 'carkeys') {
      pvzText(ctx, '车钥匙', 400, 462, 30, '#ffffff');
      pvzText(ctx, '商店将会在下一关之后开业……', 400, 496, 16, '#c8e8a8');
    } else if (type === 'wateringcan') {
      pvzText(ctx, '洒水壶', 400, 462, 30, '#ffffff');
      pvzText(ctx, '禅镜花园即将开启……', 400, 496, 16, '#c8e8a8');
    }
    const a = t > 1.5 ? 0.5 + 0.5 * Math.sin(t * 3) : 0;
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '点 击 继 续', 400, 540, 24, '#ffe9a8');
    ctx.restore();
  },
  click(p, game) { if (Screens.t > 0.6) game.afterAward(); },
};
Screens.note = {
  draw(ctx) {
    // 原版 AwardScreen 纸条页: 背景 + 纸张 + 字迹 + [FOUND_NOTE] 标题
    const game = Screens.game;
    const t = Screens.t;
    const award = game && game.levelAward;
    // 背景 (原版 BACKGROUND1 放大 2800x1200 @ -700,-300)
    const bg1 = img('background1.jpg');
    if (bg1) {
      ctx.save();
      ctx.filter = 'brightness(0.35)';
      ctx.drawImage(bg1, -700, -300, 2800, 1200);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0a0805'; ctx.fillRect(0, 0, 800, 600);
    }
    // 纸条 (原版 IMAGE_ZOMBIE_NOTE @ (80,80) + 内容图 @ (131,132))
    const note = img('zombienote.jpg');
    if (note) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24;
      ctx.drawImage(note, 80, 80);
      ctx.restore();
    }
    // 字迹内容 (烘焙的手写纸条: 1-4号 + 最终纸条)
    const noteIdx = award && award.note ? award.note : 1;
    const content = noteIdx >= 5 ? img('notefinal.png') : img('note' + noteIdx + '.png');
    if (content) {
      ctx.save();
      // 原版位置: note1 @ (131,132); note2 @ (133,127); note3 @ (120,117); note4 @ (102,117); final @ (114,138)
      const pos = { 1: [131, 132], 2: [133, 127], 3: [120, 117], 4: [102, 117], 5: [114, 138] }[noteIdx] || [131, 132];
      ctx.translate(pos[0], pos[1]);
      ctx.rotate((Math.sin(noteIdx * 2.7) * 0.012));
      ctx.drawImage(content, 0, 0);
      ctx.restore();
    }
    // 标题 (原版 [FOUND_NOTE] 黄色居中 y=70)
    ctx.save();
    ctx.font = 'bold 26px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,26,4,0.9)'; ctx.lineJoin = 'round';
    ctx.strokeText('你发现了张纸条', 400, 68);
    ctx.fillStyle = 'rgb(255,200,0)';
    ctx.fillText('你发现了张纸条', 400, 68);
    ctx.restore();
    // 继续提示
    const a = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '点 击 继 续', 400, 560, 22, '#ffe9a8');
    ctx.restore();
  },
  // 手写换行 (字间随机微偏移 = 手写感)
  wrapHand(ctx, text, cx, y, maxW, lineH) {
    const chars = Array.from(text);
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) lines.push(cur);
    lines.forEach((ln, i) => {
      const jitter = ((i * 37) % 7 - 3) * 1.2;
      ctx.fillText(ln, cx + jitter, y + i * lineH + (i % 2 ? 3 : -2));
    });
  },
  click(p, game) { game.afterAward(); },
};
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
const MODE_GROUPS = {
  challenge: {
    title: '玩玩小游戏',
    items: [
      { key: 'bowling', label: '坚果保龄球', desc: '传送带上滚出坚果，把僵尸撞飞！' },
      { key: 'whack', label: '打僵尸', desc: '僵尸冒头就敲！考验手速。' },
      { key: 'raining', label: '雨天种子', desc: '天上掉种子包，接住就能种。' },
      { key: 'vasebreaker', label: '花瓶终结者', desc: '打碎神秘罐子，小心僵尸。' },
      { key: 'izombie', label: '我是僵尸', desc: '这一次，你来指挥僵尸。' },
    ],
  },
  survival: {
    title: '生存模式',
    items: [
      { key: 'survival_day', label: '白天生存', desc: '白天草坪，波次无尽增强。' },
      { key: 'survival_night', label: '黑夜生存', desc: '黑夜墓园，蘑菇的战场。' },
      { key: 'survival_pool', label: '泳池生存', desc: '六行泳池，水陆两线作战。' },
      { key: 'survival_fog', label: '浓雾生存', desc: '浓雾弥漫，视野受限。' },
      { key: 'survival_roof', label: '屋顶生存', desc: '屋顶花盆，投手的主场。' },
    ],
  },
};

Screens.modeSelect = {
  group: 'challenge',
  hover: null,
  _cells: null,
  enter(group) { this.group = group || 'challenge'; },
  // 原版 ChallengeScreen 按钮布局: (38+col*155, 93+row*119) 104x115
  cells() {
    const g = MODE_GROUPS[this.group];
    const cells = [];
    g.items.forEach((it, i) => {
      cells.push({ ...it, x: 38 + (i % 5) * 155, y: 93 + Math.floor(i / 5) * 119, w: 104, h: 115 });
    });
    return cells;
  },
  draw(ctx) {
    const g = MODE_GROUPS[this.group];
    // 背景 (原版 Challenge_Background)
    const bg = img('challenge_background.jpg');
    if (bg) {
      ctx.drawImage(bg, 0, 0, 800, 600);
    } else {
      ctx.fillStyle = '#1a1206'; ctx.fillRect(0, 0, 800, 600);
      const bg1 = img('background1.jpg');
      if (bg1) { ctx.globalAlpha = 0.25; ctx.drawImage(bg1, -220, 0); ctx.globalAlpha = 1; }
      ctx.fillStyle = 'rgba(10,6,2,0.6)'; ctx.fillRect(0, 0, 800, 600);
    }
    // 标题 (原版挑战页标题木牌)
    pvzText(ctx, g.title, 400, 52, 36, '#ffe36a');
    pvzText(ctx, '点击选择一个玩法', 400, 86, 14, '#e8d9b5');
    const cells = this.cells();
    this._cells = cells;
    const hover = Screens.hover;
    cells.forEach((c, i) => {
      const hov = hover === 'mode' + i;
      ctx.save();
      // 按钮 (原版风格: 悬停亮框)
      ctx.fillStyle = hov ? 'rgba(120,90,40,0.55)' : 'rgba(60,44,20,0.55)';
      ctx.strokeStyle = hov ? '#ffe9a8' : 'rgba(90,70,40,0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, 10);
      ctx.fill(); ctx.stroke();
      // 图标 (植物缩略/僵尸头)
      const UIm = __getUI();
      const iconKey = {
        bowling: 'WALLNUT', whack: 'NORMAL', raining: 'PEASHOOTER',
        vasebreaker: 'PEASHOOTER', izombie: 'BUCKET',
        survival_day: 'SUNFLOWER', survival_night: 'PUFFSHROOM', survival_pool: 'LILYPAD',
        survival_fog: 'PLANTERN', survival_roof: 'CABBAGEPULT',
      }[c.key];
      let icon = null;
      if (iconKey && UIm) {
        icon = PLANTS[iconKey] ? UIm.getThumb(iconKey) : UIm.getZombieThumb(iconKey);
      }
      if (icon) ctx.drawImage(icon, c.x + (c.w - 56) / 2, c.y + 10, 56, 56);
      // 名称 + 简述
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#fff4d0';
      ctx.fillText(c.label, c.x + c.w / 2, c.y + 84);
      ctx.font = '11px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#c8b28a';
      ctx.fillText(c.desc.slice(0, 9), c.x + c.w / 2, c.y + 102);
      ctx.restore();
    });
    // 返回按钮 (原版 BACK_TO_MENU @ (18,568))
    this._back = { x: 18, y: 560, w: 120, h: 34 };
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    ctx.beginPath(); ctx.roundRect(18, 560, 120, 34, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('返回主菜单', 78, 582);
    ctx.restore();
    // 切换 小游戏⇆生存 (右下)
    const other = this.group === 'challenge' ? 'survival' : 'challenge';
    const otherLabel = other === 'challenge' ? '← 小游戏/解谜' : '生存模式 →';
    ctx.save();
    ctx.fillStyle = '#3a6a8a';
    ctx.beginPath(); ctx.roundRect(660, 560, 130, 34, 6); ctx.fill();
    ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(otherLabel, 725, 582);
    ctx.restore();
    this._swap = { x: 660, y: 560, w: 130, h: 34, group: other };
  },
  click(p, game) {
    if (this._back && inRect(p, this._back.x, this._back.y, this._back.w, this._back.h)) {
      game.audio.play('buttonclick');
      game.state = 'menu';
      return;
    }
    if (this._swap && inRect(p, this._swap.x, this._swap.y, this._swap.w, this._swap.h)) {
      game.audio.play('buttonclick');
      this.group = this._swap.group;
      return;
    }
    for (const c of (this._cells || [])) {
      if (inRect(p, c.x, c.y, c.w, c.h)) {
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
  hoverItem: null,
  bubble: null,          // 戴夫商品介绍气泡
  daveAnim: null,
  firstVisitDone: false,
  // 页定义 (原版 gStoreItemSpots: 每页 8 格, 上下两排)
  PAGES() {
    const all = SHOP_ITEMS;
    return [
      all.filter(i => ['slot8', 'poolcleaner', 'rake', 'roofcleaner', 'GATLINGPEA', 'TWINSUNFLOWER', 'GLOOMSHROOM', 'CATTAIL'].includes(i.key)),
      all.filter(i => ['SPIKEROCK', 'GOLDMAGNET', 'WINTERMELON', 'COBCANNON', 'IMITATER', 'slot9', 'slot10'].includes(i.key)),
      all.filter(i => ['goldwatering', 'fertilizer', 'bugspray', 'phonograph', 'glove'].includes(i.key)),
      all.filter(i => ['mushroomgarden', 'aquarium', 'wheelbarrow', 'stinky'].includes(i.key)),
    ];
  },
  // 原版 GetStorePosition: 前4格上排 (422+74i, 206), 后4格下排 (372+74(i-4), 310)
  itemPos(i) {
    return i <= 3
      ? { x: 422 + 74 * i, y: 206 }
      : { x: 372 + 74 * (i - 4), y: 310 };
  },
  enter() {
    this.page = 0;
    this.bubble = null;
    // 首次进店 → 戴夫开业对话 (原版 301-304)
    const game = Screens.game;
    if (game && !this.firstVisitDone && !game.daveSeen.shop) {
      const dialogs = Assets.data('dave_dialogs');
      const lines = [301, 302, 303, 304].map(id => (dialogs['CRAZY_DAVE_' + id] || '')).filter(t => t);
      if (lines.length) {
        this.bubble = { lines, line: 0, clickToContinue: true };
        game.markDaveSeen('shop');
      }
      this.firstVisitDone = true;
    }
    // 戴夫 reanim (原版 DrawCrazyDave @ (-42,+68))
    if (!this.daveAnim && RE.hasDef('CrazyDave')) {
      const d = Assets.reanim('CrazyDave');
      d.x = 60; d.y = 230;
      d.play('anim_idle', RE.LOOP, 18);
      this.daveAnim = d;
    }
  },
  draw(ctx) {
    const game = Screens.game;
    // ---- 背景 + 车 + 招牌 (原版 StoreScreen::Draw) ----
    const bg = img('store_background.jpg');
    if (bg) {
      ctx.drawImage(bg, 0, 0, 800, 600);
    } else {
      ctx.fillStyle = '#2a2018'; ctx.fillRect(0, 0, 800, 600);
    }
    const car = img('store_car.png');            // 后备箱开启的车
    if (car) ctx.drawImage(car, 196, 138);
    const hatch = img('store_hatchbackopen.png');
    if (hatch) ctx.drawImage(hatch, 299, 0);
    // 招牌 (原版 285, signPosY 轻微上下浮动)
    const sign = img('store_sign.png');
    if (sign) {
      const bob = Math.sin(Screens.t * 1.5) * 3;
      ctx.drawImage(sign, 285, 20 + bob);
    }
    // ---- 戴夫 (左侧) ----
    if (this.daveAnim) {
      this.daveAnim.update(1 / 60);
      this.daveAnim.draw(ctx);
    }
    // ---- 商品 (后备箱内两排) ----
    const pageItems = this.PAGES()[this.page] || [];
    this._cells = [];
    const t = Screens.t;
    pageItems.forEach((it, i) => {
      const pos = this.itemPos(i);
      const bought = game && game.purchased[it.key];
      const hov = this.hoverItem === i && !bought;
      const can = game && game.coins >= it.cost;
      const pop = bought ? 0 : (hov ? Math.sin(t * 6) * 2 : 0);
      this._cells.push({ x: pos.x, y: pos.y, w: 50, h: 87, item: it, i });
      ctx.save();
      ctx.translate(pos.x + 25, pos.y + 44 + pop);
      // 图标
      if (it.icon === 'plant' && PLANTS[it.key]) {
        const UIm = __getUI();
        const th = (UIm && UIm.getThumb) ? UIm.getThumb(it.key) : null;
        if (th) ctx.drawImage(th, -25, -34, 50, 68);
      } else {
        const ico = img(it.icon + '.png');
        if (ico) {
          const s = Math.min(64 / ico.width, 80 / ico.height, 1);
          ctx.drawImage(ico, -ico.width * s / 2, -ico.height * s / 2 - 10, ico.width * s, ico.height * s);
        } else {
          ctx.fillStyle = '#c9a86b';
          ctx.fillRect(-25, -34, 50, 68);
        }
      }
      // 价格牌 (原版 PriceTag 样式)
      if (!bought) {
        ctx.save();
        ctx.translate(0, 36);
        const pw = 46, ph = 18;
        ctx.fillStyle = '#f4e6b0';
        ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 3); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 12px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = can ? '#2a4a10' : '#a03030';
        ctx.fillText('$' + it.cost, 0, 1);
        ctx.restore();
      } else {
        // 售罄标签
        const sold = img('store_soldoutlabel.png');
        ctx.save();
        ctx.globalAlpha = 0.85;
        if (sold) ctx.drawImage(sold, -25, 10);
        else {
          ctx.fillStyle = 'rgba(120,110,90,0.8)';
          ctx.fillRect(-25, 20, 50, 16);
          ctx.font = 'bold 11px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText('已售出', 0, 32);
        }
        ctx.restore();
      }
      ctx.restore();
    });
    // ---- 金币栏 (原版 COINBANK @ 650,559, 金额 (766-w, 583) 绿色) ----
    const bank = img('coinbank.png');
    if (bank) ctx.drawImage(bank, 650, 559);
    else { ctx.fillStyle = '#3a2f1a'; ctx.beginPath(); ctx.roundRect(650, 559, 146, 36, 6); ctx.fill(); }
    ctx.save();
    ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(180,255,90)';
    ctx.fillText('$' + (game ? game.coins : 0), 762, 584);
    ctx.restore();
    // ---- 翻页按钮 (原版 Prev/Next) ----
    const prev = img('store_prevbutton.png');
    const next = img('store_nextbutton.png');
    const prevHov = img('store_prevbuttonhighlight.png');
    const nextHov = img('store_nextbuttonhighlight.png');
    this._prev = { x: 380, y: 425, w: 48, h: 44 };
    this._next = { x: 560, y: 425, w: 48, h: 44 };
    const pages = this.PAGES();
    const hasPrev = this.page > 0;
    const hasNext = this.page < pages.length - 1;
    const hovPrev = this._hoverBtn === 'prev', hovNext = this._hoverBtn === 'next';
    if (hasPrev) {
      const p = (hovPrev && prevHov) ? prevHov : prev;
      if (p) ctx.drawImage(p, this._prev.x, this._prev.y, 48, 44);
    }
    if (hasNext) {
      const p = (hovNext && nextHov) ? nextHov : next;
      if (p) ctx.drawImage(p, this._next.x, this._next.y, 48, 44);
    }
    // 页码 (原版 [STORE_PAGE] @ 470,500)
    ctx.save();
    ctx.font = '13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgb(80,80,80)';
    ctx.fillText(`第 ${this.page + 1} 页 / 共 ${pages.length} 页`, 470, 512);
    ctx.restore();
    // ---- 主菜单按钮 (原版 Store_MainMenuButton) ----
    const mmb = img(this._hoverBtn === 'mainmenu' ? 'store_mainmenubuttonhighlight.png' : 'store_mainmenubutton.png');
    this._mainmenu = { x: 40, y: 545, w: 150, h: 42 };
    if (mmb) ctx.drawImage(mmb, this._mainmenu.x, this._mainmenu.y, 150, 42);
    else {
      ctx.fillStyle = '#5a4a2a';
      ctx.beginPath(); ctx.roundRect(this._mainmenu.x, this._mainmenu.y, 150, 42, 8); ctx.fill();
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#f4e6b0';
      ctx.fillText('返回主菜单', 115, 572);
    }
    // ---- 戴夫气泡 (商品介绍 / 首次开店) ----
    if (this.bubble) {
      const bubbleImg = img('store_speechbubble2.png') || img('store_speechbubble.png');
      const bx = 150, by = 90, bw = 320, bh = 110;
      ctx.save();
      if (bubbleImg) {
        ctx.drawImage(bubbleImg, bx, by, bw, bh);
      } else {
        ctx.fillStyle = '#f8f4e0';
        ctx.strokeStyle = '#8a8a7a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill(); ctx.stroke();
      }
      const txt = this.bubble.lines[this.bubble.line] || '';
      ctx.fillStyle = '#3a3222';
      ctx.font = '15px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      this._wrapText(ctx, txt, bx + 24, by + 32, bw - 48, 20);
      // 继续指示
      const a = 0.5 + 0.5 * Math.sin(Screens.t * 4);
      ctx.globalAlpha = a;
      ctx.font = 'bold 12px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#8a7a3a';
      ctx.fillText(this.bubble.line < this.bubble.lines.length - 1 ? '点击继续 ▸' : '点击关闭 ✕', bx + bw - 90, by + bh - 14);
      ctx.restore();
    }
  },
  _wrapText(ctx, text, x, y, maxW, lineH) {
    let line = '', yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, x, yy); line = ch; yy += lineH;
      } else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
  },
  click(p, game) {
    // 气泡优先 (点击推进/关闭)
    if (this.bubble) {
      this.bubble.line++;
      if (this.bubble.line >= this.bubble.lines.length) this.bubble = null;
      game.audio.play('tap');
      return;
    }
    // 主菜单
    if (this._mainmenu && inRect(p, this._mainmenu.x, this._mainmenu.y, this._mainmenu.w, this._mainmenu.h)) {
      game.audio.play('gravebutton');
      game.state = 'menu';
      return;
    }
    // 翻页
    if (this._prev && inRect(p, this._prev.x, this._prev.y, this._prev.w, this._prev.h) && this.page > 0) {
      this.page--; game.audio.play('buttonclick'); return;
    }
    if (this._next && inRect(p, this._next.x, this._next.y, this._next.w, this._next.h) && this.page < this.PAGES().length - 1) {
      this.page++; game.audio.play('buttonclick'); return;
    }
    // 商品购买
    for (const c of (this._cells || [])) {
      if (inRect(p, c.x, c.y, c.w, c.h)) {
        const it = c.item;
        if (game.purchased[it.key]) { game.audio.play('buzzer'); return; }
        if (it.key === 'slot9' && !game.purchased['slot8']) { game.audio.play('buzzer'); return; }
        if (it.key === 'slot10' && !game.purchased['slot9']) { game.audio.play('buzzer'); return; }
        if (game.coins < it.cost) { game.audio.play('buzzer'); return; }
        if (game.buyItem(it.key)) {
          // 戴夫购买台词气泡
          this.bubble = { lines: [`谢谢惠临! ${it.label}是你的了!`], line: 0, clickToContinue: true };
          game.audio.play('points');
        }
        return;
      }
    }
  },
  updateHover(mouse) {
    this.hoverItem = null;
    this._hoverBtn = null;
    if (!mouse) return;
    for (const c of (this._cells || [])) {
      if (inRect(mouse, c.x, c.y, c.w, c.h)) { this.hoverItem = c.i; break; }
    }
    if (this._mainmenu && inRect(mouse, this._mainmenu.x, this._mainmenu.y, this._mainmenu.w, this._mainmenu.h)) this._hoverBtn = 'mainmenu';
    else if (this._prev && inRect(mouse, this._prev.x, this._prev.y, this._prev.w, this._prev.h) && this.page > 0) this._hoverBtn = 'prev';
    else if (this._next && inRect(mouse, this._next.x, this._next.y, this._next.w, this._next.h) && this.page < this.PAGES().length - 1) this._hoverBtn = 'next';
    // 悬停商品 → 戴夫介绍气泡 (原版 SetBubbleText)
    if (this.hoverItem !== null && !this.bubble) {
      const game = Screens.game;
      const pages = this.PAGES();
      const it = pages[this.page] && pages[this.page][this.hoverItem];
      if (it && game && !game.purchased[it.key]) {
        if (this._lastBubbleItem !== this.hoverItem + this.page * 100) {
          this._lastBubbleItem = this.hoverItem + this.page * 100;
          this.bubble = { lines: [it.label + ': ' + it.desc + (it.consumable ? ` (含${it.consumable}包, 用完可再买)` : '')], line: 0, auto: true, t: 0 };
        }
      }
    } else if (!this.hoverItem && this.bubble && this.bubble.auto) {
      this.bubble = null;
      this._lastBubbleItem = null;
    }
    if (this.bubble && this.bubble.auto) {
      this.bubble.t = (this.bubble.t || 0) + 1 / 60;
      if (this.bubble.t > 6) { this.bubble = null; this._lastBubbleItem = null; }
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
  if (g && g.state === 'shop') {
    this.shop.updateHover(mouse);
  }
  // 图鉴悬停 (网格/按钮)
  if (g && g.state === 'almanac') {
    const UIm = (window.__mods && window.__mods['ui']) || require('./ui');
    const UI = UIm && UIm.UI;
    if (UI) {
      if (UI._almClose && inRect(mouse, UI._almClose.x, UI._almClose.y, UI._almClose.w, UI._almClose.h)) this.hover = 'alm_close';
      else if (g.almanac.tab === 'index') {
        for (const b of (UI._almIndexBtns || [])) {
          if (inRect(mouse, b.x, b.y, b.w, b.h)) { this.hover = 'alm_' + b.k; break; }
        }
      } else {
        if (UI._almBack && inRect(mouse, UI._almBack.x, UI._almBack.y, UI._almBack.w, UI._almBack.h)) this.hover = 'alm_back';
        (UI.almanacCells || []).forEach((c, i) => {
          if (inRect(mouse, c.x, c.y, c.w, c.h)) this.hover = 'almcell' + i;
        });
      }
    }
  }
  if (g && g.state === 'options' && this.options.rects && this.options.rects.unlock) {
    const u = this.options.rects.unlock;
    if (inRect(mouse, u.x, u.y, u.w, u.h)) this.hover = 'unlock';
  }
};

// ================================================================
// 禅镜花园 (原版 ZenGarden.cpp: 8x4花盆 + 浇水/施肥/除虫/留声机 + 卖植物)
// 通关 5-4 (level 44) 解锁; 进度存 localStorage
// ================================================================
Screens.zengarden = {
  CELLS: { cols: 8, rows: 4 },
  // 花盆位置 (温室内居中网格)
  cellPos(col, row) {
    return { x: 172 + col * 70, y: 150 + row * 88 };
  },
  // ---------- 存档 ----------
  load() {
    try {
      const d = JSON.parse(localStorage.getItem('webpvz_garden') || 'null');
      // 格式校验: 必须是 4x8 网格 (旧版/异格式存档直接重置, 防崩溃)
      if (d && d.plants && Array.isArray(d.plants) && d.plants.length === 4 &&
          d.plants.every(row => Array.isArray(row) && row.length === 8)) {
        this.data = d;
        return;
      }
    } catch (e) { }
    // 初始: 3 株新芽 (原版 DEFAULT_CURR_NUM_NEW_GARDEN_PLANT = 3)
    this.data = { plants: this.emptyCells(), fertilizer: 5, bugspray: 2, garden: 'greenhouse' };
    let placed = 0;
    for (let r = 0; r < 4 && placed < 3; r++) {
      for (let c = 0; c < 8 && placed < 3; c++) {
        if ((c + r) % 3 === 0 && !this.data.plants[r][c]) {
          this.data.plants[r][c] = this.newPlant(null);
          placed++;
        }
      }
    }
    this.save();
  },
  emptyCells() {
    return Array.from({ length: 4 }, () => Array(8).fill(null));
  },
  newPlant(type) {
    // 原版 PottedPlant: mFeedingsPerGrow 随机3-5
    return {
      type: type || null,          // null = 新芽
      stage: 0,                    // 0新芽 1小 2中 3成熟
      fed: 0, needMax: 3 + Math.floor(Math.random() * 3),
      need: null,                  // null | 'water' | 'bugspray' | 'phonograph' (成熟后需求)
      happy: 0,                    // 刚被满足的开心计时
    };
  },
  save() {
    try { localStorage.setItem('webpvz_garden', JSON.stringify(this.data)); } catch (e) { }
  },
  enter() {
    if (!this.data) this.load();
    this.tool = 'water';           // water|fertilizer|bugspray|phonograph|glove|sell
    this.heldPlant = null;         // 手套移动中的植物
    this.coins = [];
    this._models = {};
    // 蜗牛 (原版 Stinky: 已购买才出现)
    const game = Screens.game;
    this.stinky = game && game.purchased.stinky ? { x: 400, y: 520, dir: 1, t: 0 } : null;
    // Dave 教程对话 (原版 2100, 首次)
    if (game && !game.daveSeen.zengarden) {
      const dialogs = Assets.data('dave_dialogs');
      const lines = [2100, 2101, 2102].map(id => (dialogs['CRAZY_DAVE_' + id] || '')).filter(t => t);
      if (!lines.length) lines.push('欢迎来到禅镜花园！', '给植物浇水施肥，它们会报答你的！');
      this.bubble = { lines, line: 0 };
      game.markDaveSeen('zengarden');
    } else this.bubble = null;
  },
  // 植物模型 (reanim 缓存)
  model(type, stage) {
    const key = type + ':' + stage;
    if (this._models[key]) return this._models[key];
    let r = null;
    try {
      if (!type) {
        // 新芽: 静态 anim_sprout 图 (由 draw 处理)
        r = null;
      } else {
        const def = PLANTS[type];
        if (def && RE.hasDef(def.reanim)) {
          r = Assets.reanim(def.reanim);
          const base = def.anim || 'anim_idle';
          r.play(r.animExists(base) ? base : 'anim_idle', RE.LOOP, 10);
        }
      }
    } catch (e) { r = null; }
    this._models[key] = r;
    return r;
  },
  // ---------- 更新 ----------
  update(dt) {
    if (!this.data) return;
    // 掉落金币动画
    for (const c of this.coins) {
      c.t += dt;
      c.y += 60 * dt;
      if (c.y > c.ground) c.y = c.ground;
      if (c.t > 0.8 && !c.collected) {
        c.collected = true;
        const game = Screens.game;
        if (game) { game.coins += c.value; game.saveShop(); game.audio.play('points'); }
      }
    }
    this.coins = this.coins.filter(c => c.t < 1.3);
    // 蜗牛巡游
    if (this.stinky) {
      const s = this.stinky;
      s.t += dt;
      s.x += s.dir * 24 * dt;
      if (s.x > 740) s.dir = -1;
      if (s.x < 60) s.dir = 1;
    }
    // 模型动画推进
    for (const k of Object.keys(this._models)) {
      const m = this._models[k];
      if (m && m.update) m.update(dt);
    }
    // 植物开心计时
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const p = this.data.plants[r][c];
      if (p && p.happy > 0) p.happy -= dt;
    }
  },
  // ---------- 绘制 ----------
  draw(ctx) {
    if (!this.data) this.load();
    const game = Screens.game;
    const t = Screens.t;
    // 背景 (温室 / 蘑菇园 / 水族馆)
    const bgName = {
      greenhouse: 'background_greenhouse.jpg',
      mushroomgarden: 'background_mushroomgarden.jpg',
      aquarium: 'aquarium1.jpg',
    }[this.data.garden] || 'background_greenhouse.jpg';
    const bg = img(bgName);
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#2a3a1a'; ctx.fillRect(0, 0, 800, 600); }
    // 标题
    pvzText(ctx, '禅 镜 花 园', 400, 40, 30, '#ffe9a8');
    // 花盆 + 植物
    const potImg = img('pot_bottom.png');
    const sproutImg = img('anim_sprout.png');
    const mouse = Screens.mouse || { x: -1, y: -1 };
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.data.plants[r][c];
        const pos = this.cellPos(c, r);
        // 花盆
        if (potImg) {
          ctx.save();
          ctx.globalAlpha = 0.95;
          ctx.drawImage(potImg, pos.x + 8, pos.y + 26, 54, 40);
          ctx.restore();
        } else {
          ctx.fillStyle = '#a05a28';
          ctx.beginPath(); ctx.roundRect(pos.x + 10, pos.y + 34, 50, 30, 6); ctx.fill();
        }
        if (!p) continue;
        // 悬停高亮
        const hov = mouse.x > pos.x && mouse.x < pos.x + 66 && mouse.y > pos.y && mouse.y < pos.y + 80;
        // 植物本体
        if (!p.type) {
          // 新芽
          if (sproutImg) {
            ctx.save();
            const s = 2 + Math.sin(t * 3 + c) * 0.1;
            ctx.translate(pos.x + 33, pos.y + 22);
            ctx.scale(s, s);
            ctx.drawImage(sproutImg, -9, -7);
            ctx.restore();
          }
        } else {
          const m = this.model(p.type, p.stage);
          if (m) {
            ctx.save();
            ctx.translate(pos.x + 33, pos.y + 30);
            const scale = [0, 0.45, 0.65, 0.85][p.stage] || 0.85;
            ctx.scale(scale, scale);
            m.setPosition(0, 0);
            m.draw(ctx);
            ctx.restore();
          }
        }
        // 需求图标 (原版 zen_need_icons: 浇水/肥料/除虫)
        if (p.need && !p.happy) {
          const ni = img('zen_need_icons.png');
          const bob = Math.sin(t * 4 + r + c) * 3;
          if (ni) {
            const idx = p.need === 'water' ? 0 : p.need === 'fertilizer' ? 1 : 2;
            ctx.drawImage(ni, idx * 30, 0, 30, 30, pos.x + 18, pos.y - 6 + bob, 30, 30);
          } else {
            ctx.fillStyle = p.need === 'water' ? '#4a90d8' : '#8a6a2a';
            ctx.beginPath(); ctx.arc(pos.x + 33, pos.y - 2 + bob, 7, 0, Math.PI * 2); ctx.fill();
          }
        } else if (p.stage < 3 && p.fed >= p.needMax) {
          // 等待施肥: 金色肥料图标
          const fImg = img('fertilizer.png');
          const bob = Math.sin(t * 4 + r) * 3;
          if (fImg) ctx.drawImage(fImg, pos.x + 20, pos.y - 8 + bob, 26, 26);
        }
        // 开心发光 (原版 ZEN_GLOW)
        if (p.happy > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.5, p.happy);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(180,255,120,0.5)';
          ctx.beginPath(); ctx.ellipse(pos.x + 33, pos.y + 30, 34, 40, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // 悬停框
        if (hov) {
          ctx.strokeStyle = 'rgba(255,233,168,0.9)'; ctx.lineWidth = 2.5;
          ctx.strokeRect(pos.x + 2, pos.y + 2, 62, 76);
        }
      }
    }
    // 掉落金币
    for (const c of this.coins) {
      const coinImg = img('coin.png');
      ctx.save();
      ctx.globalAlpha = c.t > 0.9 ? Math.max(0, 1 - (c.t - 0.9) / 0.4) : 1;
      if (coinImg) {
        ctx.translate(c.x, c.y - (1 - Math.min(1, c.t * 2)) * 60);
        ctx.rotate(c.t * 4);
        ctx.drawImage(coinImg, -14, -14, 28, 28);
      } else {
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // 蜗牛
    if (this.stinky) {
      const s = this.stinky;
      const shell = img('stinky_shell.png');
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.dir, 1);
      const bob = Math.sin(s.t * 6) * 2;
      if (shell) ctx.drawImage(shell, -20, -16 + bob, 40, 38);
      else {
        ctx.fillStyle = '#a8885a';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // ---------- 工具栏 (原版 GetZenButtonRect: 从 x=30 起每格一工具) ----------
    this._tools = [];
    const TOOLS = [
      { k: 'water', label: '水壶', img: game && game.purchased.goldwatering ? 'wateringcangold.png' : 'wateringcan.png' },
      { k: 'fertilizer', label: '肥料', img: 'fertilizer.png', count: this.data.fertilizer },
      { k: 'bugspray', label: '除虫', img: 'zengarden_bugspray_bottle.png', count: this.data.bugspray },
      { k: 'phonograph', label: '唱片', img: 'phonograph.png', needBuy: !game.purchased.phonograph },
      { k: 'glove', label: '手套', img: 'zen_gardenglove.png', needBuy: !game.purchased.glove },
      { k: 'sell', label: '出售', img: 'zen_moneysign.png' },
    ];
    TOOLS.forEach((tl, i) => {
      const x = 30 + i * 66, y = 522;
      this._tools.push({ ...tl, x, y, w: 60, h: 60 });
      ctx.save();
      const sel = this.tool === tl.k;
      // 槽底
      ctx.fillStyle = sel ? 'rgba(200,160,60,0.85)' : 'rgba(60,44,20,0.75)';
      ctx.strokeStyle = sel ? '#ffe9a8' : 'rgba(90,70,40,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y, 60, 60, 8); ctx.fill(); ctx.stroke();
      const tim = img(tl.img);
      if (tim) ctx.drawImage(tim, x + 8, y + 6, 44, 44);
      // 数量角标
      if (tl.count !== undefined) {
        ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText(String(tl.count), x + 54, y + 16);
        ctx.fillText(String(tl.count), x + 54, y + 16);
      }
      if (tl.needBuy) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, 60, 60);
        ctx.globalAlpha = 1;
        ctx.font = 'bold 11px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffd34d';
        ctx.fillText('需购买', x + 30, y + 54);
      }
      ctx.restore();
    });
    // 返回主菜单 + 切换花园
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    ctx.beginPath(); ctx.roundRect(700, 552, 90, 38, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('主菜单', 745, 576);
    ctx.restore();
    this._back = { x: 700, y: 552, w: 90, h: 38 };
    // 下一花园 (原版 NEXT_GARDEN 固定 x=564)
    const gardens = ['greenhouse'];
    if (game.purchased.mushroomgarden) gardens.push('mushroomgarden');
    if (game.purchased.aquarium) gardens.push('aquarium');
    if (gardens.length > 1) {
      const ng = img('zen_nextgarden.png');
      this._nextGarden = { x: 560, y: 20, w: 60, h: 60 };
      if (ng) ctx.drawImage(ng, 560, 20, 60, 60);
      const gi = gardens.indexOf(this.data.garden);
      pvzText(ctx, gardens[(gi + 1) % gardens.length] === 'greenhouse' ? '温室' : gardens[(gi + 1) % gardens.length] === 'mushroomgarden' ? '蘑菇园' : '水族馆', 590, 100, 13, '#e8d9b5');
    } else this._nextGarden = null;
    // 手套持有植物预览
    if (this.heldPlant) {
      const thumb = __getUI() && __getUI().getThumb(this.heldPlant.type);
      if (thumb) ctx.drawImage(thumb, mouse.x - 25, mouse.y - 35, 50, 70);
    }
    // 选中工具光标
    if (this.tool === 'water') {
      const wimg = img(game && game.purchased.goldwatering ? 'wateringcangold.png' : 'wateringcan.png');
      if (wimg) ctx.drawImage(wimg, mouse.x - 16, mouse.y - 30, 36, 36);
    }
    // 戴夫气泡
    if (this.bubble) {
      ctx.save();
      const bx = 420, by = 430, bw = 320, bh = 96;
      ctx.fillStyle = 'rgba(248,244,224,0.96)';
      ctx.strokeStyle = '#8a8a7a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a3222';
      ctx.font = '15px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      const txt = this.bubble.lines[this.bubble.line] || '';
      // 简单换行
      let line = '', yy = by + 30;
      for (const ch of txt) {
        if (ctx.measureText(line + ch).width > bw - 40) { ctx.fillText(line, bx + 20, yy); line = ch; yy += 20; }
        else line += ch;
      }
      if (line) ctx.fillText(line, bx + 20, yy);
      const a = 0.5 + 0.5 * Math.sin(Screens.t * 4);
      ctx.globalAlpha = a;
      ctx.font = 'bold 12px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#8a7a3a';
      ctx.fillText('点击继续', bx + bw - 70, by + bh - 10);
      ctx.restore();
    }
  },
  // ---------- 交互 ----------
  click(p, game) {
    // 气泡优先
    if (this.bubble) {
      this.bubble.line++;
      if (this.bubble.line >= this.bubble.lines.length) this.bubble = null;
      game.audio.play('tap');
      return;
    }
    // 返回
    if (this._back && inRect(p, this._back.x, this._back.y, this._back.w, this._back.h)) {
      game.audio.play('gravebutton');
      game.state = 'menu';
      return;
    }
    // 切换花园
    if (this._nextGarden && inRect(p, this._nextGarden.x, this._nextGarden.y, this._nextGarden.w, this._nextGarden.h)) {
      const gardens = ['greenhouse'];
      if (game.purchased.mushroomgarden) gardens.push('mushroomgarden');
      if (game.purchased.aquarium) gardens.push('aquarium');
      const gi = gardens.indexOf(this.data.garden);
      this.data.garden = gardens[(gi + 1) % gardens.length];
      this.save();
      game.audio.play('gravebutton');
      return;
    }
    // 工具选择
    for (const t of (this._tools || [])) {
      if (inRect(p, t.x, t.y, t.w, t.h)) {
        if (t.needBuy) { game.audio.play('buzzer'); return; }
        this.tool = t.k;
        game.audio.play('seedlift');
        return;
      }
    }
    // 植物点击
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        const pos = this.cellPos(c, r);
        if (!(p.x > pos.x && p.x < pos.x + 66 && p.y > pos.y && p.y < pos.y + 80)) continue;
        this.useTool(r, c, game);
        return;
      }
    }
  },
  useTool(r, c, game) {
    const plant = this.data.plants[r][c];
    const tool = this.tool;
    // 手套: 移动植物 (拿起/放下)
    if (tool === 'glove') {
      if (this.heldPlant) {
        if (!plant) {
          this.data.plants[r][c] = this.heldPlant;
          this.heldPlant = null;
          this.save();
          game.audio.play('plant');
        } else game.audio.play('buzzer');
      } else if (plant) {
        this.heldPlant = plant;
        this.data.plants[r][c] = null;
        this.save();
        game.audio.play('shovel');
      }
      return;
    }
    if (!plant) { game.audio.play('buzzer'); return; }
    // 出售 (原版 GetPlantSellPrice: 芽1500 小3000 中5000 成8000)
    if (tool === 'sell') {
      if (!plant.type) { game.audio.play('buzzer'); return; }
      const price = [0, 3000, 5000, 8000][plant.stage] || 8000;
      game.coins += price;
      game.saveShop();
      this.data.plants[r][c] = null;
      this.save();
      game.audio.play('points');
      this.coins.push({ x: this.cellPos(c, r).x + 33, y: this.cellPos(c, r).y, ground: this.cellPos(c, r).y + 40, value: Math.round(price / 100), t: 0, collected: false });
      return;
    }
    // 浇水 (原版 PlantWatered: 掉1银币; 满足需求开心)
    if (tool === 'water') {
      if (plant.need === 'water') {
        plant.need = null;
        plant.happy = 3;
        this.dropCoin(r, c, 25);
      } else if (plant.stage < 3 && plant.fed < plant.needMax) {
        plant.fed++;
        this.dropCoin(r, c, 10);
      } else {
        game.audio.play('tap');
        return;
      }
      game.audio.play('plant_water');
      this.save();
      return;
    }
    // 肥料 (原版 PlantFertilized: 升阶, 各阶段掉金币/钻石)
    if (tool === 'fertilizer') {
      if (this.data.fertilizer <= 0) { game.audio.play('buzzer'); return; }
      if (plant.need === 'fertilizer') {
        plant.need = null;
        plant.happy = 3;
        this.dropCoin(r, c, 25);
      } else if (plant.stage < 3 && plant.fed >= plant.needMax) {
        this.data.fertilizer--;
        plant.stage++;
        plant.fed = 0;
        plant.needMax = 3 + Math.floor(Math.random() * 3);
        // 新芽 → 小苗: 随机变成真植物 (原版 PickRandomSeedType)
        if (plant.stage === 1 && !plant.type) {
          const pool = require('./data').SEED_ORDER;
          plant.type = pool[Math.floor(Math.random() * pool.length)];
        }
        // 升到成熟: 掉钻石 (原版 FULL → 2 钻石)
        if (plant.stage === 3) this.dropCoin(r, c, 100);
        else this.dropCoin(r, c, 25);
      } else { game.audio.play('tap'); return; }
      game.audio.play('plantgrow');
      this.save();
      return;
    }
    // 除虫 (原版 PlantFulfillNeed)
    if (tool === 'bugspray') {
      if (this.data.bugspray <= 0) { game.audio.play('buzzer'); return; }
      if (plant.need === 'bugspray') {
        this.data.bugspray--;
        plant.need = null;
        plant.happy = 3;
        this.dropCoin(r, c, 25);
        game.audio.play('plant2');
        this.save();
      } else game.audio.play('tap');
      return;
    }
    // 留声机 (原版 PlantFulfillNeed)
    if (tool === 'phonograph') {
      if (plant.need === 'phonograph') {
        plant.need = null;
        plant.happy = 3;
        this.dropCoin(r, c, 25);
        game.audio.play('phonograph');
        this.save();
      } else game.audio.play('tap');
      return;
    }
  },
  dropCoin(r, c, value) {
    const pos = this.cellPos(c, r);
    this.coins.push({ x: pos.x + 33, y: pos.y, ground: pos.y + 44, value, t: 0, collected: false });
  },
  // 需求刷新 (进入花园时: 成熟植物随机产生需求)
  refreshNeeds() {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const p = this.data.plants[r][c];
      if (p && p.stage === 3 && !p.need && Math.random() < 0.3) {
        p.need = ['water', 'bugspray', 'phonograph'][Math.floor(Math.random() * 3)];
      }
    }
    this.save();
  },
};

if (typeof module !== 'undefined') module.exports = { Screens, pvzText, inRect };
