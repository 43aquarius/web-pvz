// challenge.js — 挑战模式系统 (原版 Challenge.cpp 1:1移植)
// 传送带 / 罐子解谜(Vasebreaker) / 我是僵尸(I,Zombie) / 打僵尸 / 保龄球 /
// 生存模式 / 天降种子 / 坚不可摧 / 传送门 / 宝石僵尸 / 杂项变体
// 参照: PvZ-Portable src/Lawn/Challenge.cpp (5336行) + GridItem.cpp + SeedPacket.cpp
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, MODE_LEVELS, MUSHROOMS, AQUATIC, GROUNDCOVER, availablePlants } = require('./data');
const RE = require('./reanim');

// ============================================================
// 数据表 (原版数值)
// ============================================================

// ---- 传送带权重表 (Challenge.cpp 1408-1612) ----
// [植物类型, 权重]
const CONVEYOR_POOLS = {
  // 冒险 1-10 (白天)
  adv_10: [['PEASHOOTER', 20], ['CHERRYBOMB', 20], ['WALLNUT', 15], ['REPEATER', 20], ['SNOWPEA', 10], ['CHOMPER', 5], ['POTATOMINE', 10]],
  // 冒险 2-10 (黑夜)
  adv_20: [['GRAVEBUSTER', 20], ['ICESHROOM', 15], ['DOOMSHROOM', 15], ['HYPNOSHROOM', 10], ['SCAREDYSHROOM', 15], ['FUMESHROOM', 15], ['PUFFSHROOM', 10]],
  // 冒险 3-10 (泳池)
  adv_30: [['LILYPAD', 25], ['SQUASH', 5], ['THREEPEATER', 25], ['TANGLEKELP', 5], ['JALAPENO', 10], ['SPIKEWEED', 10], ['TORCHWOOD', 10], ['TALLNUT', 10]],
  // 冒险 4-10 (浓雾)
  adv_40: [['LILYPAD', 25], ['SEASHROOM', 10], ['MAGNETSHROOM', 5], ['BLOVER', 5], ['CACTUS', 15], ['STARFRUIT', 25], ['SPLITPEA', 5], ['PUMPKIN', 10]],
  // 冒险 5-10 终boss
  boss: [['FLOWERPOT', 55], ['MELONPULT', 10], ['JALAPENO', 12], ['CABBAGEPULT', 10], ['CORNPULT', 5], ['ICESHROOM', 8]],
  // 坚果保龄球1: 坚果85 / 爆炸坚果15
  bowling: [['WALLNUT', 85], ['EXPLODEONUT', 15]],
  // 坚果保龄球2: + 巨型坚果15
  bowling2: [['WALLNUT', 85], ['EXPLODEONUT', 15], ['GIANTWALLNUT', 15]],
  // 小麻烦 (3-5)
  little_trouble: [['LILYPAD', 25], ['WALLNUT', 15], ['PEASHOOTER', 25], ['CHERRYBOMB', 35]],
  // 暴风雨夜 (4-10)
  stormy: [['LILYPAD', 30], ['CACTUS', 10], ['PEASHOOTER', 20], ['PUFFSHROOM', 15], ['CHERRYBOMB', 25]],
  // 蹦极闪电战 (5-5)
  bungee: [['FLOWERPOT', 50], ['CHOMPER', 25], ['PUMPKIN', 15], ['CHERRYBOMB', 10]],
  // 传送门大战
  portal: [['PEASHOOTER', 25], ['REPEATER', 20], ['TORCHWOOD', 10], ['CACTUS', 15], ['WALLNUT', 15], ['CHERRYBOMB', 15]],
  // 列队来袭 (屋顶)
  column: [['FLOWERPOT', 155], ['MELONPULT', 5], ['CHOMPER', 5], ['PUMPKIN', 15], ['JALAPENO', 10], ['SQUASH', 10]],
  // 隐形僵尸
  invisighoul: [['PEASHOOTER', 25], ['WALLNUT', 15], ['CORNPULT', 5], ['SQUASH', 15], ['LILYPAD', 30], ['ICESHROOM', 10]],
  // 铲子挑战 (Can you dig it) — 纯豌豆
  shovel: [['PEASHOOTER', 100]],
};

// ---- 罐子配置表 (Challenge.cpp ScaryPotterPopulate 3534-3755) ----
// pots: [type, 数量, 内容]  type: 'seed'|'zombie'|'sun'  内容: 植物名或僵尸名
// dontPlaceCols: 禁放列
const VASE_LEVELS = {
  1: {
    dontCols: [0, 1, 2, 3],
    seeds: [['PEASHOOTER', 5], ['SNOWPEA', 5], ['SQUASH', 5]],
    zombies: [['NORMAL', 6], ['BUCKET', 3], ['JACKBOX', 1]],
    leafPots: 2,
  },
  2: {
    dontCols: [0, 1, 2, 8],
    seeds: [['SPLITPEA', 7], ['SNOWPEA', 3], ['WALLNUT', 3], ['POTATOMINE', 2]],
    zombies: [['NORMAL', 6], ['BUCKET', 3], ['JACKBOX', 1]],
    leafPots: 2,
  },
  3: {
    dontCols: [0, 1, 2],
    seeds: [['SPLITPEA', 6], ['SNOWPEA', 4], ['SQUASH', 2], ['HYPNOSHROOM', 3], ['WALLNUT', 3]],
    zombies: [['NORMAL', 8], ['BUCKET', 2], ['DANCER', 1], ['JACKBOX', 1]],
    leafPots: 2,
  },
  4: {
    dontCols: [0, 1],
    seeds: [['PUFFSHROOM', 11], ['HYPNOSHROOM', 4], ['SPLITPEA', 4]],
    zombies: [['JACKBOX', 8], ['NORMAL', 7], ['FOOTBALL', 1]],
    leafPots: 2,
  },
  5: {
    dontCols: [0, 1],
    seeds: [['SPLITPEA', 6], ['PUMPKIN', 3], ['SQUASH', 4], ['HYPNOSHROOM', 2], ['SNOWPEA', 2], ['MAGNETSHROOM', 3]],
    zombies: [['NORMAL', 6], ['BUCKET', 5], ['JACKBOX', 1], ['FOOTBALL', 3]],
    leafPots: 2,
  },
  6: {
    dontCols: [0, 1],
    seeds: [['SPLITPEA', 7], ['SQUASH', 2], ['TALLNUT', 5], ['THREEPEATER', 2], ['TORCHWOOD', 4]],
    zombies: [['NORMAL', 7], ['POLEVAULTER', 5], ['FOOTBALL', 2], ['JACKBOX', 1]],
    leafPots: 2,
  },
  7: {
    dontCols: [0, 1, 2],
    seeds: [['SPIKEWEED', 13], ['WALLNUT', 3], ['SQUASH', 3]],
    zombies: [['NORMAL', 10], ['BUCKET', 1]],
    leafPots: 2,
  },
  8: {
    dontCols: [0, 1],
    seeds: [['PUFFSHROOM', 7], ['WALLNUT', 3], ['SQUASH', 5], ['SPLITPEA', 4]],
    zombies: [['JACKBOX', 8], ['NORMAL', 4], ['POGO', 4]],
    leafPots: 2,
  },
  9: {
    dontCols: [0, 1],
    seeds: [['SPLITPEA', 6], ['SNOWPEA', 2], ['PEASHOOTER', 2], ['THREEPEATER', 2], ['SQUASH', 5], ['POTATOMINE', 1], ['WALLNUT', 1], ['PLANTERN', 1]],
    zombies: [['NORMAL', 8], ['BUCKET', 5], ['JACKBOX', 1], ['GARGANTUAR', 1]],
    leafPots: 2,
  },
  10: { // ENDLESS
    dontCols: [0, 1],
    seeds: [['SPLITPEA', 6], ['SNOWPEA', 2], ['PEASHOOTER', 2], ['THREEPEATER', 2], ['SQUASH', 5], ['POTATOMINE', 1], ['WALLNUT', 1], ['PLANTERN', 1]],
    zombies: [['NORMAL', 'g8'], ['BUCKET', 5], ['JACKBOX', 1], ['GARGANTUAR', 'g1']],  // g: 随stage成长
    sunPots: 1,
    leafPots: 2,
  },
};

// ---- 我是僵尸关卡配置 (Challenge.cpp IZombieInitLevel 4190-4399) ----
// plants: [类型, 数量, 行(-1=全行随机)]
const IZ_LEVELS = {
  1: {
    limit: 4, cards: ['NORMAL', 'BUCKET', 'FOOTBALL'],
    plants: [['SUNFLOWER', 3, 2], ['SUNFLOWER', 3, 3], ['SUNFLOWER', 7, -1], ['SQUASH', 3, -1], ['PEASHOOTER', 6, -1], ['SNOWPEA', 2, -1]],
  },
  2: {
    limit: 4, cards: ['NORMAL', 'SCREEN_DOOR', 'BUCKET'],
    plants: [['SPIKEWEED', 3, 0], ['SUNFLOWER', 2, 0], ['SUNFLOWER', 3, 3], ['SPIKEWEED', 1, 0], ['PEASHOOTER', 1, 0], ['SNOWPEA', 2, 3], ['SUNFLOWER', 1, 3], ['SUNFLOWER', 4, -1], ['SPIKEWEED', 2, -1], ['SNOWPEA', 2, -1], ['PEASHOOTER', 4, -1]],
  },
  3: {
    limit: 4, cards: ['NORMAL', 'BUCKET', 'DIGGER'],
    plants: [['POTATOMINE', 3, 0], ['SUNFLOWER', 2, 0], ['POTATOMINE', 2, 2], ['SUNFLOWER', 2, 4], ['TORCHWOOD', 3, 3], ['TORCHWOOD', 2, -1], ['SUNFLOWER', 5, -1], ['PEASHOOTER', 7, -1], ['SPLITPEA', 1, -1]],
  },
  4: {
    limit: 4, cards: ['NORMAL', 'BUCKET', 'LADDER'],
    plants: [['WALLNUT', 3, 0], ['WALLNUT', 3, 1], ['WALLNUT', 3, 2], ['WALLNUT', 3, 3], ['WALLNUT', 3, 4], ['SUNFLOWER', 2, 0], ['SUNFLOWER', 2, 2], ['SUNFLOWER', 2, 4], ['PEASHOOTER', 1, 0], ['SNOWPEA', 1, 1], ['FUMESHROOM', 2, 2], ['SNOWPEA', 1, 3], ['PEASHOOTER', 1, 4], ['PEASHOOTER', 2, -1], ['SUNFLOWER', 4, -1]],
  },
  5: {
    limit: 4, cards: ['NORMAL', 'BUCKET', 'BUNGI', 'BALLOON'],
    plants: [['SUNFLOWER', 3, 2], ['SUNFLOWER', 3, 3], ['CACTUS', 1, 1], ['CACTUS', 1, 4], ['MAGNETSHROOM', 1, -1], ['SUNFLOWER', 5, -1], ['PEASHOOTER', 8, -1], ['SNOWPEA', 2, -1]],
  },
  6: {
    limit: 5, cards: ['NORMAL', 'POLEVAULTER', 'BUCKET', 'GARGANTUAR'],
    plants: [['GARLIC', 4, 1], ['GARLIC', 4, 3], ['SUNFLOWER', 3, 1], ['SUNFLOWER', 3, 3], ['TORCHWOOD', 2, -1], ['SUNFLOWER', 2, -1], ['SPIKEWEED', 3, -1], ['SNOWPEA', 1, -1], ['PEASHOOTER', 5, -1], ['SQUASH', 2, -1], ['CORNPULT', 2, -1]],
  },
  7: {
    limit: 5, cards: ['NORMAL', 'POLEVAULTER', 'BUCKET', 'DANCER'],
    plants: [['SUNFLOWER', 4, 2], ['SUNFLOWER', 4, 4], ['SUNFLOWER', 6, -1], ['POTATOMINE', 9, -1], ['CHOMPER', 8, -1]],
  },
  8: {
    limit: 5, cards: ['IMP', 'CONE', 'BUCKET', 'BUNGI', 'DIGGER', 'LADDER'],
    plants: [['WALLNUT', 3, -1], ['MAGNETSHROOM', 2, -1], ['PEASHOOTER', 8, -1], ['SQUASH', 2, -1], ['POTATOMINE', 2, -1], ['SUNFLOWER', 8, -1]],
  },
  9: {
    limit: 6, cards: ['IMP', 'CONE', 'POLEVAULTER', 'BUCKET', 'BUNGI', 'DIGGER', 'LADDER', 'FOOTBALL'],
    plants: [['TALLNUT', 5, 1], ['TORCHWOOD', 5, 3], ['POTATOMINE', 4, 0], ['SUNFLOWER', 2, 0], ['SUNFLOWER', 2, 1], ['THREEPEATER', 1, 1], ['SNOWPEA', 1, 1], ['SPLITPEA', 1, 1], ['CHOMPER', 3, 2], ['SUNFLOWER', 2, 2], ['SQUASH', 1, 2], ['PEASHOOTER', 3, 3], ['SUNFLOWER', 2, 3], ['SUNFLOWER', 1, 4], ['FUMESHROOM', 1, 4], ['SCAREDYSHROOM', 1, 4], ['STARFRUIT', 1, 4], ['SPLITPEA', 1, 4], ['MAGNETSHROOM', 1, 4]],
  },
  10: { // ENDLESS (随机生成)
    limit: 5, cards: ['IMP', 'CONE', 'POLEVAULTER', 'BUCKET', 'BUNGI', 'DIGGER', 'LADDER', 'FOOTBALL', 'DANCER'],
    endless: true,
  },
};

// 我是僵尸价格 (Plant::GetCost 特例, Plant.cpp 5006-5020)
const IZ_COST = {
  NORMAL: 50, CONE: 75, POLEVAULTER: 75, BUCKET: 125, LADDER: 150,
  DIGGER: 125, BUNGI: 125, FOOTBALL: 175, BALLOON: 150, SCREEN_DOOR: 100,
  ZAMBONI: 175, POGO: 200, DANCER: 350, GARGANTUAR: 300, IMP: 50,
};

// 我是僵尸卡名
const IZ_NAMES = {
  NORMAL: '普通僵尸', CONE: '路障僵尸', POLEVAULTER: '撑杆僵尸', BUCKET: '铁桶僵尸',
  LADDER: '梯子僵尸', DIGGER: '矿工僵尸', BUNGI: '蹦极僵尸', FOOTBALL: '橄榄球僵尸',
  BALLOON: '气球僵尸', SCREEN_DOOR: '铁门僵尸', ZAMBONI: '冰车僵尸', POGO: '跳跳僵尸',
  DANCER: '舞王僵尸', GARGANTUAR: '巨人僵尸', IMP: '小鬼僵尸',
};

const CH = (function () {
  const Assets = { image: null, reanim: null };  // 注入
  // ---- 工具 ----
  const rnd = (n) => Math.floor(Math.random() * n);
  const rndRange = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const curve = (s, e, v, a, b) => { const t = clamp((v - s) / (e - s), 0, 1); return a + (b - a) * t; };
  const TICK = 0.01; // 100Hz

  // ============================================================
  // Challenge 类 — 挂在 board.challenge
  // ============================================================
  class Challenge {
    constructor(board) {
      this.board = board;
      this.level = board.level;
      this.game = board.game;
      const f = this.level.fixed || '';
      // 模式识别
      if (f === 'conveyor' || f === 'bowling' || f === 'boss') this.mode = 'conveyor';
      else if (f === 'vasebreaker') this.mode = 'vasebreaker';
      else if (f === 'izombie') this.mode = 'izombie';
      else if (f === 'whack') this.mode = 'whack';
      else if (f === 'laststand') this.mode = 'laststand';
      else if (f === 'beghouled') this.mode = 'beghouled';
      else if (f === 'beghouled_twist') this.mode = 'beghouled';
      else if (f === 'slotmachine') this.mode = 'slotmachine';
      else if (f === 'zombiquarium') this.mode = 'zombiquarium';
      else if (this.level.rainingSeeds) this.mode = 'raining';
      else if (this.level.survival) this.mode = 'survival';
      else this.mode = null;

      // 通用状态
      this.state = 'normal';       // ChallengeState
      this.stateCounter = 0;
      this.survivalStage = 0;      // 段数
      this.puzzleStreak = 0;
      this.challengeScore = 0;
      this.beltCounter = 0;        // 传送带补卡计时 (tick)
      this.beltScroll = 0;         // 传送带滚动动画 (tick)
      this.lastBeltSeed = null;
      this.time = 0;

      // 分发初始化
      this.init();
    }

    init() {
      const b = this.board, lv = this.level;
      switch (this.mode) {
        case 'conveyor': this.initConveyor(); break;
        case 'vasebreaker': this.initVasebreaker(); break;
        case 'izombie': this.initIZombie(); break;
        case 'whack': this.initWhack(); break;
        case 'survival': this.initSurvival(); break;
        case 'raining': this.initRaining(); break;
        case 'laststand': this.initLastStand(); break;
        case 'beghouled': this.initBeghouled(); break;
        case 'slotmachine': this.initSlotMachine(); break;
      }
    }

    // ============================================================
    // 传送带 (SeedBank::AddSeed/UpdateConveyorBelt + Challenge::UpdateConveyorBelt)
    // ============================================================
    initConveyor() {
      const b = this.board, lv = this.level;
      b.seedCards = [];           // 传送带卡 (无冷却无花费)
      this.beltItems = [];        // [{type, offsetX}] offsetX: 515起, 每4tick-1, 到0停止
      this.beltMul = lv.conveyorMul || 1.0;
      this.beltScroll = 0;
      this.beltCounter = 0;
      // 权重池
      const key = this.conveyorPoolKey();
      this.beltPool = (CONVEYOR_POOLS[key] || CONVEYOR_POOLS.adv_10).map(x => [...x]);
      // 初始播种 (原版 InitLevel 直接 AddSeed)
      if (lv.fixed === 'bowling') {
        this.addSeed('WALLNUT');
        this.beltCounter = 400;
      } else if (key === 'column') {
        // 开局6张固定卡 (原版 144-153)
        const init = ['FLOWERPOT', 'MELONPULT', 'FLOWERPOT', 'CHOMPER', 'FLOWERPOT', 'JALAPENO'];
        for (const s of init) this.addSeed(s);
        this.beltCounter = 1000;
      } else if (key === 'invisighoul') {
        this.addSeed('PEASHOOTER'); this.addSeed('PEASHOOTER');
        this.beltCounter = 1000;
      } else {
        this.addSeed(this.pickBeltSeed());
        this.beltCounter = 400;
      }
    }

    conveyorPoolKey() {
      const lv = this.level, b = this.board;
      if (lv.fixed === 'bowling') return lv.bowling2 ? 'bowling2' : 'bowling';
      if (lv.boss) return 'boss';
      if (lv.id <= 50) return 'adv_' + (lv.id - (lv.id % 10 || 10) + 10 <= 50 ? Math.floor((lv.id - 1) / 10) * 10 + 10 : lv.id);
      // 模式关卡
      if (lv.zombiePool && lv.zombiePool.includes('SNORKLE') && lv.scene === 'pool' && lv.waves === 30) return 'little_trouble';
      if (lv.portals) return 'portal';
      if (lv.conveyorMul === 3.0) return 'column';
      if (lv.invisibleZ) return 'invisighoul';
      if (lv.id === 110) return 'little_trouble';
      if (lv.id === 111) return 'portal';
      if (lv.id === 112) return 'column';
      if (lv.id === 106) return 'invisighoul';
      return 'adv_10';
    }

    // AddSeed (SeedPacket.cpp 1018-1048)
    addSeed(type) {
      const n = this.beltItems.length;
      if (n >= 10) return;  // 带满丢弃
      let off = 515 - 51 * n;
      if (n > 0) off = Math.max(off, this.beltItems[n - 1].offsetX + 40);
      this.beltItems.push({ type, offsetX: off });
    }

    // RemoveSeed — 后卡链式前移补位 (原版 SeedPacket.cpp 1050-1080:
    // card[i].offsetX = card[i-1].offsetX + 51, 即间隙闭合, 不回弹右侧)
    removeSeed(index) {
      const arr = this.beltItems;
      if (index < 0 || index >= arr.length) return;
      arr.splice(index, 1);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1].offsetX;
        if (arr[i].offsetX > prev + 51) arr[i].offsetX = prev + 51;
      }
    }

    // 传送带补卡 (Challenge.cpp 1378-1679)
    updateConveyor(dt) {
      const ticks = Math.round(dt / TICK);
      // 滚动动画 (每4tick进1格, 6帧循环)
      this.beltScroll += ticks;
      // 所有卡每4tick左移1px (SeedPacket.cpp 1147-1163)
      for (const it of this.beltItems) {
        it.offsetX = Math.max(it.offsetX - ticks / 4, 0);
      }
      // 补卡计时
      this.beltCounter -= ticks;
      if (this.beltCounter <= 0) {
        const n = this.beltItems.length;
        const base = n > 8 ? 1000 : n > 6 ? 500 : n > 4 ? 425 : 400;
        this.beltCounter = Math.round(base * this.beltMul);
        if (n < 10) {
          const type = this.pickBeltSeed();
          this.addSeed(type);
        }
      }
    }

    // 权重抽取 + 通用调节 (1614-1674)
    pickBeltSeed() {
      const b = this.board;
      const pool = this.beltPool;
      if (!pool.length) return 'PEASHOOTER';
      // 复制权重并调节
      const w = pool.map(([t, base]) => {
        let weight = base;
        const total = b.plants.length;
        if (t === 'GRAVEBUSTER') {
          const graves = (b.gridItems || []).filter(g => g.type === 'grave' && !g.dead).length;
          if (graves <= 0) weight = 0;
        } else if (t === 'LILYPAD') {
          weight = curve(0, 18, total, weight, 1);
        } else if (t === 'FLOWERPOT') {
          const cap = this.conveyorPoolKey() === 'column' ? 45 : 35;
          weight = curve(0, cap, total, weight, 1);
        }
        // 同类压制 (候选>2种时)
        if (pool.length > 2) {
          const same = this.beltItems.filter(it => it.type === t).length;
          if (same >= 4) weight = 1;
          else if (same >= 3) weight = 5;
          else if (t === this.lastBeltSeed) weight = Math.max(1, weight / 2);
        }
        return [t, weight];
      });
      // 加权抽取
      let total = 0;
      for (const [, x] of w) total += x;
      if (total <= 0) return pool[0][0];
      let r = Math.random() * total;
      let picked = w[0][0];
      for (const [t, x] of w) { r -= x; if (r <= 0) { picked = t; break; } }
      this.lastBeltSeed = picked;
      return picked;
    }

    // ============================================================
    // 罐子解谜 (Vasebreaker)
    // ============================================================
    initVasebreaker() {
      const b = this.board, lv = this.level;
      b.sun = 0;
      b.seedCards = [];
      b.gridItems = b.gridItems || [];
      this.stage = 0;      // endless 段数
      this.scaryPotterPopulate();
    }

    scaryPotterPopulate() {
      const b = this.board;
      const cfg = VASE_LEVELS[this.level.vaseLevel || 1];
      if (!cfg) return;
      // 候选格 50格 (0..9 × 0..4), 排除禁放列
      const cells = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 10; x++) {
          if (cfg.dontCols.includes(x)) continue;
          cells.push([x, y]);
        }
      }
      const takeCell = () => {
        if (!cells.length) return null;
        const i = rnd(cells.length);
        return cells.splice(i, 1)[0];
      };
      const pots = [];
      // 植物罐
      for (const [type, count] of cfg.seeds) {
        for (let i = 0; i < count; i++) {
          const c = takeCell(); if (!c) break;
          pots.push({ col: c[0], row: c[1], potType: 'seed', content: type });
        }
      }
      // 僵尸罐 (endless 成长)
      const st = this.stage || 0;
      for (const [type, count] of cfg.zombies) {
        let n = count;
        if (typeof count === 'string') { // 'g8' = 8 - stage成长
          const base = parseInt(count.slice(1));
          n = type === 'NORMAL' ? Math.max(1, base - clamp(Math.floor(st / 10), 0, 8))
                                : base + (type === 'GARGANTUAR' ? Math.floor(st / 10) : 0);
        }
        for (let i = 0; i < n; i++) {
          const c = takeCell(); if (!c) break;
          pots.push({ col: c[0], row: c[1], potType: 'zombie', content: type });
        }
      }
      // 阳光罐 (仅endless)
      if (cfg.sunPots) {
        for (let i = 0; i < cfg.sunPots; i++) {
          const c = takeCell(); if (!c) break;
          pots.push({ col: c[0], row: c[1], potType: 'sun', sunCount: 1 + rnd(3) });
        }
      }
      // 随机2个植物罐→叶罐 (绿罐)
      const seedPots = pots.filter(p => p.potType === 'seed');
      for (let i = 0; i < (cfg.leafPots || 0) && seedPots.length; i++) {
        const k = rnd(seedPots.length);
        seedPots[k].leaf = true;
        seedPots.splice(k, 1);
      }
      // 生成 GridItem
      for (const p of pots) {
        b.gridItems.push({
          type: 'vase', col: p.col, row: p.row,
          potType: p.potType, content: p.content, sunCount: p.sunCount || 0,
          leaf: !!p.leaf, broken: false,
          transparent: 0,   // 透视计数 0-50
          counter: 0,
        });
      }
    }

    // 锤子砸罐 (ScaryPotterMalletPot 3802-3813)
    malletPot(gx, gy) {
      if (this.state === 'malleting') return false;
      const b = this.board;
      const pot = this.vaseAt(gx, gy);
      if (!pot || pot.broken) return false;
      this.malletGX = gx; this.malletGY = gy;
      // 锤子 reanim 于罐子位置 (原版 REANIM_HAMMER anim_pot_open 速率40)
      const px = b.gridToPixelX(gx), py = b.gridToPixelY(gy);
      this.malletReanim = this.addReanim('Hammer', px + 30, py - 20);
      if (this.malletReanim) {
        this.malletReanim.play('anim_open_pot', RE.PLAY_ONCE_HOLD, 40);
      }
      this.state = 'malleting';
      this.game && this.game.audio && this.game.audio.play('swing');
      return true;
    }

    vaseAt(gx, gy) {
      return (this.board.gridItems || []).find(g =>
        g.type === 'vase' && !g.broken && g.col === gx && g.row === gy);
    }

    // 罐子破裂 (ScaryPotterOpenPot 3873-3924)
    openPot(pot) {
      const b = this.board;
      const px = b.gridToPixelX(pot.col), py = b.gridToPixelY(pot.row);
      pot.broken = true;
      pot.dead = true;
      if (pot.potType === 'seed') {
        // 掉落可用种子包 (捡起后种植)
        b.suns.push(this.makeSunToken({
          kind: 'seedpacket', type: pot.content,
          x: px + 20, y: py, vy: -1.2, land: py + 40, life: 12,
        }));
      } else if (pot.potType === 'zombie') {
        const z = b.spawnZombie(pot.content, pot.row);
        if (z) { z.x = px; z.posX = px; }
      } else if (pot.potType === 'sun') {
        for (let i = 0; i < pot.sunCount; i++) {
          b.suns.push(this.makeSunToken({
            kind: 'sun', value: 25,
            x: px + 15 * i, y: py, vy: 0.6, land: py + 60, life: 9,
          }));
        }
      }
      // 碎片粒子
      this.vaseShatter(pot, px + 20, py);
      b.game && b.game.audio && b.game.audio.play('vase_breaking');
      b.game && b.game.audio && b.game.audio.play('bonk');
    }

    vaseShatter(pot, x, y) {
      const b = this.board;
      const chunk = Assets.image && Assets.image('vase_chunks.png');
      if (!chunk) return;
      // 3×1 cel 的碎片图, 弹出 8 片带重力
      for (let i = 0; i < 8; i++) {
        b.effects.push({
          kind: 'vasechunk', x, y: y + 30,
          vx: rndRange(-1.5, 1.5), vy: rndRange(-3.5, -1.0),
          rot: rndRange(0, 6.28), vr: rndRange(-0.2, 0.2),
          cel: pot.leaf ? 1 : rnd(3), life: 1, t: 0,
          update(dt) {
            this.vy += 0.15 * dt * 60;
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;
            this.rot += this.vr * dt * 60;
            this.t += dt;
            this.life = 1 - this.t / 1.4;
            if (this.life <= 0) this.dead = true;
          },
        });
      }
    }

    updateVasebreaker(dt) {
      const b = this.board;
      const ticks = Math.round(dt / TICK);
      // 锤子动画播完 → 开罐
      if (this.state === 'malleting') {
        const r = this.malletReanim;
        if (!r || r.loopCount > 0 || r.dead) {
          const pot = this.vaseAt(this.malletGX, this.malletGY);
          if (pot) this.openPot(pot);
          if (r) r.dead = true;
          this.malletReanim = null;
          this.state = 'normal';
        }
      }
      // 罐子透视 (Plantern 附近切比雪夫距离≤1 → 透明度升到50)
      for (const g of (b.gridItems || [])) {
        if (g.type !== 'vase' || g.broken) continue;
        let near = false;
        for (const p of b.plants) {
          if (p.dead || p.type !== 'PLANTERN') continue;
          if (Math.max(Math.abs(p.col - g.col), Math.abs(p.row - g.row)) <= 1) { near = true; break; }
        }
        g.transparent = clamp(g.transparent + (near ? 1 : -1) * ticks, 0, 50);
      }
      // 小丑僵尸爆炸 → 开周围罐
      for (const z of b.zombies) {
        if (z.dead || z.type !== 'JACKBOX' || !z._jackExploded) continue;
        if (!z._openedPots) {
          z._openedPots = true;
          this.jackExplodePots(z);
        }
      }
      // 巨人砸罐 (Zombie.cpp 2118-2126)
      for (const z of b.zombies) {
        if (z.dead || (z.type !== 'GARGANTUAR' && z.type !== 'REDEYE_GARGANTUAR')) continue;
        if (z._smashLand && !z._smashPotDone) {
          z._smashPotDone = true;
          const gx = Math.round((z.x - CONST.LAWN_XMIN) / CONST.CELL_W);
          const pot = this.vaseAt(clamp(gx, 0, 9), z.row);
          if (pot) this.openPot(pot);
        }
      }
      // 通关判定 (3765-3778)
      const pots = (b.gridItems || []).filter(g => g.type === 'vase' && !g.broken);
      const zombies = b.zombies.filter(z => !z.dead && z.fromWave !== -2);
      if (!pots.length && !zombies.length && b.state === 'playing' && !this._phaseEnding) {
        this._phaseEnding = true;
        setTimeout(() => { this._phaseEnding = false; }, 100);
        this.puzzlePhaseComplete();
      }
    }

    jackExplodePots(z) {
      const b = this.board;
      const cx = Math.round((z.x + 40 - CONST.LAWN_XMIN) / CONST.CELL_W);
      const cy = z.row;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const pot = this.vaseAt(clamp(cx + dx, 0, 9), clamp(cy + dy, 0, 4));
          if (pot) this.openPot(pot);
        }
      }
    }

    puzzlePhaseComplete() {
      const b = this.board, lv = this.level;
      if (lv.endless) {
        // 无尽: 段+1, 重新布罐 (每10段奖励)
        this.stage++;
        this.nextStageClear();
        if (this.stage % 10 === 0) this.dropStageReward();
        this.scaryPotterPopulate();
      } else {
        b.win();
      }
    }

    nextStageClear() {
      const b = this.board;
      // 清场 (3942-3999)
      for (const z of b.zombies) if (!z.dead) z.dieNoLoot();
      for (const p of b.plants) p.dead = true;
      b.plants = [];
      b.suns = b.suns.filter(s => s.kind === 'sun');
      // 屏幕闪光
      b.effects.push({ kind: 'screenflash', life: 0.4, t: 0, update(dt) { this.t += dt; if (this.t > this.life) this.dead = true; } });
    }

    dropStageReward() {
      const b = this.board;
      // 15%礼盒/30%巧克力/否则钻石袋 → 简化为金币奖励
      const r = rnd(100);
      if (r < 15) this.game && this.game.addCoins && this.game.addCoins(50);
      else if (r < 30) this.game && this.game.addCoins && this.game.addCoins(25);
      else this.game && this.game.addCoins && this.game.addCoins(100);
    }

    // ============================================================
    // 我是僵尸 (I, Zombie)
    // ============================================================
    initIZombie() {
      const b = this.board, lv = this.level;
      b.sun = 150;
      b.gridItems = b.gridItems || [];
      this.challengeScore = 0;   // 已吃脑数
      this.brains = [];
      // 脑子 ×5 (4175-4188)
      for (let row = 0; row < 5; row++) {
        const brain = {
          type: 'brain', row, col: 0,
          x: b.gridToPixelX(0) - 40, y: b.gridToPixelY(row) + 40,
          counter: 70,          // 70口吃完
          squished: false, dead: false,
        };
        this.brains.push(brain);
        b.gridItems.push(brain);
      }
      // 预植植物
      this.izPlacePlants();
      // 僵尸卡槽
      const cfg = IZ_LEVELS[lv.izLevel || 1];
      b.zombieCards = cfg.cards.map(t => ({ type: t, cost: IZ_COST[t] || 50 }));
      b.seedCards = b.zombieCards.map(c => ({ type: c.type, cd: 0, iz: true }));
      this.izLimit = cfg.limit;
      this.selectedZombieCard = -1;
    }

    izPlacePlants() {
      const b = this.board, lv = this.level;
      const cfg = IZ_LEVELS[lv.izLevel || 1];
      const Plant = b._plantClass();
      const place = (type, col, row) => {
        const p = new Plant(type, row, col, b);
        p.izStatic = true;      // 植物静止 (原版 mAnimRate=0)
        b.plants.push(p);
        b.grid[row][col] = p;
      };
      if (cfg.endless) {
        // ENDLESS 随机阵 (4300-4399)
        const st = this.stage || 0;
        const puff = rnd(clamp(3 + Math.floor(st / 2), 2, 6) - clamp(2 + Math.floor(st / 3), 2, 4) + 1) + clamp(2 + Math.floor(st / 3), 2, 4);
        const nPuff = clamp(puff, 0, 6);
        const nSun = Math.max(0, 8 - nPuff);
        const formations = [
          [['SNOWPEA', 9], ['SPLITPEA', 4], ['REPEATER', 4]],
          [['POTATOMINE', 9], ['CHOMPER', 8]],
          [['SPIKEWEED', 9], ['STARFRUIT', 8]],
          [['FUMESHROOM', 9], ['MAGNETSHROOM', 8]],
          [['SCAREDYSHROOM', 12], ['SUNFLOWER', 5]],
        ];
        const f = formations[rnd(formations.length)];
        let count = 0;
        for (const [type, n] of f) {
          for (let i = 0; i < n && count < 20; i++) {
            const col = rnd(this.izLimit || 4), row = rnd(5);
            if (b.grid[row][col]) continue;
            place(type, col, row); count++;
          }
        }
        for (let i = 0; i < nSun && count < 25; i++) {
          const col = rnd(this.izLimit || 4), row = rnd(5);
          if (b.grid[row][col]) continue;
          place('SUNFLOWER', col, row); count++;
        }
        return;
      }
      for (const [type, count, rowSpec] of cfg.plants) {
        for (let i = 0; i < count; i++) {
          const row = rowSpec === -1 ? rnd(5) : rowSpec;
          // 坚果/火炬限制在允许区最右3列
          let col = rnd(this.izLimit || 4);
          if ((type === 'WALLNUT' || type === 'TORCHWOOD') && col < (this.izLimit || 4) - 3) {
            col = (this.izLimit || 4) - 3 + rnd(3);
          }
          if (b.grid[row][col]) {
            // 找空位
            let placed = false;
            for (let c = 0; c < (this.izLimit || 4); c++) {
              if (!b.grid[row][c]) { place(type, c, row); placed = true; break; }
            }
            if (!placed) continue;
          } else {
            place(type, col, row);
          }
        }
      }
    }

    // 放僵尸 (IZombieMouseDownWithZombie 4043-4085)
    canPlaceZombieAt(gx, gy) {
      if (gy < 0 || gy >= 5) return 'not_here';
      const b = this.board;
      const type = this.placingZombieType();
      if (!type) return 'not_here';
      if (type === 'BUNGI') {
        return gx < this.izLimit ? 'ok' : 'not_here';   // 蹦极放红线左侧(植物区)
      }
      return gx >= this.izLimit ? 'ok' : 'not_here';    // 其他放红线右侧
    }

    placingZombieType() {
      const b = this.board;
      const i = this.selectedZombieCard >= 0 ? this.selectedZombieCard
        : (this.game && this.game.selectedCard);
      if (i == null || i < 0) return null;
      const c = b.zombieCards && b.zombieCards[i];
      return c ? c.type : null;
    }

    placeZombie(gx, gy) {
      const b = this.board;
      const type = this.placingZombieType();
      const i = this.selectedZombieCard >= 0 ? this.selectedZombieCard : (this.game && this.game.selectedCard);
      if (!type || i == null || i < 0) return false;
      const card = b.zombieCards[i];
      if (b.sun < card.cost) { this.game && this.game.audio && this.game.audio.play('buzzer'); return false; }
      const chk = this.canPlaceZombieAt(gx, gy);
      if (chk !== 'ok') { this.game && this.game.audio && this.game.audio.play('buzzer'); return false; }
      b.sun -= card.cost;
      const z = b.spawnZombie(type, gy);
      if (z) {
        z.x = b.gridToPixelX(gx) - 30;
        z.posX = z.x;
        if (type === 'BUNGI') { z.targetCol = gx; }
      }
      this.game && this.game.audio && this.game.audio.play('plant');
      // 取卡后清选择
      if (this.game) this.game.selectedCard = -1;
      this.selectedZombieCard = -1;
      return true;
    }

    // 僵尸吃脑 (IZombieEatBrain 4586-4601) — ticks=每次调用应扣的tick数
    zombieEatBrain(z, ticks = 4) {
      const b = this.board;
      if (z.type === 'BUNGI' || z.phase === 'DIGGER_WALKING') return false;
      const brain = this.brains.find(br => !br.dead && !br.squished && br.row === z.row);
      if (!brain) return false;
      // 接近判定 (原版 zombieRect.mX > 20 → 不够近)
      const zr = z.getZombieRect ? z.getZombieRect() : { x: z.x };
      if (zr.x > brain.x + 20) return false;
      z.startEating && z.startEating();
      brain.counter -= ticks;
      if (brain.counter <= 0) {
        brain.dead = true;
        this.game && this.game.audio && this.game.audio.play('gulp');
        this.scoreBrain(brain);
      }
      return true;
    }

    scoreBrain(brain) {
      const b = this.board;
      this.challengeScore++;
      this.game && this.game.audio && this.game.audio.play('gulp');
      if (this.challengeScore >= 5) {
        if (this.level.endless) {
          this.stage++;
          this.challengeScore = 0;
          this.nextStageClear();
          // 重置脑子+植物
          this.brains = [];
          for (const g of b.gridItems) if (g.type === 'brain') g.dead = true;
          for (let row = 0; row < 5; row++) {
            const brain2 = {
              type: 'brain', row, col: 0,
              x: b.gridToPixelX(0) - 40, y: b.gridToPixelY(row) + 40,
              counter: 70, squished: false, dead: false,
            };
            this.brains.push(brain2);
            b.gridItems.push(brain2);
          }
          this.izPlacePlants();
          if (this.stage % 3 === 0) this.dropStageReward();
        } else {
          b.win();
        }
      }
    }

    // 巨人碾压脑 (4615-4622)
    squishBrain(row) {
      const brain = this.brains.find(br => !br.dead && br.row === row);
      if (!brain || brain.squished) return;
      brain.squished = true;
      brain.counter = 500;
      brain.dead = true;
      this.game && this.game.audio && this.game.audio.play('squish');
      this.scoreBrain(brain);
    }

    // 向日葵被吃掉阳光 (IZombiePlantDropRemainingSun 4603-4613)
    plantDropSun(p) {
      const b = this.board;
      if (p.type !== 'SUNFLOWER' && p.type !== 'TWINSUNFLOWER' && p.type !== 'SUNSHROOM' && p.type !== 'MARIGOLD') return;
      const hp = Math.max(1, Math.round((p.health || 300) / 40) + 1);
      for (let i = 0; i < hp; i++) {
        b.suns.push(this.makeSunToken({
          kind: 'sun', value: 25,
          x: p.x + 5 * i, y: p.y, vy: 0.6, land: p.y + 60, life: 9,
        }));
      }
    }

    updateIZombie(dt) {
      const b = this.board;
      const ticks = Math.round(dt / TICK);
      // 失败判定 (4408-4469): 无僵尸 + 阳光<50 + 无可捡阳光 → 输
      const activeZombies = b.zombies.filter(z => !z.dead && z.fromWave !== -2);
      const collectableSun = b.suns.filter(s => !s.dead && s.kind === 'sun' && !s.collecting);
      const sunBeingCollected = b.suns.filter(s => s.collecting && s.kind === 'sun')
        .reduce((a, s) => a + (s.value || 0), 0);
      if (!activeZombies.length && b.state === 'playing' && this._izStarted) {
        if (b.sun + sunBeingCollected < 50 && !collectableSun.length) {
          // 场上无生产能力植物(向日葵还活着不算输? 原版: 无活跃植物即输)
          const sunflowers = b.plants.filter(p => !p.dead &&
            (p.type === 'SUNFLOWER' || p.type === 'SUNSHROOM' || p.type === 'TWINSUNFLOWER'));
          // 被吃光后场上残留的向日葵还会被吃出阳光; 若已无向日葵则真正无解
          if (!sunflowers.length || (b.plants.length === 0)) {
            b.lose();
          }
        }
      }
      if (activeZombies.length) this._izStarted = true;
      // 脑子被压扁计时
      for (const br of this.brains) {
        if (br.squished && !br.dead) {
          br.counter -= ticks;
          if (br.counter <= 0) br.dead = true;
        }
      }
    }

    // ============================================================
    // 打僵尸 (Whack-a-Zombie)
    // ============================================================
    initWhack() {
      const b = this.board, lv = this.level;
      b.sun = 0;
      b.seedCards = [];
      this.whackScore = 0;
      this.stateCounter = 0;
      this.spawnCounter = 0.5;
      // 初始9座墓 (原版 WhackAZombiePlaceGraves(9))
      this.whackPlaceGraves(9);
      // 波次计时
      b.waveTimer = 2.0;
      this.waveInterval = 20.0;
    }

    whackPlaceGraves(n) {
      const b = this.board;
      let placed = 0;
      let guard = 0;
      while (placed < n && guard++ < 200) {
        const col = 3 + rnd(7), row = rnd(5);
        if (b.graves.find(g => g.col === col && g.row === row)) continue;
        if (b.plants.find(p => !p.dead && p.col === col && p.row === row)) continue;
        b.graves.push({ row, col, hp: CONST.GRAVE_HP, type: rnd(4), look: rnd(20), rise: 0 });
        placed++;
      }
    }

    // 锤击 (MouseDownWhackAZombie 945-991)
    whackAt(x, y) {
      const b = this.board;
      // 圆心(x, y-20) 半径45 与僵尸矩形求交, 取渲染层最高的
      const cx = x, cy = y - 20, R = 45;
      let best = null, bestOrder = -1;
      for (const z of b.zombies) {
        if (z.dead) continue;
        const zr = z.rect ? z.rect() : { x: z.x, y: z.y, w: 80, h: 100 };
        // 圆矩形相交
        const nx = clamp(cx, zr.x, zr.x + zr.w), ny = clamp(cy, zr.y, zr.y + zr.h);
        const d2 = (nx - cx) ** 2 + (ny - cy) ** 2;
        if (d2 <= R * R && (z.renderOrder || 0) > bestOrder) { best = z; bestOrder = z.renderOrder || 0; }
      }
      if (best) {
        if (best.helmKind && best.helmHealth > 0) {
          // 有头盔: 锤头盔
          best.helmHealth -= 900;
          this.game && this.game.audio && this.game.audio.play(best.helmKind === 'BUCKET' ? 'shieldhit' : 'snowpea_splat');
          if (best.helmHealth <= 0) { best.helmKind = null; best.dropHelm && best.dropHelm(); }
        } else {
          this.game && this.game.audio && this.game.audio.play('bonk');
          b.addPow && b.addPow(x - 3, y + 9);
          best.dieWithLoot ? best.dieWithLoot() : best.dieNoLoot();
          this.whackScore++;
        }
        return true;
      }
      return false;
    }

    updateWhack(dt) {
      const b = this.board;
      // 冒头刷怪 (WhackAZombieSpawning 2534-2649)
      const wave = b.wave || 0;
      if (wave <= 0) return;
      this.spawnCounter -= dt;
      if (this.spawnCounter <= 0) {
        const phase = clamp(Math.floor((wave - 1) * 6 / 12), 0, 5);
        const dbl = [0, 30, 10, 10, 15, 18][phase];
        const tpl = [0, 0, 0, 0, 10, 13][phase];
        const pail = [0, 0, 0, 10, 15, 15][phase];
        const cone = [0, 0, 30, 30, 30, 30][phase];
        const r = rnd(100);
        let types = [];
        if (r < tpl) { /* 三只 */ }
        else if (r < tpl + dbl) { /* 两只 */ }
        let n = 1;
        if (r < tpl) n = 3; else if (r < tpl + dbl) n = 2;
        for (let i = 0; i < n; i++) {
          let ty = 'NORMAL';
          const r2 = rnd(100);
          if (r2 < pail) ty = 'BUCKET';
          else if (r2 < pail + cone) ty = 'CONE';
          this.whackSpawnFromGrave(ty, wave);
        }
        // 下一批间隔
        const lo = curve(1, 12, wave, 10, 3), hi = curve(1, 12, wave, 20, 6);
        this.spawnCounter = rndRange(lo, hi);
      }
    }

    whackSpawnFromGrave(type, wave) {
      const b = this.board;
      const graves = b.graves.filter(g => !g.dead &&
        !b.plants.find(p => !p.dead && p.col === g.col && p.row === g.row));
      if (!graves.length) return;
      const g = graves[rnd(graves.length)];
      const z = b.addZombie(type, g.row);
      if (z) {
        z.riseFromGrave && z.riseFromGrave(g.col, g.row);
        z.x = b.gridToPixelX(g.col);
        z.posX = z.x;
        const maxSpeed = curve(1, 12, wave, 1, 3);
        z.velOverride = rndRange(0.5, maxSpeed);
      }
    }

    // ============================================================
    // 生存模式 (Survival)
    // ============================================================
    initSurvival() {
      const b = this.board, lv = this.level;
      this.survivalStage = 0;
      this.stageWaves = lv.waves;      // normal=10, hard/endless=20
      b.numWaves = this.stageWaves;
      this.repicking = false;
      this.stageTransition = 0;
    }

    updateSurvival(dt) {
      const b = this.board;
      // 段过渡倒计时 (不因 repicking 早退 — 否则卡死)
      if (this.stageTransition > 0) {
        this.stageTransition -= dt;
        if (this.stageTransition <= 0) this.nextSurvivalStage();
        return;
      }
      if (this.repicking) return;
      // 段结束: 本段最后一波打完 → 过场 → 重选卡
      if (b.wave >= b.numWaves && !b.zombies.some(z => !z.dead && z.fromWave !== -2) && b.state === 'playing') {
        this.beginStageTransition();
      }
    }

    beginStageTransition() {
      const b = this.board;
      this.repicking = true;
      this.stageTransition = 5.0;
      // "一大波僵尸正在接近" 提示
      b.game && b.game.audio && b.game.audio.play('hugewave');
    }

    nextSurvivalStage() {
      const b = this.board, lv = this.level;
      this.survivalStage++;
      this.repicking = false;
      // 清场残留僵尸 (原版 RemoveZombiesForRepick)
      for (const z of b.zombies) if (!z.dead) (z.die && z.die());
      // 段奖励: 每段给阳光
      b.sun += 50 + this.survivalStage * 25;
      // 重新开波
      b.wave = 0;
      b.numWaves = this.stageWaves;
      b.waveTimer = 6.0;
      b.wavesLeft = this.stageWaves;
      // 打开选卡界面 (重选卡)
      if (b.game && b.game.openSeedChooser) b.game.openSeedChooser(true);
      // 胜利判定: normal 5段 / hard 10段 后结束
      const flagsNeeded = lv.survival === 'normal' ? 5 : lv.survival === 'hard' ? 10 : Infinity;
      const flagsDone = this.survivalStage * (this.stageWaves / 10);
      if (flagsDone >= flagsNeeded) {
        b.win();
      }
    }

    // ============================================================
    // 天降种子 (Raining Seeds)
    // ============================================================
    initRaining() {
      const b = this.board;
      b.seedCards = [];
      this.rainCards = [];
      this.rainT = 2;
      this.heldCards = [];   // 已拾取待种植
    }

    updateRaining(dt) {
      const b = this.board;
      this.rainT -= dt;
      if (this.rainT <= 0) {
        this.rainT = rndRange(5, 10);
        const pool = this.rainingPool();
        if (pool.length) {
          const type = pool[rnd(pool.length)];
          this.rainCards.push({
            type, x: rndRange(100, 650), y: -40, vy: 55,
            land: rndRange(90, 150), taken: false, life: 11,
          });
        }
      }
      for (const c of this.rainCards) {
        if (c.y < c.land) c.y += c.vy * dt;
        else { c.life -= dt; if (c.life <= 0) c.dead = true; }
      }
      this.rainCards = this.rainCards.filter(c => !c.dead);
    }

    rainingPool() {
      const b = this.board;
      const lv = b.level.id || 50;
      let pool = availablePlants(Math.min(lv, 50), this.game && this.game.purchasedSet)
        .filter(t => !UPGRADES_SET.has(t) && t !== 'SUNFLOWER' && t !== 'TWINSUNFLOWER' &&
          t !== 'COFFEEBEAN' && t !== 'UMBRELLALEAF' && t !== 'IMITATER' && t !== 'MARIGOLD');
      // 睡莲概率提升
      const nLily = b.plants.filter(p => !p.dead && p.type === 'LILYPAD').length;
      if (b.level.scene === 'pool' || b.level.scene === 'fog') {
        if (nLily < 18 && Math.random() < 0.3 * (1 - nLily / 18)) pool = pool.concat(['LILYPAD']);
      }
      return pool;
    }

    // ============================================================
    // 坚不可摧 (Last Stand)
    // ============================================================
    initLastStand() {
      const b = this.board;
      this.onslaught = false;
      this.stageNum = 0;
      b.waveTimer = 99999;   // 等玩家点开始
    }

    updateLastStand(dt) {
      const b = this.board;
      if (!this.onslaught) return;
      // 段结束 → 下一阶段
      if (b.wave >= b.numWaves && !b.zombies.some(z => !z.dead)) {
        this.stageNum++;
        if (this.stageNum >= 5) { b.win(); return; }
        this.onslaught = false;
        b.wave = 0;
        b.waveTimer = 99999;
        b.sun += 250;
        if (b.game && b.game.openSeedChooser) b.game.openSeedChooser(true);
      }
    }

    startOnslaught() {
      const b = this.board;
      this.onslaught = true;
      b.waveTimer = 2.0;
      this.game && this.game.audio && this.game.audio.play('hugewave');
    }

    // ============================================================
    // 宝石僵尸 (Beghouled) — 三消
    // ============================================================
    initBeghouled() {
      const b = this.board;
      b.sun = 0;
      b.seedCards = [];
      this.beghouledScore = 0;
      this.beghouledTarget = 75;
      this.beghouledCols = 8;
      this.selected = null;       // {col,row}
      this.swapBack = 0;
      this.cleared = b.gridItems = [];
      // 6基础植物
      this.beghouledTypes = ['PUFFSHROOM', 'STARFRUIT', 'MAGNETSHROOM', 'SNOWPEA', 'WALLNUT', 'PEASHOOTER'];
      const Plant = b._plantClass();
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < this.beghouledCols; col++) {
          const type = this.beghouledTypes[rnd(this.beghouledTypes.length)];
          const p = new Plant(type, row, col, b);
          p.izStatic = true;
          b.plants.push(p);
          b.grid[row][col] = p;
        }
      }
      // 避免初始三连
      this.fixInitialMatches();
      b.waveTimer = 2.0;
    }

    fixInitialMatches() {
      const b = this.board;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < this.beghouledCols; col++) {
          let guard = 0;
          while (this.matchAt(col, row) && guard++ < 10) {
            const p = b.grid[row][col];
            const type = this.beghouledTypes[rnd(this.beghouledTypes.length)];
            p.type = type;
          }
        }
      }
    }

    plantAt(col, row) { return this.board.grid[row] && this.board.grid[row][col]; }

    matchAt(col, row) {
      const p = this.plantAt(col, row);
      if (!p) return false;
      const t = p.type;
      // 横向
      let n = 1;
      for (let c = col - 1; c >= 0 && this.plantAt(c, row) && this.plantAt(c, row).type === t; c--) n++;
      for (let c = col + 1; c < this.beghouledCols && this.plantAt(c, row) && this.plantAt(c, row).type === t; c++) n++;
      if (n >= 3) return true;
      // 纵向
      n = 1;
      for (let r = row - 1; r >= 0 && this.plantAt(col, r) && this.plantAt(col, r).type === t; r--) n++;
      for (let r = row + 1; r < 5 && this.plantAt(col, r) && this.plantAt(col, r).type === t; r++) n++;
      return n >= 3;
    }

    // 交换尝试 (拖拽)
    beghouledSwap(c1, r1, c2, r2) {
      const b = this.board;
      if (Math.abs(c1 - c2) + Math.abs(r1 - r2) !== 1) return false;
      const p1 = this.plantAt(c1, r1), p2 = this.plantAt(c2, r2);
      if (!p1 || !p2) return false;
      // 交换
      b.grid[r1][c1] = p2; b.grid[r2][c2] = p1;
      p1.col = c2; p1.row = r2;
      p2.col = c1; p2.row = r1;
      if (this.matchAt(c1, r1) || this.matchAt(c2, r2)) {
        this.resolveMatches();
        return true;
      }
      // 换回
      b.grid[r1][c1] = p1; b.grid[r2][c2] = p2;
      p1.col = c1; p1.row = r1;
      p2.col = c2; p2.row = r2;
      return false;
    }

    // 旋转 (Beghouled Twist: 2×2顺时针)
    beghouledTwist(c, r) {
      const b = this.board;
      if (c < 0 || c > this.beghouledCols - 2 || r < 0 || r > 3) return false;
      const a = this.plantAt(c, r), bb = this.plantAt(c + 1, r);
      const cc = this.plantAt(c, r + 1), d = this.plantAt(c + 1, r + 1);
      if (!a || !bb || !cc || !d) return false;
      // 顺时针旋转
      b.grid[r][c] = cc; b.grid[r][c + 1] = a;
      b.grid[r + 1][c] = d; b.grid[r + 1][c + 1] = bb;
      a.col = c + 1; a.row = r;
      bb.col = c + 1; bb.row = r + 1;
      cc.col = c; cc.row = r;
      d.col = c; d.col = c; d.row = r + 1;
      cc.row = r; d.row = r + 1;
      if (this.matchAt(c, r) || this.matchAt(c + 1, r) || this.matchAt(c, r + 1) || this.matchAt(c + 1, r + 1)) {
        this.resolveMatches();
        return true;
      }
      // 换回
      b.grid[r][c] = a; b.grid[r][c + 1] = bb;
      b.grid[r + 1][c] = cc; b.grid[r + 1][c + 1] = d;
      a.col = c; a.row = r;
      bb.col = c + 1; bb.row = r;
      cc.col = c; cc.row = r + 1;
      d.col = c + 1; d.row = r + 1;
      return false;
    }

    resolveMatches() {
      const b = this.board;
      let chain = 0;
      const cascade = () => {
        const matched = new Set();
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < this.beghouledCols; col++) {
            if (this.matchAt(col, row)) matched.add(this.plantAt(col, row));
          }
        }
        if (!matched.size) {
          // 无可动步检测 → 洗牌
          if (!this.hasValidMove()) this.shuffleBoard();
          return;
        }
        chain++;
        // 掉阳光: 连长-2+chain, clamp 1-5
        const sunVal = clamp(3 - 2 + chain, 1, 5);
        for (const p of matched) {
          p.dead = true;
          // 弹坑 (僵尸吃植物留下的)
        }
        b.plants = b.plants.filter(p => !p.dead);
        this.beghouledScore += matched.size;
        // 掉阳光
        const first = matched.values().next().value;
        if (first) {
          b.suns.push(this.makeSunToken({
            kind: 'sun', value: sunVal * 5,
            x: first.x, y: first.y, vy: 0.6, land: first.y + 50, life: 9,
          }));
        }
        this.game && this.game.audio && this.game.audio.play('seedlift');
        // 重力下落 + 补充
        this.collapseAndRefill();
        if (this.beghouledScore >= this.beghouledTarget) { b.win(); return; }
        setTimeout(cascade, 250);
      };
      cascade();
    }

    collapseAndRefill() {
      const b = this.board;
      const Plant = b._plantClass();
      for (let col = 0; col < this.beghouledCols; col++) {
        const column = [];
        for (let row = 4; row >= 0; row--) {
          const p = b.grid[row][col];
          if (p && !p.dead) column.push(p);
        }
        // 从底行重排
        for (let row = 4, i = 0; row >= 0; row--, i++) {
          if (i < column.length) {
            const p = column[i];
            p.row = row;
            b.grid[row][col] = p;
          } else {
            // 补充新植物
            const type = this.beghouledTypes[rnd(this.beghouledTypes.length)];
            const p = new Plant(type, row, col, b);
            p.izStatic = true;
            b.plants.push(p);
            b.grid[row][col] = p;
          }
        }
      }
    }

    hasValidMove() {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < this.beghouledCols; col++) {
          if (col < this.beghouledCols - 1) {
            const b = this.board;
            const p1 = this.plantAt(col, row), p2 = this.plantAt(col + 1, row);
            if (p1 && p2) {
              b.grid[row][col] = p2; b.grid[row][col + 1] = p1;
              const ok = this.matchAt(col, row) || this.matchAt(col + 1, row);
              b.grid[row][col] = p1; b.grid[row][col + 1] = p2;
              if (ok) return true;
            }
          }
        }
      }
      return false;
    }

    shuffleBoard() {
      const b = this.board;
      const all = [];
      for (let row = 0; row < 5; row++) for (let col = 0; col < this.beghouledCols; col++) all.push(b.grid[row][col]);
      // Fisher-Yates
      for (let i = all.length - 1; i > 0; i--) {
        const j = rnd(i + 1);
        [all[i], all[j]] = [all[j], all[i]];
      }
      let i = 0;
      for (let row = 0; row < 5; row++) for (let col = 0; col < this.beghouledCols; col++) {
        const p = all[i++];
        p.row = row; p.col = col;
        b.grid[row][col] = p;
      }
      if (!this.hasValidMove()) this.shuffleBoard();
    }

    // ============================================================
    // 老虎机 (Slot Machine)
    // ============================================================
    initSlotMachine() {
      const b = this.board;
      b.sun = 50;
      this.slotTarget = 2000;
      this.slotSpinning = false;
      this.slotTimer = 0;
      this.slotCells = ['SUNFLOWER', 'PEASHOOTER', 'SNOWPEA'];
      this.spinCount = 0;
    }

    updateSlotMachine(dt) {
      const b = this.board;
      if (this.slotSpinning) {
        this.slotTimer -= dt;
        // 滚动动画
        if (this.slotTimer <= 0) {
          this.slotSpinning = false;
          this.resolveSpin();
        } else if (Math.floor(this.slotTimer * 10) % 2 === 0) {
          // 随机翻滚
          for (let i = 0; i < 3; i++) {
            const pool = ['SUNFLOWER', 'PEASHOOTER', 'SNOWPEA', 'WALLNUT', 'SUN', 'DIAMOND'];
            this.slotCells[i] = pool[rnd(pool.length)];
          }
        }
      }
      if (b.sun >= this.slotTarget) b.win();
    }

    pullSlot() {
      const b = this.board;
      if (this.slotSpinning || b.sun < 25) {
        if (b.sun < 25) this.game && this.game.audio && this.game.audio.play('buzzer');
        return false;
      }
      b.sun -= 25;
      this.slotSpinning = true;
      this.slotTimer = 3.0;
      this.spinCount++;
      this.game && this.game.audio && this.game.audio.play('slotmachine');
      return true;
    }

    resolveSpin() {
      const b = this.board;
      const cells = this.slotCells;
      // 结算: 两同 → 1种子包或4阳光或1钻; 三同 → 3包或20阳光或5钻
      const counts = {};
      for (const c of cells) counts[c] = (counts[c] || 0) + 1;
      const kinds = Object.keys(counts);
      if (kinds.length === 1) {
        // 三同
        const k = kinds[0];
        if (k === 'SUN') { b.sun += 20; this.toast('太阳三连! +20阳光'); }
        else if (k === 'DIAMOND') { b.sun += 100; this.toast('钻石三连! +100阳光'); }
        else { this.giveSeedPackets(3); this.toast('植物三连! 3个种子包'); }
      } else if (kinds.length === 2) {
        // 两同
        const k = kinds.find(x => counts[x] === 2);
        if (k === 'SUN') { b.sun += 4; }
        else if (k === 'DIAMOND') { b.sun += 20; }
        else { this.giveSeedPackets(1); }
      }
      this.game && this.game.audio && this.game.audio.play('points');
    }

    giveSeedPackets(n) {
      const b = this.board;
      for (let i = 0; i < n; i++) {
        const pool = ['SUNFLOWER', 'PEASHOOTER', 'SNOWPEA', 'WALLNUT'];
        const type = pool[rnd(pool.length)];
        b.suns.push(this.makeSunToken({
          kind: 'seedpacket', type,
          x: 350 + i * 60, y: 200, vy: 0.6, land: 350, life: 12,
        }));
      }
    }

    toast(msg) { this._toast = { msg, t: 2 }; }

    // ============================================================
    // 主更新 (Challenge::Update 1888-1986)
    // ============================================================
    update(dt) {
      this.time += dt;
      const b = this.board;
      if (b.state !== 'playing') return;
      switch (this.mode) {
        case 'conveyor': this.updateConveyor(dt); break;
        case 'vasebreaker': this.updateVasebreaker(dt); break;
        case 'izombie': this.updateIZombie(dt); break;
        case 'whack': this.updateWhack(dt); break;
        case 'survival': this.updateSurvival(dt); break;
        case 'raining': this.updateRaining(dt); break;
        case 'laststand': this.updateLastStand(dt); break;
        case 'beghouled': /* 波次由board管 */ break;
        case 'slotmachine': this.updateSlotMachine(dt); break;
      }
    }

    // ============================================================
    // 绘制 (Challenge::DrawBackdrop + 各模式特殊绘制)
    // ============================================================
    drawBackdrop(ctx) {
      const b = this.board;
      // 传送门
      if (b.level.portals && this.portals) this.drawPortals(ctx);
    }

    drawPortals(ctx) {
      for (const p of this.portals) {
        if (p.dead) continue;
        const x = b.gridToPixelX(p.col) + 25, y = b.gridToPixelY(p.row) + 50;
        const img = Assets.image && Assets.image(p.square ? 'portal_square.png' : 'portal_circle.png');
        if (img) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(this.time * 2);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          ctx.restore();
        }
      }
    }

    drawOverlay(ctx) {
      const b = this.board;
      // 我是僵尸: 红色警戒线 + 脑子 + 僵尸卡
      if (this.mode === 'izombie') this.drawIZombie(ctx);
      // 保龄球: 红线
      if (this.mode === 'conveyor' && b.level.fixed === 'bowling') this.drawRedLine(ctx, 268);
      // 打僵尸: 锤子光标
      if (this.mode === 'whack') this.drawWhackCursor(ctx);
      // 坚不可摧: 开始进攻按钮
      if (this.mode === 'laststand' && !this.onslaught) this.drawOnslaughtButton(ctx);
      // 老虎机
      if (this.mode === 'slotmachine') this.drawSlotMachine(ctx);
      // 宝石僵尸: 提示
      if (this.mode === 'beghouled') this.drawBeghouledHUD(ctx);
      // 罐子: 透视内容
      if (this.mode === 'vasebreaker') this.drawVases(ctx);
    }

    drawRedLine(ctx, x) {
      // 原版 IMAGE_WALLNUT_BOWLINGSTRIPE 竖条纹
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#d43a2a' : '#e8e3d0';
        ctx.fillRect(x + i * 4, 80, 4, 430);
      }
      ctx.restore();
    }

    drawIZombie(ctx) {
      const b = this.board;
      // 红色警戒线 (原版 IMAGE_WALLNUT_BOWLINGSTRIPE 位置由limit决定)
      const x = b.gridToPixelX(this.izLimit) - 10;
      this.drawRedLine(ctx, x);
      // 脑子
      const brainImg = Assets.image && Assets.image('brain.png');
      for (const br of this.brains) {
        if (br.dead && !br.squished) continue;
        if (brainImg) {
          ctx.save();
          if (br.squished) { ctx.translate(br.x + 10, br.y + 20); ctx.scale(1, 0.25); }
          else ctx.translate(br.x, br.y);
          ctx.drawImage(brainImg, -16, -16);
          ctx.restore();
        }
      }
      // 进度: x/5 BRAINS
      ctx.save();
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,0,0.8)';
      const txt = `${this.challengeScore}/5 脑子`;
      ctx.strokeText(txt, 14, 110);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(txt, 14, 110);
      ctx.restore();
    }

    drawWhackCursor(ctx) {
      const m = this.game && this.game.mouse;
      if (!m) return;
      const r = this.cursorReanim;
      if (r) { r.x = m.x - 25; r.y = m.y + 16; }
      else {
        this.cursorReanim = this.addReanim('Hammer', m.x - 25, m.y + 16);
        if (this.cursorReanim) this.cursorReanim.play('anim_whack_zombie', RE.PLAY_ONCE_HOLD, 24);
      }
    }

    drawOnslaughtButton(ctx) {
      // 原版 "开始进攻" (300,559,210,46)
      const b = this.board;
      const x = 300, y = 545, w = 210, h = 46;
      this.onslaughtRect = { x, y, w, h };
      const hov = this.game && this.game.mouse && this.game.mouse.x >= x && this.game.mouse.x <= x + w &&
        this.game.mouse.y >= y && this.game.mouse.y <= y + h;
      ctx.save();
      const r = this.stageNum === 0 ? 10 : 14;
      ctx.fillStyle = hov ? '#8a6642' : '#6f5233';
      ctx.strokeStyle = '#3d2c17'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke();
      ctx.font = `bold ${this.stageNum === 0 ? 20 : 18}px "Noto Sans SC", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(this.stageNum === 0 ? '开始进攻！' : '下一波进攻！', x + w / 2, y + h / 2 + 1);
      ctx.restore();
    }

    drawSlotMachine(ctx) {
      const b = this.board;
      // 3格老虎机 (种子银行位置)
      const x = 100, y = 6, w = 300, h = 80;
      ctx.save();
      ctx.fillStyle = '#5a3a20';
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
      ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 3; ctx.stroke();
      // 三个滚轮格
      const UI = require('./ui');
      for (let i = 0; i < 3; i++) {
        const cx = x + 20 + i * 92;
        ctx.fillStyle = '#3a2410';
        ctx.beginPath(); ctx.roundRect(cx, y + 10, 80, 60, 6); ctx.fill();
        const cell = this.slotCells[i];
        // 画植物卡或太阳/钻石
        if (cell === 'SUN' || cell === 'DIAMOND') {
          const img = Assets.image && Assets.image(cell === 'SUN' ? 'sun.png' : 'diamond_shine.png');
          if (img) ctx.drawImage(img, cx + 20, y + 14, 40, 40);
        } else {
          UI.drawSeedCard(ctx, cell, cx + 8, y + 8, {});
        }
      }
      // 拉杆
      const canPull = !this.slotSpinning && b.sun >= 25;
      ctx.fillStyle = canPull ? '#c8f542' : '#777';
      ctx.beginPath(); ctx.roundRect(x + w + 16, y + 10, 44, 60, 8); ctx.fill();
      ctx.font = 'bold 15px "Noto Sans SC"'; ctx.textAlign = 'center';
      ctx.fillStyle = '#333'; ctx.fillText('拉! 25', x + w + 38, y + 45);
      this.slotPullRect = { x: x + w + 16, y: y + 10, w: 44, h: 60 };
      // 进度
      ctx.font = 'bold 15px "Noto Sans SC"'; ctx.textAlign = 'left';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(`阳光 ${b.sun} / ${this.slotTarget}`, 20, 55);
      ctx.restore();
    }

    drawBeghouledHUD(ctx) {
      const b = this.board;
      ctx.save();
      ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,0,0.8)';
      const txt = `消除 ${this.beghouledScore}/${this.beghouledTarget}`;
      ctx.strokeText(txt, 14, 110);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(txt, 14, 110);
      ctx.restore();
    }

    drawVases(ctx) {
      const b = this.board;
      const potImg = Assets.image && Assets.image('scary_pot.png');
      for (const g of (b.gridItems || [])) {
        if (g.type !== 'vase' || g.broken) continue;
        const x = b.gridToPixelX(g.col) - 5, y = b.gridToPixelY(g.row) - 15;
        // 阴影
        ctx.save();
        const sh = Assets.image && Assets.image('plantshadow2.png');
        if (sh) { ctx.globalAlpha = 0.35; ctx.drawImage(sh, x - 5, y + 72, 70, 26); }
        ctx.restore();
        if (potImg) {
          const cel = g.potType === 'seed' ? (g.leaf ? 1 : 0) : 2;
          // 透视: 内容可见
          if (g.transparent > 0) {
            const alpha = curve(0, 50, g.transparent, 0, 1);
            // 罐底
            ctx.save(); ctx.globalAlpha = alpha * 0.9;
            ctx.drawImage(potImg, cel * 80, 0, 80, 202, x, y, 80, 202);
            ctx.restore();
            // 内容物
            ctx.save(); ctx.globalAlpha = alpha;
            if (g.potType === 'seed') {
              const UI = require('./ui');
              UI.drawSeedCard(ctx, g.content, x + 13, y + 30, { scale: 0.7 });
            } else if (g.potType === 'sun') {
              const sunImg = Assets.image && Assets.image('sun.png');
              if (sunImg) ctx.drawImage(sunImg, x + 20, y + 35, 40, 40);
            }
            ctx.restore();
          }
          // 罐身
          ctx.drawImage(potImg, cel * 80, 0, 80, 202, x, y, 80, 202);
        }
      }
    }

    // ============================================================
    // 交互 (MouseDown 转发)
    // ============================================================
    mouseDown(x, y) {
      const b = this.board;
      switch (this.mode) {
        case 'vasebreaker': {
          // 点击罐子 → 砸罐
          const gx = Math.floor((x - CONST.LAWN_XMIN) / CONST.CELL_W);
          const gy = b.pixelToRow(y);
          if (gx >= 0 && gx <= 9 && gy >= 0 && gy <= 4) {
            if (this.vaseAt(gx, gy)) return this.malletPot(gx, gy);
          }
          return false;
        }
        case 'whack': {
          return this.whackAt(x, y);
        }
        case 'slotmachine': {
          if (this.slotPullRect) {
            const r = this.slotPullRect;
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
              return this.pullSlot();
            }
          }
          return false;
        }
        case 'laststand': {
          if (this.onslaughtRect && !this.onslaught) {
            const r = this.onslaughtRect;
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
              this.startOnslaught();
              return true;
            }
          }
          return false;
        }
        case 'beghouled': {
          // 点击格子 → 选择/交换; 旋转模式: 点击2×2
          const gx = Math.floor((x - CONST.LAWN_XMIN) / CONST.CELL_W);
          const gy = b.pixelToRow(y);
          if (gx < 0 || gx > 7 || gy < 0 || gy > 4) return false;
          if (this.level.fixed === 'beghouled_twist') {
            return this.beghouledTwist(gx, gy);
          }
          if (!this.selected) {
            this.selected = { col: gx, row: gy };
            return true;
          }
          const s = this.selected;
          this.selected = null;
          if (s.col === gx && s.row === gy) return true;
          return this.beghouledSwap(s.col, s.row, gx, gy);
        }
      }
      return false;
    }

    // ---- reanim 添加 ----
    addReanim(name, x, y) {
      const b = this.board;
      if (!RE.hasDef(name)) return null;
      const r = new RE.Reanimation(name);
      r.setPosition(x, y);
      r.renderOrder = 10 ** 6;   // 顶层
      b.reanims.push(r);
      return r;
    }

    // ---- 阳光token工厂 ----
    makeSunToken(opt) {
      const self = this;
      const token = {
        kind: opt.kind, type: opt.type, value: opt.value || 0,
        x: opt.x, y: opt.y, vy: opt.vy || 0.6, land: opt.land,
        life: opt.life || 9, t: 0, dead: false, collected: false, collecting: false,
        draw(ctx) {
          ctx.save();
          if (this.collecting) {
            const sc = Math.max(0.5, Math.min(1, 1 - this.t * 2));
            ctx.globalAlpha = Math.max(0.3, sc);
            ctx.translate(this.x, this.y);
            ctx.scale(sc, sc);
            ctx.translate(-this.x, -this.y);
          }
          if (this.kind === 'sun') {
            const sunImg = Assets.image && Assets.image('sun.png');
            if (sunImg) {
              const bob = Math.sin(this.t * 2.5) * 2;
              ctx.drawImage(sunImg, this.x - 25, this.y - 25 + bob, 50, 50);
            } else {
              ctx.fillStyle = '#ffd34d';
              ctx.beginPath(); ctx.arc(this.x, this.y, 22, 0, Math.PI * 2); ctx.fill();
            }
          } else if (this.kind === 'seedpacket') {
            // 可用种子包 (原版 COIN_USABLE_SEED_PACKET)
            const UI = require('./ui');
            const w = this.collecting ? 40 : 50;
            UI.UI.drawSeedCard(ctx, this.type, this.x - w / 2, this.y - 30, {});
          }
          ctx.restore();
        },
        update(dt) {
          this.t += dt;
          if (this.collecting) {
            // 飞向计数器 (阳光→(15,-20) 种子包→跟随收集动效)
            const tx = 15, ty = -20;
            const dx = tx - this.x, dy = ty - this.y;
            const d = Math.hypot(dx, dy);
            if (d < 14) { this.dead = true; this.collected = true; this.onCollect && this.onCollect(); return; }
            const v = Math.max(6, d / 0.22) * dt;
            this.x += dx / d * v; this.y += dy / d * v;
            return;
          }
          // 抛物运动 (原版 FROM_PLANT: 初速可负, 重力0.09/tick)
          if (!this.landed) {
            this.vy += 0.09 * dt * 60;
            this.y += this.vy * dt * 60;
            if (this.vy > 0 && this.y >= this.land) {
              this.y = this.land;
              this.landed = true;
            }
          } else {
            this.life -= dt;
            if (this.life <= 0) this.dead = true;
          }
        },
      };
      return token;
    }
  }

  const UPGRADES_SET = new Set(['GATLINGPEA', 'TWINSUNFLOWER', 'GLOOMSHROOM', 'CATTAIL', 'WINTERMELON', 'GOLDMAGNET', 'SPIKEROCK', 'COBCANNON', 'IMITATER']);

  return { Challenge, CONVEYOR_POOLS, VASE_LEVELS, IZ_LEVELS, IZ_COST, IZ_NAMES, setAssets(a) { Object.assign(Assets, a); } };
})();

if (typeof module !== 'undefined') module.exports = CH;
