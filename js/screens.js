// ============================================================
// screens.js — 原版界面系统 (reanim 驱动)
// 主菜单: SelectorScreen.reanim 完整移植 (GameSelector.cpp)
//   anim_open 滑入(30fps) → anim_sign 木牌落下 → 静止
//   云×6 独立实例漂移 | 草叶 anim_grass 循环摇摆 | 花×3 静态
//   按钮位置 = 轨道变换 (TrackButton) | 悬停 = setImageOverride 高亮
// 标题屏: titlescreen.jpg + 载入草条 | 奖励/纸条/失败/选项: 原版素材
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, SEED_ORDER, SHOP_ITEMS, availablePlants, awardPlantForLevel, MUSHROOMS, AQUATIC, UPGRADES } = require('./data');
const RE = require('./reanim');
const { H_OFFSET } = require('./plants');
const { drawDaveDialog } = require('./cutscene');
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
    // 标题屏 logo 落下动画 (其余屏: menu 在 draw 内自更新, zengarden 由主循环单独驱动)
    if (typeof Screens.title.update === 'function') Screens.title.update(dt);
  },
};

// ================================================================
// 标题屏 — titlescreen.jpg + 闪烁开始提示
// ================================================================
Screens.title = {
  started: false,
  logoT: 0,           // logo 下落弹跳动画计时 (原版 mTitleStateCounter)
  update(dt) { this.logoT = (this.logoT || 0) + dt * 100; },
  draw(ctx) {
    // 原版标题屏: IMAGE_TITLESCREEN (titlescreen.jpg 场景图) + IMAGE_PVZ_LOGO 叠加 (#6)
    // 提取资产无 logo 图 → 用原版风格字体 logo 还原 (无 "Web原版复刻" 等自造副标题)
    const bg = img('titlescreen.jpg');
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#20300a'; ctx.fillRect(0, 0, 800, 600); }
    const t = Screens.t;
    // ---- PvZ logo (原版 TitleScreen.cpp: counter 100→60 EASE_IN 从-150加速落下, 60→50 BOUNCE 落地回弹, 之后静止 y=10) ----
    const tc = this.logoT || 0;                      // 屏幕显示后经过的 tick (100/s)
    const counter = Math.max(0, 100 - tc);           // 原版 mTitleStateCounter 递减
    let logoY;
    if (counter > 60) {
      const k = Math.min(1, (100 - counter) / 40);   // 0→1
      logoY = -150 + k * k * 160;                    // EASE_IN(t²) 加速下落
    } else if (counter > 50) {
      const k = (60 - counter) / 10;                 // 0→1
      logoY = 10 + (1 - Math.abs(2 * k - 1)) * 5;    // BOUNCE 三角波 落地回弹
    } else {
      logoY = 10;
    }
    ctx.save();
    ctx.translate(400, logoY + 110);
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
    ctx.restore();
    // 点击开始 (闪烁, 原版 Click to start 位置)
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3.2);
    pvzText(ctx, '点 击 开 始', 400, 480, 34, '#ffe9a8', { stroke: 'rgba(30,18,0,0.9)' });
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
  state: 'open',       // open(滑入) → newuser(姓名输入 #2) → sign(木牌) → idle
  hover: null,
  lockMsg: null,       // 模式锁定消息框 (原版 MODE_LOCKED LawnMessageBox) (#6)
  starting: null,      // #1 冒险开场僵尸大手过场 (原版 mStartingGame)
  newUser: null,       // #2 NewUserDialog 姓名输入对话框
  _nameAsked: false,   // 本次会话是否已询问过姓名 (取消后不重复弹)

  // 原版 GameSelector::ButtonDepress: 锁定时弹 [MODE_LOCKED] 消息框 (#6)
  showLockMsg(game, name) {
    game.audio.play('gravebutton');
    this.lockMsg = { name, t0: Date.now() };
  },

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

  // 木牌落下 (原版 SELECTOR_NEW_USER 关闭后 → anim_sign)
  playSign() {
    if (!this.inst) { this.state = 'idle'; return; }
    this.inst.play('anim_sign', RE.PLAY_ONCE_HOLD, 30);
    this.state = 'sign';
  },

  // ================================================================
  // #2 NewUserDialog (原版 NewUserDialog.cpp 28-121 + LawnDialog 纸质拼图)
  //   标题「新用户」+「请输入你的名字:」+ 12字符输入框 + 确定/取消
  // ================================================================
  showNewUser() {
    this.newUser = { text: '', err: '', t: 0 };
    try {
      const game = Screens.game;
      const canvas = game && game.canvas;
      if (canvas) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.maxLength = 12;
        inp.autocomplete = 'off';
        inp.placeholder = '输入名字…';
        inp.style.cssText = 'position:fixed;z-index:50;background:transparent;border:none;outline:none;text-align:center;font:bold 20px \'Noto Sans SC\',sans-serif;color:#3a2410;caret-color:#3a2410;pointer-events:auto;';
        document.body.appendChild(inp);
        this._nameInput = inp;
        this._layoutNameInput();
        inp.addEventListener('input', () => {
          // 原版 AllowChar: 字母数字+空格 (web 放宽中文); 折叠连续空格 (原版 GetName)
          let v = inp.value.replace(/\s+/g, ' ');
          if (v.length > 12) v = v.slice(0, 12);
          inp.value = v;
          this.newUser.text = v;
          this.newUser.err = '';
        });
        inp.addEventListener('keydown', (e) => {
          e.stopPropagation();                     // 不透传到游戏快捷键
          if (e.key === 'Enter') this.confirmNewUser();
          if (e.key === 'Escape') this.cancelNewUser();
        });
        setTimeout(() => { try { inp.focus(); } catch (e) { } }, 60);
      }
    } catch (e) { }
  },
  // 输入框页面坐标 (canvas 800x600 逻辑坐标 → 页面坐标; 每帧重算适配缩放/旋转)
  _layoutNameInput() {
    const inp = this._nameInput;
    if (!inp) return;
    const game = Screens.game;
    const canvas = game && game.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // 对话框输入区 (canvas 逻辑坐标): (280,278)-(520,318)
    const ax = rect.left + 280 / 800 * rect.width, ay = rect.top + 278 / 600 * rect.height;
    const bx = rect.left + 520 / 800 * rect.width, by = rect.top + 318 / 600 * rect.height;
    inp.style.left = ax + 'px'; inp.style.top = ay + 'px';
    inp.style.width = (bx - ax) + 'px'; inp.style.height = (by - ay) + 'px';
  },
  confirmNewUser() {
    const game = Screens.game;
    const name = (this.newUser && this.newUser.text || '').trim();
    if (!name) {
      // 原版空名错误 [USER_ERROR_MESSAGE]
      this.newUser.err = '请输入你的名字！';
      game.audio.play('buzzer');
      if (this._nameInput) { try { this._nameInput.focus(); } catch (e) { } }
      return;
    }
    game.playerName = name;
    try { localStorage.setItem('webpvz_player', name); } catch (e) { }
    game.audio.play('buttonclick');
    this.closeNewUser();
    this.playSign();
  },
  cancelNewUser() {
    const game = Screens.game;
    game.audio.play('buttonclick');
    this.closeNewUser();
    this.playSign();   // 未命名继续 (木牌显示「玩家」; 下次启动再询问)
  },
  closeNewUser() {
    this.newUser = null;
    if (this._nameInput) { try { this._nameInput.remove(); } catch (e) { } this._nameInput = null; }
  },
  // 绘制姓名输入对话框 (纸质 9-patch + 标题牌 + 输入区背景 + 按钮)
  drawNewUser(ctx) {
    const d = this.newUser;
    if (!d) return;
    this._layoutNameInput();   // 每帧同步 HTML 输入框位置 (窗口缩放跟随)
    const X = 190, Y = 150, W = 420, H = 250;
    ctx.save();
    // 模态遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, 800, 600);
    // ---- 纸质 9-patch (原版 LawnDialog: dialog_top*/center*/bottom* 系列) ----
    const P = {
      tl: img('dialog_topleft'), tm: img('dialog_topmiddle'), tr: img('dialog_topright'),
      cl: img('dialog_centerleft'), cm: img('dialog_centermiddle'), cr: img('dialog_centerright'),
      bl: img('dialog_bottomleft'), bm: img('dialog_bottommiddle'), br: img('dialog_bottomright'),
    };
    if (P.tl && P.cm) {
      const cw = P.tl.width, chh = P.tl.height;
      const topH = P.tm.height || chh, botH = P.bm.height || chh;
      for (let x = X + cw; x < X + W - cw; x += P.tm.width) ctx.drawImage(P.tm, x, Y, Math.min(P.tm.width, X + W - cw - x), topH);
      for (let x = X + cw; x < X + W - cw; x += P.bm.width) ctx.drawImage(P.bm, x, Y + H - botH, Math.min(P.bm.width, X + W - cw - x), botH);
      for (let y = Y + chh; y < Y + H - chh; y += P.cl.height) {
        ctx.drawImage(P.cl, X, y, P.cl.width, Math.min(P.cl.height, Y + H - chh - y));
        ctx.drawImage(P.cr, X + W - P.cr.width, y, P.cr.width, Math.min(P.cr.height, Y + H - chh - y));
      }
      for (let y = Y + topH; y < Y + H - botH; y += P.cm.height) {
        for (let x = X + cw; x < X + W - P.cr.width; x += P.cm.width) {
          ctx.drawImage(P.cm, x, y, Math.min(P.cm.width, X + W - P.cr.width - x), Math.min(P.cm.height, Y + H - botH - y));
        }
      }
      ctx.drawImage(P.tl, X, Y);
      ctx.drawImage(P.tr, X + W - P.tr.width, Y);
      ctx.drawImage(P.bl, X, Y + H - P.bl.height);
      ctx.drawImage(P.br, X + W - P.br.width, Y + H - P.br.height);
    } else {
      // 兑底: 羊皮纸圆角框
      const g = ctx.createLinearGradient(0, Y, 0, Y + H);
      g.addColorStop(0, '#f5e7c0'); g.addColorStop(1, '#e0c48a');
      ctx.fillStyle = g; ctx.strokeStyle = '#7a5222'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(X, Y, W, H, 16); ctx.fill(); ctx.stroke();
    }
    // 标题牌 (dialog_header 居中于顶部)
    const header = img('dialog_header');
    if (header) ctx.drawImage(header, X + W / 2 - header.width / 2, Y - 26);
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#5c3a10';
    ctx.fillText('新用户', X + W / 2, Y + 12);
    // 正文 (原版 PLEASE_ENTER_NAME)
    ctx.font = '17px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#7a5222';
    ctx.fillText('请输入你的名字：', X + W / 2, Y + 58);
    // 输入区背景 (HTML input 覆盖其上)
    ctx.fillStyle = 'rgba(58,40,20,0.92)';
    ctx.strokeStyle = '#8a6434'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(276, 274, 248, 48, 8); ctx.fill(); ctx.stroke();
    // 错误提示 (原版 USER_ERROR_MESSAGE)
    if (d.err) {
      ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#b03020';
      ctx.fillText(d.err, X + W / 2, Y + 156);
    }
    // 按钮: 确定 / 取消 (悬停高亮)
    const hover = Screens.hover;
    const btn = (bx, by, bw, bh, label, key) => {
      const h = hover === key;
      ctx.fillStyle = h ? '#9a7a3a' : '#8a6434';
      ctx.strokeStyle = '#5c3f1c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 18px "Noto Sans SC", sans-serif';
      ctx.fillStyle = h ? '#fff6d8' : '#f0e0b0';
      ctx.fillText(label, bx + bw / 2, by + bh / 2 + 7);
    };
    btn(258, 340, 120, 42, '确　定', '_nu_ok');
    btn(422, 340, 120, 42, '取　消', '_nu_cancel');
    ctx.restore();
  },

  // ================================================================
  // #1 冒险开场僵尸大手 (原版 GameSelector::ClickedAdventure, GameSelector.cpp 1126-1169)
  //   点击「冒险」→ 停BGM + losemusic + dirt_rise + Zombie_hand 破土 (-70,10)
  //   → 1.25s 僵尸狂笑 (mStartingGameCounter==125) → 4.5s 后进关 (450帧)
  // ================================================================
  async beginStartGame(game) {
    if (this.starting) return;
    this.starting = { t: 0, hand: null, laughed: false };
    game.audio.stopBGM();
    game.audio.play('losemusic');      // 原版 mMusic->StopAllMusic + SOUND_LOSEMUSIC
    game.audio.play('dirt_rise');      // 原版 FOLEY_DIRT_RISE (泥土声)
    // Zombie_hand reanim 在 zombie_core 分包 → 预载后播放
    try { await Assets.ensurePacks(['zombie_core']); } catch (e) { }
    if (!this.starting) return;       // 期间被取消
    if (RE.hasDef('Zombie_hand')) {
      const hand = Assets.reanim('Zombie_hand');
      hand.x = -70; hand.y = 10;      // 原版 AddReanimation(-70, 10)
      hand.frameStart = 0;
      hand.frameCount = hand.def ? hand.def.n : 20;
      hand.animRate = hand.def ? hand.def.fps : 30;   // 文件自带 30fps, 单次播完保持
      hand.loopType = RE.PLAY_ONCE_HOLD;
      hand.animTime = 0;
      // 原版: "rock" 前缀轨道 (飞石) mIgnoreClipRect = true → 独立分组在裁剪外绘制
      try {
        for (let i = 0; i < hand.tracks.length; i++) {
          if (hand.def.tracks[i].name.toLowerCase().startsWith('rock')) hand.tracks[i].renderGroup = 8;
        }
      } catch (e) { }
      this.starting.hand = hand;
    }
  },
  updateStarting(dt) {
    const s = this.starting;
    if (!s) return;
    s.t += dt;
    const game = Screens.game;
    // 原版 mStartingGameCounter==125 (1.25s): SOUND_EVILLAUGH 僵尸狂笑
    if (!s.laughed && s.t >= 1.25) { s.laughed = true; if (game) game.audio.play('evil_laugh'); }
    if (s.hand) s.hand.update(dt);
    // 原版 450 帧 (4.5s) 后 KillGameSelector → 进关
    if (s.t >= 4.5) {
      this.starting = null;
      if (game) game.startAdventure();
    }
  },
  drawStarting(ctx) {
    const s = this.starting;
    if (!s) return;
    const hand = s.hand;
    if (hand) {
      // 原版: 裁剪矩形 (0,0,800,560) — 手从画面底部遮罩后钻出
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, 800, 560); ctx.clip();
      hand.drawRenderGroup(ctx, 0);
      ctx.restore();
      hand.drawRenderGroup(ctx, 8);   // 飞石轨道不受裁剪 (原版 mIgnoreClipRect)
    }
    // 按钮闪烁 (原版 SetBkgColor: counter%20<10 → 灰 80,80,80)
    if ((s.t * 100) % 20 < 10) {
      const adv = (this.buttons || []).find(b => b.k === 'adventure');
      if (adv) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#000';
        ctx.fillRect(adv.x, adv.y, adv.w, adv.h);
        ctx.restore();
      }
    }
  },

  // ---- 每帧更新 ----
  update2(dt) {
    // #1 僵尸大手过场推进 (fallback 素材缺失模式同样推进 — 置于 inst 检查之前)
    if (this.starting) this.updateStarting(dt);
    if (!this.inst) return;
    this.inst.update(dt);
    // anim_open 完成 → 无玩家档案先弹 NewUserDialog (#2 原版 GameSelector SELECTOR_NEW_USER),
    //   否则 anim_sign (木牌落下)
    if (this.state === 'open' && this.inst.loopCount > 0) {
      if (!this._nameAsked && Screens.game && !Screens.game.playerName) {
        this._nameAsked = true;
        this.state = 'newuser';
        this.showNewUser();
      } else {
        this.playSign();
      }
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

  // ---- 按钮区 (原版 GameSelector::Update TrackButton 绑定, 1:1 对应) ----
  //   mAdventureButton → StartAdventure_button / Adventure_button 轨道 (0,0)
  //   mMinigameButton (玩玩小游戏) → Survival_button 轨道 (0,0)   [原版素材命名混乱, 图=开始小游戏墓碑]
  //   mPuzzleButton (解谜模式) → Challenges_button 轨道 (0,0)     [图=解谜模式墓碑]
  //   mSurvivalButton (生存模式) → ZenGarden_button 轨道 (0,0)    [图=生存模式奖杯]
  //   mZenGardenButton (禅镜花园水壶) → BG_Right + (100,360) 130x130
  //   mStoreButton (戴夫的店) → BG_Right + (334,441)
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
    // 玩玩小游戏 (墓碑) — 原版 mMinigameButton → Survival_button 轨道
    const [gx, gy] = trackPos('SelectorScreen_Survival_button');
    B.push({ k: 'minigames', x: gx, y: gy, w: 313, h: 133, track: 'SelectorScreen_Survival_button', hl: 'selectorscreen_survival_highlight.png' });
    // 解谜模式 (墓碑) — 原版 mPuzzleButton → Challenges_button 轨道
    const [px2, py2] = trackPos('SelectorScreen_Challenges_button');
    B.push({ k: 'puzzle', x: px2, y: py2, w: 286, h: 122, track: 'SelectorScreen_Challenges_button', hl: 'selectorscreen_challenges_highlight.png' });
    // 生存模式 (奖杯) — 原版 mSurvivalButton → ZenGarden_button 轨道 (图=vasebreaker_button 生存奖杯)
    const [sx, sy] = trackPos('SelectorScreen_ZenGarden_button');
    B.push({ k: 'survival', x: sx, y: sy, w: 266, h: 123, track: 'SelectorScreen_ZenGarden_button', hl: 'selectorscreen_vasebreaker_highlight.png' });
    // 禅镜花园 (水壶) — 原版 mZenGardenButton → BG_Right + (100,360) 130x130
    B.push({ k: 'zengarden', x: bgR[0] + 100, y: bgR[1] + 360, w: 130, h: 130, hl: 'selectorscreen_zengardenhighlight.png' });
    // 戴夫的店 (商店图标) — 原版 mStoreButton → BG_Right + (334,441)
    B.push({ k: 'shop', x: bgR[0] + 334, y: bgR[1] + 441, w: 74, h: 74, hl: 'selectorscreen_storehighlight.png' });
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
      { k: 'adventure', x: 234, y: 130, w: 332, h: 66, label: '冒 险 模 式' },
      { k: 'minigames', x: 234, y: 204, w: 332, h: 56, label: '玩玩小游戏' },
      { k: 'puzzle', x: 234, y: 268, w: 332, h: 56, label: '解 谜 模 式' },
      { k: 'survival', x: 234, y: 332, w: 332, h: 56, label: '生 存 模 式' },
      { k: 'almanac', x: 234, y: 412, w: 155, h: 60, label: '图 鉴' },
      { k: 'options', x: 411, y: 412, w: 155, h: 60, label: '选　项' },
    ];
    if (game && game.shopUnlocked && game.shopUnlocked()) {
      btns.push({ k: 'shop', x: 411, y: 332, w: 155, h: 56, label: '戴夫商店' });
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
    // 每帧推进 (置顶: fallback 素材缺失模式同样推进状态机/过场)
    this.update2(1 / 60);
    // 素材缺失兜底: reanim 或关键背景图缺失 → 简化菜单 (仍可点击进入游戏)
    if (!this.inst || !img('selectorscreen_bg.jpg')) {
      this.drawFallback(ctx);
      this.drawStarting(ctx);   // #1 大手过场叠加
      this.drawNewUser(ctx);    // #2 姓名输入对话框叠加
      return;
    }
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
    // ---- 6. 附加元素 (图鉴书/水壶/商店图标/小按钮/悬停高亮) ----
    this.buttons = this.computeButtons();
    const hover = Screens.hover;
    // 图鉴书 (原版 CanShowAlmanac: 通关或玩到 2-5 (level≥15) 才解锁 — 即 2-4 奖励图鉴后)
    const gameRef = Screens.game;
    const canAlm = !gameRef || gameRef.progress.unlocked >= 15 || gameRef.progress.unlocked > 50 || gameRef.debugUnlocked;
    const alm = this.buttons.find(b => b.k === 'almanac');
    if (alm && canAlm) {
      const isH = hover === 'almanac';
      const aimg = img(isH ? 'selectorscreen_almanachighlight.png' : 'selectorscreen_almanac.png');
      if (aimg) ctx.drawImage(aimg, alm.x, alm.y);
    }
    // 禅镜花园水壶 (原版 mZenGardenButton: BG_Right+(100,360) zengarden.png 130x130)
    const zg = this.buttons.find(b => b.k === 'zengarden');
    if (zg) {
      const isH = hover === 'zengarden';
      const zimg = img(isH ? 'selectorscreen_zengardenhighlight.png' : 'selectorscreen_zengarden.png');
      if (zimg) ctx.drawImage(zimg, zg.x, zg.y, 130, 130);
    }
    // 戴夫的店图标 (原版 mStoreButton: BG_Right+(334,441) store.png) — 通关 3-4 解锁
    const shop = this.buttons.find(b => b.k === 'shop');
    if (shop) {
      const game0 = Screens.game;
      if (game0 && game0.shopUnlocked && game0.shopUnlocked()) {
        const isH = hover === 'shop';
        const simg = img(isH ? 'selectorscreen_storehighlight.png' : 'selectorscreen_store.png');
        if (simg) ctx.drawImage(simg, shop.x, shop.y);
        // 悬停时显示金币余额
        if (isH) pvzText(ctx, '◆ ' + (game0.coins || 0), shop.x + 37, shop.y - 10, 14, '#ffd34d');
      } else {
        shop.disabled = true;
      }
    }
    // 墓碑/奖杯按钮悬停高亮 (原版 SetImageOverride: 悬停换高亮图)
    const trackOverrides = [
      { track: 'SelectorScreen_Survival_button', k: 'minigames', hl: 'selectorscreen_survival_highlight.png' },
      { track: 'SelectorScreen_Challenges_button', k: 'puzzle', hl: 'selectorscreen_challenges_highlight.png' },
      { track: 'SelectorScreen_ZenGarden_button', k: 'survival', hl: 'selectorscreen_vasebreaker_highlight.png' },
    ];
    for (const to of trackOverrides) {
      if (hover === to.k) inst.setImageOverride(to.track, to.hl);
      else inst.setImageOverride(to.track, null);
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
    // ---- 7. 玩家名 (原版 GameSelector.cpp 580-594: woodsign1 轨道 + (170.5-w/2, 102.5),
    //      名字+'!'; 仅 sign/idle 状态绘制 — 原版非 OPEN/NEW_USER 状态才画) (#2) ----
    const game = Screens.game;
    if (game && (this.state === 'sign' || this.state === 'idle')) {
      const name = game.playerName || '玩家';
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
    // ---- 三模式入口锁定态 (原版 GameSelector: SetBkgColor(128,128,128) 灰底) (#6) ----
    if (game) {
      const MODE_LOCKED = { minigames: '玩玩小游戏', puzzle: '解谜模式', survival: '生存模式' };
      for (const k of Object.keys(MODE_LOCKED)) {
        if (game.modeUnlocked && !game.modeUnlocked(k)) {
          const b = (this.buttons || []).find(b => b.k === k);
          if (b) {
            ctx.save();
            ctx.fillStyle = 'rgba(110,110,110,0.42)';
            ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
            ctx.restore();
          }
        }
      }
    }
    // 未解锁模式的悬停提示 (原版 MODE_LOCKED)
    if (game) {
      if (hover === 'minigames' || hover === 'puzzle') {
        if (game.modeUnlocked && !game.modeUnlocked(hover)) pvzText(ctx, '通关冒险模式后开放', 400, 560, 15, '#cfe0ff');
      } else if (hover === 'survival') {
        if (game.modeUnlocked && !game.modeUnlocked('survival')) pvzText(ctx, '通关冒险模式后开放', 400, 560, 15, '#cfe0ff');
      } else if (hover === 'zengarden') {
        if (!game.zenGardenUnlocked()) pvzText(ctx, '通关 5-4 ( level 44 ) 后开放', 400, 560, 15, '#cfe0ff');
      } else if (hover === 'shop') {
        if (!game.shopUnlocked()) pvzText(ctx, '通关 3-4 后开放', 400, 560, 15, '#cfe0ff');
      }
    }
    // ---- 模式锁定消息框 (原版 MODE_LOCKED LawnMessageBox: 木牌+文字+确认) (#6) ----
    if (this.lockMsg) {
      const el = Math.min(1, (Date.now() - this.lockMsg.t0) / 200);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, 800, 600);
      const W = 430, H = 165, X = 400 - W / 2, Y = (600 - H) / 2 - 20;
      ctx.translate(400, Y + H / 2);
      ctx.scale(0.85 + 0.15 * el, 0.85 + 0.15 * el);
      ctx.translate(-400, -(Y + H / 2));
      // 木牌底
      const wood = img && img('SelectorScreen_WoodSign3');
      if (wood) {
        ctx.drawImage(wood, X, Y, W, H);
      } else {
        ctx.fillStyle = '#8a6434';
        ctx.fillRect(X, Y, W, H);
        ctx.strokeStyle = '#5c3f1c'; ctx.lineWidth = 4;
        ctx.strokeRect(X + 2, Y + 2, W - 4, H - 4);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 24px "Noto Sans SC", sans-serif';
      ctx.fillText('模式尚未解锁', 400, Y + 52);
      ctx.font = '16px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#ffe9c8';
      ctx.fillText(`要解锁「${this.lockMsg.name}」模式`, 400, Y + 86);
      ctx.fillText('请先通关冒险模式！', 400, Y + 110);
      const blink = Math.sin((Date.now() % 900) / 900 * Math.PI * 2) > -0.2;
      if (blink) {
        ctx.fillStyle = '#c8f542';
        ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
        ctx.fillText('点击任意处继续', 400, Y + 142);
      }
      ctx.restore();
    }
    // ---- #2 姓名输入对话框 (模态叠加) ----
    this.drawNewUser(ctx);
    // ---- #1 僵尸大手开场过场 (叠加于菜单之上) ----
    this.drawStarting(ctx);
  },

  click(p, game) {
    // #2 NewUserDialog 模态: 仅响应对话框按钮/输入区 (原版对话框独占输入)
    if (this.newUser) {
      const hitBtn = (bx, by, bw, bh) => p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh;
      if (hitBtn(258, 340, 120, 42)) this.confirmNewUser();
      else if (hitBtn(422, 340, 120, 42)) this.cancelNewUser();
      else if (hitBtn(276, 274, 248, 48) && this._nameInput) { try { this._nameInput.focus(); } catch (e) { } }
      return;
    }
    // #1 僵尸大手过场中: 按钮全部禁用 (原版 mStartingGame 所有按钮 SetDisabled)
    if (this.starting) return;
    // 锁定消息框打开时: 点击任意处关闭 (原版 DIALOG_BUTTON_OK) (#6)
    if (this.lockMsg) {
      if (Date.now() - this.lockMsg.t0 > 250) { this.lockMsg = null; game.audio.play('buttonclick'); }
      return;
    }
    for (const b of (this.buttons || [])) {
      if (!inRect(p, b.x, b.y, b.w, b.h)) continue;
      if (b.disabled) { game.audio.play('buzzer'); return; }
      if (b.k === 'adventure') {
        game.audio.play('gravebutton');
        this.inst && this.inst.setImageOverride('SelectorScreen_StartAdventure_button', null);
        // #1 僵尸大手开场 (原版 GameSelector::ClickedAdventure 1126-1169):
        //   停BGM + losemusic + dirt_rise + Zombie_hand 破土 + 1.25s 狂笑 + 4.5s 后进关
        //   (evil_laugh 移至 1.25s 时机 = 原版 mStartingGameCounter==125)
        this.beginStartGame(game);
      } else if (b.k === 'minigames') {
        // 玩玩小游戏 (原版: 通关冒险模式解锁; 锁定时弹 MODE_LOCKED 消息框) (#6)
        if (!game.modeUnlocked('minigames')) { this.showLockMsg(game, '玩玩小游戏'); return; }
        game.audio.play('gravebutton');
        game.state = 'modeselect';
        Screens.modeSelect.enter('minigames');
      } else if (b.k === 'puzzle') {
        // 解谜模式 (原版 mPuzzleButton → ChallengeScreen(PAGE_PUZZLE))
        if (!game.modeUnlocked('puzzle')) { this.showLockMsg(game, '解谜模式'); return; }
        game.audio.play('gravebutton');
        game.state = 'modeselect';
        Screens.modeSelect.enter('puzzle');
      } else if (b.k === 'survival') {
        // 生存模式 (原版 mSurvivalButton → ChallengeScreen(PAGE_SURVIVAL))
        if (!game.modeUnlocked('survival')) { this.showLockMsg(game, '生存模式'); return; }
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
        // 商店素材预载 (#6: 升级植物 plant_ 包; 缺此则 getThumb 返回空白占位
        //   → GATLINGPEA/TWINSUNFLOWER 等商品只剩价格牌无图 — 与图鉴 #10 同型问题)
        if (Assets.ensureShop) Assets.ensureShop().catch(() => { });
      } else if (b.k === 'almanac') {
        // 原版 CanShowAlmanac: 2-4 奖励图鉴后才可进入 (level≥15)
        if (!(game.progress.unlocked >= 15 || game.progress.unlocked > 50 || game.debugUnlocked)) { game.audio.play('buzzer'); return; }
        game.audio.play('gravebutton');
        game.state = 'almanac'; game.almanac.selected = null; game.almanac.tab = 'index';
        // 索引页模型素材预载 (SUNFLOWER/普通僵尸 reanim; 缺此则两展示窗空白) (#10)
        if (Assets.ensurePacks) {
          Assets.ensurePacks(['plant_SUNFLOWER', 'zombie_core', 'ui']).catch(() => { });
        }
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
    // ---- 原版 AwardScreen::Draw (AwardScreen.cpp:290-360, #9) ----
    //   背景 AWARDSCREEN_BACK; 布局 DrawBottom: 标题(400,58) 奖品名(400,326) 描述(285,360,230×90);
    //   新植物 = 2 倍种子包 @ (350,129) (DrawAwardSeed SetScale(2,2,350,129));
    //   物品类 = 原图 @ (400-w/2, 137)。旧实现自创黑底+光芒旋转+浮动动画, 与原版不符。
    //   渐入 (#9): 原版末尾全屏 FillRect 遮罩淡出 — 非纸条白色 255→0 / 纸条黑色;
    //   旧实现用 globalAlpha 整体透明渐入, 语义偏差 (背景透出下一帧画面)
    const award = game.levelAward || { type: 'seed', plant: game.justUnlocked };
    const type = award.type || 'seed';
    const fadeIn = Math.max(0, Math.min(1, t * 100 / 180));      // 180 tick = 1.8s
    ctx.save();
    const bg = img('awardscreen_back.jpg');
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#e8dcb8'; ctx.fillRect(0, 0, 800, 600); }
    // 标题 (原版 FONT_DWARVENTODCRAFT24 金棕 @ 400,58)
    pvzText(ctx, this.AWARD_TITLE[type] || '你获得了奖励!', 400, 58, 24, '#d59f2b');
    // ---- 奖励主体 ----
    if (type === 'seed' && award.plant) {
      // 原版 DrawAwardSeed: 2x 种子包 @ (350,129) → 显示区 100×140
      const UIm = __getUI();
      ctx.save();
      ctx.translate(350, 129);
      ctx.scale(2, 2);
      if (UIm && UIm.drawSeedCard) UIm.drawSeedCard(ctx, award.plant, 0, 0, { noCost: false });
      else {
        const packet = img('seedpacket_larger.png');
        if (packet) ctx.drawImage(packet, 0, 0, 50, 70);
      }
      ctx.restore();
    } else {
      // 原版各奖励: DrawImage(IMAGE_XXX, 400 - w/2, 137) 顶部对齐
      const im = img(this.AWARD_IMG[type]);
      if (im) {
        const s = Math.min(280 / im.width, 190 / im.height, 1.6);
        const w = im.width * s, h = im.height * s;
        ctx.drawImage(im, 400 - w / 2, 137, w, h);
      } else {
        ctx.font = 'bold 90px sans-serif';
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe36a';
        ctx.fillText('?', 400, 220);
      }
    }
    // ---- DrawBottom: 奖品名 + 描述 ----
    if (type === 'seed' && award.plant && PLANTS[award.plant]) {
      pvzText(ctx, PLANTS[award.plant].cn, 400, 326, 18, '#ffe36a');
      // 原版 GetToolTip 描述 @ (285,360,230×90) 居中 16 号蓝灰
      const desc = PLANTS[award.plant].desc || '';
      ctx.save();
      ctx.fillStyle = 'rgb(40,50,90)';
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 230px 宽自动换行
      const lineH = 20;
      let line = '', yy = 375;
      for (const ch of desc) {
        if (ctx.measureText(line + ch).width > 220) { ctx.fillText(line, 400, yy); yy += lineH; line = ch; }
        else line += ch;
      }
      if (line) ctx.fillText(line, 400, yy);
      ctx.restore();
    } else {
      const SUB = {
        trophy: ['向日葵奖杯', '你完成了整个冒险模式!'],
        carkeys: ['车钥匙', '商店将会在下一关之后开业……'],
        wateringcan: ['洒水壶', '禅镜花园即将开启……'],
        shovel: ['铁铲', '可以铲除植物了!'],
        almanac: ['大图鉴', '可以查看植物与僵尸资料!'],
        taco: ['玉米卷', '戴夫正在寻找的东西……'],
      };
      const sub = SUB[type] || ['', ''];
      pvzText(ctx, sub[0], 400, 326, 18, '#ffe36a');
      pvzText(ctx, sub[1], 400, 375, 14, 'rgb(40,50,90)');
    }
    ctx.restore();
    // 点击继续 (渐入完成后闪烁)
    const a = t > 1.5 ? 0.5 + 0.5 * Math.sin(t * 3) : 0;
    ctx.save(); ctx.globalAlpha = a;
    pvzText(ctx, '点 击 继 续', 400, 540, 24, '#ffe9a8');
    ctx.restore();
    // 原版末尾: 全屏遮罩 FillRect 淡出 — 非纸条白色 (AwardScreen.cpp:420-423)
    //   mFadeInCounter 180→0, alpha 255→0 (CURVE_LINEAR)
    const fadeAlpha = (1 - fadeIn) * 255;
    if (fadeAlpha > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (fadeAlpha / 255).toFixed(3) + ')';
      ctx.fillRect(0, 0, 800, 600);
    }
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
// 模式选择屏 — 原版 ChallengeScreen 完整还原 (#7)
//   三个独立页面 (从主菜单各自入口进入, 彼此独立, 只能返回主菜单):
//     minigames (玩玩小游戏 CHALLENGE_PAGE_CHALLENGE 20格)
//     puzzle    (解谜模式 CHALLENGE_PAGE_PUZZLE 20格)
//     survival  (生存模式 CHALLENGE_PAGE_SURVIVAL 10格)
//   原版布局: 4行×5列 挑战格子 (38+col*155, 93+row*119) 104x115
// ================================================================
const MODE_GROUPS = {
  minigames: {
    title: '玩玩小游戏',
    // 原版 CHALLENGE_PAGE_CHALLENGE 20 项 (gChallengeDefs 顺序), beghouled×2/zombiquarium 暂未实作
    items: [
      { key: 'war_and_peas', label: '豌豆大战', icon: 'PEASHOOTER', desc: '豌豆射手大阅兵' },
      { key: 'bowling', label: '坚果保龄球', icon: 'WALLNUT', desc: '坚果滚滚滚' },
      { key: 'slot_machine', label: '老虎机', icon: 'SUNFLOWER', desc: '随机神秘种子' },
      { key: 'raining', label: '雨天种子', icon: 'REPEATER', desc: '天降种子包' },
      { key: null, label: '消消乐', icon: null, desc: '敬请期待' },
      { key: 'invisighoul', label: '隐形僵尸', icon: 'ICESHROOM', desc: '看不见的僵尸' },
      { key: 'seeing_stars', label: '看见星星', icon: 'STARFRUIT', desc: '杨桃阵点亮' },
      { key: null, label: '僵尸水族馆', icon: null, desc: '敬请期待' },
      { key: null, label: '消消乐·转', icon: null, desc: '敬请期待' },
      { key: 'little_trouble', label: '小僵尸大麻烦', icon: 'LILYPAD', desc: '泳池上的迷你僵尸' },
      { key: 'portal_combat', label: '传送门战斗', icon: 'CACTUS', desc: '传送门夹击' },
      { key: 'column', label: '列队僵尸', icon: 'FLOWERPOT', desc: '一列一列打' },
      { key: 'bobsled_bonanza', label: '雪橇大丰收', icon: 'BOBSLED', desc: '雪橇小队来袭' },
      { key: 'zombies_speed', label: '高速僵尸', icon: 'FOOTBALL', desc: '僵尸喝了红牛' },
      { key: 'whack', label: '打僵尸', icon: 'NORMAL', desc: '冒头就敲' },
      { key: 'last_stand', label: '最后防线', icon: 'TALLNUT', desc: '巨额阳光守到底' },
      { key: 'war_and_peas_2', label: '豌豆大战2', icon: 'GATLINGPEA', desc: '更密集的豌豆' },
      { key: 'bowling2', label: '保龄球·极', icon: 'GIANTWALLNUT', desc: '巨型坚果登场' },
      { key: 'pogo_party', label: '跳跳派对', icon: 'POGO', desc: '跳跳僵尸狂欢' },
      { key: 'final_boss', label: '最终Boss', icon: 'BOSS', desc: '僵王博士决战' },
    ],
  },
  puzzle: {
    title: '解谜模式',
    // 原版 CHALLENGE_PAGE_PUZZLE: 花瓶终结者 10 关 + 我是僵尸 10 关
    items: [
      { key: 'vasebreaker', label: '花瓶终结者 I', icon: 'WALLNUT', desc: '砸罐子放植物' },
      { key: 'vasebreaker2', label: '花瓶终结者 II', icon: 'CHOMPER', desc: '向左双发射手登场' },
      { key: 'vasebreaker3', label: '花瓶终结者 III', icon: 'JALAPENO', desc: '魅惑菇与舞王' },
      { key: 'vasebreaker4', label: '花瓶终结者 IV', icon: 'PUFFSHROOM', desc: '小丑僵尸的狂欢' },
      { key: 'vasebreaker5', label: '花瓶终结者 V', icon: 'MAGNETSHROOM', desc: '磁力菇登场' },
      { key: 'vasebreaker6', label: '花瓶终结者 VI', icon: 'TALLNUT', desc: '火炬与高坚果' },
      { key: 'vasebreaker7', label: '花瓶终结者 VII', icon: 'SPIKEWEED', desc: '地刺阵' },
      { key: 'vasebreaker8', label: '花瓶终结者 VIII', icon: 'POGO', desc: '跳跳僵尸来袭' },
      { key: 'vasebreaker9', label: '花瓶终结者 IX', icon: 'GARGANTUAR', desc: '巨人僵尸压轴' },
      { key: 'vasebreaker_endless', label: '花瓶·无尽', icon: 'LEFTPEATER', desc: '巨人越来越多的罐子' },
      { key: 'izombie', label: '我是僵尸 I', icon: 'NORMAL', desc: '指挥僵尸吃脑' },
      { key: 'izombie2', label: '我是僵尸 II', icon: 'CONE', desc: '夜晚指挥官' },
      { key: 'izombie3', label: '我是僵尸 III', icon: 'BUCKET', desc: '铜墙铁壁防线' },
      { key: null, label: '僵尸 IV', icon: null, desc: '敬请期待' },
      { key: null, label: '僵尸 V', icon: null, desc: '敬请期待' },
      { key: null, label: '僵尸 VI', icon: null, desc: '敬请期待' },
      { key: null, label: '僵尸 VII', icon: null, desc: '敬请期待' },
      { key: null, label: '僵尸 VIII', icon: null, desc: '敬请期待' },
      { key: null, label: '僵尸 IX', icon: null, desc: '敬请期待' },
      { key: null, label: '僵尸·无尽', icon: null, desc: '敬请期待' },
    ],
  },
  survival: {
    title: '生存模式',
    // 原版 CHALLENGE_PAGE_SURVIVAL: 普通 5 + 困难 5
    items: [
      { key: 'survival_day', label: '白天生存', icon: 'SUNFLOWER', desc: '白天草坪' },
      { key: 'survival_night', label: '黑夜生存', icon: 'PUFFSHROOM', desc: '黑夜墓园' },
      { key: 'survival_pool', label: '泳池生存', icon: 'LILYPAD', desc: '水陆两线' },
      { key: 'survival_fog', label: '浓雾生存', icon: 'PLANTERN', desc: '视野受限' },
      { key: 'survival_roof', label: '屋顶生存', icon: 'CABBAGEPULT', desc: '屋顶花盆' },
      { key: 'survival_day_hard', label: '白天生存·难', icon: 'GATLINGPEA', desc: '全兵种僵尸' },
      { key: 'survival_night_hard', label: '黑夜生存·难', icon: 'DOOMSHROOM', desc: '重甲军团' },
      { key: 'survival_pool_hard', label: '泳池生存·难', icon: 'TANGLEKELP', desc: '海豚雪橇齐上阵' },
      { key: 'survival_fog_hard', label: '浓雾生存·难', icon: 'MAGNETSHROOM', desc: '矿工气球夜袭' },
      { key: 'survival_roof_hard', label: '屋顶生存·难', icon: 'MELONPULT', desc: '投石车与巨人' },
    ],
  },
};

Screens.modeSelect = {
  group: 'minigames',
  hover: null,
  _cells: null,
  enter(group) { this.group = group || 'minigames'; },
  // 原版 ChallengeScreen 构造: 挑战/解谜页 (38+col*155, 93+row*119); 生存页 (38+col*155, 125+row*145)
  cells() {
    const g = MODE_GROUPS[this.group];
    const isSurvival = this.group === 'survival';
    const cells = [];
    g.items.forEach((it, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      const y = isSurvival ? 125 + row * 145 : 93 + row * 119;
      cells.push({ ...it, x: 38 + col * 155, y, w: 104, h: 115 });
    });
    return cells;
  },
  draw(ctx) {
    const g = MODE_GROUPS[this.group];
    const game = Screens.game;
    // 背景 (原版 IMAGE_CHALLENGE_BACKGROUND @ 0,0)
    const bg = img('challenge_background.jpg');
    if (bg) {
      ctx.drawImage(bg, 0, 0, 800, 600);
    } else {
      ctx.fillStyle = '#1a1206'; ctx.fillRect(0, 0, 800, 600);
      const bg1 = img('background1.jpg');
      if (bg1) { ctx.globalAlpha = 0.25; ctx.drawImage(bg1, -220, 0); ctx.globalAlpha = 1; }
      ctx.fillStyle = 'rgba(10,6,2,0.6)'; ctx.fillRect(0, 0, 800, 600);
    }
    // 标题 (原版: PvzpDrawString 400,58 居中 HouseOfTerror28 Color(220,220,220))
    pvzText(ctx, g.title, 400, 62, 30, '#e4e4e4');
    // 奖杯计数 (原版: TROPHY 0.5x @718,26 + "N/M" @739,73 黄色)
    const trophy = img('trophy_hi_res.png');
    if (trophy) ctx.drawImage(trophy, 718, 26, trophy.width * 0.5, trophy.height * 0.5);
    const total = g.items.length;
    const got = 0;
    ctx.save();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgb(255,240,0)';
    ctx.fillText(`${got}/${total}`, 739, 83);
    ctx.restore();
    // 格子 (原版 DrawButton: CHALLENGE_WINDOW@(-6,-2) + thumbnail@(+13,+4) + 名字)
    const cells = this.cells();
    this._cells = cells;
    const hover = Screens.hover;
    const UIm = __getUI();
    const win = img('challenge_window.png');
    const winHl = img('challenge_window_highlight.png');
    const lockImg = img('lock.png');
    const miniTrophy = img('minigame_trophy.png');
    cells.forEach((c, i) => {
      const hov = hover === 'mode' + i;
      const locked = !c.key;
      // 窗口框 (原版 118x120 图 @ -6,-2)
      const wimg = hov && !locked ? winHl : win;
      if (wimg) {
        ctx.save();
        if (locked) { ctx.globalAlpha = 0.55; }
        ctx.drawImage(wimg, c.x - 6, c.y - 2);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = locked ? 'rgba(40,30,16,0.55)' : hov ? 'rgba(120,90,40,0.62)' : 'rgba(60,44,20,0.55)';
        ctx.strokeStyle = locked ? 'rgba(70,54,30,0.6)' : hov ? '#ffe9a8' : 'rgba(90,70,40,0.8)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, 10);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // 图标 (原版 thumbnails @ +13,+4 ~78px; 此处用植物/僵尸缩略图)
      let icon = null;
      if (c.icon && UIm) {
        icon = PLANTS[c.icon] ? UIm.getThumb(c.icon) : UIm.getZombieThumb(c.icon);
      }
      if (icon) {
        ctx.save();
        if (locked) { ctx.globalAlpha = 0.35; }
        else if (hov) { ctx.globalAlpha = 1; ctx.filter = 'brightness(1.15)'; }
        // 等比适配到 72x86 区域 (原版 cel 区)
        const s = Math.min(72 / icon.width, 86 / icon.height);
        ctx.drawImage(icon, c.x + 13 + (78 - icon.width * s) / 2, c.y + 6 + (86 - icon.height * s) / 2, icon.width * s, icon.height * s);
        ctx.restore();
      }
      // 锁定: LOCK 图 0.7x @ (+24,+9) (原版未解锁项)
      if (locked && lockImg) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(lockImg, c.x + 24, c.y + 9, lockImg.width * 0.7, lockImg.height * 0.7);
        ctx.restore();
      }
      // 名称 (原版 ButtonWidget label: 居中格下部)
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
      ctx.fillStyle = locked ? '#8a7a5a' : (hov ? '#fff8e0' : '#f0e0b8');
      ctx.fillText(c.label.length > 7 ? c.label.slice(0, 7) : c.label, c.x + c.w / 2, c.y + 102);
      ctx.restore();
    });
    // 返回按钮 (原版 mBackButton: SEEDCHOOSER_BUTTON2 @18,568 111x26 "回到菜单")
    this._back = { x: 18, y: 568, w: 111, h: 26 };
    const backBtn = img('seedchooser_button2.png');
    if (backBtn) {
      ctx.drawImage(backBtn, 18, 568);
      ctx.save();
      ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgb(42,42,90)';
      ctx.fillText('回到菜单', 18 + 55, 568 + 18);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#a03a3a';
      ctx.beginPath(); ctx.roundRect(18, 568, 111, 26, 5); ctx.fill();
      ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('回到菜单', 73, 586);
      ctx.restore();
    }
  },
  click(p, game) {
    if (this._back && inRect(p, this._back.x, this._back.y, this._back.w, this._back.h)) {
      game.audio.play('buttonclick');
      game.state = 'menu';
      return;
    }
    for (const c of (this._cells || [])) {
      if (inRect(p, c.x, c.y, c.w, c.h)) {
        if (!c.key) { game.audio.play('buzzer'); return; }   // 未实作项
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
      // 原版页3 (STORE_PAGE_ZEN1): 金盏花×3 + 金壶 + 肥料 + 杀虫剂 + 唱片 + 手套 = 8 格
      all.filter(i => ['marigold1', 'marigold2', 'marigold3', 'goldwatering', 'fertilizer', 'bugspray', 'phonograph', 'glove'].includes(i.key)),
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
    this.signT = 0;   // 招牌降落动画计时 (原版 aStoreSignPosY: -150→0 EASE_IN_OUT)
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
    // 戴夫 reanim (原版 StoreScreen::Draw: gCrazyDave = Graphics(*g); mTransX -= 42; mTransY += 68)
    // 原版无缩放绘制: 屏幕空间 (-42, 68), 模型 353x853 → 头 y≈174, 躯干至屏底, 站汽车左侧
    if (!this.daveAnim && RE.hasDef('CrazyDave')) {
      const d = Assets.reanim('CrazyDave');
      d.x = -42; d.y = 68;
      d.play('anim_idle', RE.LOOP, 18);
      this.daveAnim = d;
    }
  },
  draw(ctx) {
    const game = Screens.game;
    // ---- 背景 + 车 + 招牌 (原版 StoreScreen::Draw 1:1 坐标) ----
    const bg = img('store_background.jpg');
    if (bg) {
      ctx.drawImage(bg, 0, 0, 800, 600);
    } else {
      ctx.fillStyle = '#2a2018'; ctx.fillRect(0, 0, 800, 600);
    }
    // 招牌降落动画 (原版 aStoreSignPosY: PvzpAnimateCurve(50,110,time,-150,0,EASE_IN_OUT))
    this.signT = Math.min(110, (this.signT || 0) + 1);
    const signP = Math.min(1, Math.max(0, (this.signT - 50) / 60));
    const signEase = signP < 0.5 ? 2 * signP * signP : 1 - Math.pow(-2 * signP + 2, 2) / 2;
    const signPosY = -150 + 150 * signEase;
    const car = img('store_car.png');            // 车身 (后备箱开启) @ (196,138)
    if (car) ctx.drawImage(car, 196, 138);
    const hatch = img('store_hatchbackopen.png'); // 开启的后备箱盖 @ (299,0)
    if (hatch) ctx.drawImage(hatch, 299, 0);
    // 招牌 (原版 285, signPosY)
    const sign = img('store_sign.png');
    if (sign) ctx.drawImage(sign, 285, Math.round(signPosY));
    // ---- 戴夫 (原版: 车身之后绘制, 站在车左侧 (158,278)) ----
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
      // 金盏花: 每日限购 — 原版 purchases[marigoldN]=daysSince2000 日期判定
      const marigoldSold = it.key.startsWith('marigold') && game && game.purchased[it.key + '_day'] === new Date().toDateString();
      const bought = marigoldSold || (game && game.purchased[it.key]);
      const hov = this.hoverItem === i && !bought;
      const can = game && game.coins >= it.cost;
      const pop = bought ? 0 : (hov ? Math.sin(t * 6) * 2 : 0);
      this._cells.push({ x: pos.x, y: pos.y, w: 50, h: 87, item: it, i, bought });
      ctx.save();
      ctx.translate(pos.x + 25, pos.y + 44 + pop);
      // 图标
      if ((it.icon === 'plant' || PLANTS[it.icon]) && PLANTS[it.key]) {
        const UIm = __getUI();
        const th = (UIm && UIm.getThumb) ? UIm.getThumb(it.key) : null;
        if (th) ctx.drawImage(th, -25, -34, 50, 68);
      } else if (PLANTS[it.icon]) {
        const UIm = __getUI();
        const th = (UIm && UIm.getThumb) ? UIm.getThumb(it.icon) : null;
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
    // ---- 翻页按钮 (原版 mPrevButton @252,402 / mNextButton @596,402 原尺寸) (#12) ----
    const prev = img('store_prevbutton.png');
    const next = img('store_nextbutton.png');
    const prevHov = img('store_prevbuttonhighlight.png');
    const nextHov = img('store_nextbuttonhighlight.png');
    this._prev = { x: 252, y: 402, w: prev ? prev.width : 96, h: prev ? prev.height : 75 };
    this._next = { x: 596, y: 402, w: next ? next.width : 136, h: next ? next.height : 83 };
    const pages = this.PAGES();
    const hasPrev = this.page > 0;
    const hasNext = this.page < pages.length - 1;
    const hovPrev = this._hoverBtn === 'prev', hovNext = this._hoverBtn === 'next';
    if (hasPrev) {
      const p = (hovPrev && prevHov) ? prevHov : prev;
      if (p) ctx.drawImage(p, this._prev.x, this._prev.y);
    }
    if (hasNext) {
      const p = (hovNext && nextHov) ? nextHov : next;
      if (p) ctx.drawImage(p, this._next.x, this._next.y);
    }
    // 页码 (原版 [STORE_PAGE] @ 470,500)
    ctx.save();
    ctx.font = '13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgb(80,80,80)';
    ctx.fillText(`第 ${this.page + 1} 页 / 共 ${pages.length} 页`, 470, 500);
    ctx.restore();
    // ---- 主菜单按钮 (原版 mBackButton @366,512 原尺寸 138x80, 底部中央; 旧(40,545)挡车尾) (#12) ----
    const mmb = img(this._hoverBtn === 'mainmenu' ? 'store_mainmenubuttonhighlight.png' : 'store_mainmenubutton.png');
    this._mainmenu = { x: 366, y: 512, w: mmb ? mmb.width : 138, h: mmb ? mmb.height : 80 };
    if (mmb) ctx.drawImage(mmb, this._mainmenu.x, this._mainmenu.y);
    else {
      ctx.fillStyle = '#5a4a2a';
      ctx.beginPath(); ctx.roundRect(this._mainmenu.x, this._mainmenu.y, 138, 80, 8); ctx.fill();
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#f4e6b0';
      ctx.fillText('返回主菜单', 435, 556);
    }
    // ---- 戴夫气泡 (原版 DrawCrazyDave: IMAGE_STORE_SPEECHBUBBLE2 @ (285,20) 原尺寸 280x183) ----
    if (this.bubble) {
      const bubbleImg = img('store_speechbubble2.png') || img('store_speechbubble.png');
      const bx = 285, by = 20, bw = bubbleImg ? bubbleImg.width : 280, bh = bubbleImg ? bubbleImg.height : 183;
      ctx.save();
      if (bubbleImg) {
        ctx.drawImage(bubbleImg, bx, by);
      } else {
        ctx.fillStyle = '#f8f4e0';
        ctx.strokeStyle = '#8a8a7a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill(); ctx.stroke();
      }
      const txt = this.bubble.lines[this.bubble.line] || '';
      ctx.fillStyle = '#3a3222';
      ctx.font = '15px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      this._wrapText(ctx, txt, bx + 25, by + 30, bw - 50, 20);
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
    // 主菜单 (或返回禅境花园 — 原版 OpenStore 后回花园)
    if (this._mainmenu && inRect(p, this._mainmenu.x, this._mainmenu.y, this._mainmenu.w, this._mainmenu.h)) {
      game.audio.play('gravebutton');
      if (this.returnState === 'zengarden') {
        this.returnState = null;
        game.state = 'zengarden';
        Screens.zengarden.enter();
      } else {
        game.state = 'menu';
      }
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
        const marigoldSold = it.key.startsWith('marigold') && game.purchased[it.key + '_day'] === new Date().toDateString();
        if (game.purchased[it.key] || marigoldSold) { game.audio.play('buzzer'); return; }
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
    // 模式胜利 → 回对应模式选择页 (三页独立, 不互切)
    const group = game.modeKey && game.modeKey.startsWith('survival') ? 'survival'
      : game.modeKey && (game.modeKey.startsWith('vasebreaker') || game.modeKey.startsWith('izombie')) ? 'puzzle'
      : 'minigames';
    game.state = 'modeselect';
    Screens.modeSelect.enter(group);
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
// 禅境花园 v2 (逐行对照 PvZ-Portable ZenGarden.cpp 2461 行 + Board.cpp
//   工具栏/CanUseGameObject/GetZenButtonRect + CursorObject.cpp 工具光标
//   + StoreScreen 商店页 + Plant.cpp UpdateReanim 盆栽缩放/成长动画)
//   · 三花园: 温室(8x4) / 蘑菇园(8散点) / 水族馆(8散点) + 手推车搬运
//   · 时钟驱动需求 (GetPlantsNeed: 浇水15s阈值/当日满足/1小时肥料)
//   · 成长链: 芽 → 小(定型) → 中 → 成熟; 中/成熟带 100 帧缩放成长动画
//     (原版 mStateCountdown=100 + PvzpAnimateCurve 线性插值)
//   · 工具栏: 顶部 shovelbank 槽位横排 (原版 GetZenButtonRect: y=0, x=槽序×70)
//     消耗品 xN 角标 / 空库存灰化 / 30s 无操作上滑隐藏 (ZEN_FADING)
//   · 巧克力: 喂植物(300s 高速动画+产币加速) / 喂蜗牛(3600s 2倍速+残影)
//   · 蜗牛 Stinky: 金币权重寻路(金-40/钻-80) / 180s 睡眠 / 巧克力残影
//   · 金盏花 11 色变种 (原版 DrawVariation MARIGOLD_WHITE..LIGHT_GREEN)
//   · 戴夫教程: 拿壶→浇水→继续浇→商店→施肥 全流程按钮门控 + 免费补肥
//   · 卖植物: 通关冒险后解锁 $ 工具 (GetPlantSellPrice 价格表)
// ================================================================
Screens.zengarden = {
  // ---- 原版 SpecialGridPlacement 网格表 (ZenGarden.cpp:46-104) ----
  GRIDS: {
    greenhouse: [
      [73, 73], [155, 71], [239, 68], [321, 73], [406, 71], [484, 67], [566, 70], [648, 72],
      [67, 168], [150, 165], [232, 170], [314, 175], [416, 173], [497, 170], [578, 164], [660, 168],
      [41, 268], [130, 266], [219, 260], [310, 266], [416, 267], [504, 261], [594, 265], [684, 269],
      [37, 371], [124, 369], [211, 368], [302, 369], [425, 375], [512, 368], [602, 365], [691, 368],
    ],
    mushroomgarden: [
      [110, 441], [237, 360], [298, 458], [355, 296], [387, 203], [460, 385], [486, 478], [552, 283],
    ],
    aquarium: [
      [113, 185], [306, 120], [356, 270], [622, 120], [669, 270], [122, 355], [365, 458], [504, 417],
    ],
  },
  GARDEN_LABEL: { greenhouse: '禅境花园', mushroomgarden: '蘑菇园', aquarium: '水族馆' },
  BG: { greenhouse: 'background_greenhouse.jpg', mushroomgarden: 'background_mushroomgarden.jpg', aquarium: 'aquarium1.jpg' },
  COIN_VAL: { silver: 10, gold: 25, diamond: 100 },
  // 原版 PlantPottedDrawHeightOffset (ZenGarden.cpp:1190-1267): [高度偏移, 缩放修正]
  POTTED_DH: {
    GRAVEBUSTER: [50, 15], PUFFSHROOM: [10, 24], SUNSHROOM: [10, 17], SCAREDYSHROOM: [5, 5],
    TANGLEKELP: [-18, 20], SEASHROOM: [-20, 15], LILYPAD: [-10, 30],
    HYPNOSHROOM: [0, 10], MARIGOLD: [0, 10], PEASHOOTER: [0, 10], REPEATER: [0, 10], LEFTPEATER: [0, 10],
    SNOWPEA: [0, 10], THREEPEATER: [0, 10], SUNFLOWER: [0, 10], STARFRUIT: [10, 24],
    CABBAGEPULT: [3, 10], MELONPULT: [3, 10], POTATOMINE: [0, 5], TORCHWOOD: [0, 3],
    SPIKEWEED: [-13, 10], BLOVER: [0, 10], PUMPKIN: [0, 20], PLANTERN: [0, -1],
  },

  // ---- 工具栏常量 (原版 GetZenButtonRect: y=0 起, 每可用工具 +SHOVELBANK 宽) ----
  SLOT_W: 70, SLOT_H: 72, TRAY_Y: 0,
  // 工具图标相对槽位偏移 (原版 Board::DrawZenButtons 各 case 偏移)
  TOOL_ICON: {
    water: ['wateringcan.png', -2, -6], fertilizer: ['fertilizer.png', -6, -7],
    bugspray: ['zengarden_bugspray_bottle.png', 0, -1], phonograph: ['phonograph.png', 2, 2],
    chocolate: ['chocolate.png', 6, 4], glove: ['zen_gardenglove.png', -6, -4],
    sell: ['zen_moneysign.png', -5, -4], wheelbarrow: ['zen_wheelbarrow.png', -7, -3],
  },
  // 持工具光标偏移 (原版 CursorObject::Draw 各 case)
  CURSOR_OFF: {
    water: [-3, 12], fertilizer: [-15, 0], bugspray: [-9, -1], phonograph: [-17, 10],
    chocolate: [-2, -8], glove: [-17, 15], sell: [-17, -10], wheelbarrow: [-20, -30],
  },
  // 金盏花 11 色变种 (原版 VARIATION_MARIGOLD_WHITE..LIGHT_GREEN, canvas filter 近似)
  MARIGOLD_FILTERS: [
    'saturate(0.12) brightness(1.32)',              // 0 白
    'hue-rotate(215deg) saturate(1.5)',             // 1 洋红
    'hue-rotate(-24deg) saturate(1.25)',            // 2 橙
    'hue-rotate(188deg) saturate(1.05)',            // 3 粉
    'hue-rotate(140deg) saturate(1.2)',             // 4 浅蓝
    'hue-rotate(-45deg) saturate(1.75)',            // 5 红
    'hue-rotate(160deg) saturate(1.45)',            // 6 蓝
    'hue-rotate(235deg) saturate(1.4)',             // 7 紫
    'hue-rotate(205deg) saturate(0.72) brightness(1.15)', // 8 淡紫
    'saturate(1.05)',                               // 9 黄 (原色)
    'hue-rotate(45deg) saturate(0.85) brightness(1.12)',  // 10 浅绿
  ],
  VAR_CN: ['白', '洋红', '橙', '粉', '浅蓝', '红', '蓝', '紫', '淡紫', '黄', '浅绿'],

  // 花盆位置 (原版格点; 命中区 80×85 = PixelToGridX/Y)
  cellPos(col, row) {
    const g = this.GRIDS[this.data.garden];
    const cell = g && g[row * 8 + col];
    return cell ? { x: cell[0], y: cell[1] } : { x: 172 + col * 70, y: 150 + row * 88 };
  },
  gridOf(garden) { return this.GRIDS[garden] || this.GRIDS.greenhouse; },
  ownedGardens(game) {
    const g = ['greenhouse'];
    if (game.purchased.mushroomgarden) g.push('mushroomgarden');
    if (game.purchased.aquarium) g.push('aquarium');
    return g;
  },

  // 原版 PlantPottedDrawHeightOffset: height + (scale*fix − fix)
  pottedDH(seed, scale) {
    const e = seed ? this.POTTED_DH[seed] : null;
    return e ? e[0] + e[1] * (scale - 1) : 0;
  },
  // 原版 PlantFlowerPotHeightOffset (Plant.cpp:3485-3535): 盆上植物偏移 (mini 绘制用)
  flowerPotOff(seed, scale) {
    let h = -5 * scale, fix = 0;
    if (seed === 'CHOMPER' || seed === 'PLANTERN') h -= 5;
    else if (seed === 'SCAREDYSHROOM') { h += 5; fix = -8; }
    else if (seed === 'SUNSHROOM' || seed === 'PUFFSHROOM' || seed === 'SEASHROOM' || seed === 'POTATOMINE') fix = -4;
    else if (seed === 'LILYPAD') fix = -16;
    else if (seed === 'COFFEEBEAN') fix = -20;
    else if (['HYPNOSHROOM', 'MAGNETSHROOM', 'PEASHOOTER', 'REPEATER', 'LEFTPEATER', 'SNOWPEA', 'THREEPEATER',
      'SUNFLOWER', 'MARIGOLD', 'CABBAGEPULT', 'MELONPULT', 'TANGLEKELP', 'BLOVER', 'SPIKEWEED'].includes(seed)) fix = -8;
    return h + (scale * fix - fix);
  },
  // 原版 Plant::UpdateReanim 盆栽分支 (Plant.cpp:2798-2849) 精确移植:
  //   y = 格Y + H_OFFSET[seed] −5(盆上) + 成长插值Y + PottedDH; 面左镜像 x+80−animX, scaleX 取负
  plantDrawParams(p, garden) {
    const seed = (p.age > 0 && p.seed) ? p.seed : null;
    const g = garden || p.garden;
    const inPot = g === 'greenhouse' || (g === 'mushroomgarden' && seed && AQUATIC.has(seed));
    // 成长状态 (原版 mStateCountdown=100 帧线性插值)
    let ax = 0, ay = 0, sc = 1;
    if (p.age === 1) { ax = 20; ay = 40; sc = 0.5; }
    else if (p.age === 2) {
      if (p.growT > 0) { const k = 1 - p.growT / 1.6; ax = 20 - 10 * k; ay = 40 - 20 * k; sc = 0.5 + 0.25 * k; }
      else { ax = 10; ay = 20; sc = 0.75; }
    } else if (p.age === 3 && p.growT > 0) {
      const k = 1 - p.growT / 1.6; ax = 10 - 10 * k; ay = 20 - 20 * k; sc = 0.75 + 0.25 * k;
    }
    const isPotato = seed === 'POTATOMINE';
    if (isPotato) sc *= 0.8;                       // 原版 UpdateReanim 土豆雷特例
    let dy = (seed ? (H_OFFSET[seed] || 0) : 0) + (inPot ? -5 : 0) + ay + (isPotato ? 12 : 0);
    let dx = isPotato ? 12 : 0;
    if (p.facing === 1) dx = 80 + dx - ax - (isPotato ? 6 : 0);   // 面左镜像 (80 锚点 + ZenPlantOffsetX)
    else dx += ax;
    dy += this.pottedDH(seed, sc);
    return { dx, dy, sx: p.facing === 1 ? -sc : sc, sy: sc, sc, inPot };
  },

  // ---------- 存档 (PottedPlant 列表, 原版 mPlayerInfo->mPottedPlant) ----------
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('webpvz_garden') || 'null'); } catch (e) { }
    if (d && d.v === 3 && Array.isArray(d.plants)) { this.data = d; return; }
    // v2 → v3 迁移: 补巧克力/蜗牛位置/金盏花变种/教程步进
    if (d && d.v === 2 && Array.isArray(d.plants)) {
      d.v = 3;
      d.chocolate = d.chocolate || 0;
      d.stinkyPos = d.stinkyPos || null;
      d.stinkyChoc = d.stinkyChoc || 0;
      d.tutStep = d.tutStep || null;
      for (const p of d.plants) {
        p.lastChocolate = p.lastChocolate || 0;
        p.growT = 0;
        if (p.variation === undefined) p.variation = (p.seed === 'MARIGOLD' || p.isMarigold) ? Math.floor(Math.random() * 11) : -1;
      }
      this.data = d; this.save(); return;
    }
    // 旧版 4x8 网格存档迁移
    let oldFert = 5, oldSpray = 2;
    if (d && Array.isArray(d.plants) && d.plants.length === 4 && d.plants.every(r => Array.isArray(r))) {
      oldFert = d.fertilizer || 0; oldSpray = d.bugspray || 0;
      const plants = [];
      d.plants.forEach((row, r) => row.forEach((c, i) => {
        if (!c) return;
        plants.push(this.newPlant(c.type || null, {
          age: Math.min(3, c.stage || 0), timesFed: c.fed || 0,
          feedingsPerGrow: c.needMax || 3, isMarigold: c.type === 'MARIGOLD',
        }));
        plants[plants.length - 1].garden = 'greenhouse';
        plants[plants.length - 1].x = i; plants[plants.length - 1].y = r;
      }));
      this.data = { v: 3, plants, fertilizer: oldFert, bugspray: oldSpray, chocolate: 0, garden: d.garden === 'mushroomgarden' || d.garden === 'aquarium' ? d.garden : 'greenhouse', stinkyWake: 0, stinkyChoc: 0, stinkyPos: null, tutStep: null };
      this.save(); return;
    }
    // 初始: 空花园 (原版首次进入由戴夫 2102 对话赠送 2 株金盏花芽)
    this.data = { v: 3, plants: [], fertilizer: 0, bugspray: 0, chocolate: 0, garden: 'greenhouse', stinkyWake: 0, stinkyChoc: 0, stinkyPos: null, tutStep: null };
    this.save();
  },
  // 原版 PottedPlant::InitializePottedPlant: facing 随机 / feedingsPerGrow 3-5 / 变种随机
  newPlant(seed, opts = {}) {
    return {
      seed: seed || null,          // null = 未知新芽 (长成 SMALL 时 PickRandomSeedType 定型)
      isMarigold: !!opts.isMarigold,
      garden: opts.garden || 'greenhouse',
      x: opts.x || 0, y: opts.y || 0,
      facing: Math.random() < 0.5 ? 0 : 1,
      age: opts.age || 0,          // 0芽 1小 2中 3成熟
      timesFed: opts.timesFed || 0,
      feedingsPerGrow: opts.feedingsPerGrow || (3 + Math.floor(Math.random() * 3)),
      need: 'none',
      lastWatered: 0, lastNeedFulfilled: 0, lastFertilized: 0, lastChocolate: 0,
      variation: opts.variation !== undefined ? opts.variation
        : ((seed === 'MARIGOLD' || opts.isMarigold) ? Math.floor(Math.random() * 11) : -1),
      launchCounter: 0, growT: 0,
    };
  },
  save() {
    try {
      const d = { ...this.data, plants: this.data.plants.map(p => {
        const o = {}; for (const k in p) if (k[0] !== '_') o[k] = p[k]; return o;
      }) };
      localStorage.setItem('webpvz_garden', JSON.stringify(d));
    } catch (e) { }
  },
  // 原版 IsZenGardenFull: 温室 32 格满 (含推车植物)
  isFull() {
    return this.data.plants.filter(p => p.garden === 'greenhouse').length >= 32;
  },

  // ---------- 时钟 (原版 time(nullptr) 实时秒) ----------
  now() { return Math.floor(Date.now() / 1000); },
  sameDay(a, b) {
    const d1 = new Date(a * 1000), d2 = new Date(b * 1000);
    return d1.getFullYear() === d2.getFullYear() &&
      Math.floor((d1 - new Date(d1.getFullYear(), 0, 0)) / 86400000) ===
      Math.floor((d2 - new Date(d2.getFullYear(), 0, 0)) / 86400000);
  },
  // 原版 WasPlantNeedFulfilledToday: 1小时内 或 同一自然日
  fulfilledToday(p) {
    const n = this.now();
    return n - p.lastNeedFulfilled < 3600 || this.sameDay(p.lastNeedFulfilled, n);
  },
  fertilizedRecently(p) { return this.now() - p.lastFertilized < 3600; },
  // 原版 PlantShouldRefreshNeed: 距上次浇水≥1小时 且 跨日
  shouldRefreshNeed(p) {
    if (this.now() - p.lastWatered < 3600) return false;
    return !this.sameDay(p.lastWatered, this.now());
  },

  // ---------- 需求计算 (原版 GetPlantsNeed, ZenGarden.cpp:843-908 逐行移植) ----------
  getNeed(p) {
    if (p.age !== 0 && p.seed && MUSHROOMS.has(p.seed) && p.garden === 'greenhouse') return 'none';  // 夜习性植物只在蘑菇园活跃
    if (p.garden === 'wheelbarrow') return 'none';
    const n = this.now();
    const tooLong = n - p.lastWatered > 15;
    const tooShort = n - p.lastWatered < 3;
    if (this.fertilizedRecently(p) || this.fulfilledToday(p)) return 'none';
    if (p.seed && AQUATIC.has(p.seed) && p.age !== 0) {
      if (p.age === 3) return this.shouldRefreshNeed(p) ? 'none' : p.need;
      return p.garden === 'aquarium' ? 'fertilizer' : 'none';
    }
    if (!tooLong) return 'none';
    if (p.timesFed < p.feedingsPerGrow) return 'water';
    if (tooShort) return 'none';
    if (p.age !== 3) return 'fertilizer';
    if (this.shouldRefreshNeed(p)) return 'none';
    if (p.need !== 'none') return p.need;
    return 'water';
  },
  // 原版 UpdatePlantEffectState: 植物状态 (决定花盆加深/气泡/光晕)
  plantState(p) {
    const sleeping = p.seed && MUSHROOMS.has(p.seed) && p.garden !== 'mushroomgarden';
    const need = this.getNeed(p);
    if (need === 'water') return 'notready';
    if (need === 'none') {
      if (this.fulfilledToday(p)) return 'happy';
      if (sleeping) return 'notready';
      return 'watered';
    }
    return 'needy';
  },
  isSleeping(p) {
    return !!(p.seed && p.age > 0 && MUSHROOMS.has(p.seed) && p.garden !== 'mushroomgarden');
  },
  // 原版 PlantHighOnChocolate: 300 秒
  highOnChocolate(p) { return this.now() - (p.lastChocolate || 0) < 300; },
  // 原版 PlantCanHaveChocolate: 成熟 + 当日已满足 + 未处于巧克力兴奋
  canHaveChocolate(p) {
    return p.age === 3 && this.fulfilledToday(p) && !this.highOnChocolate(p);
  },

  // ---------- 生命周期 ----------
  enter() {
    if (!this.data) this.load();
    // 推车光标跨花园保留 (原版 CursorObject 挂在 Board 上, GotoNextGarden 不清)
    const keepBarrow = this.tool === 'wheelbarrow';
    this.tool = keepBarrow ? 'wheelbarrow' : null;   // 持有的工具 (原版 CursorType; null = 普通光标)
    this.heldPlant = null;         // 手套持有中的植物 (植物本来就留在原地)
    this.coins = [];
    this.tools = [];               // 使用中的工具动画
    this._pots = {};
    this._sproutM = {};
    this.bubble = null; this.sellAsk = null;
    this.arrowT = 0;
    this._ready = false;
    this.daveAnim = null;
    this.trayIdle = 0; this.trayFade = 0;    // ZEN_FADING: 30s 无操作 → 0.8s 上滑隐藏
    this.bankT = 0;                          // 金币银行显示计时 (原版 ShowCoinBank 300 帧)
    this.advice = null;
    this.puffs = [];               // 种植尘土粒子
    const game = Screens.game;
    // 按需加载花园素材 (garden/fx/ui + 全部植物包) 后再建模型
    Promise.resolve(Assets.ensureGarden ? Assets.ensureGarden() : null)
      .catch(() => { })
      .then(() => { this._ready = true; });
    // BGM: 原版 MUSIC_TUNE_ZEN_GARDEN
    if (game) game.audio.playBGM('garden');
    // 蜗牛 (原版 AddStinky: 已购买 + 主花园; 位置从存档恢复)
    this.stinky = null;
    if (game && game.purchased.stinky && this.data.garden === 'greenhouse') this.stinky = this.makeStinky();
    // 戴夫教程 (原版 SetupForZenTutorial: CrazyDaveTalkIndex(2100); 按钮门控)
    if (game && !game.daveSeen.zengarden) {
      const dialogs = Assets.data('dave_dialogs');
      this.bubble = { lines: ['2100', '2101', '2102', '2103', '2104'].map(id => dialogs['CRAZY_DAVE_' + id] || '').filter(t => t), line: 0, tutorial: true };
      game.markDaveSeen('zengarden');
      this.data.tutStep = 'pickup_water';
    }
    // 恢复中断的教程步进 (从商店回来等)
    this.tut = this.data.tutStep ? { step: this.data.tutStep } : null;
    this._daveIdle = false;
    // 教程自愈: 中断存档若已满足后续条件直接推进 (防主菜单按钮永久隐藏;
    //   首次进入的教程对话进行中不兜底 — 2102 句会赠送 2 株金盏花芽)
    if (this.tut && this.tut.step !== 'done' && !(this.bubble && this.bubble.tutorial)) {
      const ps = this.data.plants.filter(q => q.garden !== 'wheelbarrow');
      if (ps.length === 0) {
        for (let i = 0; i < 2; i++) this.addPottedPlant(this.newPlant('MARIGOLD', { isMarigold: true, feedingsPerGrow: 3 }));
        this.finishTutorial(game);
      } else if (ps.every(q => q.age >= 1)) {
        this.finishTutorial(game);
      } else if (['water_plant', 'keep_watering'].includes(this.tut.step) && ps.some(q => this.getNeed(q) === 'fertilizer')) {
        this.tut.step = 'visit_store'; this.data.tutStep = 'visit_store';
        this.save();
      }
    }
  },
  leaveToMenu(game) {
    // 原版 LeaveGarden: 未收金币自动入账 + 工具立即结算
    this.settleAndLeave(game);
    game.audio.playBGM('start_menu');
  },
  // 结算: 进行中工具立即生效 + 未收金币自动入账 + 蜗牛位置存档 (原版 LeaveGarden)
  settleAndLeave(game) {
    for (const t of this.tools) this.applyToolEffect(t);
    this.tools = [];
    let got = 0;
    for (const c of this.coins) if (!c.scored) { got += c.value; c.scored = true; }
    if (got > 0 && game) { game.coins += got; game.saveShop(); }
    this.coins = [];
    if (this.stinky) this.data.stinkyPos = [Math.round(this.stinky.x), Math.round(this.stinky.y)];
    // 教程中断保护: 尚无植物 → 补 2 株金盏花芽并结束教程 (原版 2102 赠礼的兜底)
    if (this.tut && this.tut.step !== 'done' && this.data.plants.length === 0) {
      for (let i = 0; i < 2; i++) this.addPottedPlant(this.newPlant('MARIGOLD', { isMarigold: true, feedingsPerGrow: 3 }));
      this.finishTutorial(game);
    }
    this.save();
  },
  // ---------- 教程 (原版 TutorialState ZEN_GARDEN 系列) ----------
  setAdvice(txt, long) { this.advice = { txt, t: 0, life: long ? 9 : 6 }; },
  finishTutorial(game) {
    this.tut = { step: 'done' };
    this.data.tutStep = null;
    if (game) game.markDaveSeen('zenTutorialDone');
    this.setAdvice('教程完成！ 好好照料你的花园吧！', true);
    this.save();
  },
  menuVisible() { return !this.tut || this.tut.step === 'done'; },
  storeVisible() { return !this.tut || ['visit_store', 'fertilize', 'done'].includes(this.tut.step); },

  // ---------- 模型 ----------
  // 每株植物独立 reanim 实例 (巧克力变速/睡眠层/水族馆层 均为植株级状态)
  plantModel(p) {
    if (p._r) return p._r;
    try {
      const def = PLANTS[p.seed];
      if (!def || !RE.hasDef(def.reanim)) return null;
      p._r = Assets.reanim(def.reanim);
      const base = def.anim || 'anim_idle';
      p._r.play(p._r.animExists(base) ? base : 'anim_idle', RE.LOOP, 10 + Math.random() * 5);
      p._sleepDrawn = false;
    } catch (e) { p._r = null; }
    return p._r;
  },
  // 芽 (原版 REANIM_ZENGARDEN_SPROUT: 非金盏花 anim_idle_noflower / 金盏花 anim_idle)
  sproutModel(marigold) {
    const key = marigold ? 'mf' : 'm';
    if (this._sproutM[key]) return this._sproutM[key];
    let r = null;
    try {
      if (RE.hasDef('ZenGarden_sprout')) {
        r = Assets.reanim('ZenGarden_sprout');
        const a = (!marigold && r.animExists('anim_idle_noflower')) ? 'anim_idle_noflower' : 'anim_idle';
        r.play(a, RE.LOOP, 8);
      }
    } catch (e) { r = null; }
    this._sproutM[key] = r;
    return r;
  },
  // 花盆 (原版 REANIM_POT: anim_zengarden 带叶盆 / anim_waterplants 水生盆;
  //   需求期 Pot_top 换 pot_top_dark 湿土色 — UpdatePlantEffectState)
  potModel(dark, water) {
    const key = (dark ? 'd' : 'n') + (water ? 'w' : 'g');
    if (this._pots[key]) return this._pots[key];
    let r = null;
    try {
      if (RE.hasDef('Pot')) {
        r = Assets.reanim('Pot');
        const layer = water && r.animExists('anim_waterplants') ? 'anim_waterplants'
          : (r.animExists('anim_zengarden') ? 'anim_zengarden' : 'anim_idle');
        r.play(layer, RE.LOOP, 6);
        if (dark && r.trackExists('Pot_top')) {
          try { r.setImageOverride('Pot_top', 'pot_top_dark.png'); } catch (e) { }
        }
      }
    } catch (e) { r = null; }
    this._pots[key] = r;
    return r;
  },

  // ---------- 原版动作 ----------
  // PlantWatered (ZenGarden.cpp:648-674): 计数+1, 时间戳回拨0-8s, 掉银币; 成熟且无需求 → 随机产生除虫/唱片需求
  plantWatered(p, pos) {
    p.timesFed++;
    // 原版: 时间回拨 0-8s; 教程浇水步固定 9s (延迟需求再现)
    const tutWater = this.tut && (this.tut.step === 'water_plant' || this.tut.step === 'keep_watering');
    p.lastWatered = this.now() - (tutWater ? 9 : Math.floor(Math.random() * 9));
    const game = Screens.game;
    if (game) game.audio.play('points');   // FOLEY_SPAWN_SUN
    this.dropCoin(pos.x + 40, pos.y, 'silver');
    if (p.age === 3 && p.need === 'none') {
      p.need = Math.random() < 0.5 ? 'bugspray' : 'phonograph';
    }
    // 教程: 首次浇水 → KEEP_WATERING
    if (this.tut && this.tut.step === 'water_plant') {
      this.tut.step = 'keep_watering'; this.data.tutStep = 'keep_watering';
      this.setAdvice('继续浇水， 直到植物需要肥料！');
    }
    this.save();
  },
  // PlantFertilized (529-579): 升阶+需求清零; 芽→小苗定型; 中/成熟带成长动画; 各阶段掉币
  plantFertilized(p, pos) {
    const game = Screens.game;
    p.lastFertilized = this.now();
    p.age = Math.min(3, p.age + 1);
    p.need = 'none';
    p.timesFed = 0;
    if (p.age === 1 && !p.seed) {
      p.seed = p.isMarigold ? 'MARIGOLD' : this.pickRandomSeedType();   // 原版 PickRandomSeedType
      p._r = null;   // 换模型
    }
    // 原版 Plant::UpdateReanim mStateCountdown=100 帧线性插值成长 (≈1.6s)
    if (p.age === 2 || p.age === 3) p.growT = 1.6;
    if (game) { game.audio.play('plantgrow'); game.audio.play('points'); }
    if (p.age === 1) { this.dropCoin(pos.x + 40, pos.y, 'gold'); }
    else if (p.age === 2) { this.dropCoin(pos.x + 30, pos.y, 'gold'); this.dropCoin(pos.x + 50, pos.y, 'gold'); }
    else if (p.age === 3) {
      if (p.seed === 'MARIGOLD') this.dropCoin(pos.x + 40, pos.y, 'diamond');
      else { this.dropCoin(pos.x + 10, pos.y, 'diamond'); this.dropCoin(pos.x + 70, pos.y, 'diamond'); }
    }
    // 教程: 全部脱离芽期 → 完成; 肥料耗尽 → 免费补 5 (原版 DoFeedingTool 教程分支;
    //   赠礼同时标记已购 — 原版 purchases[FERTILIZER]=OFFSET+5 使工具栏常驻显示)
    if (this.tut && this.tut.step === 'fertilize') {
      if (this.data.plants.every(q => q.age >= 1)) {
        this.finishTutorial(game);
      } else if ((this.data.fertilizer || 0) <= 0) {
        this.data.fertilizer = 5;
        if (game) game.purchased.fertilizer = true;
        this.setAdvice('戴夫又给了你一些肥料！');
      }
    }
    this.save();
  },
  // PlantFulfillNeed (580-597): 除虫/唱片需求满足 → 当日开心 + 金币
  plantFulfillNeed(p, pos) {
    p.lastNeedFulfilled = this.now();
    p.need = 'none';
    p.timesFed = 0;
    const game = Screens.game;
    game.audio.play('zen_prize');
    game.audio.play('points');
    this.dropCoin(pos.x + 40, pos.y, 'gold');
    if (p.seed && (MUSHROOMS.has(p.seed) || AQUATIC.has(p.seed))) {
      this.dropCoin(pos.x + 10, pos.y, 'gold');
      this.dropCoin(pos.x + 70, pos.y, 'gold');
    }
    this.save();
  },
  // FeedChocolateToPlant (1017-1023): 兴奋 300s + 60 帧后爆发产币 + 礼物闪光
  feedChocolate(p, pos) {
    p.lastChocolate = this.now();
    p.launchCounter = 0.6;
    this.sparkle(pos.x + 40, pos.y + 40);
    this.save();
  },
  // 喂蜗牛巧克力 (原版 MouseDownWithFeedingTool CHOCOLATE 分支): 唤醒 + 1 小时高速
  feedStinkyChocolate() {
    this.data.stinkyChoc = this.now();
    const s = this.stinky;
    if (s) {
      this.sparkle(s.x + 40, s.y + 40);
      this.wakeStinky(true);
    }
    this.save();
  },
  sparkle(x, y) {
    // 原版 PARTICLE_PRESENT_PICKUP: 金色星光四散
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 2 * i / 8 + Math.random() * 0.5;
      this.puffs.push({ x, y, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55 - 30, t: 0, life: 0.6, gold: true });
    }
  },
  pickRandomSeedType() {
    // 原版 PickRandomSeedType (2410-2425): 0-39 号种子中排除金盏花/花盆
    const pool = SEED_ORDER.filter(t => t !== 'MARIGOLD' && t !== 'FLOWERPOT' && t !== 'IMITATER' && !UPGRADES.has(t));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'PEASHOOTER';
  },
  // GetPlantSellPrice (407-455)
  sellPrice(p) {
    if (p.seed === 'MARIGOLD') return [150, 200, 250, 300][p.age] || 300;
    if (p.age === 3 && p.seed && (MUSHROOMS.has(p.seed) || AQUATIC.has(p.seed))) return 1000;
    return [150, 300, 500, 800][p.age] || 800;
  },
  plantLabel(p) {
    if (p.age === 0) return p.isMarigold ? '金盏花苗' : '花苗';
    if (p.seed === 'MARIGOLD' && p.variation >= 0) return (PLANTS[p.seed] && PLANTS[p.seed].cn || '金盏花') + '(' + this.VAR_CN[p.variation] + ')';
    return (PLANTS[p.seed] && PLANTS[p.seed].cn) || '植物';
  },
  dropCoin(x, y, type) {
    // 原版 COIN_MOTION_COIN (Coin.cpp:334-358): vy −3~−5px/帧, vx ±0.5, 落地点 y+45+rand(20)
    this.coins.push({
      x, y, vx: -30 + Math.random() * 60, vy: -180 - Math.random() * 120,
      groundY: Math.max(80, Math.min(521, y + 45 + Math.random() * 20)),
      type, value: this.COIN_VAL[type], t: 0, hitGround: false, collected: false, scored: false, anim: null,
    });
  },

  // ---------- 工具动画 (原版 GRIDITEM_ZEN_TOOL: 动画播完 DoFeedingTool 才生效) ----------
  spawnTool(kind, x, y, plant, gold) {
    const defs = {
      water: { reanim: 'ZenGarden_wateringcan', anim: gold ? 'anim_water_area' : 'anim_water' },
      fertilizer: { reanim: 'ZenGarden_fertilizer' },
      bugspray: { reanim: 'ZenGarden_bugspray' },
      phonograph: { reanim: 'ZenGarden_phonograph' },
    };
    const d = defs[kind];
    if (!d) return;
    let r = null;
    try {
      if (!RE.hasDef(d.reanim)) return;
      r = Assets.reanim(d.reanim);
      if (d.anim && r.animExists(d.anim)) {
        r.play(d.anim, RE.PLAY_ONCE_HOLD, 0, 0);
        if (gold) r.animRate = 8;   // 原版 anim_water_area rate 8
      } else {
        // 无命名动画 (肥料/杀虫剂/唱片): 整时间轴; 唱片 LOOP 播 2 轮才生效 (原版 animRate=20)
        r.loopType = kind === 'phonograph' ? RE.LOOP : RE.PLAY_ONCE;
        r.animRate = kind === 'phonograph' ? 20 : (r.def.fps || 14);
      }
    } catch (e) { return; }
    // 原版位置: 水壶(植物x+32,y) / 肥料(x,y) / 杀虫剂(x+54,y) / 唱片(x+20,y+34, 循环2轮)
    let px = x, py = y;
    if (kind === 'water' && !gold) { px = x + 32; py = y; }
    else if (kind === 'bugspray') { px = x + 54; py = y; }
    else if (kind === 'phonograph') { px = x + 20; py = y + 34; r.animRate = 20; }
    r.setPosition(px, py);
    this.tools.push({ kind, r, x, y, plant, gold: !!gold, loops: kind === 'phonograph' ? 2 : 1, done: false });
    const game = Screens.game;
    game.audio.play(kind === 'water' ? 'zen_watering' : kind === 'fertilizer' ? 'zen_fertilizer' : kind === 'bugspray' ? 'zen_bugspray' : 'zen_phonograph');
  },
  applyToolEffect(t) {
    if (t.done) return;
    t.done = true;
    // 金水壶区域浇灌 (原版 DoFeedingTool GOLD_WATERING_CAN: 点击点附近所有需水植物)
    if (t.kind === 'water' && t.goldArea) {
      for (const p of this.data.plants) {
        if (p.garden !== this.data.garden) continue;
        if (this.getNeed(p) !== 'water') continue;
        const pos = this.cellPos(p.x, p.y);
        // 原版 IsPlantInGoldWateringCanRange: 植物中心 (x+40,y+40) ∈ [mx−70,mx+90)×[my−80,my+80)
        if (pos.x + 40 >= t.goldArea.x - 70 && pos.x + 40 < t.goldArea.x + 90 &&
            pos.y + 40 >= t.goldArea.y - 80 && pos.y + 40 < t.goldArea.y + 80) {
          this.plantWatered(p, pos);
        }
      }
      return;
    }
    if (!t.plant) return;
    const p = t.plant;
    const pos = this.cellPos(p.x, p.y);
    const need = this.getNeed(p);
    if (t.kind === 'water' && need === 'water') this.plantWatered(p, pos);
    else if (t.kind === 'fertilizer' && need === 'fertilizer') this.plantFertilized(p, pos);
    else if ((t.kind === 'bugspray' && need === 'bugspray') || (t.kind === 'phonograph' && need === 'phonograph')) this.plantFulfillNeed(p, pos);
  },

  // ---------- 蜗牛 Stinky (原版 GridItem GRIDITEM_STINKY + StinkyUpdate 状态机) ----------
  makeStinky() {
    let r = null;
    try {
      if (RE.hasDef('Stinky')) {
        r = Assets.reanim('Stinky');
        r.overrideScale(0.8, 0.8);
        r.play('anim_crawl', RE.LOOP, 6);
      }
    } catch (e) { r = null; }
    const sp = this.data.stinkyPos;
    const s = { x: sp ? sp[0] : 400, y: sp ? sp[1] : 461, goalX: 400, goalY: 461, dir: 1, state: 'walk', r, counter: 0, trail: [] };
    if (this.stinkyAwake()) {
      this.stinkyPickGoal(s);
    } else {
      s.y = 461; s.state = 'sleep';
      if (r) { try { r.play('anim_out', RE.PLAY_ONCE_HOLD, 0, 0); } catch (e) { } }
    }
    return s;
  },
  // 原版 ShouldStinkyBeAwake: 巧克力兴奋 3600s 或 唤醒后 180s
  stinkyAwake() {
    return this.stinkyHigh() || this.now() - (this.data.stinkyWake || 0) < 180;
  },
  stinkyHigh() { return this.now() - (this.data.stinkyChoc || 0) < 3600; },
  stinkyPickGoal(s) {
    // 原版 StinkyPickGoal: 未收金币优先 (金-40/钻-80/近旧目标-20+消失补偿), 否则带权重随机格
    let best = null, bw = 1e9;
    for (const c of this.coins) {
      if (c.collected) continue;
      let w = Math.hypot(c.x - s.x, (c.y + 30) - s.y);
      if (c.type === 'gold') w -= 40;
      else if (c.type === 'diamond') w -= 80;
      const dGoal = Math.hypot(c.x - s.goalX, (c.y + 30) - s.goalY);
      if (dGoal < 5) w -= 20;
      if (w < bw) { bw = w; best = c; }
    }
    if (best) { s.goalX = best.x; s.goalY = best.y + 30; }
    else {
      // 原版: 当前目标未到达 (>10) 则保持 (仅重新评估金币)
      if (Math.hypot(s.goalX - s.x, s.goalY - s.y) > 10) return;
      // 原版: 有植物格权重 2000-|Δy| (优先同行), 空格权重 1
      const cells = this.gridOf('greenhouse');
      const occupied = this.data.plants.filter(p => p.garden === 'greenhouse');
      const picks = [];
      let tot = 0;
      for (let i = 0; i < cells.length; i++) {
        const gx = i % 8, gy = Math.floor(i / 8);
        const has = occupied.some(q => q.x === gx && q.y === gy);
        const w = has ? Math.max(1, 2000 - Math.abs(cells[i][1] + 80 - s.y)) : 1;
        picks.push({ x: cells[i][0] + 15, y: cells[i][1] + 80, w }); tot += w;
      }
      if (tot > 0) {
        let roll = Math.random() * tot;
        for (const pk of picks) { roll -= pk.w; if (roll <= 0) { s.goalX = pk.x; s.goalY = pk.y; break; } }
      }
    }
    s.counter = 1.7;   // 原版 mGridItemCounter=100 帧
    if (s.goalX < s.x - 4 && s.dir > 0) this.stinkyTurn(s, -1);
    else if (s.goalX > s.x + 4 && s.dir < 0) this.stinkyTurn(s, 1);
  },
  stinkyTurn(s, dir) {
    s.dir = dir; s.state = 'turn'; s.turnT = 0;
    s.trail = [];
    if (s.r) { try { s.r.playReanim('anim_turn', RE.PLAY_ONCE_HOLD, 10, 6); } catch (e) { } }   // 原版: blend 10, rate 6
  },
  wakeStinky(silent) {
    const s = this.stinky;
    if (!s) return;
    this.data.stinkyWake = this.now();
    this.save();
    if (s.state === 'sleep' || s.state === 'falling') {
      s.state = 'waking'; s.wakeT = 0;
      if (s.r) { try { s.r.playReanim('anim_out', RE.PLAY_ONCE_HOLD, 20, 6); } catch (e) { } }
    }
    if (!silent) {
      const game = Screens.game;
      game.audio.play('wakeup');
      game.audio.play('tap');
    }
  },
  stinkyUpdate(dt) {
    const s = this.stinky;
    if (!s) return;
    if (s.r && s.r.update) s.r.update(dt);
    const awake = this.stinkyAwake();
    const high = this.stinkyHigh();
    const chocCursor = this.tool === 'chocolate';
    // 残影 (原版 UpdateStinkyMotionTrail: 巧克力高速行走时记录轨迹帧)
    if (high && (s.state === 'walk' || s.state === 'turn')) {
      s.trail.unshift({ x: s.x, y: s.y });
      if (s.trail.length > 8) s.trail.length = 8;
    } else s.trail = [];
    if (s.state === 'falling') {
      if (s.r && s.r.loopCount > 0) {
        s.state = 'sleep';
        if (s.r) { try { s.r.playReanim('anim_out', RE.PLAY_ONCE_HOLD, 0, 0); s.r.animRate = 0; } catch (e) { } }   // 原版: 冻结帧睡姿
      }
      return;
    }
    if (s.state === 'sleep') {
      if (awake) this.wakeStinky(true);
      return;
    }
    if (s.state === 'waking') {
      if (s.r && s.r.loopCount > 0) {
        s.state = 'walk';
        if (s.r) { try { s.r.playReanim('anim_crawl', RE.LOOP, 10, high ? 12 : 6); } catch (e) { } }
        this.stinkyPickGoal(s);
      }
      return;
    }
    if (s.state === 'turn') {
      s.turnT += dt;
      if (s.r && s.r.loopCount > 0) {
        s.state = 'walk';
        if (s.r) { try { s.r.playReanim('anim_crawl', RE.LOOP, 10, high ? 12 : 6); } catch (e) { } }
      }
      return;
    }
    // ---- walk ----
    // 原版: 到点睡 y=461; !awake → 先走下来再 TURNING_LEFT→anim_in 入睡
    if (!awake) {
      if (s.y < 461) {
        if (s.goalY !== 461) s.goalY = 471;
      } else {
        if (s.dir < 0) { s.state = 'falling'; if (s.r) { try { s.r.playReanim('anim_in', RE.PLAY_ONCE_HOLD, 20, 6); } catch (e) { } } }
        else { this.stinkyTurn(s, -1); s.goalX = s.x; s.goalY = s.y; }
        return;
      }
    }
    if (s.counter > 0) s.counter -= dt;
    // 持巧克力但未兴奋 → 停下盯住 (原版 anim_idle + 速度 0)
    const frozen = chocCursor && !high;
    if (frozen) {
      if (s.r && !s.r.isPlaying('anim_idle')) { try { s.r.playReanim('anim_idle', RE.LOOP, 10, 6); } catch (e) { } }
      return;
    }
    if (s.r && !s.r.isPlaying('anim_crawl')) { try { s.r.playReanim('anim_crawl', RE.LOOP, 10, high ? 12 : 6); } catch (e) { } }
    if (s.r && s.state === 'walk') s.r.animRate = high ? 12 : 6;   // 原版 StinkyAnimRateUpdate 每帧同步
    // 原版: aSpeedX=轨道速度x15 (≈75px/s), 纵向 0.5px/帧=30px/s × 距离曲线; 巧克力 ×2
    const sp = high ? 150 : 75;
    let spy = high ? 60 : 30;
    const dy = Math.abs(s.goalY - s.y);
    spy *= Math.max(0.2, Math.min(1, (dy - 5) / 15 + 0.2));
    if (s.goalX < s.x - 2) s.x = Math.max(s.goalX, s.x - sp * dt);
    else if (s.goalX > s.x + 2) s.x = Math.min(s.goalX, s.x + sp * dt);
    if (dy < spy * dt) s.y = s.goalY;
    else s.y += Math.sign(s.goalY - s.y) * spy * dt;
    if ((Math.abs(s.goalX - s.x) < 5 && Math.abs(s.goalY - s.y) < 5) || s.counter <= 0) this.stinkyPickGoal(s);
    // 收币 (原版: 距离 (币x, 币y+30) < 20)
    for (const c of this.coins) {
      if (!c.collected && Math.hypot(c.x - s.x, (c.y + 30) - s.y) < 20) this.collectCoin(c, true);
    }
  },

  // ---------- 更新 ----------
  update(dt) {
    if (!this.data) return;
    // 排落金币 (原版 Coin::UpdateFall / UpdateCollected)
    for (const c of this.coins) {
      c.t += dt;
      if (c.collected) {
        // 收取: 指数逼近金币银行 (442,558), 每帧 Δ/21
        const k = Math.min(1, dt * 60);
        c.x += (442 - c.x) / 21 * k;
        c.y += (558 - c.y) / 21 * k;
        if (Math.hypot(442 - c.x, 558 - c.y) < 12) this.scoreCoin(c);
      } else if (!c.hitGround) {
        c.vy += 540 * dt;
        c.y += c.vy * dt;
        c.x += c.vx * dt;
        if (c.x < 0) { c.x = 0; c.vx = 24 + Math.random() * 24; }
        else if (c.x > 757) { c.x = 757; c.vx = -24 - Math.random() * 24; }
        if (c.y >= c.groundY) { c.y = c.groundY; c.hitGround = true; }
      }
    }
    this.coins = this.coins.filter(c => !c.scored);
    // 金币银行显示计时 (原版 mCoinBankFadeCount 300 帧, 末 15 帧淡出)
    if (this.bankT > 0) this.bankT = Math.max(0, this.bankT - dt);
    // 戴夫动画 (原版 UpdateCrazyDave: 入场完 → 待机)
    if (this.daveAnim && this.bubble) {
      this.daveAnim.update(dt);
      if (this.daveAnim.loopCount > 0 && !this._daveIdle) {
        this._daveIdle = true;
        try { this.daveAnim.play(this.bubble.sell ? 'anim_blahblah' : 'anim_idle', RE.LOOP, 12); } catch (e) { }
      }
    }
    // 每株植物独立动画推进 + 成长计时 + 产币 (原版 PottedPlantUpdate)
    for (const p of this.data.plants) {
      if (p.garden !== this.data.garden) continue;
      if (p._r && p._r.update) p._r.update(dt);
      if (p.growT > 0) p.growT = Math.max(0, p.growT - dt);
      // 成熟 + 当日满足 → 定期产币 (原版 PlantUpdateProduction)
      const sleeping = this.isSleeping(p);
      if (!sleeping && p.age === 3 && this.fulfilledToday(p)) {
        const mins = Math.floor((this.now() - p.lastNeedFulfilled) / 60);
        if (!p.launchCounter || p.launchCounter <= 0) {
          // 原版 PlantSetLaunchCounter: RandRangeInt(1800, curve(5→3000, 30→15000))
          const maxSec = 30 + (150 - 30) * Math.max(0, Math.min(1, (mins - 5) / 25));
          p.launchCounter = 18 + Math.random() * Math.max(18, maxSec - 18);
        }
        p.launchCounter -= dt * (this.highOnChocolate(p) ? 2 : 1);   // 巧克力: 双倍倒计
        if (p.launchCounter <= 0) {
          const pos = this.cellPos(p.x, p.y);
          // 原版: Rand(1000)+curve(0..80) < 100 → 金币; 越久没开心越容易出金
          const goldChance = 0.1 + 0.08 * Math.max(0, Math.min(1, (mins - 5) / 25));
          this.dropCoin(pos.x + 40, pos.y, Math.random() < goldChance ? 'gold' : 'silver');
          const game = Screens.game;
          if (game) game.audio.play('points');
        }
      }
    }
    // 共享模型 (芽/花盆)
    for (const k of Object.keys(this._sproutM || {})) { const m = this._sproutM[k]; if (m && m.update) m.update(dt); }
    for (const k of Object.keys(this._pots || {})) { const m = this._pots[k]; if (m && m.update) m.update(dt); }
    // 工具动画 → 播完生效 (原版 ZenToolUpdate)
    for (const t of this.tools) {
      if (t.r && t.r.update) t.r.update(dt);
      if (t.r && t.r.loopCount >= t.loops) this.applyToolEffect(t);
    }
    this.tools = this.tools.filter(t => !t.done);
    // 蜗牛
    // reanim 自愈: enter 时分包未就绪 → 就绪后补建 (睡姿冻结/爬行循环)
    if (this.stinky && !this.stinky.r && RE.hasDef('stinky')) {
      try {
        const r = Assets.reanim('Stinky');
        r.overrideScale(0.8, 0.8);
        const asleep = this.stinky.state === 'sleep';
        r.playReanim(asleep ? 'anim_out' : 'anim_crawl', asleep ? RE.PLAY_ONCE_HOLD : RE.LOOP, asleep ? 0 : 10, 6);
        if (asleep) r.animRate = 0;
        this.stinky.r = r;
      } catch (e) { }
    }
    this.stinkyUpdate(dt);
    // 尘土/星光粒子
    for (const q of this.puffs) {
      q.t += dt;
      q.x += (q.vx || 0) * dt; q.y += (q.vy || 0) * dt;
      if (q.vy !== undefined && !q.gold) q.vy += 260 * dt;
    }
    this.puffs = this.puffs.filter(q => q.t < q.life);
    // 工具栏闲置隐藏 (原版 ZEN_FADING: 3000 帧无操作 → 50 帧上滑)
    const idleOK = !this.tool && !this.heldPlant && !this.bubble && (!this.tut || this.tut.step === 'done');
    if (idleOK) this.trayIdle += dt; else this.trayIdle = 0;
    if (this.trayIdle >= 30) this.trayFade = Math.min(1, this.trayFade + dt / 0.8);
    else this.trayFade = Math.max(0, this.trayFade - dt / 0.5);
    // 教程: 全部需肥 → 商店步 (原版 ZenGardenUpdate KEEP_WATERING 分支)
    if (this.tut && this.tut.step === 'keep_watering') {
      if (this.data.plants.some(q => q.garden !== 'wheelbarrow' && this.getNeed(q) === 'fertilizer')) {
        this.tut.step = 'visit_store'; this.data.tutStep = 'visit_store';
        this.setAdvice('去戴夫的商店买些肥料吧！', true);
        this.save();
      }
    }
    if (this.advice) { this.advice.t += dt; if (this.advice.t > this.advice.life) this.advice = null; }
    if (this.bubble) this.arrowT += dt;
  },

  collectCoin(c, byStinky) {
    if (c.collected || c.scored) return;
    c.collected = true;
    c.flyT = 0;
    const game = Screens.game;
    if (game) game.audio.play('coin');
  },
  // 原版 ScoreCoin: 飞到银行才入账
  scoreCoin(c) {
    if (c.scored) return;
    c.scored = true;
    const game = Screens.game;
    if (game) { game.coins += c.value; game.saveShop(); }
    this.bankT = 5;   // 原版 mCoinBankFadeCount = 300 帧
  },

  // ---------- 绘制 ----------
  // 原版 REANIM_SLEEPING: 小 Z 上升渐隐 (主场景同款 22px, 比例 2:3)
  drawZzz(ctx, x, y, t, seed) {
    const zimg = img('zzz');
    const p = ((t * 0.625) + (seed || 0) * 0.37) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.95;
    if (zimg) {
      ctx.drawImage(zimg, x + p * 8 - 11, y - 16 - p * 18, 22, 33);
    } else {
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.fillStyle = '#fff';
      ctx.strokeText('Z', x + p * 8, y - p * 18);
      ctx.fillText('Z', x + p * 8, y - p * 18);
    }
    ctx.restore();
  },

  // 迷你整株盆栽 (原版 DrawPottedPlant: 光标/推车预览; 盆 @ y+26·scale, 植物按原版偏移)
  drawPlantMini(ctx, p, x, y, scale, withPot) {
    const aquatic = p.seed && AQUATIC.has(p.seed);
    if (withPot) {
      const pm = this.potModel(false, !!aquatic);
      if (pm) { ctx.save(); pm.setPosition(x, y + 26 * scale); pm.draw(ctx); ctx.restore(); }
    }
    const seed = (p.age > 0 && p.seed) ? p.seed : null;
    let r = null;
    if (p.age === 0) r = this.sproutModel(p.isMarigold);
    else r = this.plantModel(p);
    if (!r) return;
    // 原版 DrawPottedPlant: offsetY = H_OFFSET + FlowerPotOffset(scale) + 年龄偏移·scale + PottedDH
    let ax = 0, ay = 0, asc = 1;
    if (p.age === 1) { ax = 20; ay = 40; asc = 0.5; }
    else if (p.age === 2) { ax = 10; ay = 20; asc = 0.75; }
    const sc = asc * scale;
    let dy = (seed ? (H_OFFSET[seed] || 0) : 0);
    if (withPot) dy += this.flowerPotOff(seed, scale);
    dy += ay * scale + this.pottedDH(seed, sc);
    const faceLeft = p.facing === 1;
    const dx = faceLeft ? (80 * scale - ax * scale) : (ax * scale);
    ctx.save();
    if (p.seed === 'MARIGOLD' && p.variation >= 0 && p.variation !== 9) ctx.filter = this.MARIGOLD_FILTERS[p.variation];
    r.setPosition(x + dx, y + dy);
    r.overrideScale(faceLeft ? -sc : sc, sc);
    r.draw(ctx);
    ctx.restore();
  },

  draw(ctx) {
    if (!this.data) this.load();
    const game = Screens.game;
    const t = Screens.t;
    const mouse = Screens.mouse || { x: -1, y: -1 };
    const garden = this.data.garden;
    // 背景
    const bg = img(this.BG[garden]);
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#2a3a1a'; ctx.fillRect(0, 0, 800, 600); }
    // 原版: 温室/水族馆全屏光效 (IMAGE_BACKGROUND_GREENHOUSE_OVERLAY, ADDITIVE 叠加 — Board.cpp:7165)
    if (garden === 'greenhouse' || garden === 'aquarium') {
      const ov = img('background_greenhouse_overlay.jpg');
      if (ov) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(ov, 0, 0, 800, 600);
        ctx.restore();
      }
    }
    // 水族馆: 持植物时空位阴影 (原版 DrawBackdrop: PLANTSHADOW ×1.7 @ (px-35, py+33))
    if (garden === 'aquarium' && (this.heldPlant || this.tool === 'wheelbarrow')) {
      const sh = img('plantshadow.png');
      const cells = this.gridOf('aquarium');
      for (let i = 0; i < cells.length; i++) {
        const gx = i % 8, gy = Math.floor(i / 8);
        if (this.plantAt(gx, gy)) continue;
        ctx.save();
        ctx.globalAlpha = 0.45;
        if (sh) ctx.drawImage(sh, cells[i][0] - 35, cells[i][1] + 33, sh.width * 1.7, sh.height * 1.7);
        else { ctx.fillStyle = 'rgba(0,0,30,0.35)'; ctx.beginPath(); ctx.ellipse(cells[i][0] + 40, cells[i][1] + 66, 55, 16, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    }
    // ---- 花盆 + 植物 (按 y 排序保证遮挡; 需求气泡二次 pass — 原版 RENDER_LAYER_PARTICLE) ----
    const entries = this.data.plants.filter(p => p.garden === garden);
    entries.sort((a, b) => (this.cellPos(a.x, a.y).y - this.cellPos(b.x, b.y).y) || a.x - b.x);
    const overlays = [];
    for (const p of entries) {
      const pos = this.cellPos(p.x, p.y);
      const aquatic = p.seed && AQUATIC.has(p.seed);
      const held = this.heldPlant === p;
      const st = this.plantState(p);
      const dp = this.plantDrawParams(p, garden);
      // 花盆 (原版 PlacePottedPlant: FLOWERPOT Plant @ 格Y+26 — H_OFFSET.FLOWERPOT;
      //   需求期 Pot_top 换 pot_top_dark 湿土色)
      if (dp.inPot) {
        const pm = this.potModel(st !== 'notready', !!aquatic);
        if (pm) {
          ctx.save();
          if (held) ctx.globalAlpha = 0.45;
          pm.setPosition(pos.x, pos.y + 26);
          pm.draw(ctx);
          ctx.restore();
        } else {
          const potTop = img(st !== 'notready' ? 'pot_top_dark.png' : 'pot_top.png');
          if (potTop) { ctx.save(); if (held) ctx.globalAlpha = 0.45; ctx.drawImage(potTop, pos.x + 7, pos.y + 39, 66, 51); ctx.restore(); }
        }
      }
      // 植物本体 (原版 UpdateReanim 精确偏移/缩放/镜像: 小苗 (±20,+40)×0.5 / 中苗 (±10,+20)×0.75 / 成熟 ×1.0)
      const sleeping = this.isSleeping(p);
      let m = p.age === 0 ? this.sproutModel(p.isMarigold) : this.plantModel(p);
      if (m) {
        // 水族馆水生植物浮动 (原版 doFloating: sin(row·π+col·0.25π+t)·2)
        let bobY = 0;
        if (garden === 'aquarium' && aquatic) bobY = Math.sin(t * 2.5 + p.y * Math.PI + p.x * 0.25 * Math.PI) * 2;
        // 睡眠层切换 (原版 SetSleeping)
        if (p.age > 0 && sleeping !== !!p._sleepDrawn) {
          p._sleepDrawn = sleeping;
          if (m.animExists && m.animExists('anim_sleep') && m.animExists('anim_idle')) {
            try { m.play(sleeping ? 'anim_sleep' : 'anim_idle', RE.LOOP, sleeping ? 1 : 10 + Math.random() * 5); } catch (e) { }
          }
        }
        // 巧克力兴奋: 动画加速 (原版 SetPlantAnimSpeed ≥25)
        if (this.highOnChocolate(p) && !sleeping) { m.animRate = 26; p._chocBoost = true; }
        else if (p._chocBoost) { p._chocBoost = false; if (!sleeping) m.animRate = 10 + Math.random() * 5; }
        ctx.save();
        if (held) ctx.globalAlpha = 0.45;
        else if (sleeping && !(m.animExists && m.animExists('anim_sleep'))) ctx.globalAlpha = 0.8;
        if (p.seed === 'MARIGOLD' && p.variation >= 0 && p.variation !== 9) ctx.filter = this.MARIGOLD_FILTERS[p.variation];
        m.setPosition(pos.x + dp.dx, pos.y + dp.dy + bobY);
        m.overrideScale(dp.sx, dp.sy);
        m.draw(ctx);
        ctx.restore();
      } else if (p.age === 0) {
        const sp = img('anim_sprout.png');
        if (sp) { ctx.save(); const s2 = 1.6 + Math.sin(t * 3 + p.x) * 0.08; ctx.translate(pos.x + 40, pos.y + 30); ctx.scale(s2, s2); ctx.drawImage(sp, -9, -7); ctx.restore(); }
      }
      // 睡觉的夜习性植物: Zzz (原版 SetSleeping: 附件 @ (mX+50, mY+40))
      if (sleeping) this.drawZzz(ctx, pos.x + 50, pos.y + 40, t, p.x);
      // 开心光晕 (原版 PARTICLE_POTTED_PLANT_GLOW @ (盆X+40, 盆Y+63))
      if (st === 'happy') {
        ctx.save();
        const a = 0.28 + 0.1 * Math.sin(t * 3 + p.x + p.y);
        const gy = dp.inPot ? 63 : 60;
        const g = ctx.createRadialGradient(pos.x + 40, pos.y + gy, 6, pos.x + 40, pos.y + gy, 46);
        g.addColorStop(0, `rgba(255,244,150,${a + 0.25})`);
        g.addColorStop(1, 'rgba(255,244,150,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(pos.x + 40, pos.y + gy, 46, 50, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // 需求气泡 → 延迟二次 pass (原版 RENDER_LAYER_PARTICLE, 不被前排花盆遮挡)
      const need = this.getNeed(p);
      if (need !== 'none' && !held) overlays.push({ pos, need });
    }
    // 需求气泡 pass (原版 DrawPlantOverlay: 气泡(50,0) 肥料/杀虫图标(61,7) 唱片(60,7) 水滴(67,9))
    for (const o of overlays) {
      const bub = img('plantspeechbubble.png');
      const bx = o.pos.x + 50, by = o.pos.y;
      if (bub) ctx.drawImage(bub, bx, by);
      if (o.need === 'water') {
        const wd = img('waterdrop.png');
        if (wd) ctx.drawImage(wd, o.pos.x + 67, o.pos.y + 9);
      } else {
        const ni = img('zen_need_icons.png');
        if (ni) {
          const idx = o.need === 'fertilizer' ? 0 : o.need === 'bugspray' ? 1 : 2;
          ctx.drawImage(ni, idx * 30, 0, 30, 30, o.pos.x + (o.need === 'phonograph' ? 60 : 61), o.pos.y + 7, 30, 30);
        }
      }
    }
    // 尘土/星光粒子 (种植特效 DoPlantingEffects / PRESENT_PICKUP)
    for (const q of this.puffs) {
      const k = 1 - q.t / q.life;
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      if (q.gold) {
        ctx.fillStyle = '#ffe36a';
        ctx.beginPath(); ctx.arc(q.x, q.y, 3.5 * k + 1, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#c8b088';
        ctx.beginPath(); ctx.arc(q.x, q.y, 4 * (1.2 - k) + 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // 工具动画层
    for (const tl of this.tools) {
      if (tl.r) { ctx.save(); tl.r.draw(ctx); ctx.restore(); }
    }
    // 掉落金币 (原版 Coin::Draw: 飞行中=静态币面+光晕, 落地=旋转 reanim; 钻石=reanim+拾取光晕)
    for (const c of this.coins) {
      ctx.save();
      if (c.type === 'diamond') {
        // 原版: IMAGE_AWARDPICKUPGLOW @(x−56,y−66) + 钻石 reanim
        const gl = img('awardpickupglow.png');
        if (gl) ctx.drawImage(gl, c.x - 56, c.y - 66);
        if (!c.anim && RE.hasDef('diamond')) {
          c.anim = Assets.reanim('diamond');
          if (c.anim) { c.anim.frameStart = 0; c.anim.frameCount = c.anim.def ? c.anim.def.n : 1; c.anim.animRate = 10; c.anim.loopType = RE.LOOP; }
        }
        if (c.anim) { c.anim.update(1 / 60); c.anim.setPosition(c.x, c.y); c.anim.draw(ctx); }
        else {
          // def 未就绪: 静态钻石图回退
          const dm = img('diamond.png');
          if (dm) ctx.drawImage(dm, c.x - dm.width / 2, c.y - dm.height / 2);
        }
      } else if (c.hitGround && !c.collected && RE.hasDef(c.type === 'gold' ? 'coin_gold' : 'coin_silver')) {
        // 落地: 旋转金币 reanim (原版 attachment 显现)
        if (!c.anim) {
          c.anim = Assets.reanim(c.type === 'gold' ? 'coin_gold' : 'coin_silver');
          if (c.anim) { c.anim.frameStart = 0; c.anim.frameCount = c.anim.def ? c.anim.def.n : 1; c.anim.animRate = 10; c.anim.loopType = RE.LOOP; }
        }
        if (c.anim) { c.anim.update(1 / 60); c.anim.setPosition(c.x, c.y); c.anim.draw(ctx); }
      } else {
        // 飞行/收取中/def 未就绪: 静态币面 + 光晕 (原版 DOLLAR @(+8,+10) / COINGLOW @(−14,−12), 中心缩放)
        const sc = c.collected ? Math.max(0.5, Math.min(1, Math.hypot(442 - c.x, 558 - c.y) * 0.05)) : 1;
        const gl = img('coinglow.png');
        if (gl) ctx.drawImage(gl, c.x - 14 - gl.width * sc / 2, c.y - 12 - gl.height * sc / 2, gl.width * sc, gl.height * sc);
        const im = img(c.type === 'gold' ? 'coin_gold_dollar.png' : 'coin_silver_dollar.png');
        if (im) ctx.drawImage(im, c.x + 8 - im.width * sc / 2, c.y + 10 - im.height * sc / 2, im.width * sc, im.height * sc);
        else {
          ctx.fillStyle = c.type === 'gold' ? '#ffd34d' : '#cfd6dd';
          ctx.beginPath(); ctx.arc(c.x + 8, c.y + 10, 11 * sc, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    // 蜗牛 + 残影 (原版 StinkyUpdate: 面左=原生 +0.8 @(x,y); 面右=镜像 −0.8 @(x+69,y))
    if (this.stinky && this.stinky.r) {
      const s = this.stinky;
      const stDraw = (sx, sy) => {
        const faceRight = s.dir > 0;
        s.r.setPosition(faceRight ? sx + 69 : sx, sy);
        s.r.overrideScale(faceRight ? -0.8 : 0.8, 0.8);
        s.r.draw(ctx);
      };
      ctx.save();
      for (let i = s.trail.length - 1; i >= 1; i--) {
        ctx.globalAlpha = 0.13 * (1 - i / s.trail.length);
        stDraw(s.trail[i].x, s.trail[i].y);
      }
      ctx.restore();
      ctx.save();
      stDraw(s.x, s.y);
      // 睡眠 Zzz (原版挂 shell 轨道 (34,39)×0.8; 持巧克力光标时隐藏)
      if (s.state === 'sleep' && this.tool !== 'chocolate') this.drawZzz(ctx, s.x + 27, s.y + 31, t, 3);
      ctx.restore();
    }
    // 工具栏 + 顶栏按钮
    this.drawToolBar(ctx, game, t, mouse);
    // 手套/推车持有植物光标 (原版 CursorObject PLANT_FROM_GLOVE/WHEEL_BARROW:
    //   温室带盆 (-22,-38) 缩放1.0 / 蘑菇园水族馆无盆 (-10,-10))
    if (this.heldPlant) {
      const withPot = this.data.garden === 'greenhouse';
      const cx = withPot ? mouse.x - 22 : mouse.x - 10;
      const cy = withPot ? mouse.y - 38 : mouse.y - 10;
      this.drawPlantMini(ctx, this.heldPlant, cx, cy, 1.0, withPot);
    }
    // 对话气泡 (教程 / 卖花)
    if (this.bubble) this.drawBubble(ctx, game, t);
    // 建议条 (原版 MESSAGE_STYLE_ZEN_GARDEN_LONG: 全宽半透明黑带 @ y=514 h=55, 色彩脉动)
    if (this.advice) {
      const a = this.advice.t > this.advice.life - 0.8 ? Math.max(0, (this.advice.life - this.advice.t) / 0.8) : 1;
      const pulse = 0.75 + 0.25 * Math.sin(t * 15.7);   // 原版 alpha 192↔255 (BOUNCE_SLOW_MIDDLE 75帧)
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 514, 800, 55);
      ctx.globalAlpha = a * pulse;
      ctx.font = 'bold 21px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineJoin = 'round';
      ctx.strokeText(this.advice.txt, 400, 542);
      ctx.fillStyle = '#fdf5ad';
      ctx.fillText(this.advice.txt, 400, 542);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
  },

  // ---- 顶部工具栏 (原版 Board::DrawZenButtons + GetZenButtonRect) ----
  trayTools(game) {
    // 原版 CanUseGameObject: 已购才显示; 肥料/杀虫剂购过即常驻(空时灰化);
    //   $ 需通关冒险; 巧克力有存货才显示
    const T = [];
    T.push({ k: 'water' });
    if (game.purchased.fertilizer) T.push({ k: 'fertilizer', count: this.data.fertilizer || 0 });
    if (game.purchased.bugspray) T.push({ k: 'bugspray', count: this.data.bugspray || 0 });
    if (game.purchased.phonograph) T.push({ k: 'phonograph' });
    if ((this.data.chocolate || 0) > 0) T.push({ k: 'chocolate', count: this.data.chocolate });
    if (game.purchased.glove) T.push({ k: 'glove' });
    if (game.finishedAdventure || game.progress.unlocked > 50 || game.debugUnlocked) T.push({ k: 'sell' });   // 原版 HasFinishedAdventure
    if (game.purchased.wheelbarrow) T.push({ k: 'wheelbarrow' });
    return T;
  },
  drawToolBar(ctx, game, t, mouse) {
    const UI = __getUI();
    const tools = this.trayTools(game);
    // ZEN_FADING: 50 帧上滑 72px (原版 CURVE_EASE_IN_OUT)
    const ease = this.trayFade * this.trayFade * (3 - 2 * this.trayFade);
    const offY = -72 * ease;
    // ---- 商店按钮 (原版 mStoreButton @ (678,33) — 在菜单按钮下方; 先画使其被菜单钮压住) ----
    this._store = null;
    if (this.storeVisible()) {
      const sImg = img('zenshopbutton.png');
      if (sImg) {
        ctx.drawImage(sImg, 678, 33);
        this._store = { x: 678, y: 33, w: sImg.width, h: sImg.height };
      } else if (UI && UI.drawStoneButton) {
        UI.drawStoneButton(ctx, 678, 36, 104, 40, '商 店', 17);
        this._store = { x: 678, y: 36, w: 104, h: 40 };
      } else {
        ctx.fillStyle = '#a8834a'; ctx.strokeStyle = '#5c4020'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(678, 36, 104, 40, 8); ctx.fill(); ctx.stroke();
        this._store = { x: 678, y: 36, w: 104, h: 40 };
      }
    }
    // ---- 主菜单按钮 (原版 mMenuButton: 石质 [MAIN_MENU_BUTTON] @(628,-10,163,46),
    //      ZEN_FADING 时滑至 -50; 教程期间隐藏, 完成后出现) ----
    this._menu = null;
    if (this.menuVisible()) {
      const mbY = -10 - 40 * ease;
      if (UI && UI.drawStoneButton) UI.drawStoneButton(ctx, 628, mbY, 163, 46, '主菜单', 19);
      else {
        ctx.fillStyle = '#a8834a'; ctx.strokeStyle = '#5c4020'; ctx.lineWidth = 2;
        ctx.fillRect(628, mbY, 163, 46);
      }
      // 命中区 = 屏内可见部分
      const visTop = Math.max(0, mbY);
      if (mbY + 46 > 0) this._menu = { x: 628, y: visTop, w: 163, h: mbY + 46 - visTop };
    }
    // ---- 工具槽 (原版 GetZenButtonRect: 非全部工具可用时起始 x=30, 每槽 +70) ----
    const ZEN_ORDER = ['water', 'fertilizer', 'bugspray', 'phonograph', 'chocolate', 'glove', 'sell', 'wheelbarrow'];
    const allUsable = ZEN_ORDER.every(k => k === 'water' || tools.some(tl => tl.k === k));
    const x0 = allUsable ? 0 : 30;
    const bank = img('shovelbank.png');
    this._tools = [];
    tools.forEach((tl, i) => {
      const x = x0 + i * this.SLOT_W, y = this.TRAY_Y;
      this._tools.push({ ...tl, x, y, w: this.SLOT_W, h: this.SLOT_H });
      ctx.save();
      // 槽底 (原版 IMAGE_SHOVELBANK)
      if (bank) ctx.drawImage(bank, x, y + offY);
      else {
        ctx.fillStyle = 'rgba(70,52,26,0.85)';
        ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x, y + offY, this.SLOT_W, this.SLOT_H, 6); ctx.fill(); ctx.stroke();
      }
      // 持有中的工具不在槽内绘制 (原版 skip drawing a tool currently held)
      if (this.tool === tl.k && tl.k !== 'wheelbarrow') { ctx.restore(); return; }
      const [icn, ix, iy] = this.TOOL_ICON[tl.k];
      // 推车: 满车图标 +4 / 空车 −3 (原版 DrawZenWheelBarrowButton)
      const byOff = tl.k === 'wheelbarrow' && this.barrowPlant() ? 4 : iy;
      const tim = (tl.k === 'water' && game.purchased.goldwatering) ? img('wateringcangold.png') : img(icn);
      if (tim) {
        ctx.save();
        // 空库存灰化 (原版 SetColorizeImages gray)
        if (tl.count !== undefined && tl.count <= 0) ctx.filter = 'grayscale(1) brightness(0.55)';
        // 教程施肥步: 肥料闪烁 (原版 GetFlashingColor(mMainCounter, 75))
        else if (tl.k === 'fertilizer' && this.tut && this.tut.step === 'fertilize') {
          const f = 0.5 + 0.5 * Math.sin(t * 8.3);
          ctx.filter = `brightness(${(1 + f * 0.7).toFixed(2)})`;
        }
        ctx.drawImage(tim, x + ix, y + offY + byOff);
        ctx.restore();
      }
      // 数量角标 (原版 "x{N}" 白字 @ (+64,+65) 右对齐)
      if (tl.count !== undefined) {
        ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        ctx.strokeText('x' + tl.count, x + 64, y + offY + 65);
        ctx.fillText('x' + tl.count, x + 64, y + offY + 65);
      }
      // 推车格: 车内植物预览 (原版 DrawZenWheelBarrowButton: (23,-8,0.6)/(28,2,0.5)/(34,12,0.4))
      if (tl.k === 'wheelbarrow') {
        const bp = this.barrowPlant();
        if (bp) {
          const sc = bp.age === 1 ? 0.6 : bp.age === 2 ? 0.5 : 0.4;
          const px = bp.age === 1 ? 23 : bp.age === 2 ? 28 : 34;
          const py = bp.age === 1 ? -8 : bp.age === 2 ? 2 : 12;
          this.drawPlantMini(ctx, bp, x + px, y + offY + py, sc, true);
        }
      }
      ctx.restore();
    });
    // ---- 下一花园按钮 (原版 IMAGE_ZEN_NEXTGARDEN @ x=566, 随 fading 同步滑动; 菜单可见时才画) ----
    this._nextGarden = null;
    const gardens = this.ownedGardens(game);
    if (gardens.length > 1 && this.menuVisible()) {
      const ng = img('zen_nextgarden.png');
      const nx = 566, ny = Math.round(offY);
      this._nextGarden = { x: 566, y: 0, w: 60, h: 60 };
      if (ng) ctx.drawImage(ng, nx, ny, 60, 60);
      else {
        ctx.save();
        ctx.fillStyle = '#8a6a2a'; ctx.strokeStyle = '#4a3410'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(nx, ny, 60, 60, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('→', nx + 30, ny + 38);
        ctx.restore();
      }
      const gi = gardens.indexOf(this.data.garden);
      const nxt = gardens[(gi + 1) % gardens.length];
      if (mouse.x > nx && mouse.x < nx + 60 && mouse.y < 60) {
        ctx.save();
        ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
        const label = '前往' + (this.GARDEN_LABEL[nxt] || '');
        ctx.strokeText(label, nx + 30, 76); ctx.fillText(label, nx + 30, 76);
        ctx.restore();
      }
    }
    // ---- 金币银行 (原版 DrawUICoinBank: coinbank @(450,568), 绿字右对齐 +116, 收币淡入 5s) ----
    if (this.bankT > 0) {
      const cb = img('coinbank.png');
      const cbH = cb ? cb.height : 31;
      const a = Math.min(1, this.bankT / 0.25);
      ctx.save();
      ctx.globalAlpha = a;
      if (cb) ctx.drawImage(cb, 450, 599 - cbH);
      ctx.font = 'bold 17px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#b4ff5a';
      ctx.fillText(String(game.coins || 0), 450 + 116, 599 - cbH + 24);
      ctx.restore();
    }
    // ---- 教程箭头 (原版 ShowTutorialArrowOnWateringCan: 粒子 @ 槽位 (+10,+10) 弹跳) ----
    if (this.tut && this.tut.step === 'pickup_water' && this._tools.length) {
      const wt = this._tools[0];
      ctx.save();
      this.arrowT += 1 / 60;
      const bob = Math.abs(Math.sin(this.arrowT * 4.2)) * 8;
      const da = img('downarrow.png');
      if (da) ctx.drawImage(da, wt.x + 10, wt.y + 10 + bob - 26);
      else {
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wt.x + 26, wt.y + 26 + bob);
        ctx.lineTo(wt.x + 12, wt.y + 4 + bob);
        ctx.lineTo(wt.x + 40, wt.y + 4 + bob);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // ---- 持工具光标 (原版 CursorObject::Draw 各工具偏移) ----
    if (this.tool && !this.heldPlant) {
      const off = this.CURSOR_OFF[this.tool];
      if (off) {
        // 金水壶: 准星 (原版 IMAGE_ZEN_GOLDTOOLRETICLE @ (-62,-37))
        if (this.tool === 'water' && game.purchased.goldwatering) {
          const ret = img('zen_goldtoolreticle.png');
          ctx.save();
          ctx.globalAlpha = 0.85;
          if (ret) ctx.drawImage(ret, mouse.x - 62, mouse.y - 37);
          else { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3; ctx.strokeRect(mouse.x - 55, mouse.y - 50, 110, 100); }
          ctx.restore();
        }
        const icn = (this.tool === 'water' && game.purchased.goldwatering) ? 'wateringcangold.png' : this.TOOL_ICON[this.tool][0];
        const tim = img(icn);
        if (tim) {
          ctx.save();
          ctx.globalAlpha = 0.95;
          ctx.drawImage(tim, mouse.x + off[0], mouse.y + off[1]);
          ctx.restore();
        }
        // 满推车: 车上画植物 (原版 CursorObject WHEEELBARROW 分支)
        if (this.tool === 'wheelbarrow') {
          const bp = this.barrowPlant();
          if (bp) {
            const sc = bp.age === 1 ? 0.6 : bp.age === 2 ? 0.5 : 0.4;
            const px = bp.age === 1 ? 10 : bp.age === 2 ? 15 : 21;
            const py = bp.age === 1 ? -35 : bp.age === 2 ? -25 : -15;
            this.drawPlantMini(ctx, bp, mouse.x + px, mouse.y + py, sc, true);
          }
        }
      }
    }
  },

  drawBubble(ctx, game, t) {
    const b = this.bubble;
    const UI = __getUI();
    // 原版 CrazyDaveEnter (LawnApp.cpp:2455): AddReanimation(0,0) 全尺寸入场
    //   (模型 353x853, 头 y≈106, 下半身在屏外, 占屏幕左侧 — 与主场景过场完全一致)
    if (!this.daveAnim) {
      try {
        if (RE.hasDef('CrazyDave')) {
          const d = Assets.reanim('CrazyDave');
          d.x = 0; d.y = 0;
          d.play('anim_enter', RE.PLAY_ONCE_HOLD, 24);
          this.daveAnim = d;
        }
      } catch (e) { this.daveAnim = null; }
    }
    if (this.daveAnim) {
      ctx.save();
      this.daveAnim.setPosition(0, 0);
      this.daveAnim.draw(ctx);
      ctx.restore();
    }
    // 对话框 (原版 DrawCrazyDave: Store_SpeechBubble2 @(285,20), 文本区 (310,26,233,144) 黑字居中)
    drawDaveDialog(ctx, b.lines[b.line] || '', t, { noHint: !!b.sell });
    if (b.sell) {
      // 卖花确认 (原版 DIALOG_ZEN_SELL: BUTTONS_YES_NO, 对话框 +120,+60)
      const yes = { x: 330, y: 218, w: 104, h: 40 };
      const no = { x: 452, y: 218, w: 104, h: 40 };
      this._sellBtns = { yes, no };
      if (UI && UI.drawStoneButton) {
        UI.drawStoneButton(ctx, yes.x, yes.y, yes.w, yes.h, '卖！', 17);
        UI.drawStoneButton(ctx, no.x, no.y, no.w, no.h, '先不卖', 17);
      } else {
        for (const [r2, label] of [[yes, '卖！'], [no, '先不卖']]) {
          ctx.fillStyle = label === '卖！' ? '#c8e8a0' : '#e8d8b0';
          ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(r2.x, r2.y, r2.w, r2.h, 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#3a2a10'; ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, r2.x + r2.w / 2, r2.y + 26);
        }
      }
    }
  },

  // ---------- 交互 ----------
  cellAt(x, y) {
    const cells = this.gridOf(this.data.garden);
    for (let i = 0; i < cells.length; i++) {
      if (x >= cells[i][0] && x <= cells[i][0] + 80 && y >= cells[i][1] && y <= cells[i][1] + 85) {
        return [i % 8, Math.floor(i / 8)];
      }
    }
    return null;
  },
  plantAt(col, row) {
    return this.data.plants.find(p => p.garden === this.data.garden && p.x === col && p.y === row) || null;
  },
  barrowPlant() {
    return this.data.plants.find(p => p.garden === 'wheelbarrow') || null;
  },
  // 放下持有植物 (原版 MovePlant / MouseDownWithFullWheelBarrow + DoPlantingEffects)
  placeHeld(col, row, game, hpArg) {
    const hp = hpArg || this.heldPlant;
    hp.garden = this.data.garden; hp.x = col; hp.y = row;
    this.heldPlant = null;
    this.tool = null;
    const pos = this.cellPos(col, row);
    for (let i = 0; i < 6; i++) {
      this.puffs.push({ x: pos.x + 12 + Math.random() * 56, y: pos.y + 52 + Math.random() * 14, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 25, t: 0, life: 0.55 });
    }
    game.audio.play('plant');
    game.audio.play('plant2');
    this.save();
  },

  click(p, game) {
    // 任意点击 → 工具栏复位 (原版 MouseDownZenGarden: ZEN_FADING → NORMAL + counter=3000)
    this.trayIdle = 0;
    // 对话气泡优先
    if (this.bubble) {
      if (this.bubble.sell && this._sellBtns) {
        const { yes, no } = this._sellBtns;
        if (inRect(p, yes.x, yes.y, yes.w, yes.h)) { this.doSell(this.bubble.sell.plant, game); this.bubble = null; return; }
        if (inRect(p, no.x, no.y, no.w, no.h)) { this.bubble = null; game.audio.play('tap'); return; }
        return;
      }
      this.bubble.line++;
      // 原版 AdvanceCrazyDaveDialog 2102: 播到 2102 时赠送 2 株金盏花芽 (随机色变种)
      if (this.bubble.tutorial && this.bubble.line === 2 && this.data.plants.filter(pp => pp.garden !== 'wheelbarrow').length === 0) {
        for (let i = 0; i < 2; i++) this.addPottedPlant(this.newPlant('MARIGOLD', { isMarigold: true, feedingsPerGrow: 3 }));
        this.save();
      }
      // 2104 (末句) 显示 → 指向水壶的教程箭头 + PICKUP_WATER
      if (this.bubble.tutorial && this.bubble.line >= this.bubble.lines.length - 1) {
        if (this.tut && this.tut.step === 'pickup_water') this.setAdvice('点击拿起步水管！');
      }
      if (this.bubble.line >= this.bubble.lines.length) this.bubble = null;
      game.audio.play('tap');
      return;
    }
    // 主菜单 (原版: 石质 MAIN_MENU_BUTTON, 普通光标才可点 — CanInteractWithBoardButtons,
    //   点击直接回主菜单 DoBackToMain; 教程完成态点击同时结束教程)
    if (this._menu && !this.tool && !this.heldPlant && inRect(p, this._menu.x, this._menu.y, this._menu.w, this._menu.h)) {
      game.audio.play('gravebutton');
      if (this.tut && this.tut.step !== 'done') this.finishTutorial(game);
      this.leaveToMenu(game);
      game.state = 'menu';
      return;
    }
    // 切换花园 (原版 GotoNextGarden 先 LeaveGarden: 结算进行中工具 + 收币)
    if (this._nextGarden && inRect(p, this._nextGarden.x, this._nextGarden.y, this._nextGarden.w, this._nextGarden.h)) {
      this.settleAndLeave(game);
      const gardens = this.ownedGardens(game);
      const gi = gardens.indexOf(this.data.garden);
      this.data.garden = gardens[(gi + 1) % gardens.length];
      this.save();
      this.enter();
      game.audio.play('gravebutton');
      return;
    }
    // 商店 (原版 mStoreButton @(678,33): OpenStore 先 LeaveGarden + STORE_PAGE_ZEN1 + 教程期送 5 袋肥料)
    if (this._store && !this.tool && !this.heldPlant && inRect(p, this._store.x, this._store.y, this._store.w, this._store.h)) {
      this.settleAndLeave(game);
      game.audio.play('buttonclick');
      const shop = Screens.shop;
      shop.returnState = 'zengarden';
      game.state = 'shop';
      shop.enter();
      shop.page = 2;   // 原版 STORE_PAGE_ZEN1 (园艺工具页)
      // 教程: 从商店回来 → 施肥步 (原版 OpenStore 返回后 FERTILIZE_PLANTS + 送 5 袋肥料)
      if (this.tut && this.tut.step === 'visit_store') {
        if ((this.data.fertilizer || 0) <= 0) { this.data.fertilizer = 5; game.purchased.fertilizer = true; }
        this.tut.step = 'fertilize'; this.data.tutStep = 'fertilize';
        this.save();
      }
      return;
    }
    // 工具栏槽位
    for (const t of (this._tools || [])) {
      if (inRect(p, t.x, t.y, t.w, t.h)) {
        // 消耗品空库存: 蜂鸣器 (原版 PickUpTool SOUND_BUZZER)
        if (t.count !== undefined && t.count <= 0) { game.audio.play('buzzer'); return; }
        // 推车: 存/取植物 (原版 MouseDownWithEmptyWheelBarrow / PLANT_FROM_WHEEL_BARROW)
        if (t.k === 'wheelbarrow') {
          if (this.heldPlant) {
            this.heldPlant.garden = 'wheelbarrow';
            this.heldPlant = null;
            this.tool = null;
            this.save();
            game.audio.play('plant');
          } else {
            const bp = this.barrowPlant();
            if (bp) { this.heldPlant = bp; this.tool = 'wheelbarrow'; game.audio.play('seedlift'); }   // 原版 PLANT_FROM_WHEEL_BARROW
            else if (this.tool === 'wheelbarrow') { this.tool = null; game.audio.play('tap'); }
            else { this.tool = 'wheelbarrow'; game.audio.play('seedlift'); }
          }
          return;
        }
        // 再点同一工具 = 放回
        if (this.tool === t.k) { this.tool = null; game.audio.play('tap'); return; }
        this.tool = t.k;
        // 教程: 拿起水壶 → WATER_PLANT
        if (this.tut && this.tut.step === 'pickup_water' && t.k === 'water') {
          this.tut.step = 'water_plant'; this.data.tutStep = 'water_plant';
          this.setAdvice('给植物浇水！');
          this.save();
        }
        game.audio.play('seedlift');   // 原版 FOLEY_DROP
        return;
      }
    }
    // 蜗牛: 普通光标点击唤醒 / 巧克力喂食 (原版 MouseDownZenGarden STINKY 命中; 视觉体 [x, x+69]×[y, y+50])
    if (this.stinky && p.x >= this.stinky.x && p.x <= this.stinky.x + 69 && p.y >= this.stinky.y && p.y <= this.stinky.y + 50) {
      if (this.tool === 'chocolate') {
        if ((this.data.chocolate || 0) > 0) {
          this.data.chocolate--;
          this.feedStinkyChocolate();
          game.audio.play('wakeup');
          this.tool = null;
        } else game.audio.play('buzzer');
      } else if (!this.tool) {
        this.wakeStinky(false);
      }
      return;
    }
    // 金币收集 (原版 ToolHitTest 金币命中优先于格子)
    for (const c of this.coins) {
      if (!c.collected && !c.scored && Math.abs(p.x - (c.x + 8)) < 26 && Math.abs(p.y - (c.y + 6)) < 28) {
        this.collectCoin(c, false);
        return;
      }
    }
    // 格子 → 使用工具
    const cell = this.cellAt(p.x, p.y);
    if (cell) { this.useTool(cell[0], cell[1], p, game); return; }
    // 空白处: 工具归还 (原版 MouseDownWithTool 无命中 → FOLEY_DROP + ClearCursor)
    if (this.tool && this.tool !== 'glove' && this.tool !== 'wheelbarrow') {
      if (this.tool === 'sell') game.audio.play('throw');
      this.tool = null;
      return;
    }
    // 水族馆: 空白处敲玻璃 (原版 SOUND_TAPGLASS)
    if (this.data.garden === 'aquarium' && !this.tool && !this.heldPlant) {
      game.audio.play('tap');
    }
  },

  useTool(col, row, p, game) {
    const plant = this.plantAt(col, row);
    const pos = this.cellPos(col, row);
    const tool = this.tool;
    // 手套 / 满推车: 放置植物 (原版 PLANT_FROM_GLOVE / MouseDownWithFullWheelBarrow)
    const barrowP = this.barrowPlant();
    if (tool === 'glove' || (tool === 'wheelbarrow' && (this.heldPlant || barrowP))) {
      const hp = this.heldPlant || barrowP;
      if (hp) {
        if (!plant) {
          // 原版: 水族馆只收水生植物
          if (this.data.garden === 'aquarium' && !(hp.seed && AQUATIC.has(hp.seed))) {
            game.audio.play('buzzer');
            this.setAdvice('水族馆只能放水生植物！');
            return;
          }
          this.placeHeld(col, row, game, hp);
          return;
        }
        game.audio.play('buzzer');
        return;
      }
      if (tool === 'glove' && plant) {
        this.heldPlant = plant;
        game.audio.play('seedlift');   // 原版 SOUND_TAP
        return;
      }
      game.audio.play('buzzer');
      return;
    }
    // 空推车: 点植物 → 装入 (原版 MouseDownWithEmptyWheelBarrow)
    if (tool === 'wheelbarrow') {
      if (plant) {
        plant.garden = 'wheelbarrow';
        plant._r = null;
        this.save();
        game.audio.play('plant');
      } else game.audio.play('buzzer');
      return;
    }
    if (!plant) {
      // 无命中 → 工具归还 (喂食工具静默 / 手套$有 FOLEY_DROP)
      if (tool === 'glove' || tool === 'sell') game.audio.play('throw');
      this.tool = null;
      return;
    }
    // 出售 (原版 MouseDownWithMoneySign: CrazyDaveEnter 重新入场 + 报价 + DIALOG_ZEN_SELL 确认)
    if (tool === 'sell') {
      const price = this.sellPrice(plant);
      this.bubble = {
        lines: [`我给你 ${price} 来换 ${this.plantLabel(plant)}！`, '要卖掉它吗？'],
        line: 0, sell: { plant, price },
      };
      this._sellBtns = null;
      this.daveAnim = null;      // 原版 CrazyDaveEnter: 重新入场动画
      this._daveIdle = false;
      game.audio.play('gravebutton');
      return;
    }
    // 浇水 (原版 MouseDownWithFeedingTool: 金壶区域浇灌 / 普通壶单株; 播动画, 完成后生效)
    if (tool === 'water') {
      if (game.purchased.goldwatering) {
        this.spawnTool('water', p.x, p.y, null, true);
        const tl = this.tools[this.tools.length - 1];
        if (tl) tl.goldArea = { x: p.x, y: p.y };
      } else {
        this.spawnTool('water', pos.x, pos.y, plant, false);
      }
      this.tool = null;   // 原版 MouseDownWithFeedingTool 末尾 ClearCursor
      return;
    }
    // 肥料 (消耗品 — 原版点击即扣库存, 播动画, 播完时若需要才生效)
    if (tool === 'fertilizer') {
      if ((this.data.fertilizer || 0) <= 0) { game.audio.play('buzzer'); this.tool = null; return; }
      this.data.fertilizer--;
      this.save();
      this.spawnTool('fertilizer', pos.x, pos.y, plant);
      this.tool = null;
      return;
    }
    // 杀虫剂 (消耗品)
    if (tool === 'bugspray') {
      if ((this.data.bugspray || 0) <= 0) { game.audio.play('buzzer'); this.tool = null; return; }
      this.data.bugspray--;
      this.save();
      this.spawnTool('bugspray', pos.x, pos.y, plant);
      this.tool = null;
      return;
    }
    // 留声机 (原版 animRate 20, 播 2 轮生效)
    if (tool === 'phonograph') {
      this.spawnTool('phonograph', pos.x, pos.y, plant);
      this.tool = null;
      return;
    }
    // 巧克力 (原版 CURSOR_TYPE_CHOCOLATE → FeedChocolateToPlant)
    if (tool === 'chocolate') {
      if (this.canHaveChocolate(plant)) {
        this.data.chocolate--;
        this.feedChocolate(plant, pos);
        game.audio.play('wakeup');
      } else {
        game.audio.play('buzzer');
      }
      this.tool = null;
      return;
    }
  },

  doSell(plant, game) {
    const price = this.sellPrice(plant);
    game.coins += price;
    game.saveShop();
    const idx = this.data.plants.indexOf(plant);
    if (idx >= 0) this.data.plants.splice(idx, 1);
    this.save();
    game.audio.play('shovel');
    game.audio.play('points');
  },

  // 新植物入花园 (原版 AddPottedPlant: FindOpenZenGardenSpot 随机空位;
  //   戴夫对话期间跳过其遮挡区 x<2 / y<1 — ZenGarden.cpp:357)
  addPottedPlant(p) {
    const cells = this.gridOf('greenhouse');
    const open = [];
    const daveTalking = !!(this.bubble && this.bubble.tutorial);
    for (let i = 0; i < cells.length; i++) {
      const x = i % 8, y = Math.floor(i / 8);
      if (daveTalking && (x < 2 || y < 1)) continue;
      if (!this.data.plants.some(q => q.garden === 'greenhouse' && q.x === x && q.y === y)) open.push([x, y]);
    }
    if (!open.length) return;
    const [x, y] = open[Math.floor(Math.random() * open.length)];
    p.garden = 'greenhouse'; p.x = x; p.y = y;
    this.data.plants.push(p);
    // 种植特效 (原版 DoPlantingEffects)
    if (this.data.garden === 'greenhouse') {
      for (let i = 0; i < 6; i++) {
        this.puffs.push({ x: cells[y * 8 + x][0] + 12 + Math.random() * 56, y: cells[y * 8 + x][1] + 52 + Math.random() * 14, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 25, t: 0, life: 0.55 });
      }
    }
  },

  // ESC/右键: 归还工具 (植物本来就留在原地)
  cancelHold() {
    this.tool = null;
    this.heldPlant = null;
  },

  // 兼容旧调用 (main.js 进花园时调用) — 需求已由实时时钟计算
  refreshNeeds() { },
};

if (typeof module !== 'undefined') module.exports = { Screens, pvzText, inRect };
