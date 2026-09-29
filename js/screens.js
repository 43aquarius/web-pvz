// ============================================================
// screens.js — 原版界面系统 (reanim 驱动)
// 主菜单: SelectorScreen.reanim 完整移植 (GameSelector.cpp)
//   anim_open 滑入(30fps) → anim_sign 木牌落下 → 静止
//   云×6 独立实例漂移 | 草叶 anim_grass 循环摇摆 | 花×3 静态
//   按钮位置 = 轨道变换 (TrackButton) | 悬停 = setImageOverride 高亮
// 标题屏: titlescreen.jpg + 载入草条 | 奖励/纸条/失败/选项: 原版素材
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, SEED_ORDER, availablePlants, awardPlantForLevel } = require('./data');
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
    // 小游戏/解谜/生存 (锁定)
    const [mx, my] = trackPos('SelectorScreen_Survival_button');
    B.push({ k: 'locked', x: mx, y: my, w: 313, h: 133 });
    const [px, py] = trackPos('SelectorScreen_Challenges_button');
    B.push({ k: 'locked', x: px, y: py, w: 286, h: 122 });
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

  draw(ctx) {
    if (!this.inst) {
      // 无 reanim 数据降级
      ctx.fillStyle = '#2f9be0'; ctx.fillRect(0, 0, 800, 600);
      return;
    }
    this.update2(1 / 60);
    const inst = this.inst;
    // ---- 1. 天空 (BG 轨道, 8x 缩放) ----
    ctx.save();
    const bgSaved = inst.group[this._skyTrackIdx];
    for (let i = 0; i < inst.group.length; i++) if (i !== this._skyTrackIdx) inst.group[i] = 1;
    inst.group[this._skyTrackIdx] = 0;
    inst.draw(ctx);
    for (let i = 0; i < inst.group.length; i++) inst.group[i] = 0;
    inst.group[this._skyTrackIdx] = bgSaved === 1 ? 1 : 0;
    ctx.restore();
    // ---- 2. 云 ----
    for (const c of this.clouds) c.draw(ctx);
    // ---- 3. 主景 (BG 轨道隐藏) ----
    inst.group[this._skyTrackIdx] = 1;
    inst.draw(ctx);
    inst.group[this._skyTrackIdx] = 0;
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
    // 锁定按钮提示 (悬停)
    if (hover === 'locked') {
      pvzText(ctx, '尚未开放', 400, 240, 18, '#cfcfcf');
    }
  },

  click(p, game) {
    for (const b of (this.buttons || [])) {
      if (!inRect(p, b.x, b.y, b.w, b.h)) continue;
      if (b.k === 'adventure') {
        game.audio.play('gravebutton');
        this.inst && this.inst.setImageOverride('SelectorScreen_StartAdventure_button', null);
        game.startAdventure();
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
// 选项 — 原版 option_dialog + 滑块/复选框
// ================================================================
Screens.options = {
  rects: {},
  draw(ctx) {
    const game = Screens.game;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
    const dlg = img('option_dialog.png');
    const dw = 500, dh = 420, dx = 150, dy = 90;
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

// 悬停检测 (主循环调用)
Screens.updateHover = function (mouse) {
  if (!mouse) return;
  this.hover = null;
  if (this.game && this.game.state === 'menu' && this.menu.buttons) {
    for (const b of this.menu.buttons) {
      if (inRect(mouse, b.x, b.y, b.w, b.h)) { this.hover = b.k; break; }
    }
  }
};

if (typeof module !== 'undefined') module.exports = { Screens, pvzText, inRect };
