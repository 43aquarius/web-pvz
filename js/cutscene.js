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
//   6000-8000 草皮卷铺设 (1/2/4 关首次冒险)
//   6000-7000 墓碑浮现 (夜关, +草皮偏移)
//   6550+1830 READY-SET-PLANT (SodRoll/墓碑时间顺延)
//   结束 = 6000+550+sod+grave+1830
// 戴夫过场 (1-5 首次): t=2000 Dave入场 → 对话(点击推进) → 赠送铲子 → 离场
// ============================================================
'use strict';

const RE = require('./reanim');
const { WAVE, STR } = require('./data');

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
    this.rspDone = false;      // READY-SET-PLANT 只播一次
    this.gravesShown = false;
    board.sodRolls = [];
    const level = board.level;
    // 首次冒险判定 (原版 IsFirstTimeAdventureMode): 已解锁 ≤ 本关 → 首次
    this.firstTime = board.game && board.game.progress ? board.game.progress.unlocked <= level.id : true;
    // 时间分量 (原版: 首次冒险且关号 1/2/4 才滚草皮)
    this.sodTime = (level.sodRoll && this.firstTime) ? 2000 : 0;
    this.graveTime = (level.graves && level.graves.length) ? 1000 : 0;
    // 戴夫过场 (原版 CutScene.cpp 750-860: 按关卡触发对话; 未看过该关对话则播放)
    this.daveFirst = !!(board.game && board.game.daveSeen && !board.game.daveSeen[level.id]);
    this.daveDialog = this.daveDialogFor(level, this.daveFirst);
    this.daveMode = !!this.daveDialog;
    this.davePhase = null;        // null → enter → talk → gift → leave → null
    this.daveT = 0;
    this.daveLine = 0;
    this.daveAnim = null;
    this.daveTalkT = 0;
    this.daveGrab = false;        // 5-10: 被飞贼抓走演出
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
    // 非滚草皮关: 草皮直接完整 (原版 mSodPosition=1000)
    board.cutsceneSod = this.sodTime > 0 ? 0 : undefined;
    board.sodDone = this.sodTime <= 0;
    // 需要重新隐藏已放置植物? 不需要 — 原版开局植物只在1-5保龄球等关卡
  },

  placeStreetZombies(board) {
    // 原版 PlaceStreetZombies: 仅僵王博士关 (5-10) 无街边僵尸;
    // 打僵尸/罐子/我不是僵尸无常规波次 → 无预览类型, 也跳过
    if (board.level.id === 50 && !board.level.mode) return;
    if (['whack', 'vasebreaker', 'izombie'].includes(board.level.fixed)) return;
    // 收集本关可出现的僵尸种类 (原版按波次统计)
    const types = [];
    const seen = new Set();
    for (const w of board.waves) {
      for (const [ty] of w.types) {
        if (ty === 'FLAG' || ty === 'BOSS' || seen.has(ty)) continue;
        if (ty === 'YETI' && board.level.id !== 40) continue;   // 原版: 雪人仅暴雨夜预览
        seen.add(ty);
        types.push(ty);
      }
    }
    if (board.waterRows.length && !types.includes('DUCKY')) types.unshift('DUCKY');
    if (!types.length) return;
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
    // 创建实体 (原版: fromWave=ZOMBIE_WAVE_CUTSCENE → 不参与逻辑, 仅播放待机动画)
    // 预览容量 (原版 PlaceStreetZombies): 常规 10 / 小僵尸 15 / 小Boss与暴雨 18
    const lv = board.level.id;
    const cap = (!board.level.mode && lv === 25) ? 15
      : (!board.level.mode && (lv === 10 || lv === 20 || lv === 30 || lv === 40)) ? 18 : 12;
    for (const p of placed.slice(0, cap)) {
      const z = this.board.addZombie(p.ty, -2);
      if (!z) continue;
      z.posX = p.gx * 56 + 830;                       // 原版 mPosX
      z.x = Math.floor(z.posX);
      z.posY = p.gy * 90 + 70 + (p.gx % 2 === 1 ? 30 : 0); // 原版 mPosY
      z.y = Math.floor(z.posY);
      z.row = -1;             // 不属于任何行
      z.velX = 0;
      if (z.bodyReanim) { try { z.playZombieReanim('anim_idle', RE.LOOP, 0, 8); z.updateReanim(); } catch (e) { } }
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
    // ---- 戴夫过场 (1-5): 入场/对话/离场, 期间主时间轴暂停 ----
    if (this.daveMode) { this.updateDave(dt); if (this.davePhase) return; }
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

    // ---- 墓碑浮现 (夜关, 带泥土粒子 + 升起动画) ----
    if (this.graveTime > 0 && t >= T.GRAVE_START + this.sodTime) {
      const p = clamp01((t - T.GRAVE_START - this.sodTime) / (T.GRAVE_END - T.GRAVE_START));
      for (const g of board.graves) g.rise = p;
      if (!this.gravesShown && p > 0.15) {
        this.gravesShown = true;
        for (const g of board.graves) {
          board.addEffect('dust', board.gridX(g.col) + 40, board.cellY(g.row, g.col) + 50);
        }
        board.game.audio.play('gravebuttonchime');
      }
    }
    if (this.graveTime > 0 && t >= T.GRAVE_END + this.sodTime) {
      for (const g of board.graves) g.rise = 1;
    }

    // ---- READY-SET-PLANT (原版: 6000+550+sod+grave 起, reanim 13帧@12fps) ----
    const rspStart = 6000 + T.MOWER_TIME + this.sodTime + this.graveTime;
    if (!level.noReadySet && !this.rspDone && !this.rspAnim && t >= rspStart && RE.hasDef('StartReadySetPlant')) {
      this.rspDone = true;      // 防止播完后被重置重新创建 (重复bug根因)
      const r = Assets.reanim('StartReadySetPlant');
      r.x = 400; r.y = 324;
      r.frameStart = 0; r.frameCount = 13;
      r.animRate = 12;
      r.loopType = RE.PLAY_ONCE_HOLD;
      r.animTime = 0;
      this.rspAnim = r;
      board.game.audio.play('readysetplant');
    }
    // 按实际帧时间推进 (在 draw 中按 1/60 推进在高刷屏上会变快/节奏错乱)
    if (this.rspAnim) {
      this.rspAnim.update(dt);
      // 原版: reanim 1083ms 播完后 PLANT! 末帧保持至 1830ms 过场结束 (PLAY_ONCE_HOLD 不清除)
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
      // 移除街边僵尸 (原版 RemoveCutsceneZombies; fromWave=WAVE_CUTSCENE=-2)
      for (const z of board.zombies) {
        if (z.fromWave === -2) z.dieNoLoot();
      }
      board.zombies = board.zombies.filter(z => z.fromWave !== -2);
      board.state = 'playing';
      board.beginWaves();
    }
  },

  // ---- 草皮卷滚筒 (原版 REANIM_SODROLL 添加于 RenderLayer_TOP) ----
  startSodRoll(board) {
    const lvl = board.level.id;
    // 原版 CutScene.cpp 1202-1226: 不同关卡滚筒偏移
    const offsets = lvl === 1 ? [[0, 0]]
      : lvl === 2 ? [[0, -102], [0, 111]]
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
    const rows = lvl === 1 ? [0] : lvl === 2 ? [-102, 111] : [-198, 203];
    const colors = ['#7a5a30', '#8a6a3a', '#6a4a28', '#9a7a48'];
    const oy = rows[Math.floor(Math.random() * rows.length)];
    const y = 300 + oy;
    board.addEffect('sod_dirt', fx + (Math.random() * 16 - 8), y - Math.random() * 30, {
      dur: 0.55 + Math.random() * 0.3,
      vx: -30 - Math.random() * 50, vy: -90 - Math.random() * 80,
      r: 2 + Math.random() * 3.5, c: colors[Math.floor(Math.random() * colors.length)],
    });
  },

  // ============================================================
  // 戴夫过场 (原版 CutScene.cpp 750-860: 各关卡 mCrazyDaveDialogStart)
  // 入场 t=1500 (冻结主时间轴) → 对话点击推进 → 离场 → 时间轴恢复
  // 文本来自原版 LawnStrings [CRAZY_DAVE_xxxx] (assets/dave_dialogs.json)
  // ============================================================
  daveText(id) {
    const dialogs = Assets.data('dave_dialogs');
    let t = dialogs['CRAZY_DAVE_' + id] || '';
    // 占位符替换 (原版 {PLAYER_NAME}/{MONEY}/{UPGRADE_COST})
    const game = this.board.game;
    t = t.replace('{PLAYER_NAME}', '邻居')
      .replace('{MONEY}', String(game.coins || 0))
      .replace('{UPGRADE_COST}', '$7500')
      .replace(/\{[A-Z_0-9]+\}/g, '');   // 剩余表情标记清除
    return t.trim();
  },
  daveIdsFor(level, firstTime) {
    const lv = level.id;
    // [原版 CutScene::StartLevel 场景→ID映射表]
    if (lv === 5) return firstTime ? { ids: range(2400, 2406), giftAt: 2405 } : { ids: [2410, 2411], giftAt: null };
    if (lv === 15) return { ids: range(401, 406), giftAt: null };                    // 2-5 打僵尸 (锤子)
    if (lv === 25) return { ids: range(701, 703), giftAt: null };                    // 3-5 小僵尸
    if (lv === 35) return firstTime ? { ids: range(2500, 2502), giftAt: null } : null; // 4-5 罐子
    if (lv === 45) return firstTime ? { ids: range(1301, 1311), giftAt: null } : { ids: range(1304, 1311), giftAt: null }; // 5-5 蹦极
    if (lv === 50) return { ids: range(2300, 2302), giftAt: null, boss: true };      // 5-10 僵王
    // 我不是僵尸 / 花瓶终结者 首次
    if (level.fixed === 'izombie' && firstTime) return { ids: range(2200, 2203), giftAt: null };
    if (level.fixed === 'vasebreaker' && firstTime) return { ids: range(3000, 3002), giftAt: null };
    if (!firstTime) {
      if (lv === 1) return { ids: range(1601, 1603), giftAt: null };
      return null;
    }
    // 首次冒险的关卡引导 (原版 201/501/801/1201 等)
    if (lv === 11) return { ids: range(201, 207), giftAt: null };
    if (lv === 12) return { ids: range(1401, 1402), giftAt: null };
    if (lv === 21) return { ids: range(501, 505), giftAt: null };
    if (lv === 31) return { ids: range(801, 803), giftAt: null };
    if (lv === 41) return { ids: range(1201, 1204), giftAt: null };
    return null;
  },
  daveDialogFor(level, firstTime) {
    const spec = this.daveIdsFor(level, firstTime);
    if (!spec || !spec.ids.length) return null;
    const lines = spec.ids.map(id => this.daveText(id)).filter(t => t);
    if (!lines.length) return null;
    return {
      lines,
      gift: spec.giftAt ? lines.slice(lines.length - (spec.ids.length - spec.ids.indexOf(spec.giftAt))) : null,
      boss: !!spec.boss,
    };
  },

  daveLines() {
    const d = this.daveDialog;
    if (!d) return [];
    return d.gift ? [...d.lines, ...d.gift] : d.lines;
  },

  updateDave(dt) {
    const game = this.board.game;
    const t = this.t * 1000;
    if (!this.daveAnim && RE.hasDef('CrazyDave')) {
      const d = Assets.reanim('CrazyDave');
      d.x = 170; d.y = 88;
      this.daveAnim = d;
    }
    if (!this.davePhase && t >= 1500) {
      // 入场 (在镜头右移之前冻结时间轴: 原版 mCrazyDaveTime 将右移推迟到 Dave 离场后)
      this.davePhase = 'enter';
      this.daveT = 0;
      this.t = 1.5;              // 冻结在镜头房子视图 (cam=-220)
      if (this.daveAnim) this.daveAnim.play('anim_enter', RE.PLAY_ONCE_HOLD, 24);
      game.audio.play('dave_short');
    }
    if (this.davePhase === 'enter') {
      this.daveT += dt;
      if (this.daveAnim) this.daveAnim.update(dt);
      if (this.daveT >= 0.75) {
        this.davePhase = 'talk';
        this.daveLine = 0;
        this.daveTalkT = 0;
        if (this.daveAnim) this.daveAnim.play('anim_mediumtalk', RE.LOOP, 18);
        game.audio.play('dave_medium');
      }
    } else if (this.davePhase === 'talk') {
      this.daveTalkT += dt;
      if (this.daveAnim) {
        this.daveAnim.update(dt);
        // 说话动画循环切换
        if (this.daveTalkT > 1.6) {
          this.daveTalkT = 0;
          const next = ['anim_smalltalk', 'anim_mediumtalk', 'anim_blahblah'][Math.floor(Math.random() * 3)];
          this.daveAnim.play(next, RE.LOOP, 16 + Math.random() * 8);
          game.audio.play(Math.random() < 0.5 ? 'dave_short' : 'dave_medium');
        }
      }
    } else if (this.davePhase === 'gift') {
      this.daveT += dt;
      if (this.daveAnim) this.daveAnim.update(dt);
    } else if (this.davePhase === 'leave') {
      this.daveT += dt;
      if (this.daveAnim) this.daveAnim.update(dt);
      // 被飞贼抓走: 戴夫快速上升消失 (原版 CutScene.cpp 1562-1572)
      if (this.daveGrab && this.daveAnim) {
        this.daveAnim.y -= dt * 220;
      }
      if (this.daveT >= (this.daveGrab ? 1.2 : 0.62)) {
        // 离场完成 → 恢复主时间轴 + 标记已看过
        this.davePhase = null;
        this.daveAnim = null;
        this.daveMode = false;
        if (this.board.game && this.board.game.markDaveSeen) this.board.game.markDaveSeen(this.board.level.id);
      }
    }
  },

  // 点击推进对话 (由 gameClick 转发)
  daveClick() {
    const game = this.board.game;
    if (this.davePhase === 'enter') { this.daveT = Math.max(this.daveT, 0.74); return true; }
    if (this.davePhase === 'talk') {
      const lines = this.daveLines();
      const giftLines = this.daveDialog && this.daveDialog.gift ? this.daveDialog.gift.length : 0;
      this.daveLine++;
      if (giftLines && this.daveLine >= lines.length - giftLines) {
        // 进入赠送阶段 (原版 2406: "拿起铲子开始挖吧" — 仅 1-5 首次)
        game.shovelUnlocked = true;
        game.audio.play('dave_crazy');
        if (this.daveAnim) this.daveAnim.play('anim_crazy', RE.PLAY_ONCE_HOLD, 20);
        this.davePhase = 'gift';
        this.daveT = 0;
        return true;
      }
      if (this.daveLine >= lines.length) {
        // 无赠礼: 离场 (5-10 僵王关: 被飞贼抓走 — 原版 anim_grab + BUNGEE_SCREAM)
        if (this.daveDialog && this.daveDialog.boss && this.daveAnim && this.daveAnim.animExists && this.daveAnim.animExists('anim_grab')) {
          this.daveAnim.play('anim_grab', RE.PLAY_ONCE_HOLD, 24);
          this.davePhase = 'leave';
          this.daveT = 0;
          this.daveGrab = true;   // 抓走后快速上升消失
          game.audio.play('bungee_scream');
          game.audio.play('dave_scream');
        } else {
          if (this.daveAnim) this.daveAnim.play('anim_leave', RE.PLAY_ONCE_HOLD, 22);
          this.davePhase = 'leave';
          this.daveT = 0;
          game.audio.play('dave_short');
        }
        return true;
      }
      game.audio.play(Math.random() < 0.5 ? 'dave_short' : 'dave_medium');
      return true;
    }
    if (this.davePhase === 'gift') {
      // 点击推进赠礼台词 → 最后离场
      const lines = this.daveLines();
      this.daveLine++;
      if (this.daveLine >= lines.length) {
        if (this.daveAnim) this.daveAnim.play('anim_leave', RE.PLAY_ONCE_HOLD, 22);
        this.davePhase = 'leave';
        this.daveT = 0;
      }
      game.audio.play('dave_short');
      return true;
    }
    return false;
  },

  // 绘制戴夫 + 对话框 (叠加在 board 之上)
  drawDave(ctx) {
    if (!this.daveMode || !this.daveAnim) return;
    this.daveAnim.draw(ctx);
    // 对话框 (原版风格: 羊皮纸圆角框 + 底部文字)
    if (this.davePhase === 'talk' || this.davePhase === 'gift') {
      const lines = this.daveLines();
      const text = lines[Math.min(this.daveLine, lines.length - 1)] || '';
      const bx = 400, by = 470, bw = 560, bh = 88;
      ctx.save();
      ctx.globalAlpha = 0.96;
      // 羊皮纸底
      const grad = ctx.createLinearGradient(0, by, 0, by + bh);
      grad.addColorStop(0, '#f5e7c0'); grad.addColorStop(1, '#e0c48a');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#7a5222'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(bx - bw / 2, by, bw, bh, 16);
      ctx.fill(); ctx.stroke();
      // 文本 (自动换行)
      ctx.fillStyle = '#4a2f10';
      ctx.font = 'bold 19px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      this.wrapText(ctx, text, bx, by + 34, bw - 60, 26);
      // 继续指示
      const a = 0.5 + 0.5 * Math.sin(this.daveTalkT * 6);
      ctx.globalAlpha = a;
      ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#8a6a2a';
      ctx.fillText('点击继续', bx, by + bh - 12);
      ctx.restore();
      // 赠送铲子高亮
      if (this.davePhase === 'gift') {
        const shovel = Assets.image('shovel_hi_res') || Assets.image('shovel.png');
        if (shovel) {
          const bob = Math.sin(this.daveT * 4) * 6;
          ctx.save();
          ctx.translate(560, 300 + bob);
          ctx.rotate(-0.5 + Math.sin(this.daveT * 2) * 0.1);
          ctx.shadowColor = 'rgba(255,240,140,0.9)'; ctx.shadowBlur = 24;
          ctx.drawImage(shovel, -28, -40, 56, 80);
          ctx.restore();
        }
      }
    }
  },

  wrapText(ctx, text, cx, y, maxW, lineH) {
    const chars = Array.from(text);
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) lines.push(cur);
    lines.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lineH));
  },

  // ---- 绘制 (叠加在 board 渲染之上) ----
  draw(ctx, board) {
    const t = this.t * 1000;
    // 1. 房子文案 (原版 MESSAGE_STYLE_HOUSE_NAME: 镜头房子期间)
    if (t < 3600 && this.houseMsg && !this.davePhase) {
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
    // 1.5 戴夫过场 (1-5 赠铲子)
    this.drawDave(ctx);
    // 2. READY-SET-PLANT (reanim, 居中; 推进已在 update 中按 dt 进行)
    if (this.rspAnim) this.rspAnim.draw(ctx);
  },
};

// 避免循环引用: 僵尸表延迟获取
let ZOMBIES_DEF = {};
function setZombieDefs(z) { ZOMBIES_DEF = z; }
function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

// ============================================================
// 场内横幅系统 (一大波僵尸/最后一波 — 原版 FinalWave.reanim 动画 / APPROACHING 静图)
// 原版锚点: FinalWave reanim AddReanimation(0,30); 静止位图像中心 ≈(390,330)
//   (矩阵合成 Overlay∘T∘T(+w/2) → 图像中心 = overlay + tx + sx*w/2)
//   一大波文字 MESSAGE_STYLE_HUGE_WAVE: aPosX=400, aPosY=330 → 静图中心 (400,330)
// ============================================================
const Banners = {
  list: [],
  show(imgName, dur = 3.4, sound = null, audio = null) {
    this.list.push({ img: imgName, t: 0, dur, sound, soundDelay: 0.25, soundPlayed: false, audio });
    // 原版: 文字出现 25tick 后播 hugewave 音效 — 由 update() 按 soundDelay 触发
  },
  // 原版: 最后一波用 REANIM_FINALWAVE reanim (23帧@12fps, 含自带淡出); reanim 挂在 (0,30)
  showFinalWave(dur = 2.1, audio = null) {
    if (RE.hasDef('FinalWave')) {
      const r = Assets.reanim('FinalWave');
      r.x = 0; r.y = 30;              // 原版 AddReanimation(0, 30) — 勿改, 换算后静止中心 (390.6, 330.1)
      r.frameStart = 0; r.frameCount = r.def ? r.def.n : 23;
      r.animRate = 12;
      r.loopType = RE.PLAY_ONCE;      // 原版动画自带淡出, 单次播放
      this.list.push({ reanim: r, t: 0, dur, sound: 'finalwave', soundDelay: 0.6, soundPlayed: false, audio });
    } else {
      this.show('finalwave.png', dur, 'finalwave', audio);
      return;
    }
  },
  update(dt) {
    for (const b of this.list) {
      b.t += dt;
      // 原版: 横幅出现 60tick(0.6s) 后才播放 finalwave 音效 (一大波为 25tick)
      if (!b.soundPlayed && b.t >= (b.soundDelay || 0)) {
        b.soundPlayed = true;
        if (b.sound && b.audio) b.audio.play(b.sound);
      }
      if (b.reanim) b.reanim.update(dt);
    }
    this.list = this.list.filter(b => b.t < b.dur && !(b.reanim && b.reanim.dead && b.t > 0.1));
  },
  draw(ctx) {
    for (const b of this.list) {
      // reanim 横幅 (原版 FinalWave, 自带缩放飞入+淡出)
      if (b.reanim) {
        ctx.save();
        b.reanim.draw(ctx);
        ctx.restore();
        continue;
      }
      const im = img(b.img);
      if (!im) continue;
      const p = b.t / b.dur;
      // 原版: 弹入 → 停留 → 淡出 (淡出固定 ~0.5s)
      let sc = 1, alpha = 1;
      if (p < 0.12) { const q = p / 0.12; sc = 0.5 + 0.5 * easeIO(q); alpha = q; }
      else if (b.dur - b.t < 0.5) { alpha = Math.max(0, (b.dur - b.t) / 0.5); }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(400, 330);        // 原版 MESSAGE_STYLE_HUGE_WAVE: (BOARD_WIDTH/2, 330)
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
