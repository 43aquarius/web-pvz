// ============================================================
// cutscene.js — 关卡开场过场 / 转场动画 (完整移植原版 CutScene.cpp 时间轴)
// 原版时间轴 (ms):
//   0-1500  房子视图 (镜头 cam=-220, 显示房子+街道僵尸)
//   1500-3500 镜头右移 (cam → +380, 显示僵尸街景)
//   3500-4000 停留僵尸视图
//   4000-4250 选卡界面从底部滑入 (选卡关卡) → 暂停等玩家选卡
//   [玩家选卡 → 点击"让我们摇滚吧!"]
//   4500-4750 选卡界面滑出
//   4500-6000 镜头左移回正 (cam → 0)
//   6050-6550 割草机逐行出现 (+草皮/墓碑偏移)
//   6000-8000 草皮卷铺设 (1/2/4 关首次)
//   6000-7000 墓碑浮现 (夜关, +草皮偏移)
//   6550+1830 READY-SET-PLANT (SodRoll/墓碑时间顺延)
//   结束 = 6000+550+sod+grave+1830
// ============================================================
'use strict';

const RE = require('./reanim');
const { WAVE } = require('./data');

const img = (n) => Assets.image(n);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// ease in-out (原版 CURVE_EASE_IN_OUT 近似)
function easeIO(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
// 时间区间进度
function seg(t, t0, t1) { return clamp01((t - t0) / (t1 - t0)); }
// 原版 CalcPosition
function calcPos(t0, t1, from, to, t) { return from + (to - from) * easeIO(seg(t, t0, t1)); }

// ---- 原版时间常量 (CutScene.cpp) ----
const T = {
  PAN_RIGHT_START: 1500, PAN_RIGHT_END: 3500,
  CHOOSER_ON_START: 4000, CHOOSER_ON_END: 4250,
  CHOOSER_OFF_START: 4500, CHOOSER_OFF_END: 4750,
  PAN_LEFT_START: 4500, PAN_LEFT_END: 6000,
  SEED_BANK_ON: 4000, SEED_BANK_ON_END: 4250,
  ROLL_SOD_START: 6000, ROLL_SOD_END: 8000,
  GRAVE_START: 6000, GRAVE_END: 7000,
  MOWER_START: [6300, 6250, 6200, 6150, 6100, 6050], // 行0..5
  MOWER_DURATION: 250,
  INTRO_END: 6000, MOWER_TIME: 550, RSP_TIME: 1830,
};

const Cutscene = {
  active: false,
  t: 0,                  // 过场时间 (秒)
  phase: 'intro',        // intro / done
  seedChoosing: false,   // 选卡暂停
  chooserY: 516,         // 选卡界面 y (516=屏外 → 0)
  seedBankY: -87,        // 种子银行 y (滑入)
  cameraX: 0,            // 镜头 x (原版 board Move 取反: -220房子 / +380僵尸 / 0草坪)
  sodRolls: [],          // 草皮卷滚筒 reanim 实例
  rspAnim: null,         // READY-SET-PLANT reanim
  houseMsg: '',
  mowTime: {},           // 每行割草机显示时间
  gravesShown: false,

  // ---- 启动关卡开场 ----
  start(board) {
    this.active = true;
    this.t = 0;
    this.phase = 'intro';
    this.seedChoosing = false;
    this.chooserY = 516;
    this.seedBankY = -87;
    this.cameraX = -220;               // 房子视图
    this.board = board;
    this.sodRolls = [];
    this.rspAnim = null;
    this.gravesShown = false;
    board.sodRolls = [];
    const level = board.level;
    // 时间分量
    this.sodTime = level.sodRoll ? 2000 : 0;
    this.graveTime = (level.graves && level.graves.length) ? 1000 : 0;
    // 房子文案 (原版 [PLAYERS_HOUSE])
    this.houseMsg = level.scene === 'day' || level.scene === 'night' ? '玩家之家'
      : level.scene === 'pool' || level.scene === 'fog' ? '玩家的后院' : '玩家的屋顶';
    // 割草机出现时间 (原版: 行5最先)
    this.mowTime = {};
    for (let r = 0; r < board.rows; r++) {
      this.mowTime[r] = (T.MOWER_START[Math.min(r, 5)] + this.sodTime + this.graveTime) / 1000;
    }
    // 割草机初始隐藏
    for (const m of board.mowers) m.hidden = true;
    // 街边僵尸 (原版 PlaceAZombie: gridX*56+830, gridY*90+70, 5x5网格)
    this.placeStreetZombies(board);
    board.state = 'intro';
    board.cutsceneSod = level.sodRoll ? 0 : undefined;
    // 需要重新隐藏已放置植物? 不需要 — 原版开局植物只在1-5保龄球等关卡
  },

  placeStreetZombies(board) {
    if (board.level.fixed) return;   // 特殊玩法关卡无街边僵尸
    // 收集本关可出现的僵尸种类 (原版按波次统计)
    const types = [];
    const seen = new Set();
    for (const w of board.waves) {
      for (const [ty] of w.types) {
        if (ty === 'FLAG' || ty === 'BOSS' || seen.has(ty)) continue;
        seen.add(ty);
        types.push(ty);
      }
    }
    if (board.waterRows.length && !types.includes('DUCKY')) types.unshift('DUCKY');
    if (!types.length) types.push('NORMAL');
    // 5x5 网格摆放 (大僵尸优先)
    const grid = Array.from({ length: 5 }, () => new Array(5).fill(false));
    const placed = [];
    const big = types.filter(ty => ['GARGANTUAR', 'REDEYE'].includes(ty));
    const rest = types.filter(ty => !big.includes(ty));
    const place = (ty) => {
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (grid[gy][gx]) continue;
          grid[gy][gx] = true;
          if (big.includes(ty) && gx > 0 && gy > 0) { grid[gy][gx - 1] = true; grid[gy - 1][gx] = true; grid[gy - 1][gx - 1] = true; }
          placed.push({ ty, gx, gy });
          return;
        }
      }
    };
    big.forEach(place);
    rest.forEach(place);
    // 创建实体
    for (const p of placed.slice(0, 12)) {
      const z = board.spawnZombie(p.ty, 0);
      if (!z) continue;
      z.x = p.gx * 56 + 830;                       // 原版 mPosX
      z.streetY = p.gy * 90 + 70 + (p.gx % 2 === 1 ? 30 : 0); // 原版 mPosY
      z.streetIdle = true;
      z.row = -1;             // 不属于任何行
      z.vel = 0;
      if (z.anim) { try { z.anim.play('anim_idle', RE.LOOP, 8); } catch (e) { } }
    }
  },

  // 玩家点击"让我们摇滚吧!" → 结束选卡
  finishSeedChoosing() {
    this.seedChoosing = false;
    const board = this.board;
    // 最终确定卡组 + 开局冷却 (原版: 选卡结束后卡片进入冷却)
    board.seedCards = board.chosenSeeds.map(t => ({ type: t, cd: 0 }));
    for (const c of board.seedCards) c.cd = 2;
    this.t = Math.max(this.t, T.CHOOSER_OFF_START / 1000); // 从滑出开始继续
  },

  update(dt) {
    if (!this.active) return;
    if (this.seedChoosing) return;   // 选卡期间暂停时间轴
    this.t += dt;
    const t = this.t * 1000;         // ms
    const board = this.board;
    const level = board.level;

    // ---- 镜头 (原版 AnimateBoard: Move(220,0)→Move(-380,0)→Move(0,0), 此处取反) ----
    let cam;
    if (t <= T.PAN_RIGHT_START) cam = -220;
    else if (t <= T.PAN_RIGHT_END) cam = -calcPos(T.PAN_RIGHT_START, T.PAN_RIGHT_END, 220, -380, t);
    else if (t <= T.PAN_LEFT_START) cam = 380;
    else if (t <= T.PAN_LEFT_END) cam = -calcPos(T.PAN_LEFT_START, T.PAN_LEFT_END, -380, 0, t);
    else cam = 0;
    this.cameraX = cam;
    board.cameraX = cam;

    // ---- 选卡界面滑入/滑出 ----
    if (level.chooseSeeds && !level.fixed) {
      if (t <= T.CHOOSER_ON_START) this.chooserY = 516;
      else if (t <= T.CHOOSER_ON_END) this.chooserY = calcPos(T.CHOOSER_ON_START, T.CHOOSER_ON_END, 516, 0, t);
      else if (t <= T.CHOOSER_OFF_START) {
        this.chooserY = 0;
        // 到位 → 暂停等玩家选卡
        if (!this._chooserShown && t >= T.CHOOSER_ON_END) {
          this._chooserShown = true;
          this.seedChoosing = true;
        }
      }
      else if (t <= T.CHOOSER_OFF_END) this.chooserY = calcPos(T.CHOOSER_OFF_START, T.CHOOSER_OFF_END, 0, 516, t);
      else this.chooserY = 516;
    }

    // ---- 种子银行滑入 (原版: 选卡关 4000, 非选卡关 6000+sod+grave) ----
    const bankOn = level.chooseSeeds ? T.SEED_BANK_ON : (6000 + this.sodTime + this.graveTime);
    if (t <= bankOn) this.seedBankY = -87;
    else if (t <= bankOn + 250) this.seedBankY = calcPos(bankOn, bankOn + 250, -87, 0, t);
    else this.seedBankY = 0;

    // ---- 割草机出现 (逐行) ----
    for (const m of board.mowers) {
      if (m.hidden && t >= this.mowTime[m.row] * 1000) m.hidden = false;
    }

    // ---- 草皮卷 (原版 6000-8000, 滚筒 reanim + 泥土粒子 + digger音效) ----
    if (this.sodTime > 0 && t >= T.ROLL_SOD_START && t <= T.ROLL_SOD_END) {
      if (!this.sodRolls.length) {
        this.startSodRoll(board);
        board.game.audio.play('digger');
      }
      // 草皮揭示进度 (原版 mSodPosition 线性 0→1000)
      board.cutsceneSod = (t - T.ROLL_SOD_START) / (T.ROLL_SOD_END - T.ROLL_SOD_START);
      // 泥土粒子: 跟随滚筒前沿
      this.spawnSodDirt(board, t, dt);
    }
    if (this.sodTime > 0 && t > T.ROLL_SOD_END) {
      if (board.cutsceneSod !== undefined) board.cutsceneSod = 1;
      if (this.sodRolls.length && !this._sodDone) {
        this._sodDone = true;
        board.sodRolls = [];
        this.sodRolls = [];
        board.sodDone = true;
        delete board.cutsceneSod;
      }
    }

    // ---- 墓碑浮现 (夜关, 带泥土粒子) ----
    if (this.graveTime > 0 && !this.gravesShown && t >= T.GRAVE_START + this.sodTime) {
      this.gravesShown = true;
      for (const g of board.graves) {
        board.addEffect('dust', board.gridX(g.col) + 40, board.cellY(g.row, g.col) + 50);
      }
      board.game.audio.play('gravebuttonchime');
    }

    // ---- READY-SET-PLANT (原版: 6000+550+sod+grave 起 1.83s, reanim) ----
    const rspStart = 6000 + T.MOWER_TIME + this.sodTime + this.graveTime;
    if (!level.noReadySet && !this.rspAnim && t >= rspStart && RE.hasDef('StartReadySetPlant')) {
      const r = Assets.reanim('StartReadySetPlant');
      r.x = 400; r.y = 324;
      r.frameStart = 0; r.frameCount = 13;
      r.animRate = 12;
      r.loopType = RE.PLAY_ONCE_HOLD;
      r.animTime = 0;
      this.rspAnim = r;
      board.game.audio.play('readysetplant');
    }

    // ---- 结束 ----
    const endT = (6000 + T.MOWER_TIME + this.sodTime + this.graveTime + (level.noReadySet ? 0 : T.RSP_TIME)) / 1000;
    if (this.t >= endT) {
      this.active = false;
      this.phase = 'done';
      this._chooserShown = false;
      this._sodDone = false;
      board.cameraX = 0;
      board.sodDone = true;
      delete board.cutsceneSod;
      board.sodRolls = [];
      this.sodRolls = [];
      board.rspAnim = null;
      this.rspAnim = null;
      // 移除街边僵尸 (原版 RemoveCutsceneZombies)
      board.zombies = board.zombies.filter(z => !z.streetIdle);
      board.state = 'playing';
      board.beginWaves();
    }
  },

  // ---- 草皮卷滚筒 (原版 REANIM_SODROLL 添加于 RenderLayer_TOP) ----
  startSodRoll(board) {
    const lvl = board.level.id;
    // 原版 CutScene.cpp 1202-1226: 不同关卡滚筒偏移
    const offsets = lvl === 1 ? [[0, 0]]
      : (lvl === 2 || lvl === 3) ? [[0, -102], [0, 111]]
        : [[-3, -198], [-3, 203]];
    for (const [ox, oy] of offsets) {
      const r = Assets.reanim('SodRoll');
      if (!r || !r.def) continue;
      r.x = ox; r.y = oy;
      r.frameStart = 0; r.frameCount = 48;   // 全区间 48帧
      r.animRate = 24;                        // 24fps → 2秒
      r.loopType = RE.PLAY_ONCE_HOLD;
      r.animTime = 0;
      this.sodRolls.push(r);
    }
    board.sodRolls = this.sodRolls;
  },

  // ---- 泥土粒子 (原版 PARTICLE_SOD_ROLL, 滚筒前沿喷土) ----
  spawnSodDirt(board, t, dt) {
    if (Math.random() > dt * 22) return;   // 平均每秒 ~22 粒
    const p = (t - T.ROLL_SOD_START) / (T.ROLL_SOD_END - T.ROLL_SOD_START);
    const lvl = board.level.id;
    // 滚筒前沿 x (轨道 x: 10→770)
    const fx = 10 + 760 * p;
    // 滚筒所在行 y (轨道 y≈244 + 偏移)
    const rows = lvl === 1 ? [0] : (lvl === 2 || lvl === 3) ? [-102, 111] : [-198, 203];
    const colors = ['#7a5a30', '#8a6a3a', '#6a4a28', '#9a7a48'];
    const oy = rows[Math.floor(Math.random() * rows.length)];
    const y = 300 + oy;
    board.addEffect('sod_dirt', fx + (Math.random() * 16 - 8), y - Math.random() * 30, {
      dur: 0.55 + Math.random() * 0.3,
      vx: -30 - Math.random() * 50, vy: -90 - Math.random() * 80,
      r: 2 + Math.random() * 3.5, c: colors[Math.floor(Math.random() * colors.length)],
    });
  },

  // ---- 绘制 (叠加在 board 渲染之上) ----
  draw(ctx, board) {
    const t = this.t * 1000;
    // 1. 房子文案 (原版 MESSAGE_STYLE_HOUSE_NAME: 镜头房子期间)
    if (t < 3600 && this.houseMsg) {
      const a = t < 300 ? t / 300 : (t > 3300 ? Math.max(0, (3600 - t) / 300) : 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 26px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,12,0,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(this.houseMsg, 400, 110);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(this.houseMsg, 400, 110);
      ctx.restore();
    }
    // 2. READY-SET-PLANT (reanim, 居中)
    if (this.rspAnim) {
      this.rspAnim.update(1 / 60);
      this.rspAnim.draw(ctx);
      if (this.rspAnim.animTime >= 1) this.rspAnim = null;
    }
  },
};

// 避免循环引用: 僵尸表延迟获取
let ZOMBIES_DEF = {};
function setZombieDefs(z) { ZOMBIES_DEF = z; }

// ============================================================
// 场内横幅系统 (一大波僵尸/最后一波 — 原版图片横幅)
// ============================================================
const Banners = {
  list: [],
  show(imgName, dur = 3.4, sound = null, audio = null) {
    this.list.push({ img: imgName, t: 0, dur, sound });
    if (sound && audio) audio.play(sound);
  },
  update(dt) {
    for (const b of this.list) b.t += dt;
    this.list = this.list.filter(b => b.t < b.dur);
  },
  draw(ctx) {
    for (const b of this.list) {
      const im = img(b.img);
      if (!im) continue;
      const p = b.t / b.dur;
      // 原版: 弹入 → 停留 → 淡出
      let sc = 1, alpha = 1;
      if (p < 0.12) { const q = p / 0.12; sc = 0.5 + 0.5 * easeIO(q); alpha = q; }
      else if (p > 0.85) { alpha = (1 - p) / 0.15; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(400, 240);
      ctx.scale(sc, sc);
      const w = im.width, h = im.height;
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  },
  clear() { this.list = []; },
};

// ============================================================
// 转场效果 (场景切换淡入淡出)
// ============================================================
const Transition = {
  fade: 0, target: 0, cb: null,
  to(cb, dur = 0.4) { this.target = 1; this.dur = dur; this.cb = cb; },
  update(dt) {
    if (this.target === 1) {
      this.fade = Math.min(1, this.fade + dt / (this.dur || 0.4));
      if (this.fade >= 1 && this.cb) { const cb = this.cb; this.cb = null; this.target = 0; cb(); }
    } else if (this.target === 0 && this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / (this.dur || 0.4));
    }
  },
  draw(ctx) {
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, 800, 600);
    }
  },
  busy() { return this.target === 1 || this.cb !== null; },
};

if (typeof module !== 'undefined') module.exports = { Cutscene, Banners, Transition, setZombieDefs, easeIO };
