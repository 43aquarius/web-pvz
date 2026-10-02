// ============================================================
// screens.js — 原版界面系统 (reanim 驱动)
// 主菜单: SelectorScreen.reanim 完整移植 (GameSelector.cpp)
//   anim_open 滑入(30fps) → anim_sign 木牌落下 → 静止
//   云×6 独立实例漂移 | 草叶 anim_grass 循环摇摆 | 花×3 静态
//   按钮位置 = 轨道变换 (TrackButton) | 悬停 = setImageOverride 高亮
// 标题屏: titlescreen.jpg + 载入草条 | 奖励/纸条/失败/选项: 原版素材
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, SEED_ORDER, SHOP_ITEMS, GARDEN_PLANTS, availablePlants, awardPlantForLevel, ZOMBIE_NOTES } = require('./data');
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
    B.push({ k: 'locked', x: vx, y: vy, w: 266, h: 123 });
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
      // #3/#15/#16: 原版无额外文字 — 进度由冒险按钮上的关卡数字 cel 呈现
    }
    // 锁定按钮提示 (悬停)
    if (hover === 'locked') {
      pvzText(ctx, '尚未开放', 400, 240, 18, '#cfcfcf');
    }
    // ---- 戴夫的杂货车 → 商店 (原版: 通关 3-1 找到车钥匙; selectorscreen_store 原版素材 #1) ----
    if (game && game.shopUnlocked && game.shopUnlocked()) {
      const cx = 90, cy = 372, cw2 = 158, ch2 = 118;
      this.shopRect = { x: cx, y: cy, w: cw2, h: ch2 };
      const hov2 = inRect(Screens.mouse || { x: -1, y: -1 }, cx, cy, cw2, ch2);
      const storeImg = img(hov2 ? 'selectorscreen_storehighlight.png' : 'selectorscreen_store.png');
      if (storeImg) {
        ctx.drawImage(storeImg, cx, cy, cw2, ch2);
      } else {
        // 素材缺失兜底 (简化车)
        ctx.save();
        ctx.translate(cx + cw2 / 2, cy + ch2 / 2);
        ctx.fillStyle = hov2 ? '#d94f3a' : '#b23a28';
        ctx.beginPath(); ctx.roundRect(-cw2 / 2 + 8, -14, cw2 - 22, 34, 7); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(-cw2 / 2 + 24, 22, 11, 0, Math.PI * 2); ctx.arc(cw2 / 2 - 22, 22, 11, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        pvzText(ctx, '戴夫杂货店', cx + cw2 / 2, cy + ch2 - 6, 16, hov2 ? '#ffffff' : '#ffe9a8');
      }
    } else {
      this.shopRect = null;
    }
    // ---- 禅园入口 (原版: 通关 5-5 解锁; selectorscreen_zengarden 素材 #14) ----
    if (game && game.gardenUnlocked) {
      const gx = 560, gy = 500, gw = 170, gh = 78;
      this.gardenRect = { x: gx, y: gy, w: gw, h: gh };
      const hov3 = inRect(Screens.mouse || { x: -1, y: -1 }, gx, gy, gw, gh);
      const zgImg = img(hov3 ? 'selectorscreen_zengardenhighlight.png' : 'selectorscreen_zengarden.png');
      if (zgImg) ctx.drawImage(zgImg, gx, gy, gw, gh);
      else pvzText(ctx, '禅 镜 花 园', gx + gw / 2, gy + gh / 2 + 8, 20, hov3 ? '#ffffff' : '#ffe9a8');
    } else {
      this.gardenRect = null;
    }
  },

  click(p, game) {
    // 禅园入口
    if (this.gardenRect && inRect(p, this.gardenRect.x, this.gardenRect.y, this.gardenRect.w, this.gardenRect.h)) {
      game.audio.play('gravebutton');
      game.state = 'garden';
      const gm = (window.__mods && window.__mods['garden']) || require('./garden');
      gm.Garden.enter();
      return;
    }
    // 戴夫商店入口
    if (this.shopRect && inRect(p, this.shopRect.x, this.shopRect.y, this.shopRect.w, this.shopRect.h)) {
      game.audio.play('gravebutton');
      Assets.ensureShop && Assets.ensureShop();
      game.state = 'shop';
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
      } else if (b.k === 'shop') {
        game.audio.play('gravebutton');
        game.state = 'shop';
      } else if (b.k === 'almanac') {
        game.audio.play('gravebutton');
        game.state = 'almanac'; game.almanac.selected = null;
        Assets.ensureAlmanac && Assets.ensureAlmanac(game.almanac.tab);
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
  pages() {
    return [
      [
        ['—— 基 础 玩 法 ——', '#8a4a10'],
        ['· 收集阳光(天降+向日葵), 点卡再点草坪种植', '#4a2f10'],
        ['· 铲子移除植物; 铲一次自动回位', '#4a2f10'],
        ['· 僵尸进屋触发割草机, 割草机只能用一次', '#4a2f10'],
        ['· 夜晚无天降阳光, 蘑菇免阳光但白天睡觉', '#4a2f10'],
        ['· 咖啡豆可以唤醒睡觉的蘑菇', '#4a2f10'],
        ['', ''],
        ['—— 冒险模式 ——', '#8a4a10'],
        ['· 1-1 → 5-10 共 50 关, X-5/X-10 有惊喜', '#4a2f10'],
        ['· 屋顶需先摆花盆; 泳池需先铺睡莲', '#4a2f10'],
        ['· 通关解锁新植物, 疯狂戴夫随时来串门', '#4a2f10'],
      ],
      [
        ['—— 玩玩小游戏 ——', '#8a4a10'],
        ['· 坚果保龄球: 传送带上滚出坚果撞飞僵尸', '#4a2f10'],
        ['· 打僵尸: 冒头就敲, 考验手速 (原版 2-5)', '#4a2f10'],
        ['· 雨天种子: 天降种子包, 接住就能种', '#4a2f10'],
        ['', ''],
        ['—— 解谜模式 ——', '#8a4a10'],
        ['· 罐子僵尸: 打碎罐子, 藏着植物或僵尸', '#4a2f10'],
        ['· 我不是僵尸: 你指挥僵尸, 吃到脑子获胜', '#4a2f10'],
        ['  (植物是纸板做的, 不会还手!)', '#7a6a4a'],
        ['', ''],
        ['—— 生存模式 ——', '#8a4a10'],
        ['· 白天/黑夜/泳池/浓雾/屋顶五张地图', '#4a2f10'],
        ['· 波次不断增强, 撑得越久越强!', '#4a2f10'],
      ],
      [
        ['—— 戴夫杂货店 ——', '#8a4a10'],
        ['· 击败僵尸掉金币, 攒钱找疯狂戴夫', '#4a2f10'],
        ['· 可买: 耙子/卡槽扩容/泳池屋顶清洁车', '#4a2f10'],
        ['· 升级植物: 机枪射手/双子向日葵/冰西瓜…', '#4a2f10'],
        ['', ''],
        ['—— 禅镜花园 ——', '#8a4a10'],
        ['· 通关 5-5 解锁, 主菜单随时进入', '#4a2f10'],
        ['· 给盆栽浇水三次长大一阶', '#4a2f10'],
        ['· 长成的盆栽会周期性产金币', '#4a2f10'],
        ['· 肥料秒长大, 杀虫剂让盆栽吐金币', '#4a2f10'],
        ['· Stinky 蜗牛会自动帮你捡金币', '#4a2f10'],
      ],
    ];
  },
  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
    const dlg = img('option_dialog.png');
    if (dlg) ctx.drawImage(dlg, 115, 55, 570, 480);
    else { ctx.fillStyle = '#c8b28a'; ctx.fillRect(115, 55, 570, 480); }
    pvzText(ctx, '怎 么 玩', 400, 105, 30, '#4a2f10');
    pvzText(ctx, `第 ${this.page + 1} / 3 页  (点击翻页)`, 400, 130, 13, '#7a5a30');
    const lines = this.pages()[this.page];
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '16px "Noto Sans SC", sans-serif';
    let y = 172;
    for (const [txt, col] of lines) { if (txt) { ctx.fillStyle = col; ctx.fillText(txt, 150, y); } y += 29; }
    ctx.restore();
    pvzText(ctx, '点击返回', 400, 505, 18, '#6b1c04');
  },
  click(p, game) {
    // 返回按钮 (右下角)
    if (p.x > 640 && p.y > 480) { game.audio.play('buttonclick'); game.state = 'menu'; return; }
    game.audio.play('tap');
    this.page = (this.page + 1) % 3;   // 点正文翻页
  },
};

// ================================================================
// 奖励屏 — 通关后展示新植物 (原版 AwardScreen: 种子包从天而降 + 弹跳)
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
      // 种子包掉落动画 (#24: 从顶部掉下 + 落地弹跳 + 缩放闪现)
      const packet = img('seedpacket_larger.png');
      const dropT = Math.min(1, t / 0.75);
      const ease = 1 - Math.pow(1 - dropT, 2);          // ease-out 下落
      let y = -320 + (265 + 320) * ease;
      let rot = (1 - ease) * 0.6;
      if (t > 0.75) {
        // 落地后弹跳 (衰减)
        const bt = t - 0.75;
        y = 265 - Math.abs(Math.sin(bt * 7)) * 46 * Math.exp(-bt * 3.2);
        rot = Math.sin(bt * 5) * 0.12 * Math.exp(-bt * 3.5);
      }
      const bob = t > 2 ? Math.sin((t - 2) * 2) * 5 : 0;
      ctx.save();
      ctx.translate(400, y + bob);
      ctx.rotate(rot);
      if (packet) ctx.drawImage(packet, -80, -100, 160, 200);
      const thumb = __getUI() ? __getUI().getThumb(type) : null;
      if (thumb) ctx.drawImage(thumb, -50, -78, 100, 140);
      // 闪现光效
      if (t > 0.7 && t < 1.4) {
        ctx.globalAlpha = 0.5 * (1.4 - t) / 0.7;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-80, -100, 160, 200);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (t > 0.9) pvzText(ctx, '你获得了新植物!', 400, 420, 26, '#b8ff7a');
      if (t > 1.2) pvzText(ctx, PLANTS[type] ? PLANTS[type].cn : type, 400, 458, 34, '#ffffff');
    } else {
      pvzText(ctx, '你击败了所有僵尸!', 400, 300, 30, '#b8ff7a');
      const trophy = img('trophy_hi_res.png');
      if (trophy) ctx.drawImage(trophy, 400 - 83, 200, 166, 136);
    }
    const a = t > 1.5 ? 0.5 + 0.5 * Math.sin(t * 3) : 0;
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '点 击 继 续', 400, 540, 24, '#ffe9a8');
    ctx.restore();
  },
  click(p, game) { if (Screens.t > 0.6) game.afterAward(); },
};

// ================================================================
// 纸条屏 — X-5 / X-10 僵尸纸条 (原版: zombienote 素材 + 手写字迹)
// ================================================================
Screens.note = {
  draw(ctx) {
    ctx.fillStyle = '#0a0805'; ctx.fillRect(0, 0, 800, 600);
    const t = Screens.t;
    const note = img('zombienote.jpg') || img('zombienote.png');
    const w = 560, h = w * 427 / 654;
    ctx.save();
    ctx.translate(400, 300);
    // 弹入: 从顶部掉落 + 微旋转 (原版纸条滑入)
    const drop = Math.min(1, t / 0.5);
    const ease = 1 - Math.pow(1 - drop, 3);
    ctx.translate(0, (1 - ease) * -400);
    ctx.rotate(Math.sin(t * 0.8) * 0.012);
    if (note) {
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 30;
      ctx.drawImage(note, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = '#d8cfa0'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = '#b8a878'; ctx.lineWidth = 3;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + 24, -h / 2 + i * h / 5); ctx.lineTo(w / 2 - 24, -h / 2 + i * h / 5); ctx.stroke(); }
    }
    // 手写字迹 (楷体风格, 深褐墨色, 微倾斜 — 原版僵尸字迹风格)
    const game = Screens.game;
    const lv = game ? game.levelId : 5;
    const text = ZOMBIE_NOTES[lv] || ZOMBIE_NOTES[10] || '';
    if (text) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(58,38,20,0.92)';
      ctx.font = 'bold 27px "Kaiti SC", "KaiTi", "STKaiti", "LXGW WenKai", "Noto Sans SC", serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.rotate(-0.03);
      this.wrapHand(ctx, text, 0, -h / 2 + 96, w - 90, 44);
      ctx.restore();
    }
    ctx.restore();
    pvzText(ctx, '僵尸留下了神秘的纸条…', 400, 60, 24, '#c8b28a');
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
const MODE_GROUPS = {
  challenge: {
    title: '玩玩小游戏 · 解谜模式',
    items: [
      { key: 'bowling', label: '坚果保龄球', desc: '传送带上滚出坚果，把僵尸撞飞！' },
      { key: 'whack', label: '打僵尸', desc: '僵尸冒头就敲！考验手速。' },
      { key: 'raining', label: '雨天种子', desc: '天上掉种子包，接住就能种。' },
      { key: 'vasebreaker', label: '罐子僵尸', desc: '打碎神秘罐子，小心僵尸。' },
      { key: 'izombie', label: '我不是僵尸', desc: '这一次，你来指挥僵尸。' },
    ],
  },
  survival: {
    title: '生存模式 · 无尽挑战',
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
  cells() {
    const g = MODE_GROUPS[this.group];
    const cells = [];
    g.items.forEach((it, i) => {
      cells.push({ ...it, x: 90, y: 120 + i * 82, w: 620, h: 70 });
    });
    return cells;
  },
  draw(ctx) {
    const g = MODE_GROUPS[this.group];
    // 背景
    const bg = img('background1.jpg');
    ctx.fillStyle = '#1a1206'; ctx.fillRect(0, 0, 800, 600);
    if (bg) { ctx.globalAlpha = 0.22; ctx.drawImage(bg, -220, 0); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(10,6,2,0.78)'; ctx.fillRect(0, 0, 800, 600);
    pvzText(ctx, g.title, 400, 62, 34, '#ffe36a');
    pvzText(ctx, '点击选择一个玩法', 400, 96, 15, '#d8cfa8');
    const cells = this.cells();
    this._cells = cells;
    const hover = Screens.hover;
    cells.forEach((c, i) => {
      const hov = hover === 'mode' + i;
      ctx.save();
      const g1 = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
      if (hov) { g1.addColorStop(0, '#5a9a3a'); g1.addColorStop(1, '#2a6a1a'); }
      else { g1.addColorStop(0, '#4a3720'); g1.addColorStop(1, '#2a1f10'); }
      ctx.fillStyle = g1;
      ctx.strokeStyle = hov ? '#ffe9a8' : '#1a1208';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, 10);
      ctx.fill(); ctx.stroke();
      // 序号圆
      ctx.fillStyle = 'rgba(255,233,168,0.16)';
      ctx.beginPath(); ctx.arc(c.x + 40, c.y + c.h / 2, 24, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 22px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
      ctx.fillText(String(i + 1), c.x + 40, c.y + c.h / 2 + 8);
      // 标题 + 描述
      ctx.textAlign = 'left';
      ctx.font = 'bold 21px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#fff4d0';
      ctx.fillText(c.label, c.x + 80, c.y + 32);
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#c8b28a';
      ctx.fillText(c.desc, c.x + 80, c.y + 55);
      ctx.restore();
    });
    // 返回 + 切换组
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    ctx.beginPath(); ctx.roundRect(700, 548, 84, 34, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('返 回', 742, 570);
    ctx.restore();
    this._back = { x: 700, y: 548, w: 84, h: 34 };
    // 切换 小游戏⇆生存
    const other = this.group === 'challenge' ? 'survival' : 'challenge';
    const otherLabel = other === 'challenge' ? '小游戏/解谜' : '生存模式';
    ctx.save();
    ctx.fillStyle = '#3a6a8a';
    ctx.beginPath(); ctx.roundRect(16, 548, 150, 34, 6); ctx.fill();
    ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('切换: ' + otherLabel, 91, 570);
    ctx.restore();
    this._swap = { x: 16, y: 548, w: 150, h: 34, group: other };
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
// 戴夫商店 (原版 StoreScreen — 通关 3-1 找到车钥匙后从主菜单杂货车进入)
// 疯狂戴夫站台 + 原版标签素材 + 升级植物/道具/禅园盆栽
// ================================================================
Screens.shop = {
  scroll: 0,
  daveAnim: null,
  items() {
    const game = Screens.game;
    if (!game) return [];
    const lv = Math.min(game.progress.unlocked, 50);
    const base = SHOP_ITEMS.filter(it => lv >= it.minLevel).map(it => ({ ...it, garden: false }));
    // 禅园解锁后: 盆栽/肥料/杀虫剂上架 (原版 StoreItem 顺序)
    if (game.gardenUnlocked) {
      for (const g of GARDEN_PLANTS) base.push({ ...g, minLevel: 0, desc: g.plant ? '种进禅镜花园的盆栽' : (g.key === 'g_fertilizer' ? '让盆栽瞬间长大 (5次)' : '让盆栽开心吐金币 (5次)'), icon: 'plant', garden: true });
    }
    return base;
  },
  draw(ctx) {
    const game = Screens.game;
    const t = Screens.t;
    // 背景: 夜色车库 (原版商店氛围)
    ctx.fillStyle = '#15100a'; ctx.fillRect(0, 0, 800, 600);
    const bg = img('background2.jpg');
    if (bg) { ctx.globalAlpha = 0.18; ctx.drawImage(bg, -220, 0); ctx.globalAlpha = 1; }
    // 后墙货架木板
    ctx.save();
    ctx.fillStyle = 'rgba(72,52,26,0.95)';
    ctx.fillRect(0, 60, 800, 96);
    ctx.fillStyle = 'rgba(96,70,36,0.95)';
    ctx.fillRect(0, 60, 800, 10);
    for (let x = 0; x < 800; x += 8) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, 70, 4, 86); }
    ctx.restore();
    // ---- 疯狂戴夫 (原版 CrazyDave reanim, 柜台后 idle + 说话动画) ----
    if (!this.daveAnim && RE.hasDef('CrazyDave')) {
      const d = Assets.reanim('CrazyDave');
      d.x = 400; d.y = 108;
      d.play('anim_smalltalk', RE.LOOP, 14);
      this.daveAnim = d;
    }
    if (this.daveAnim) {
      if (Math.sin(t * 0.4) > 0.96 && this.daveAnim.isPlaying('anim_smalltalk')) this.daveAnim.play('anim_mediumtalk', RE.LOOP, 16);
      else if (Math.sin(t * 0.4) < -0.96 && this.daveAnim.isPlaying('anim_mediumtalk')) this.daveAnim.play('anim_smalltalk', RE.LOOP, 14);
      this.daveAnim.update(1 / 60);
      this.daveAnim.draw(ctx);
    } else {
      // 兜底: 简易戴夫
      ctx.save();
      ctx.translate(400, 108);
      ctx.fillStyle = '#e8b48a'; ctx.beginPath(); ctx.arc(0, -30, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a3626'; ctx.fillRect(-26, -6, 52, 60);
      // 锅
      ctx.fillStyle = '#8a8f96'; ctx.beginPath(); ctx.ellipse(0, -44, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 标题 + 欢迎语 (原版 303: 疯子戴夫的闪闪亮杂货店正式营业了!)
    pvzText(ctx, '疯狂戴夫的杂货店', 400, 40, 34, '#ffe36a');
    pvzText(ctx, '"欢迎光临邻居! 瞧一瞧有没有你喜欢的东西!"', 400, 172, 15, '#d8cfa8');
    // 金币余额
    ctx.save();
    ctx.fillStyle = 'rgba(60,44,16,0.9)';
    ctx.beginPath(); ctx.roundRect(636, 24, 152, 40, 8); ctx.fill();
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2; ctx.stroke();
    const coinImg = img('coin_black_gold.png');
    if (coinImg) ctx.drawImage(coinImg, 650, 32, 24, 24);
    ctx.font = 'bold 22px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffd34d';
    ctx.fillText(String(game ? game.coins : 0), 776, 52);
    ctx.restore();
    // 货架
    const items = this.items();
    const COLS = 3, CELL_W = 232, CELL_H = 108, GX = 46, GY = 196;
    const hover = Screens.hover;
    this._cells = [];
    items.forEach((it, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = GX + col * (CELL_W + 12), y = GY + row * (CELL_H + 10);
      if (y > 470) return;
      const bought = game && game.purchased[it.key];
      const hov = hover === 'shop' + i;
      this._cells.push({ x, y, w: CELL_W, h: CELL_H, item: it, i });
      ctx.save();
      const g1 = ctx.createLinearGradient(0, y, 0, y + CELL_H);
      if (bought) { g1.addColorStop(0, '#3a4428'); g1.addColorStop(1, '#24301a'); }
      else if (hov) { g1.addColorStop(0, '#5a9a3a'); g1.addColorStop(1, '#2a6a1a'); }
      else { g1.addColorStop(0, '#4a3720'); g1.addColorStop(1, '#2a1f10'); }
      ctx.fillStyle = g1;
      ctx.strokeStyle = bought ? '#6a8a4a' : (hov ? '#ffe9a8' : '#1a1208');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y, CELL_W, CELL_H, 10);
      ctx.fill(); ctx.stroke();
      // 图标区 (木框)
      const iconBg = bought ? 'rgba(120,160,90,0.25)' : 'rgba(255,233,168,0.14)';
      ctx.fillStyle = iconBg;
      ctx.beginPath(); ctx.roundRect(x + 10, y + 12, 72, 72, 8); ctx.fill();
      // 图标: 植物 = 缩略图; 其他 = 简笔图
      const UIm = __getUI();
      if (it.plant || PLANTS[it.key]) {
        const th = (UIm && UIm.getThumb) ? UIm.getThumb(it.plant || it.key) : null;
        if (th) ctx.drawImage(th, x + 14, y + 14, 64, 64);
      } else if (it.key === 'rake') {
        // 耙子简笔 (原版 Dave's rake)
        ctx.strokeStyle = '#c8a86a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x + 24, y + 70); ctx.lineTo(x + 52, y + 26); ctx.stroke();
        ctx.lineWidth = 3;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + 44 + k * 8, y + 30); ctx.lineTo(x + 40 + k * 8, y + 48); ctx.stroke(); }
      } else if (it.key.startsWith('slot')) {
        // 卡槽
        ctx.fillStyle = '#c9a86b'; ctx.fillRect(x + 18, y + 26, 56, 44);
        ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2; ctx.strokeRect(x + 18, y + 26, 56, 44);
        ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#5a3a10'; ctx.textAlign = 'center';
        ctx.fillText('×' + it.label.match(/×(\d+)/)?.[1], x + 46, y + 56);
      } else if (it.key === 'poolcleaner' || it.key === 'roofcleaner') {
        const cln = img(it.key === 'poolcleaner' ? 'poolcleaner_funnel_overlay' : 'roofcleaner_body3');
        if (cln) ctx.drawImage(cln, x + 14, y + 16, 64, 64);
        else { ctx.fillStyle = '#9aa8b0'; ctx.fillRect(x + 22, y + 34, 48, 28); ctx.fillStyle = '#5a3a10'; ctx.fillRect(x + 30, y + 26, 32, 12); }
      } else if (it.key === 'g_fertilizer') {
        const fert = img('zengarden_fertilizer_seed1.png');
        if (fert) ctx.drawImage(fert, x + 14, y + 14, 64, 64);
      } else if (it.key === 'g_bug_spray') {
        ctx.fillStyle = '#9ad8e8'; ctx.beginPath(); ctx.roundRect(x + 28, y + 24, 32, 46, 6); ctx.fill();
        ctx.fillStyle = '#4a6a7a'; ctx.fillRect(x + 34, y + 18, 20, 8);
      } else {
        ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
        ctx.fillText('◆', x + 46, y + 60);
      }
      // 名称/描述
      ctx.textAlign = 'left';
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      ctx.fillStyle = bought ? '#a8c88a' : '#fff4d0';
      ctx.fillText(it.label, x + 94, y + 28);
      ctx.font = '11px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#c8b28a';
      ctx.fillText((it.desc || '').slice(0, 18), x + 94, y + 46);
      // 购买按钮 / 已售罄 (原版 store_soldoutlabel 素材)
      if (bought) {
        const sold = img('store_soldoutlabel.png');
        if (sold) ctx.drawImage(sold, x + 94, y + 56, 124, 34);
        else {
          ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
          ctx.fillStyle = '#a8e88a'; ctx.textAlign = 'center';
          ctx.fillText('已拥有', x + 156, y + 80);
        }
      } else {
        const can = game && game.coins >= it.cost;
        ctx.fillStyle = can ? '#c8a02a' : '#6a5a3a';
        ctx.beginPath(); ctx.roundRect(x + 94, y + 56, 124, 34, 6); ctx.fill();
        ctx.strokeStyle = can ? '#ffe9a8' : '#8a7a5a'; ctx.lineWidth = 1.5; ctx.stroke();
        const ci = img('coin_black_gold.png');
        if (ci) ctx.drawImage(ci, x + 104, y + 63, 20, 20);
        ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
        ctx.fillStyle = can ? '#fff' : '#b0a080'; ctx.textAlign = 'center';
        ctx.fillText(String(it.cost), x + 168, y + 80);
      }
      ctx.restore();
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
    pvzText(ctx, '击败僵尸获得金币 · 购买即时生效并永久保存', 400, 570, 13, '#c8b28a');
  },
  click(p, game) {
    if (this._back && inRect(p, this._back.x, this._back.y, this._back.w, this._back.h)) {
      game.audio.play('buttonclick');
      game.state = 'menu';
      return;
    }
    for (const c of (this._cells || [])) {
      if (inRect(p, c.x, c.y, c.w, c.h)) {
        const it = c.item;
        if (game.purchased[it.key]) { game.audio.play('buzzer'); return; }
        // 种子槽顺序检查
        if (it.key === 'slot9' && !game.purchased['slot8']) { game.audio.play('buzzer'); return; }
        if (it.key === 'slot10' && !game.purchased['slot9']) { game.audio.play('buzzer'); return; }
        if (game.coins < it.cost) { game.audio.play('buzzer'); return; }
        // 禅园商品: 需要空位
        if (it.garden) {
          const gm = (window.__mods && window.__mods['garden']) || require('./garden');
          if (!gm.Garden.buyGardenItem(it.key)) { game.audio.play('buzzer'); return; }
          game.coins -= it.cost;
          game.audio.play('points');
          game.saveShop();
          return;
        }
        game.buyItem(it.key);
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
