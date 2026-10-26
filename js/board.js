// ============================================================
// board.js — 战场核心 (Board.cpp 移植 + 已验证波次系统)
//  - 100Hz 固定 tick (SECONDS_PER_UPDATE=0.01 语义)
//  - 原版网格: GridToPixelX=col*80+40 / GridToPixelY=行高100|85+80 / 屋顶坡度
//  - 渲染顺序系统: renderOrder = row*10000 + layer + offset
//  - GetTopPlantAt / 泳池判定 / 高地 / 梯子 / 冰道 / 践踏
//  - 割草机 → Zombie.mowDown()
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, MODE_LEVELS, CONVEYOR_POOLS, VASE_RECIPES, VASE_ADVENTURE_STAGES, zombieAllowedOnLevel, WAVE, MUSHROOMS, AQUATIC, GROUNDCOVER, availablePlants, awardForLevel } = require('./data');
const { Zombie, H, PH } = require('./zombie');
const RE = require('./reanim');
const { Projectile } = require('./projectiles');
const { Banners } = require('./cutscene');

const SCENE_BG = {
  day: 'background1.jpg', night: 'background2.jpg',
  pool: 'background3.jpg', fog: 'background4.jpg', roof: 'background5.jpg',
  boss: 'background6boss.jpg',
  aquarium: 'aquarium1.jpg',   // 僵尸水族馆 (原版 BACKGROUND_ZOMBIQUARIUM → IMAGE_AQUARIUM1)
};
// #10: 5-10 僵王博士 = 夜间屋顶 (原版 background6boss)
function sceneBgName(board) {
  if (board.level && board.level.bossNight) return 'background6boss.jpg';
  return SCENE_BG[board.scene];
}

const RENDER_LAYER = {
  ROW_OFFSET: 10000, GROUND: 200000, LAWN: 300000, GRAVE: 301000,
  PLANT: 302000, ZOMBIE: 303000, BOSS: 304000, PROJECTILE: 305000,
  MOWER: 306000, PARTICLE: 307000, TOP: 400000,
};

class Board {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.rows = (level.scene === 'pool' || level.scene === 'fog') ? 6 : 5;
    this.scene = level.scene;
    this.isRoof = level.scene === 'roof' || level.scene === 'boss';
    this.isNight = level.scene === 'night' || level.scene === 'fog' || level.scene === 'boss';
    this.waterRows = this.scene === 'pool' || this.scene === 'fog' ? [2, 3] : [];
    this.grassRows = level.grassRows || Array.from({ length: this.rows }, (_, i) => i);
    this.cols = 9;

    this.sun = level.startSun !== undefined ? level.startSun : CONST.START_SUN;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.coins = [];
    this.effects = [];
    this.reanims = [];         // reanim型特效 (水花/尘土/掉落物)
    this.mowers = [];
    this.graves = [];
    this.grid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    this.gridPumpkin = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    this.gridLily = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    this.gridPot = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    this.gridSpikes = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));   // 地刺层 (#19 根因: 从未初始化)
    this.ladders = [];         // 梯子 GridItem
    this.craters = [];
    this.iceTrails = [];
    this.iceTimers = new Array(this.rows).fill(0);
    this.iceMinXs = new Array(this.rows).fill(900);
    this.seedCards = [];
    this.shakeX = 0; this.shakeY = 0;
    this.plantsEaten = 0;
    this.time = 0;
    // 原版 GAMEMODE_CHALLENGE_SPEED (Zombie Nimble): Challenge::Update 额外调一次
    //   UpdateGame → 整局 2x (植物/僵尸/子弹/天阳全部加速, 非仅僵尸提速)
    this.speed = level.speedMul || 1;

    // 波次
    this.waves = this.buildWaves(level);
    this.totalWaves = this.waves.length;
    this.wave = 0;
    this.waveTimer = 0;
    this.wavesStarted = false;
    this.lastWaveTime = 0;
    this._waveHP = 0;
    this.hugeWaveWarned = false;
    this.state = 'intro';

    this.sodDone = !level.sodRoll;
    this.cameraX = 0;
    this.skySunTimer = 5;

    // ---- 雾系统 (原版 Board: mGridCelFog/mGridCelLook/mFogOffset/mFogBlownCountDown) ----
    this.gridCelFog = Array.from({ length: 9 }, () => new Array(7).fill(0));
    this.gridCelLook = Array.from({ length: 9 }, () => Array.from({ length: 7 }, () => Math.floor(Math.random() * 20)));
    this.fogBlown = 0;       // 秒 (原版 tick/100)
    this.fogOffset = 0;
    if (this.scene === 'fog') {
      this.fogBlown = 2;                       // 开场雾滚入 (原版 200 tick)
      this.fogOffset = this.maxFogOffset();
    }

    // 割草机 (特殊玩法关卡无割草机: 保龄球/打僵尸/罐子/我不是僵尸/水族馆)
    // 水族馆: 僵尸自由游动不受行约束 (原版 HEIGHT_ZOMBIQUARIUM 豁免割草机/进屋判定;
    //   若带割草机会被游到左侧的潜水僵尸误触发 → 全场清扫 → 误判全灭失败)
    const noMowerModes = ['bowling', 'bowling2', 'whack', 'vasebreaker', 'izombie', 'zombiquarium'];
    const bought = (game && game.purchased) || {};
    for (let r = 0; r < this.rows; r++) {
      if (noMowerModes.includes(level.fixed)) continue;
      if (this.waterRows.includes(r)) {
        // 水行: 购买泳池清洁车后配备
        if (bought['poolcleaner']) this.mowers.push({ row: r, x: -20, state: 'idle', type: 'pool', reanim: null });
        continue;
      }
      if (!this.grassRows.includes(r)) continue;
      if (this.isRoof) {
        if (bought['roofcleaner']) this.mowers.push({ row: r, x: -20, state: 'idle', type: 'roof', reanim: null });
        continue;
      }
      this.mowers.push({
        row: r, x: -20, state: 'idle',
        type: 'lawn',
        reanim: null,
      });
    }
    // 墓碑
    if (level.graves && level.graves.length) {
      for (const [col, cnt] of level.graves) {
        const rowsPool = [];
        for (let r = 0; r < this.rows; r++) {
          if (!this.waterRows.includes(r) && this.grassRows.includes(r)) rowsPool.push(r);
        }
        for (let i = 0; i < cnt && rowsPool.length; i++) {
          const j = Math.floor(Math.random() * rowsPool.length);
          const r = rowsPool.splice(j, 1)[0];
          this.graves.push({ row: r, col, hp: CONST.GRAVE_HP, type: Math.floor(Math.random() * 4), look: Math.floor(Math.random() * 20), rise: 0 });
        }
      }
    }
    this.game.audio.playBGM(level.bgm);
    this.initMode();
  }

  // ---------- 网格坐标 (原版 Board.cpp 8846-8930) ----------
  gridToPixelX(col) { return col * CONST.CELL_W + CONST.LAWN_XMIN; }
  gridX(col) { return this.gridToPixelX(col); }
  gridToPixelY(row, col = 0) {
    let y;
    if (this.isRoof) {
      const slope = col < 5 ? (5 - col) * 20 : 0;
      y = row * 85 + slope + CONST.LAWN_YMIN - 10;
    } else if (this.waterRows.length) {
      y = row * 85 + CONST.LAWN_YMIN;
    } else {
      y = row * 100 + CONST.LAWN_YMIN;
    }
    return y;
  }
  gridY(row) { return this.gridToPixelY(row, 0); }
  cellY(row, col) { return this.gridToPixelY(row, col); }
  roofOffset(col) { return this.isRoof && col < 5 ? (5 - col) * 20 : 0; }
  getPosYBasedOnRow(posX, row) {
    if (this.isRoof) {
      const slope = posX < 440 ? (440 - posX) * 0.25 : 0;
      return this.gridToPixelY(row, 8) + slope;
    }
    return this.gridToPixelY(row, 0);
  }
  pixelToGridX(x, y = 0) {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - CONST.LAWN_XMIN) / CONST.CELL_W)));
  }
  pixelToGridXKeepOnBoard(x, y = 0) { return this.pixelToGridX(x, y); }
  pixelToGridY(x, y) {
    const rowH = this.waterRows.length ? 85 : 100;
    return Math.max(0, Math.min(this.rows - 1, Math.floor((y - CONST.LAWN_YMIN) / rowH)));
  }

  isWater(row, col) { return this.waterRows.includes(row); }
  isPoolRow(row) { return this.waterRows.includes(row); }
  isPoolSquare(col, row) { return this.waterRows.includes(row); }
  isHighGround(col, row) {
    // 原版: 5-? 高地格子 — 屋顶关无高地, 白天关无. 保留接口
    return false;
  }
  zombieTypeCanGoInPool(type) {
    if (this.waterRows.length === 0) return false;
    switch (type) {
      case 'ZAMBONI': case 'CATAPULT': case 'BALLOON': case 'BUNGEE': case 'DANCER': case 'BACKUP':
      case 'GARGANTUAR': case 'REDEYE': case 'IMP': case 'BOSS': case 'DIGGER':
        return false;
      default: return true;
    }
  }
  isFlagWave(w) {
    if (w < 0 || this.totalWaves < 10) return false;
    return w > 0 && w % 10 === 0;
  }
  bungeeIsTargetingCell(col, row) {
    for (const z of this.zombies) {
      if (!z.dead && z.type === 'BUNGEE' && z.targetCol === col && z.row === row) return true;
    }
    return false;
  }
  getGraveAt(col, row) {
    return this.graves.find(g => g.col === col && g.row === row) || null;
  }
  makeRenderOrder(layer, row, offset) { return row * RENDER_LAYER.ROW_OFFSET + layer + offset; }

  // ---------- 植物查询 (GetTopPlantAt 家族) ----------
  getTopPlantAt(col, row, priority = 'eating') {
    // 返回该格最顶层可交互植物
    const order = { eating: ['grid', 'pumpkin'], normal: ['grid', 'pumpkin'], bungee: ['grid', 'pumpkin', 'pot', 'lily'] };
    const seq = order[priority] || order.eating;
    for (const key of seq) {
      const g = key === 'grid' ? this.grid[row][col]
        : key === 'pumpkin' ? this.gridPumpkin[row][col]
          : key === 'pot' ? this.gridPot[row][col]
            : this.gridLily[row][col];
      if (g && !g.dead) return g;
    }
    return null;
  }
  getFlowerPotAt(col, row) {
    const p = this.gridPot[row][col];
    return p && !p.dead ? p : null;
  }
  getLadderAt(col, row) {
    return this.ladders.find(l => l.col === col && l.row === row && !l.dead) || null;
  }
  addLadder(col, row) {
    this.ladders.push({ col, row, dead: false, rise: 0 });
  }
  setIceTrail(row, time) { this.iceTimers[row] = Math.max(this.iceTimers[row] || 0, time); }
  iceTimer(row) { return this.iceTimers[row]; }
  setIceMinX(row, x) { this.iceMinXs[row] = Math.min(this.iceMinXs[row] ?? 900, x); }
  iceMinX(row) { return this.iceMinXs[row]; }

  shakeBoard(x, y) { this.shakeX += x; this.shakeY += y; }

  killAllZombiesInRadius(row, x, y, radius, mindControlled = false) {
    for (const z of this.zombies) {
      if (z.dead || z.isDeadOrDying) continue;
      if (Math.hypot(z.x + 40 - x, z.y + 50 - y) <= radius) {
        // #fix(烧灰防具掉落) 原版杰克盒爆炸 KillAllZombiesInRadius(theBurn=true) → ApplyBurn:
        //   烧杀不走护盾/头盔扣血, 防具随本体蒸发不掉粒子 (旧实现 takeDamage(1800,1) 防具先掉)
        try { z.applyBurn && z.applyBurn(); } catch (e) { z.takeDamage(1800, 1); }
      }
    }
  }
  killAllPlantsInRadius(x, y, radius) {
    for (const p of this.plants) {
      if (p.dead) continue;
      if (Math.hypot(p.x + 40 - x, p.y + 40 - y) <= radius) {
        p.die();
      }
    }
  }

  // ---------- 波次构建 (已验证的原版移植) ----------
  canSpawnType(ty) {
    const d = ZOMBIES[ty];
    if (!d || d.weight <= 0 || d.boss) return false;
    // 小游戏显式僵尸名单 (level.zombieTypes) 即权威 — 原版 InitZombieWaves 直接置 mZombieAllowed
    if (this.level.zombieTypes) return this.level.zombieTypes.includes(ty) || ty === 'FLAG';
    // 原版 CanZombieSpawnOnLevel: 雪人需 CanSpawnYetis (通关至少一次后才出现)
    if (ty === 'YETI' && !(this.game && this.game.finishedAdventure)) return false;
    // 5-5 蹦极闪电战 (原版: NORMAL/CONE/BUCKET/LADDER)
    if (this.level.id === 45 && ['NORMAL', 'CONE', 'BUCKET', 'LADDER', 'FLAG', 'BUNGEE'].includes(ty)) return true;
    // 小僵尸关 (原版 Challenge.cpp:2345 — NORMAL/TRAFFIC_CONE/FOOTBALL/SNORKEL)
    if (this.game && this.game.littleTrouble) return ['NORMAL', 'CONE', 'FOOTBALL', 'SNORKEL'].includes(ty);
    return zombieAllowedOnLevel(ty, this.level.id);
  }
  introZombieType() {
    const lv = this.level.id;
    if (lv <= 1) return null;
    // 原版 GetIntroducedZombieType: 雪人需 CanSpawnYetis (通关后重玩才登场)
    if (lv === 40 && !(this.game && this.game.finishedAdventure)) return null;
    for (const ty of Object.keys(ZOMBIES)) {
      const d = ZOMBIES[ty];
      if (d.unlock === lv && d.weight > 0 && !d.boss && ty !== 'DUCKY') return ty;
    }
    return null;
  }
  buildWaves(level) {
    const lv = level.id > 50 ? 50 : level.id;   // 额外模式(生存等)按满级僵尸池
    // #1 僵王关 (5-10): 无常规波次 — 原版 Challenge::UpdateZombieSpawning 对 IsFinalBossLevel
    //   返回 true 屏蔽常规刷怪, 出怪全部由僵王状态机召唤 (Board.cpp 5309)
    if (level.fixed === 'boss') return [];
    // 原版 PickZombieWaves 581-586: 非首次冒险重玩 → 波数 <10 提到 20, ≥10 加 10 波
    let baseWaves = level.waves;
    if (level.replayBoost) baseWaves = baseWaves < 10 ? 20 : baseWaves + 10;
    const numWaves = level.endless ? 200 : baseWaves;
    const wavesPerFlag = numWaves >= 10 ? 10 : numWaves;
    const intro = this.introZombieType();
    const out = [];
    for (let w = 0; w < numWaves; w++) {
      const isFlag = numWaves >= 10 && w % wavesPerFlag === wavesPerFlag - 1 && lv !== 1;
      const isFinal = !level.endless && w === numWaves - 1;
      const types = [];
      let points = level.endless ? Math.min(26, Math.floor(w / 2.2) + 1) : Math.floor(w / 3) + 1;
      // 最后防线: 原版 points = (stage*10+wave+10)*2/5+1 (Board.cpp 634-637)
      if (level.lastStand) points = Math.floor(((this.lsStage || 0) * 10 + w + 10) * 2 / 5) + 1;
      // 小僵尸关: 僵尸点数×4 (原版 Board.cpp:672 IsLittleTroubleLevel/WallnutBowling ×4)
      if (this.game && this.game.littleTrouble) points *= 4;
      if (level.fixed === 'boss' && isFinal) {
        out.push({ flag: false, final: true, boss: true, count: 1, types: [['BOSS', 1]] });
        continue;
      }
      if (isFlag) {
        // 原版 PickZombieWaves 617-629: 蹦极突袭 (5-5 / 蹦极闪电战小游戏) 旗帜波先放 5 只蹦极;
        //   非末波 → 该波仅有蹦极 (continue); 末波 → 蹦极 + 常规大波内容
        if ((!level.mode && lv === 45) || level.conveyorPool === 'bungee_blitz') {
          types.push(['BUNGEE', 5]);
          if (!isFinal) {
            out.push({ flag: true, final: false, count: 5, types });
            continue;
          }
        }
        const plain = Math.min(points, 8);
        points = Math.round(points * 2.5);
        // 原版 PickZombieWaves 656: 豌豆大战 1/2 旗帜波不加普僵与旗帜僵尸 (植物僵尸军团本身即阵容)
        if (level.flagPlain !== false) {
          types.push(['NORMAL', plain]);
          types.push(['FLAG', 1]);
        }
      }
      if (intro && !isFlag) {
        if (w === Math.floor(numWaves / 2) || isFinal) types.push([intro, 1]);
      }
      if (isFinal) {
        // 原版 PutInMissingZombies 仅冒险模式末波补全兵种 (Board.cpp:723 IsAdventureMode)
        if (!level.mode) {
          for (const ty of Object.keys(ZOMBIES)) {
            if (ty === 'FLAG' || ty === 'BOSS') continue;
            if (this.level.zombieTypes && !this.level.zombieTypes.includes(ty)) continue;
            if (this.canSpawnType(ty) && !types.some(([t]) => t === ty)) types.push([ty, 1]);
          }
        }
      }
      // 原版 Board.cpp 667-686 关卡僵尸点数倍率:
      //   列队僵尸 ×6 / 小僵尸·保龄球 ×4 / 铲子·蹦极·传送门·隐形 ×2
      if (level.columnFill) points *= 6;
      else if ((this.game && this.game.littleTrouble) || level.fixed === 'bowling' || level.fixed === 'bowling2') points *= 4;
      else if (level.conveyorPool === 'bungee_blitz' || level.portals || level.invisibleZ) points *= 2;
      // 原版 Board.cpp 727-743 列队僵尸特殊波: wave%10==5 → 梯子僵尸×10; wave%10==8 → 小丑×10
      if (level.columnFill) {
        if (w % 10 === 5) { for (let i = 0; i < 10; i++) types.push(['LADDER', 1]); }
        if (w % 10 === 8) { for (let i = 0; i < 10; i++) types.push(['JACK', 1]); }
      }
      const pool = Object.keys(ZOMBIES).filter(ty => {
        const d = ZOMBIES[ty];
        if (d.weight <= 0 || d.boss) return false;
        // 小游戏显式僵尸名单即权威 (原版 InitZombieWaves: 挑战模式直接置 mZombieAllowed)
        if (level.zombieTypes) {
          if (!level.zombieTypes.includes(ty)) return false;
        } else if (this.game && this.game.littleTrouble) {
          // 小僵尸关限定池 (原版 Challenge.cpp:2345 NORMAL/CONE/FOOTBALL/SNORKEL)
          if (!['NORMAL', 'CONE', 'FOOTBALL', 'SNORKEL'].includes(ty)) return false;
        } else if (level.hard) {
          // 困难生存: 全兵种僵尸池 (按 unlock 门槛, 门槛内全部可用)
          if ((d.unlock || 99) > 48) return false;
        } else if (!zombieAllowedOnLevel(ty, lv)) return false;
        if ((d.firstWave || 1) > w + 1) return false;
        return true;
      });
      let guard = 60;
      while (points > 0 && guard-- > 0) {
        const cands = pool.filter(ty => ZOMBIES[ty].value <= points);
        if (!cands.length) break;
        const totalW = cands.reduce((s, ty) => s + ZOMBIES[ty].weight, 0);
        let r = Math.random() * totalW, pick = cands[0];
        for (const ty of cands) { r -= ZOMBIES[ty].weight; if (r <= 0) { pick = ty; break; } }
        types.push([pick, 1]);
        points -= ZOMBIES[pick].value;
      }
      const count = types.reduce((s, [, n]) => s + n, 0);
      out.push({ flag: isFlag, final: isFinal, count, types });
    }
    return out;
  }

  // ---------- 僵尸生命周期 ----------
  addZombie(type, fromWave = 0, parent = null) {
    const z = new Zombie(type, 0, this, fromWave, parent);
    if (z.dead) return null;
    this.zombies.push(z);
    return z;
  }
  spawnZombie(type, row, extraX = 0) {
    const z = new Zombie(type, row, this, this.wave);
    if (extraX) z.posX += extraX;
    if (z.dead) return z;
    this.zombies.push(z);
    return z;
  }
  spawnZombieForWave(type, row, waveIdx) {
    const z = new Zombie(type, row, this, waveIdx + 1);
    this.zombies.push(z);
    // 戴夫的耙子 (原版: 商店购买, 自动消灭本关第一只僵尸; 僵王免疫 — 原版耙子只打普通僵尸)
    if (this.game && this.game.purchased && this.game.purchased['rake'] && !this.rakeUsed && z.fromWave !== -2 && z.type !== 'BOSS') {
      this.rakeUsed = true;
      z.takeDamage(99999, null, { noFlash: true });
      this.addEffect('text', z.posX + 20, z.posY + 40, { hold: 1.2, txt: '耙子!', c: '#ff5a3c', size: 22 });
      this.game.audio.play('swing');
    }
    return z;
  }
  zombiesWon(zombie) {
    if (this.state !== 'playing') return;
    const m = this.mowers.find(m => m.row === zombie.row && m.state === 'idle');
    if (!m) {
      this.triggerLose(zombie.row);
    }
  }

  // 僵王实体引用 (#1: 进度条/投手瞄准/胜负判定共用)
  get bossZombie() {
    return this.zombies.find(z => z.type === 'BOSS' && !z.dead) || null;
  }

  // #1 僵王火球/冰球被克制消除 (原版 Plant::DoSpecial → BossDestroyFireball /
  //   BurnRow → BossDestroyIceballInRow: 寒冰菇冻爆火球, 辣椒烤化同行冰球)
  destroyBossBall(kind, row) {
    for (const pr of this.projectiles) {
      if (pr.dead || (pr.type !== 'bossfire' && pr.type !== 'bossice')) continue;
      if (kind === 'fire' && pr.type !== 'bossfire') continue;
      if (kind === 'ice' && pr.type !== 'bossice') continue;
      if (kind === 'ice' && row !== undefined && pr.row !== row) continue;
      const fxName = kind === 'fire' ? 'fire' : 'dust';
      try { this.addEffect(fxName, pr.x + 40, pr.y + 40, { hold: 0.5 }); } catch (e) { }
      this.game.audio.play(kind === 'fire' ? 'iceshroom' : 'jalapeno');
      pr.dead = true;
    }
  }

  // ---------- 主循环: 100Hz tick ----------
  update(dt) {
    if (this.state === 'win' || this.state === 'lose') { this.updateVisuals(dt); return; }
    // 奖励掉落阶段 (原版 TrySpawnLevelAward → 点击 → COIN_MOTION_LEVEL_TARGET 飞向屏幕中央)
    if (this.state === 'awarddrop') {
      this.updateLevelAward(dt); this.updateVisuals(dt);
      // #fix(僵王白旗): 原版奖励掉落期僵尸更新不冻结 — 僵王的死亡序列/白旗挥舞
      //   (flag_loop) 在玩家领奖前持续推进 (旧实现 awarddrop 直接 return → 驱动卡死)
      this._awardTickAcc = (this._awardTickAcc || 0) + dt * 100;
      let at = Math.floor(this._awardTickAcc);
      this._awardTickAcc -= at;
      if (at > 50) { at = 50; this._awardTickAcc = 0; }
      for (let i = 0; i < at; i++) {
        for (const z of this.zombies) {
          if (z.dead || z.type !== 'BOSS') continue;
          if (z.bodyReanim && !z.bodyReanim.dead) z.bodyReanim.updateTicks(1);
          z.update();
        }
      }
      return;
    }
    this.time += dt;
    // 注: dt 已是乘过 speed 的秒数 (main.js: sdt = dt * board.speed), 此处不再二次乘速
    // 固定步长累积器 (原版 100Hz): round→floor+余数进位, 高刷新率 (144/240Hz) 下
    // 不再产生 Math.max(1,round) 的倍速 (原 bug: 240Hz 时僵尸 2.4 倍速 "莫名加快")
    this._tickAcc = (this._tickAcc || 0) + dt * 100;
    let ticks = Math.floor(this._tickAcc);
    this._tickAcc -= ticks;
    if (ticks > 50) { ticks = 50; this._tickAcc = 0; }   // 防死亡螺旋
    const tickDt = dt;
    // 波次与天降阳光 (秒)
    this.updateWaves(tickDt);
    // 最后一波墓僵僵尸计时 (原版 mRiseFromGraveCounter 200tick)
    if (this.riseFromGraveTimer > 0) {
      this.riseFromGraveTimer -= tickDt;
      if (this.riseFromGraveTimer <= 0) {
        this.riseFromGraveTimer = 0;
        this.spawnZombiesFromGraves();
      }
    }
    // 原版 UpdateSunSpawning 排除表 (Board.cpp:5177-5195): 夜/浓雾/雨天/传送带/最后防线/罐子等无天降阳光;
    // 老虎机为白天场景 — 教学期 (TUTORIAL_SLOT_MACHINE_PULL, 首拉前) 不掉, 首拉后正常掉
    const slotSkySun = this.mode === 'slotmachine' && this.slotRolls > 0;
    if (this.level.skySun && (!this.mode || slotSkySun)) {
      this.skySunTimer -= tickDt;
      if (this.skySunTimer <= 0) {
        this.skySunTimer = CONST.SKY_SUN_INTERVAL[0] + Math.random() * (CONST.SKY_SUN_INTERVAL[1] - CONST.SKY_SUN_INTERVAL[0]);
        this.spawnSkySun();
      }
    }
    // 实体: 僵尸/植物按tick, 子弹按帧
    for (let i = 0; i < ticks; i++) {
      for (const z of this.zombies) {
        if (z.dead) continue;
        // 原版 100Hz 语义: 僵尸 reanim 与僵尸同一 tick 逐拍推进 —
        // 否则本帧 N 个 tick 采样同一对帧, _ground 非均匀关键帧下产生
        // "脉冲式突进" (快区 N×放大/慢区停滞), 视觉上僵尸莫名加快/顿挫
        if (z.bodyReanim && !z.bodyReanim.dead) z.bodyReanim.updateTicks(1);
        z.update();
      }
      for (const p of this.plants) if (!p.dead) p.tick && p.tick();
      this.tick++;
    }
    for (const p of this.plants) if (!p.dead) p.update(dt, this);
    for (const pr of this.projectiles) if (!pr.dead) pr.update(dt, this);
    for (const s of this.suns) s.update(dt, this);
    for (const c of this.coins) c.update(dt, this);
    for (const m of this.mowers) this.updateMower(m, dt);
    // 墓碑升起动画 (原版 mGridItemCounter 0→100; 打僵尸中途补墓也走此动画)
    for (const g of this.graves) {
      if (g.rise !== undefined && g.rise < 1) g.rise = Math.min(1, g.rise + dt * 1.6);
    }
    this.updateMode(dt);
    // 传送门战斗 (100Hz tick 语义)
    if (this.portals && this.state === 'playing') {
      const ptk = Math.max(1, Math.round(dt * 100));
      this.updatePortals(ptk);
    }
    this.updateVisuals(dt);
    // 清理
    this.plants = this.plants.filter(p => !p.dead);
    this.zombies = this.zombies.filter(z => !z.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.suns = this.suns.filter(s => !s.dead);
    this.coins = this.coins.filter(c => !c.dead);
    this.ladders = this.ladders.filter(l => !l.dead);
    this.checkWinLose();
  }
  get tick() { return this._tick || (this._tick = 0); }
  set tick(v) { this._tick = v; }

  updateVisuals(dt) {
    // 僵尸 body reanim 在 playing 态由 tick 循环逐 tick 推进, 此处不重复驱动;
    // win/lose/awarddrop 态 tick 循环未运行 → 用累积器按 dt 推进 (进屋/死亡动画继续)
    const tickLoopRan = this.state === 'playing';
    for (const r of this.reanims) {
      if (r.tickDriven && tickLoopRan) continue;
      r.update(dt);
    }
    this.reanims = this.reanims.filter(r => !r.dead);
    for (const e of this.effects) e.update(dt, this);
    this.effects = this.effects.filter(e => !e.dead);
    // 4-10 暴风雨夜 (#暴风雨: 雨滴粒子 + 周期闪电)
    if (this.level.stormy && this.state === 'playing') {
      this._rainT = (this._rainT || 0) - dt;
      if (this._rainT <= 0) {
        this._rainT = 0.016;
        for (let i = 0; i < 3; i++) {
          this.effects.push(new Effect('rain', Math.random() * 900 - 50, -20, { vy: 900 + Math.random() * 200, vx: -120 }));
        }
      }
      this._stormT = (this._stormT === undefined ? 8 : this._stormT) - dt;
      if (this._stormT <= 0) {
        // 原版 UpdateStormyNight: STORM_FLASH_TIME(150) + rand(300, 400|750) = 450~900tick
        this._stormT = 4.5 + Math.random() * 4.5;
        this.addEffect('lightning', 0, 0, { hold: 0.35 });
        this.game.audio.play('thunder' in this.game.audio ? 'thunder' : 'bossstomp');
      }
    }
    // 冰道衰减
    for (let r = 0; r < this.rows; r++) {
      if (this.iceTimers[r] > 0) {
        this.iceTimers[r] -= dt * 100;
        if (this.iceTimers[r] <= 0) { this.iceTimers[r] = 0; this.iceMinXs[r] = 900; }
      }
    }
    this.shakeX *= 0.85; this.shakeY *= 0.85;
    this.updateFog(dt);
  }

  // ---------- reanim 特效 ----------
  addReanimEffect(name, x, y, rate = 0) {
    const r = new RE.Reanimation(name);
    r.setPosition(x, y);
    if (rate) r.animRate = rate;
    this.reanims.push(r);
    return r;
  }
  addLimbParticle(kind, x, y, imgName, row) {
    // 掉落肢体: 原版 PARTICLE_ZOMBIE_HEAD/ARM 粒子 — 抛出+落地弹跳+静止后淡出
    // #修复(肢体落点): 传入僵尸所在行 — 头/手臂生成点在行上部(僵尸y-30), 旧实现按掉落
    //   像素位置反查行会落到上一行地面, 肢体悬空弹跳
    this.effects.push(new LimbParticle(kind, x, y, imgName, this, row));
  }

  // ---------- 波次计时 (已验证原版移植) ----------
  updateWaves(dt) {
    if (this.state !== 'playing') return;
    if (!this.wavesStarted) return;
    if (!this.waves.length) return;
    // 原版 Challenge::UpdateZombieSpawning 返回 true 阻断常规刷怪:
    // 我不是僵尸/罐子解谜/打僵尸 由 updateMode 全权管理出怪
    if (this.mode === 'izombie' || this.mode === 'vasebreaker' || this.mode === 'whack') return;
    if (this.wave >= this.totalWaves) {
      if (this.zombies.filter(z => z.fromWave !== -2 && !z.dead).length === 0) {
        // 最后防线: 阶段完成 → 下一建造期 (原版 LastStandCompletedStage 4879-4900)
        if (this.level.lastStand) { this.lastStandStageComplete(); return; }
        this.triggerWin();
      }
      return;
    }
    this.waveTimer -= dt;
    if (this.waveTimer > 2 && this._waveHP > 0) {
      const aliveHP = this.zombies.reduce((s, z) => s + (z.body + (z.helm || 0) + (z.shield || 0)), 0);
      if (aliveHP < this._waveHP * WAVE.ACCEL_THRESHOLD && this.time - this.lastWaveTime > 4) {
        this.waveTimer = Math.min(this.waveTimer, WAVE.ACCEL_DELAY);
      }
    }
    const nextW = this.wave;
    // 原版: 旗波(含最后一波)前 750tick 显示"一大波僵尸正在接近"红字, 停留至出怪
    if (this.waveTimer <= WAVE.HUGE_WAVE_WARN && this.waveTimer > 0 && !this.hugeWaveWarned) {
      const isFlagNext = this.waves[nextW] && this.waves[nextW].flag;
      if (isFlagNext) {
        this.hugeWaveWarned = true;
        Banners.show('approaching.png', WAVE.HUGE_WAVE_WARN, 'hugewave', this.game.audio);
      }
    }
    if (this.waveTimer <= 0) {
      // 原版 NextWaveComing: 最后一波出怪瞬间显示 FinalWave reanim + finalwave 音效(延迟0.6s)
      // (生存重选/最后 Stand/连续挑战不显示 — 对应 endless 关卡跳过)
      const spawning = this.waves[nextW];
      if (spawning && spawning.final && !this.level.endless) {
        Banners.showFinalWave(2.1, this.game.audio);
      }
      this.spawnWave();
    }
  }

  beginWaves() {
    if (this.wavesStarted) return;
    // 最后防线: 建造期不出怪 (原版 STATECHALLENGE_LAST_STAND_ONSLAUGHT 才开波)
    if (this.level.lastStand && this.lsPhase !== 'onslaught') return;
    this.wavesStarted = true;
    // 原版 Challenge::StartLevel 起手倒计时: 通用 200tick(2s);
    //   雪橇大丰收 4500tick / 跳跳派对 5500tick / 列队僵尸 2400tick
    this.waveTimer = this.level.startDelay || WAVE.FIRST_WAVE_DELAY; this._waveTimerStart = this.waveTimer;
    // 原版列队僵尸: StartLevel 置 mCurrentWave=9 → 首个出怪波 = 第10波(旗波)
    if (this.level.startWave) this.wave = this.level.startWave;
    this.hugeWaveWarned = false;
  }

  spawnWave() {
    this.wave++;
    if (this.wave > this.totalWaves) return;
    const w = this.waves[this.wave - 1];
    this.lastWaveTime = this.time;
    this.hugeWaveWarned = false;
    // 原版 NextWaveComing 音效: 首波 AWOOGA, 旗波 SIREN
    if (this.wave === 1) this.game.audio.play('awooga');
    else if (w.flag) this.game.audio.play('siren');
    const next = this.waves[this.wave];
    if (next && next.flag) { this.waveTimer = WAVE.BEFORE_FLAG; this._waveTimerStart = this.waveTimer; }
    else { this.waveTimer = WAVE.WAVE_DELAY + Math.random() * WAVE.WAVE_DELAY_RANGE; this._waveTimerStart = this.waveTimer; }

    const list = [];
    for (const [type, n] of w.types) {
      for (let i = 0; i < n; i++) list.push(type);
    }
    let hp = 0;
    for (const type of list) {
      const zd = ZOMBIES[type];
      hp += zd.body + (zd.helm || 0) + (zd.shield || 0);
      let row;
      // 传送门战斗: 行权重 (原版 PortalCombatRowSpawnWeight: 近割草机0.01/有门行1.0/其他0.2)
      if (this.level.portals && this.portals) {
        const rows = zd.water ? this.waterRows : this.grassRows.filter(r => !this.waterRows.includes(r));
        const entries = rows.map(r => [r, this.portalRowWeight(r)]);
        const tot = entries.reduce((s, [, wt]) => s + wt, 0);
        let rr = Math.random() * tot;
        row = rows[0];
        for (const [r0, wt] of entries) { rr -= wt; if (rr <= 0) { row = r0; break; } }
      } else if (zd.water) row = this.waterRows[Math.floor(Math.random() * this.waterRows.length)];
      else {
        const landRows = this.grassRows.filter(r => !this.waterRows.includes(r));
        row = landRows[Math.floor(Math.random() * landRows.length)];
      }
      this.spawnZombieForWave(type, row, this.wave - 1);
    }
    this._waveHP = hp;
    if (w.boss) {
      this.spawnZombieForWave('BOSS', 0, this.wave - 1);
      // #fix(boss-audio): 原版 Boss 生成 (PlayBossEnter/AddZombie) 不播任何音效 —
      //   evillaugh 属主菜单"冒险"按钮音 (GameSelector mStartingGameCounter==125)
    }
    // 原版: 最后一波刷出后 200tick → 墓碑/泳池/天空额外僵尸 (SpawnZombiesFromGraves/Pool/Sky)
    if (this.wave === this.totalWaves && !this.level.endless) {
      this.riseFromGraveTimer = 2;
    }
  }

  // 原版 Board::SpawnZombiesFromGraves — 最后一波从墓碑爬出僵尸
  spawnZombiesFromGraves() {
    const pool = this.waterRows.length > 0;
    if (this.isRoof) {
      this.spawnZombiesFromSky();
      return;
    }
    if (pool) {
      this.spawnZombiesFromPool();
      return;
    }
    for (const g of this.graves) {
      // 原版 PickGraveRisingZombieType: NORMAL / TRAFFIC_CONE 加权
      const ty = Math.random() < 0.75 ? 'NORMAL' : 'CONE';
      const z = this.spawnZombieForWave(ty, g.row, this.wave - 1);
      z.riseFromGrave(g.col, g.row);
    }
  }

  // 原版 SpawnZombiesFromPool — 泳池关最后一波从水里冒出 ( NORMAL/CONE/BUCKET )
  spawnZombiesFromPool() {
    const count = 2 + Math.floor(Math.random() * 2);
    const poolSquares = [];
    for (const r of this.waterRows) {
      for (let c = 1; c < 8; c++) {
        if (!this.getLilyAt ? !this.gridLily[r][c] : !this.getLilyAt(r, c)) poolSquares.push([r, c]);
      }
    }
    for (let i = 0; i < count && poolSquares.length; i++) {
      const [r, c] = poolSquares.splice(Math.floor(Math.random() * poolSquares.length), 1)[0];
      const roll = Math.random();
      const ty = roll < 0.55 ? 'DUCKY' : roll < 0.85 ? 'CONE' : 'BUCKET';
      const z = this.spawnZombieForWave(ty, r, this.wave - 1);
      z.riseFromGrave(c, r, true);
    }
  }

  // 原版 SpawnZombiesFromSky — 屋顶关最后一波蹦极投僵尸
  spawnZombiesFromSky() {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const c = 1 + Math.floor(Math.random() * 7);
      const r = this.grassRows[Math.floor(Math.random() * this.grassRows.length)];
      const ty = Math.random() < 0.6 ? 'NORMAL' : 'CONE';
      const z = this.spawnZombieForWave(ty, r, this.wave - 1);
      z.posX = this.gridX(c);
      z.x = Math.floor(z.posX);
      z.zombieHeight = H.FALLING;
      z.altitude = 400;
      z.velX = 0;
      try { z.playZombieReanim('anim_falling', RE.PLAY_ONCE_HOLD, 0, 20); } catch (e) { }
    }
  }

  spawnSkySun() {
    const col = Math.floor(Math.random() * 9);
    const targetY = this.gridY(Math.floor(Math.random() * this.rows)) + 40 + Math.random() * 30;
    this.suns.push(new Sun(this.gridX(col) + Math.random() * 40, -60, targetY, 'sky'));
  }

  // ---------- 打僵尸模式 (原版 WhackAZombie 系列) ----------
  // 原版 WhackAZombiePlaceGraves: 列3..8 随机格, 避开已有墓碑;
  // 原版权重: 有植物格 1 / 空格 100000; 新墓碑所在格的植物直接压死 (aPlant->Die())
  whackPlaceGraves(count) {
    const cells = [];
    for (let c = 3; c < 9; c++) {
      for (const r of this.grassRows) {
        if (this.graves.some(g => g.row === r && g.col === c)) continue;
        cells.push([r, c]);
      }
    }
    for (let i = 0; i < count && cells.length; i++) {
      // 原版权重抽取 (PvzpPickFromWeightedGridArray)
      let total = 0;
      for (const [r, c] of cells) total += (this.grid[r] && this.grid[r][c]) ? 1 : 100000;
      let pick = Math.random() * total, idx = cells.length - 1;
      for (let j = 0; j < cells.length; j++) {
        pick -= (this.grid[cells[j][0]] && this.grid[cells[j][0]][cells[j][1]]) ? 1 : 100000;
        if (pick <= 0) { idx = j; break; }
      }
      const [r, c] = cells.splice(idx, 1)[0];
      // 原版: 新墓碑压死该格植物 (墓碑会挤掉玩家的植物!)
      const plant = this.grid[r] && this.grid[r][c];
      if (plant && !plant.dead) {
        if (typeof plant.die === 'function') plant.die();
        plant.dead = true;
        this.addEffect('text', this.gridX(c) + 40, this.cellY(r, c) + 30, { hold: 1.1, txt: '墓碑压碎了植物!', c: '#ff8a6a', size: 15 });
      }
      this.graves.push({ row: r, col: c, rise: 0 });
      this.addEffect('dust', this.gridX(c) + 40, this.cellY(r, c) + 60);
      this.game.audio.play('gravebuttonchime');
    }
  }
  // 原版 WhackAZombieSpawning 组生成: 相位权重 + 墓碑随机 + 快速奔跑
  whackSpawnGroup() {
    const wave = this.whackWave;
    const isFinal = wave === this.whackWaves;
    // 相位 (原版 aPhase = clamp((wave-1)*6/12, 0, 5))
    const phase = Math.max(0, Math.min(5, Math.floor((wave - 1) * 6 / 12)));
    const doubleChance = [0, 30, 10, 10, 15, 18][phase];
    const tripleChance = [0, 0, 0, 0, 10, 13][phase];
    const pailChance = [0, 0, 0, 10, 15, 15][phase];
    const coneChance = [0, 0, 30, 30, 30, 30][phase];
    let count = 1;
    let type = 'NORMAL';
    if (isFinal) {
      count = 20;                       // 原版终波: 20 只倾巢而出
    } else {
      const numHit = Math.random() * 100;
      if (numHit < tripleChance) count = 3;
      else if (numHit < tripleChance + doubleChance) count = 2;
      const typeHit = Math.random() * 100;
      if (typeHit < pailChance && count < 3) type = 'BUCKET';
      else if (typeHit < pailChance + coneChance) type = 'CONE';
    }
    // 从现有墓碑中随机挑选 (原版 weighted array)
    // 原版: 正在被咬咬碑吃掉的墓碑不出僵尸 (aPlant->mSeedType != SEED_GRAVEBUSTER)
    const graves = this.graves.filter(g => {
      const p = this.grid[g.row] && this.grid[g.row][g.col];
      return !p || p.type !== 'GRAVEBUSTER';
    });
    count = Math.min(count, graves.length);
    // 原版 aMaxSpeed = PvzpAnimateCurve(1,12,wave, 1,3, EASE_IN) → 快速奔跑
    const maxSpeed = 1 + (Math.min(wave, 12) - 1) / 11 * 2;
    for (let i = 0; i < count; i++) {
      const g = graves.splice(Math.floor(Math.random() * graves.length), 1)[0];
      let ty = type, spd = maxSpeed;
      if (isFinal) { ty = Math.random() < 0.5 ? 'CONE' : 'BUCKET'; spd = 2; }
      const z = this.spawnZombieForWave(ty, g.row, wave);
      if (!z) continue;
      z.riseFromGrave(g.col, g.row);
      // 原版: RiseFromGrave 后 mPhaseCounter=50 → 跳过地下等待直接破土 (打僵尸节奏更快)
      z.phaseCounter = 50;
      // 原版 RandRangeFloat(0.5, aMaxSpeed) — 破土后按此速度奔跑 (pickRandomSpeed 尊重)
      z.whackSpeed = 0.5 + Math.random() * Math.max(0, spd - 0.5);
      try { z.updateAnimSpeed(); } catch (e) { }
    }
    // 组间隔 (原版 aStateCounterMin/Max: 100..200 → 30..60 tick 随 wave 线性)
    if (isFinal) {
      this.whackFinalSpawned = true;
      this.whackCountdown = 0;          // 原版: 终波后停止出怪
      this.whackSpawnCounter = 0x7fffffff;
    } else {
      const minC = 100 + (Math.min(wave, 12) - 1) / 11 * -70;
      const maxC = 200 + (Math.min(wave, 12) - 1) / 11 * -140;
      this.whackSpawnCounter = Math.round(minC + Math.random() * (maxC - minC));
    }
  }

  // ---------- 割草机 ----------
  updateMower(m, dt) {
    if (m.state === 'idle') {
      for (const z of this.zombies) {
        if (!z.dead && z.row === m.row && z.x < 90 && !z.flyingHigh && !z.isDeadOrDying && !z.boss && z.zombieHeight !== 1 && z.zombieHeight !== 9) {
          m.state = 'running';
          m.x = 0;
          this.game.audio.play(m.type === 'pool' ? 'pool_cleaner' : 'lawnmower');
          break;
        }
      }
    } else if (m.state === 'running') {
      m.x += 320 * dt;
      for (const z of this.zombies) {
        if (!z.dead && !z._mowedHit && z.row === m.row && !z.boss && Math.abs(z.x + 40 - m.x) < 60 && !z.isThrown) {
          z._mowedHit = true;
          z.mowDown();
        }
      }
      if (m.x > 900) m.state = 'gone';
    }
  }

  // ---------- 阳光/金币 ----------
  addSun(x, y, targetY, from, value) {
    const s = new Sun(x, y, targetY, from);
    if (value) s.value = value;
    this.suns.push(s);
    return s;
  }
  collectSun(s) {
    if (s.collected || s.dead) return;
    s.collected = true;
    this.sun += s.value;
    this.game.audio.play('points');
    try { const _U = (window.__mods && window.__mods['ui']) || require('./ui'); if (_U && _U.UI) _U.UI.sunPulse = 1; } catch (e) { }
  }
  addCoin(x, y, value = 25, type) {
    this.coins.push(new Coin(x, y, value, type));
    this.game.audio.play('coin');
  }
  // 礼物植物盒 (原版 COIN_PRESENT_PLANT: 点击开盒 → 随机植物入禅境花园)
  addPresent(x, y) {
    const c = new Coin(x, y, 0, 'present');
    c.kind = 'present'; c.life = 25;
    this.coins.push(c);
    this.game.audio.play('points');
  }
  // 巧克力 (原版 COIN_CHOCOLATE: 点击 → 巧克力库存+1, 上限10)
  addChocolateDrop(x, y) {
    const c = new Coin(x, y, 0, 'chocolate');
    c.kind = 'chocolate'; c.life = 18;
    this.coins.push(c);
    this.game.audio.play('points');
  }
  // 我不是僵尸: 植物被吃时掉落的阳光 (原版 COIN_SUN + COIN_MOTION_FROM_PLANT 弹出)
  addIZombieSun(x, y) {
    const s = new Sun(x + 10, y - 20, y + 25, 'plant');
    s.vx = (Math.random() - 0.5) * 60;
    this.suns.push(s);
    this.game.audio.play('points');
  }
  // 打僵尸: 击杀掉落的阳光 (原版 Zombie::DieWithLoot → AddCoin COIN_SUN + COIN_MOTION_COIN
  // — 从僵尸位置弹出、落地弹跳、待拾取; 每颗 25 阳光, 一次掉 3 颗)
  addWhackSun(x, y) {
    const s = new Sun(x, y - 30, y + 15 + Math.random() * 10, 'coin');
    s.vy = -170 - Math.random() * 60;
    s.vx = (Math.random() - 0.5) * 50;
    this.suns.push(s);
  }
  addProjectile(type, x, y, row, opts = {}) {
    const pr = new Projectile(type, x, y, row, this, opts);
    this.projectiles.push(pr);
    return pr;
  }

  // ---------- 特效 ----------
  addEffect(name, x, y, opts = {}) {
    const e = new Effect(name, x, y, opts);
    this.effects.push(e);
    return e;
  }

  // ---------- 胜负 ----------
  checkWinLose() {
    // 我不是僵尸: 僵尸进屋 = 吃到脑子 = 胜利 (由 updateMode 判定)
    if (this.mode === 'izombie') return;
    // 打僵尸/砸罐子模式: 失败判定由僵尸自身 checkForBoardEdge 处理
    // (原版 Zombie.cpp:4566 — 僵尸带 头到达 BOARD_EDGE → ZombiesWon 判负, 两模式均无豁免;
    //   旧实现"到左侧直接消失"是错的 — 会抢先在 -70 杀掉僵尸导致永远无法判负)
    if (this.mode === 'whack' || this.mode === 'vasebreaker') return;
    for (const z of this.zombies) {
      if (!z.dead && !z.boss && z.x < -60 && z.hasHead) {
        if (z.flyingHigh) { this.triggerLose(z.row); return; }
        const m = this.mowers.find(m => m.row === z.row && m.state === 'idle');
        if (!m) { this.triggerLose(z.row); return; }
      }
    }
  }
  triggerWin() {
    if (this.state === 'win' || this.state === 'awarddrop') return;
    const game = this.game;
    // 冒险模式普通关: 原版最后一僵尸死处掉奖励卡 → 点击后飞向屏幕中央放大 → 奖励屏
    if (!game.modeKey && this.level.id && this.level.id <= 50) {
      const award = awardForLevel(this.level.id);
      if (award) {
        this.state = 'awarddrop';
        const kx = this.lastKill ? this.lastKill.x : 400;
        const ky = this.lastKill ? this.lastKill.y : 300;
        this.levelAward = {
          ...award,
          x: Math.max(180, Math.min(580, kx)),
          y: Math.max(200, Math.min(440, ky)),
          vx: (Math.random() - 0.5) * 60,
          vy: -170,
          phase: 'drop',   // drop(掉落弹跳) → wait(待点击) → fly(飞向中央) → done
          t: 0,
        };
        this.levelAward.groundY = Math.min(500, this.levelAward.y + 55);
        game.audio.play('seedlift');
        return;
      }
    }
    this.state = 'win';
    this.game.audio.play('winmusic');
    this.game.onLevelWin();
  }

  // 奖励掉落物推进 (掉落物理 / 飞行动画)
  updateLevelAward(dt) {
    const a = this.levelAward;
    if (!a || a.phase === 'done') return;
    a.t += dt;
    if (a.phase === 'drop') {
      a.vy += 600 * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.y >= a.groundY) {
        a.y = a.groundY;
        if (Math.abs(a.vy) > 60) { a.vy = -a.vy * 0.35; a.vx *= 0.5; }
        else { a.vy = 0; a.vx = 0; a.phase = 'wait'; a.t = 0; }   // #6 落地停稳: 水平速度一并归零 (原版 Coin 落地即停)
      }
    } else if (a.phase === 'fly') {
      // 原版 COIN_MOTION_LEVEL_TARGET: 0.5s 飞向屏幕中央 + 放大 + 旋转
      const p = Math.min(1, a.t / 0.5);
      const ease = 1 - Math.pow(1 - p, 2);
      a.fx = a.fx0 + (400 - a.fx0) * ease;
      a.fy = a.fy0 + (270 - a.fy0) * ease;
      a.fscale = 1 + 2.2 * ease;
      a.frot = a.frot0 + ease * Math.PI * 2;
      if (p >= 1) {
        a.phase = 'done';
        this.state = 'win';
        this.levelAward = null;
        this.game.audio.play('points');
        this.game.onLevelWin();
      }
    }
  }

  // 点击奖励掉落物 → 起飞 (原版 LevelAwardClicked)
  clickLevelAward(p) {
    const a = this.levelAward;
    if (!a || a.phase !== 'wait') return false;
    const hitR = a.type === 'seed' ? 40 : 36;
    if (Math.abs(p.x - a.x) < hitR + 14 && Math.abs(p.y - a.y) < hitR + 14) {
      a.phase = 'fly';
      a.t = 0;
      a.fx0 = a.x; a.fy0 = a.y;
      a.fx = a.x; a.fy = a.y;
      a.fscale = 1; a.frot0 = 0; a.frot = 0;
      this.game.audio.play('buttonclick');
      return true;
    }
    return false;
  }

  // 记录僵尸死亡位置 (奖励掉落点)
  _noteKill(z) {
    if (z.row >= 0) this.lastKill = { x: z.posX + 40, y: z.posY + 60 };
  }

  triggerLose(row) {
    if (this.state === 'lose') return;
    this.state = 'lose';
    this.game.audio.play('scream');
    this.game.audio.stopBGM();
    this.game.onLevelLose(row);
  }

  // ---------- 查询 ----------
  zombiesInRow(row, minX = -100, maxX = 900) {
    return this.zombies.filter(z => !z.dead && z.row === row && z.x >= minX && z.x <= maxX &&
      z.hittable !== false && !z.underwater && !z.underground && !z.boss && !z.mindControlled);   // 原版: 植物不攻击被魅惑僵尸
  }
  firstZombieInRow(row, fromX, toX) {
    let best = null;
    for (const z of this.zombies) {
      if (z.dead || z.row !== row || z.hittable === false || z.boss || z.mindControlled) continue;
      const zx = z.hitX();
      if (zx >= fromX && zx <= toX) {
        if (!best || zx < best.hitX()) best = z;
      }
    }
    return best;
  }
  plantAt(row, col) { return this.grid[row][col]; }
  eatTargetAt(row, col) {
    const pk = this.gridPumpkin[row][col];
    if (pk && !pk.dead) return pk;
    return this.grid[row][col];
  }
  fogLevel(x) {
    if (this.scene !== 'fog') return 0;
    // 迷雾只在右半区 (原版 fogOffset 期间整体右移)
    return 1;
  }
  // ---- 雾 (原版语义) ----
  leftFogColumn() {
    const lv = this.level.id;
    if (lv === 31) return 6;
    if (lv >= 32 && lv <= 36) return 5;
    if (lv >= 37 && lv <= 40) return 4;
    return 5;
  }
  maxFogOffset() { return 1065 - this.leftFogColumn() * 80; }
  blowFog(seconds = 20) { this.fogBlown = seconds; }   // 三叶草
  updateFog(dt) {
    if (this.scene !== 'fog') return;
    // 偏移 (原版 UpdateGame: blown 倒计时 2000tick, offset = max*easeOut)
    if (this.fogBlown > 0) {
      this.fogBlown = Math.max(0, this.fogBlown - dt);
      const p = this.fogBlown / 20;
      this.fogOffset = this.maxFogOffset() * easeOut01(Math.min(1, p));
    } else {
      this.fogOffset = 0;
    }
    // 单元格淡入 (原版 3/tick@100Hz = 300/s; blown 返回期 1/tick=100/s; 最左列上限 200)
    const left = this.leftFogColumn();
    const speed = this.fogBlown > 0 ? 100 : 300;
    for (let x = left; x < 9; x++) {
      const mx = x === left ? 200 : 255;
      for (let y = 0; y < 7; y++) {
        this.gridCelFog[x][y] = Math.min(mx, this.gridCelFog[x][y] + speed * dt);
      }
    }
    // 路灯花/火炬树清除 (原版 ClearFogAroundPlant: 6/tick = 600/s)
    for (const p of this.plants) {
      if (p.dead || p.notOnGround) continue;
      if (p.type === 'PLANTERN') this.clearFogAround(p.col, p.row, 4, dt);
      else if (p.type === 'TORCHWOOD') this.clearFogAround(p.col, p.row, 1, dt);
    }
  }
  clearFogAround(col, row, size, dt) {
    const fadeOut = 600 * dt;   // 原版 6/tick@100Hz
    const offX = Math.round((this.fogOffset + 50) / 100);
    for (let x = Math.max(0, col - size - offX); x <= Math.min(8, col + size - offX); x++) {
      for (let y = Math.max(0, row - size); y <= Math.min(6, row + size); y++) {
        const dx = Math.abs(x + offX - col), dy = Math.abs(y - row);
        if (size === 4) {
          if (dx > 3 || dy > 2) continue;
          if (dx + dy === 5) continue;
        } else if (dx + dy > size) continue;
        this.gridCelFog[x][y] = Math.max(0, this.gridCelFog[x][y] - fadeOut);
      }
    }
  }
  // ============================================================
  // 特殊模式系统 (传送带 / 坚果保龄球 / 打僵尸 / 罐子解谜 / 我不是僵尸 / 雨天种子 / 无尽生存)
  // ============================================================
  initMode() {
    const f = this.level.fixed;
    this.mode = null;
    this.modeData = {};
    // 最后防线 (原版 LAST_STAND): 建造期→进攻循环, 共 5 面旗 (LAST_STAND_FLAGS)
    if (this.level.lastStand) {
      this.lsStage = 0;
      this.lsPhase = 'build';
    }
    // 雪橇大丰收 (原版 StartLevel: 非水池行冰道 mIceMinX=400 + 永冻 mIceTimer=INT_MAX)
    if (this.level.iceZone) {
      for (let r = 0; r < this.rows; r++) {
        if (this.waterRows.includes(r)) continue;
        this.iceMinXs[r] = this.level.iceZone;
        this.iceTimers[r] = 1e9;
      }
    }
    if (f === 'bowling' || f === 'bowling2' || f === 'conveyor' || f === 'boss') {
      // 传送带种子银行 (原版 HasConveyorBeltSeedBank: 无阳光经济, 卡从右侧滚动而来)
      this.mode = 'conveyor';
      // ---- 原版 Challenge.cpp 传送带卡池 (PvzpWeightedArray 精确权重) ----
      // 1-5 保龄球: WALLNUT 85/EXPLODE_O_NUT 15; 保龄球·极(bowling2): +GIANT 15
      // X-10/3-5/4-10/5-5/5-10: 固定专属卡池; 小游戏变体: conveyorPool 指定
      const game = this.game;
      const poolKey = this.level.conveyorPool || (this.level.id && this.level.id <= 50 ? this.level.id : null);
      if (f === 'bowling') {
        this.beltPool = [['WALLNUT', 85], ['EXPLODEONUT', 15]];
      } else if (f === 'bowling2') {
        this.beltPool = [['WALLNUT', 85], ['EXPLODEONUT', 15], ['GIANTWALLNUT', 15]];
      } else if (f === 'boss') {
        // 原版 Boss 关卡卡池 (Challenge.cpp): 花盆55/西瓜10/辣椒12/卷心菜10/玉米5/寒冰8
        this.beltPool = [['FLOWERPOT', 55], ['MELONPULT', 10], ['JALAPENO', 12], ['CABBAGEPULT', 10], ['KERNELPULT', 5], ['ICESHROOM', 8]];
      } else if (poolKey && CONVEYOR_POOLS[poolKey]) {
        this.beltPool = CONVEYOR_POOLS[poolKey].map(e => e.slice());
      } else {
        this.beltPool = (this.level.id <= 50 ? availablePlants(this.level.id, game && game.purchasedSet) : availablePlants(50, game && game.purchasedSet));
      }
      // 原版 SeedBank::AddSeed/UpdateConveyorBelt: 卡片 offsetX 从右侧 515-(51)*n 起, 每4tick左移1px(25px/s)
      // 槽位 x = 91 + i*50
      // 原版 Challenge::UpdateConveyorBelt 1390-1406 发卡间隔倍率:
      //   Boss ×0.875 / 铲子关·传送门 ×1.5 / 隐形僵尸 ×2.0 / 列队僵尸 ×3.0 (其余 ×1)
      const ck = this.level.conveyorPool;
      const beltMult = f === 'boss' ? 0.875 : (ck === 'portal_combat' ? 1.5 : (ck === 'invisighoul' ? 2.0 : (ck === 'column' ? 3.0 : 1)));
      this.belt = { items: [], counter: 0, spawnT: 0.1, isBoss: f === 'boss', mult: beltMult };
      // 原版 Challenge::StartLevel/InitLevel 开局预发卡 + 首卡延迟:
      //   保龄球: 1 张坚果 + 400tick; Boss: 4 张固定卡 + 1000tick;
      //   列队僵尸: 6 张 (土豆雷/高坚果/西瓜/磁力菇/咖啡豆/西瓜) + 1000tick (InitLevel);
      //   隐形僵尸: 2 张 (豌豆/寒冰菇) + 200tick; 小僵尸/暴风雨/蹦极: 空带 + 200tick;
      //   传送门: 空带 + 立即 (counter=0)
      if (f === 'bowling' || f === 'bowling2') {
        this.belt.items.push({ type: 'WALLNUT', offset: 515, active: true });
        this.belt.spawnT = 4;
      }
      if (f === 'boss') {
        for (const t of ['CABBAGEPULT', 'JALAPENO', 'CABBAGEPULT', 'ICESHROOM']) this.belt.items.push({ type: t, offset: 515, active: true });
        this.belt.spawnT = 10;
      }
      if (ck === 'column') {
        for (const t of ['POTATOMINE', 'TALLNUT', 'MELONPULT', 'MAGNETSHROOM', 'COFFEEBEAN', 'MELONPULT']) this.belt.items.push({ type: t, offset: 515, active: true });
        this.belt.spawnT = 10;   // 原版 InitLevel counter=1000
      }
      if (ck === 'invisighoul') {
        this.belt.items.push({ type: 'PEASHOOTER', offset: 515, active: true });
        this.belt.items.push({ type: 'ICESHROOM', offset: 515, active: true });
        this.belt.spawnT = 2;    // 原版 StartLevel counter=200
      }
      if (ck === 'little_trouble' || ck === 'stormy_night' || ck === 'bungee_blitz') {
        this.belt.spawnT = 2;    // 原版 StartLevel conveyorCounter=200
      }
      this.sun = 0;
      this.seedCards = [];
      // ---- 传送门战斗 (原版 PortalStart Challenge.cpp 2870-2906):
      //      SQUARE(2,0)↔SQUARE(9,1) / CIRCLE(9,3)↔CIRCLE(2,4); 搬家计时 9000tick ----
      if (this.level.portals) {
        this.portals = [
          { kind: 'square', col: 2, row: 0, anim: null, closing: false },
          { kind: 'square', col: 9, row: 1, anim: null, closing: false },
          { kind: 'circle', col: 9, row: 3, anim: null, closing: false },
          { kind: 'circle', col: 2, row: 4, anim: null, closing: false },
        ];
        this.portalCounter = 9000;
      }
    } else if (f === 'whack') {
      // 打僵尸 (原版 2-5 / 小游戏): 锤子光标 + 墓碑刷怪 + 击杀掉阳光购买植物
      this.mode = 'whack';
      this.whackScore = 0;
      this.sun = 0;
      // 原版 Board.cpp:1495-1499 三张卡: 土豆雷 / 咬咬碑(墓碑吞噬者) / 冒险=樱桃炸弹 小游戏=寒冰菇
      const third = this.level.mode === 'minigame' ? 'ICESHROOM' : 'CHERRYBOMB';
      this.seedCards = [
        { type: 'POTATOMINE', cd: 0 },
        { type: 'GRAVEBUSTER', cd: 0 },
        { type: third, cd: 0 },
      ];
      // 原版 Board::PickZombieWaves (Board.cpp:576): 冒险 2-5 = 8 波, 小游戏 = 12 波
      this.whackWaves = this.level.mode === 'minigame' ? 12 : 8;
      this.whackWave = 0;
      this.whackCountdown = 200;     // 原版 StartLevel: 200tick (2s 后第一波)
      this.whackSpawnCounter = 0;
      this.whackFinalSpawned = false;
      // 原版种子银行初始隐藏于屏上 (mY=-87), 首次获得阳光后滑入 (Challenge.cpp:1923 +2/帧)
      this.seedBankY = -87;
      this.whackBankShown = false;
      this.whackFlashT = 0;          // 原版 TUTORIAL_WHACK_A_ZOMBIE_*: 卡片闪烁提示玩家用阳光买植物
      // 原版 Board::InitLevel (Board.cpp:1077): 开局随机长出 9 座墓碑 (刷怪点)
      this.whackPlaceGraves(9);
    } else if (f === 'vasebreaker') {
      // 罐子解谜 (原版 ScaryPotter): 按原版配方摆罐, 点击锤碎 → 植物/僵尸/阳光
      this.mode = 'vasebreaker';
      this.sun = 0;
      // 原版 Board.cpp:1490: 罐子关种子银行仅 1 格樱桃炸弹 (阳光罐攒阳光后可用)
      this.seedCards = [{ type: 'CHERRYBOMB', cd: 0 }];
      this.vases = [];
      this.vasePackets = [];   // 砸出的可用种子包 (点击拾取 → 免费种植)
      this.mallet = null;      // 锤子动画 (Hammer.reanim anim_open_pot)
      this.potStage = 0;       // 冒险 4-5: 原版 mSurvivalStage 三轮 / 无尽: 轮数
      this.vaseDave = null;    // 轮间戴夫过场 (冒险 4-5)
      this.initVasebreaker();
    } else if (f === 'izombie') {
      // 我不是僵尸 (原版 I Zombie): 指挥僵尸吃掉脑子
      this.mode = 'izombie';
      this.sun = this.level.startSun || 150;
      // 原版 IZ1 卡槽: 普僵50 / 铁桶125 / 橄榄球175 (GetCost 原版价格)
      this.zombieCards = [
        { type: 'NORMAL', cost: 50 }, { type: 'BUCKET', cost: 125 }, { type: 'FOOTBALL', cost: 175 },
      ];
      // 红线位置 (原版 Challenge::DrawBackdrop: IZ1-5 红线 x=352 → 前4列可种植物)
      this.izombieLimit = 4;
      // 脑子 (原版 IZombieInitLevel: 每行1个, 70口咬完)
      this.brains = this.grassRows.map(r => ({ row: r, hp: 70, eaten: false }));
      this.brainsEaten = 0;
      // 预置植物防线 (原版 IZombiePlacePlantInSquare 固定布局, 左4列)
      this.izSetup();
    } else if (f === 'slotmachine') {
      // 老虎机 (原版 Slot Machine): 3 转轮即种子银行; 拉杆 25 阳光; 2000 分胜利
      this.mode = 'slotmachine';
      this.sun = this.level.startSun || 50;
      // 原版 Board::InitLevel 1386-1392: 三转轮初始面 = 向日葵/豌豆/雪花豌豆
      this.slotReels = [
        { type: 'SUNFLOWER', next: null, pos: 0, cd: 0 },
        { type: 'PEASHOOTER', next: null, pos: 0, cd: 0 },
        { type: 'SNOWPEA', next: null, pos: 0, cd: 0 },
      ];
      this.slotRolls = 0;        // 原版 mSlotMachineRollCount (<3 时拉杆闪烁提示)
      this.slotPayouts = [];     // 赔付掉落物: {kind, plant?, x, y, vy, vx, ground, life, taken}
      this.slotSpinning = false; // 原版 STATECHALLENGE_SLOT_MACHINE_ROLLING
      // 种子银行视图: 3 转轮即 3 卡 (点击选卡 → 种植消耗阳光)
      this.seedCards = this.slotReels.map(r => ({ type: r.type, cd: 0 }));
    } else if (f === 'beghouled') {
      // 消消乐 / 消消乐·转 (原版 Beghouled): 8×5 植物棋盘 + 三连消除 + 僵尸啃食
      this.mode = 'beghouled';
      this.begTwist = !!this.level.beghouledTwist;
      this.begScore = 0;             // 原版 mChallengeScore (75 胜)
      this.begState = 'idle';        // idle(NORMAL) | moving | falling | nomoves
      this.begStateT = 1500;         // 原版 StartLevel: mChallengeStateCounter=1500
      this.begSel = null;            // 交换模式点选格
      this.begTwistSel = null;       // 旋转悬停 2×2 锚点
      this.begEated = Array.from({ length: 9 }, () => new Array(5).fill(false));   // 弹坑 (僵尸吃掉)
      this.begUpgrades = { REPEATER: false, FUMESHROOM: false, TALLNUT: false };
      this.begMatchesThisMove = 0;
      this.sun = 0;
      this.seedCards = [];           // 首次消除后解锁 4-5 张功能卡
      this.beghouledMakeStartBoard();
      this.addEffect('text', 400, 130, { hold: 4, txt: this.begTwist ? '点击旋转 2×2 方格, 凑三连!' : '拖动交换相邻植物, 凑三连!', c: '#ffe9a8', size: 16 });
    } else if (f === 'zombiquarium') {
      // 僵尸水族馆 (原版 Zombiquarium): 自由游动的潜水僵尸 + 喂脑子产阳光 + 1000 分买奖杯
      this.mode = 'zombiquarium';
      this.sun = this.level.startSun || 50;
      this.brains = [];              // {x,y,t}
      // 原版种子银行 2 格: 潜水僵尸 $100 / 奖杯 $1000
      this.seedCards = [
        { type: 'ZQ_SNORKLE', cd: 0 },
        { type: 'ZQ_TROPHY', cd: 0 },
      ];
      this.aqSpawnSnorkle();
      this.aqSpawnSnorkle();         // 原版 StartLevel: 开局 2 只
    } else if (this.level.rainingSeeds) {
      // 雨天种子: 种子包从天而降 (原版 It's Raining Seeds)
      // 原版 InitLevel: mChallengeStateCounter=100 → 首包 1s 后落地
      this.mode = 'raining';
      this.rainCards = [];
      this.rainT = 1;
      this.heldCards = [];
    }
    if (this.level.endless) this.mode = this.mode || 'endless';
  }

  izSetup() {
    // 我不是僵尸植物防线 (原版 IZombiePlacePlantInSquare 固定布局: 左4列 = izombieLimit)
    // 原版 IZ1 风格: 每行 向日葵×2 + 豌豆×2 (向日葵被吃掉阳阳光经济来源)
    const layoutsKey = this.level.izLayout || 'sp1';
    const layouts = {
      sp1: [
        ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'PEASHOOTER'],
        ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'SNOWPEA'],
        ['SUNFLOWER', 'SUNFLOWER', 'REPEATER', 'PEASHOOTER'],
        ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'PEASHOOTER'],
        ['SUNFLOWER', 'SUNFLOWER', 'SNOWPEA', 'REPEATER'],
        ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'PEASHOOTER'],
      ],
      hard1: [
        ['SUNFLOWER', 'SNOWPEA', 'REPEATER', 'WALLNUT'],
        ['SUNFLOWER', 'REPEATER', 'REPEATER', 'WALLNUT'],
        ['SUNFLOWER', 'SNOWPEA', 'PEASHOOTER', 'TALLNUT'],
        ['SUNFLOWER', 'REPEATER', 'SNOWPEA', 'WALLNUT'],
        ['SUNFLOWER', 'PEASHOOTER', 'REPEATER', 'TALLNUT'],
        ['SUNFLOWER', 'SNOWPEA', 'REPEATER', 'WALLNUT'],
      ],
      hard2: [
        ['SUNFLOWER', 'REPEATER', 'REPEATER', 'TALLNUT', 'PUMPKIN'],
        ['SUNFLOWER', 'SNOWPEA', 'REPEATER', 'WALLNUT', 'PUMPKIN'],
        ['SUNFLOWER', 'REPEATER', 'SNOWPEA', 'TALLNUT', 'PUMPKIN'],
        ['SUNFLOWER', 'REPEATER', 'REPEATER', 'WALLNUT', 'PUMPKIN'],
        ['SUNFLOWER', 'SNOWPEA', 'REPEATER', 'TALLNUT', 'PUMPKIN'],
        ['SUNFLOWER', 'REPEATER', 'REPEATER', 'WALLNUT', 'PUMPKIN'],
      ],
    }[layoutsKey] || [];
    const limit = this.izombieLimit || 4;
    for (let r = 0; r < this.rows; r++) {
      const lay = layouts[r % layouts.length].slice(0, limit + 1);
      lay.forEach((ty, i) => {
        const col = i;   // 原版: 植物只出现在红线左侧列内 (0..limit-1)
        if (ty === 'PUMPKIN') {
          // 南瓜壳套在 (limit-1) 列植物外
          const c2 = Math.min(i, limit - 1);
          const inner = this.grid[r][c2];
          if (inner && !this.gridPumpkin[r][c2]) {
            const pk = new (this._plantClass())('PUMPKIN', r, c2, this);
            pk.izombiePlant = true;
            this.plants.push(pk);
            this.gridPumpkin[r][c2] = pk;
          }
          return;
        }
        const p = new (this._plantClass())(ty, r, col, this);
        p.izombiePlant = true;   // 纸牌植物: 不动画不生产 (原版 IZombieSetupPlant)
        this.plants.push(p);
        this.grid[r][col] = p;
      });
    }
  }
  _plantClass() {
    const m = (window.__mods && window.__mods['plants']) || require('./plants');
    return m.Plant;
  }

  // ---------- 罐子解谜: 原版 Challenge::ScaryPotterPopulate 1:1 ----------
  initVasebreaker() {
    const isAdv = !this.level.mode;              // 冒险 4-5 vs 解谜模式
    let R;
    if (isAdv) {
      R = VASE_ADVENTURE_STAGES[Math.min(this.potStage, 2)];
    } else {
      const key = this.level.vaseRecipe || 'sp1';
      R = VASE_RECIPES[key] || VASE_RECIPES.sp1;
    }
    // 原版: 全网格每格权重1 → ScaryPotterDontPlaceInCol 清零禁列 → 抽取后清零
    const cells = [];
    for (let c = 0; c < 9; c++) {
      if (R.excl.includes(c)) continue;
      for (let r = 0; r < this.rows; r++) cells.push([r, c]);
    }
    shuffleB(cells);
    // 展开配方 → 内容列表 (无尽: 巨人随轮数增, 普僵相应减, 原版 aNumExtraGargantuars)
    const contents = [];
    let gargc = 0;
    for (const [kind, ty, n] of R.pots) {
      let count = n;
      if (n === -1) {   // spE 动态数量
        if (ty === 'NORMAL') count = 8 - Math.min(8, Math.floor(this.potStage / 10));
        if (ty === 'GARGANTUAR') { gargc = 1 + Math.min(8, Math.floor(this.potStage / 10)); count = gargc; }
      }
      for (let i = 0; i < count; i++) contents.push([kind, ty]);
    }
    const nVases = Math.min(contents.length, cells.length);
    for (let i = 0; i < nVases; i++) {
      const [row, col] = cells[i];
      const [kind, ty] = contents[i];
      // 原版: 装巨人的罐显示 ZOMBIE 脸 (玩家可辨识规避)
      const state = (kind === 'z' && ty === 'GARGANTUAR') ? 'zombie' : 'question';
      this.vases.push({
        row, col, broken: false, rising: 0,
        content: kind === 'p' ? ty : kind === 'sun' ? null : ty,
        isPlant: kind === 'p',
        isSun: kind === 'sun',
        sunCount: kind === 'sun' ? 1 + Math.floor(Math.random() * 3) : 0,  // 原版 Rand(3)+1
        state,   // question | leaf | zombie (原版三态贴图列)
      });
    }
    // 原版 ScaryPotterChangePotType(LEAF, n): 随机挑种子罐 → 叶子预揭示
    const seedVases = this.vases.filter(v => v.isPlant && v.state === 'question');
    shuffleB(seedVases);
    for (let i = 0; i < Math.min(R.leaf || 0, seedVases.length); i++) seedVases[i].state = 'leaf';
  }

  // 冒险 4-5 轮间戴夫 (原版 UpdateLevelEndSequence + AdvanceCrazyDaveDialog)
  startVaseDave() {
    const stage = this.potStage;
    this.vaseDave = {
      stage,
      lines: stage === 0
        ? ['看！清干净了！', '不过别高兴太早——', '我再给你一些罐子！']
        : ['干得漂亮！', '这应该是他们的最后一波了！'],
      line: -1,
      phase: 'enter',
      t: 0,
      anim: null,
    };
    this.game.audio.play('hugewave');
  }
  updateVaseDave(dt) {
    const d = this.vaseDave;
    if (!d) return;
    d.t += dt;
    if (!d.anim && RE.hasDef('CrazyDave')) {
      const a = Assets.reanim('CrazyDave');
      // 原版: 罐子关戴夫与过场相同 — 屏幕空间 (0,0) 无缩放 (IsScaryPotterDaveTalking → aScreenSpace)
      a.x = 0; a.y = 0;
      d.anim = a;
    }
    if (d.phase === 'enter') {
      if (d.anim) d.anim.update(dt);
      if (!d._played) {
        d._played = true;
        if (d.anim) d.anim.play('anim_enter', RE.PLAY_ONCE_HOLD, 24);
        this.game.audio.play('dave_short');
      }
      if (d.t >= 0.75) { d.phase = 'talk'; d.line = 0; d.talkT = 0; }
    } else if (d.phase === 'talk') {
      d.talkT = (d.talkT || 0) + dt;
      if (d.anim) {
        d.anim.update(dt);
        if (d.talkT > 1.8) {
          d.talkT = 0;
          const next = ['anim_smalltalk', 'anim_mediumtalk', 'anim_blahblah'][Math.floor(Math.random() * 3)];
          d.anim.play(next, RE.LOOP, 16 + Math.random() * 8);
          this.game.audio.play(Math.random() < 0.5 ? 'dave_short' : 'dave_medium');
        }
      }
    } else if (d.phase === 'repopulate') {
      // 原版 PuzzleNextStageClear: 清场后 ScaryPotterPopulate
      this.potStage++;
      for (const z of this.zombies) if (!z.dead && z.fromWave !== -2) z.dieNoLoot();
      for (const p of this.plants) if (!p.dead) p.dead = true;
      this.vasePackets = [];
      this.game.freePlant = null;
      this.vases = [];
      this.initVasebreaker();
      this.game.audio.play('plant');
      d.phase = 'leave';
      d.t = 0;
      if (d.anim) d.anim.play('anim_leave', RE.PLAY_ONCE_HOLD, 22);
      this.game.audio.play('dave_short');
    } else if (d.phase === 'leave') {
      if (d.anim) d.anim.update(dt);
      if (d.t >= 0.62) this.vaseDave = null;
    }
  }
  vaseDaveClick(game) {
    const d = this.vaseDave;
    if (!d) return false;
    if (d.phase === 'enter') { d.t = Math.max(d.t, 0.74); return true; }
    if (d.phase === 'talk') {
      d.line++;
      if (d.line >= d.lines.length) { d.phase = 'repopulate'; return true; }
      game.audio.play(Math.random() < 0.5 ? 'dave_short' : 'dave_medium');
      return true;
    }
    return true;
  }

  // ============================================================
  // 看星星 (原版 Seeing Stars: gArtChallengeStarFruit 星形阵)
  // ============================================================
  starPatternCells() {
    // 原版 Challenge.h:505 gArtChallengeStarFruit (5行×9列, 14 格)
    return [[3,0],[3,1],[4,1],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[3,3],[4,3],[5,3],[3,4],[6,4]];
  }
  checkStarPattern(game) {
    // 原版 CheckForCompleteArtChallenge: 全部阵点格顶植物为杨桃 → SpawnLevelAward (奖杯)
    if (!this.level.starPattern || this.state !== 'playing') return;
    const done = this.starPatternCells().every(([c, r]) => {
      const p = this.grid[r] && this.grid[r][c];
      return p && !p.dead && p.type === 'STARFRUIT';
    });
    if (done) {
      game.audio.play('points');
      this.addEffect('present_pickup', 360, 240);
      this.triggerWin();
    }
  }

  // ============================================================
  // 老虎机 (原版 Slot Machine — SeedPacket.cpp 57-107 + Challenge.cpp 1052-1071/1762-1852)
  // ============================================================
  pickSlotSeed(reelIdx) {
    // 原版 SLOT_SEED_TYPES 权重: 基砑100; 豌豆 200→100 (场上0→5棵线性);
    //   钻石 30; 第3轮与前两轮 next 同符号 +50% (控连胜率)
    const peas = this.plants.filter(p => !p.dead && p.type === 'PEASHOOTER').length;
    const SYMS = ['SUNFLOWER', 'PEASHOOTER', 'SNOWPEA', 'WALLNUT', 'SLOT_SUN', 'SLOT_DIAMOND'];
    const entries = SYMS.map(s => {
      let w = 100;
      if (s === 'PEASHOOTER') w = 200 - 100 * Math.min(5, peas) / 5;
      else if (s === 'SLOT_DIAMOND') w = 30;
      if (reelIdx === 2 && s !== 'SLOT_DIAMOND') {
        if (this.slotReels[0].next === s || this.slotReels[1].next === s) w += w / 2;
      }
      return [s, w];
    });
    let total = entries.reduce((t, [, w]) => t + w, 0);
    let r = Math.random() * total;
    for (const [s, w] of entries) { r -= w; if (r <= 0) return s; }
    return 'SUNFLOWER';
  }
  slotPull(game) {
    if (this.slotSpinning) return true;                    // 转动中拉杆无效
    if (this.sun < 25) {
      this.addEffect('text', 400, 320, { hold: 1.6, txt: '阳光不够拉动拉杆! (需要 25)', c: '#ffd76a', size: 16 });
      game.audio.play('buzzer');
      return true;
    }
    this.sun -= 25;                                      // 原版 TakeSunMoney(25)
    for (let i = 0; i < 3; i++) {
      const reel = this.slotReels[i];
      reel.cd = 300;                                      // 原版 SlotMachineStart: 300tick
      reel.pos = 0;
      reel.next = this.pickSlotSeed(i);
    }
    this.slotSpinning = true;
    this.slotRolls++;
    if (this._slotHandle && this._slotHandle.animExists('anim_pull')) {
      this._slotHandle.play('anim_pull', RE.PLAY_ONCE_HOLD, 0, 36);
    }
    game.audio.play('slotmachine');
    return true;
  }
  slotSettle(game) {
    // 原版 UpdateSlotMachine 1794-1850: 停轮后匹配结算
    const [a, b, c] = this.slotReels.map(r => r.type);
    const drop = (kind, plant, n) => {
      for (let i = 0; i < n; i++) {
        this.slotPayouts.push({
          kind, plant,
          x: 320 + (kind === 'seed' ? i * 20 : i * 12),
          y: 85, vy: -60 - Math.random() * 40, vx: (Math.random() - 0.5) * 60,
          ground: 200 + Math.random() * 220,
          life: 15, taken: false,
        });
      }
    };
    if (a === b && b === c) {
      // 三个相同
      if (a === 'SLOT_DIAMOND') drop('diamond', null, 5);
      else if (a === 'SLOT_SUN') drop('sun', null, 20);
      else drop('seed', a, 3);
      this.addEffect('text', 400, 160, { hold: 1.8, txt: a === 'SLOT_DIAMOND' ? '钻石大奖!!' : a === 'SLOT_SUN' ? '阳光大奖!!' : '三连!!', c: '#ffe86a', size: 20 });
    } else if (a === b || b === c || a === c) {
      // 两个相同
      const s = (a === b || a === c) ? a : b;
      if (s === 'SLOT_DIAMOND') drop('diamond', null, 1);
      else if (s === 'SLOT_SUN') drop('sun', null, 4);
      else drop('seed', s, 1);
    }
    // 同步种子银行视图 (停轮后转轮可用)
    for (let i = 0; i < 3; i++) this.seedCards[i].type = this.slotReels[i].type;
    if (this.sun >= this.level.slotWinScore) { this.triggerWin(); return; }
  }

  // ============================================================
  // 消消乐 (原版 Beghouled — Challenge.cpp 107-879/1133-1376/3235-3290)
  //   棋盘 8列x5行; 六种棋子: 小喷菇/杨桃/磁力菇/雪花豌豆/坚果/豌豆
  //   交换/旋转 成三连 → 消除计分 + 掉阳光; 75 次消除获胜
  //   状态机: idle(NORMAL) / moving / falling / nomoves — 动画驱动级联
  //   (原版: 等所有植物滑到目标格才结算 → RemoveMatches → MakeFall → Populate)
  // ============================================================
  BEG_BASE() { return ['PUFFSHROOM', 'STARFRUIT', 'MAGNETSHROOM', 'SNOWPEA', 'WALLNUT', 'PEASHOOTER']; }
  BEG_COSTS() { return { BEG_REPEATER: 1000, BEG_FUMESHROOM: 500, BEG_TALLNUT: 250, BEG_SHUFFLE: 100, BEG_CRATER: 200 }; }
  begPlantAt(c, r) { return (this.grid[r] && this.grid[r][c] && !this.grid[r][c].dead) ? this.grid[r][c] : null; }
  beghouledLoadState() {
    // 原版 LoadBeghouledBoardState: 棋盘快照 [col][row] → 种子类型
    const st = Array.from({ length: 8 }, () => new Array(5).fill(null));
    for (const p of this.plants) {
      if (p.dead || p._begRemoved || p.col >= 8 || p.row >= 5) continue;
      st[p.col][p.row] = p.type;
    }
    return st;
  }
  beghouledMatchLen(c, r, st, horiz) {
    // 原版 BeghouledHorizontal/VerticalMatchLength: 段首前一位同型 → 0 (非段首)
    const t = st[c] && st[c][r];
    if (!t) return 0;
    if (horiz) {
      if (c > 0 && st[c - 1][r] === t) return 0;
      let len = 1;
      while (c + len < 8 && st[c + len][r] === t) len++;
      return len;
    }
    if (r > 0 && st[c][r - 1] === t) return 0;
    let len = 1;
    while (r + len < 5 && st[c][r + len] === t) len++;
    return len;
  }
  beghouledHasMatch(st) {
    // 原版 BeghouledBoardHasMatch: 固定 8x5
    for (let c = 0; c < 8; c++) for (let r = 0; r < 5; r++) {
      if (this.beghouledMatchLen(c, r, st, true) >= 3 || this.beghouledMatchLen(c, r, st, false) >= 3) return true;
    }
    return false;
  }
  begStateSwap(st, c1, r1, c2, r2) { const t = st[c1][r1]; st[c1][r1] = st[c2][r2]; st[c2][r2] = t; }
  begIsValidMoveOnState(c1, r1, c2, r2, st) {
    // 原版 BeghouledIsValidMove 419-441 (在状态快照上交换后查三连)
    if (c1 < 0 || c1 > 7 || c2 < 0 || c2 > 7 || r1 < 0 || r1 > 4 || r2 < 0 || r2 > 4) return false;
    if (this.begEated[c1][r1] || this.begEated[c2][r2]) return false;
    if (st[c1][r1] == null) return false;
    this.begStateSwap(st, c1, r1, c2, r2);
    const ok = this.beghouledHasMatch(st);
    this.begStateSwap(st, c1, r1, c2, r2);
    return ok;
  }
  begTwistCausesMatchOnState(c, r, st) {
    // 原版 BeghouledTwistMoveCausesMatch 331-359 (试转 2x2 后查三连, 不提交)
    if (r < 0 || c < 0 || c > 6 || r > 3) return false;
    if (st[c][r] == null || st[c + 1][r] == null || st[c][r + 1] == null || st[c + 1][r + 1] == null) return false;
    const a1 = st[c][r], a2 = st[c + 1][r], a3 = st[c][r + 1], a4 = st[c + 1][r + 1];
    st[c + 1][r] = a1; st[c + 1][r + 1] = a2; st[c][r + 1] = a4; st[c][r] = a3;
    const ok = this.beghouledHasMatch(st);
    st[c][r] = a1; st[c + 1][r] = a2; st[c][r + 1] = a3; st[c + 1][r + 1] = a4;
    return ok;
  }
  begCheckPossibleMovesOnState(st) {
    // 原版 BeghouledCheckForPossibleMoves 849-879
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      if (this.begTwist) {
        if (this.begTwistCausesMatchOnState(c, r, st)) return true;
      } else {
        if (this.begIsValidMoveOnState(c, r, c + 1, r, st) || this.begIsValidMoveOnState(c, r, c, r + 1, st)) return true;
      }
    }
    return false;
  }
  beghouledPickSeed(c, r, st, allowMatches) {
    // 原版 BeghouledPickSeed 740-789: 6 选 1, 已购升级替换, 默认不成三连
    const picks = [];
    for (let t of this.BEG_BASE()) {
      if (t === 'PEASHOOTER' && this.begUpgrades.REPEATER) t = 'REPEATER';
      else if (t === 'PUFFSHROOM' && this.begUpgrades.FUMESHROOM) t = 'FUMESHROOM';
      else if (t === 'WALLNUT' && this.begUpgrades.TALLNUT) t = 'TALLNUT';
      st[c][r] = t;
      if (allowMatches || !this.beghouledHasMatch(st)) picks.push(t);
    }
    st[c][r] = null;
    return picks.length ? picks[Math.floor(Math.random() * picks.length)] : 'PEASHOOTER';
  }
  beghouledFillHoles(st, allowMatches) {
    // 原版 BeghouledFillHoles 791-805: 列优先 (aCol 外层, aRow 内层)
    for (let c = 0; c < 8; c++) for (let r = 0; r < 5; r++) {
      if (st[c][r] == null && !this.begEated[c][r]) {
        st[c][r] = this.beghouledPickSeed(c, r, st, allowMatches);
      }
    }
  }
  beghouledCreatePlants(old, st) {
    // 原版 BeghouledCreatePlants 807-829: 每列自底向上, 新植物 mY 依次 -20/-120/-220
    const Plant = this._plantClass();
    let created = false;
    for (let c = 0; c < 8; c++) {
      let fallY = 80;
      for (let r = 4; r >= 0; r--) {
        if (old[c][r] == null && st[c][r] != null) {
          fallY -= 100;
          const p = new Plant(st[c][r], r, c, this);
          p.y = fallY;
          this.plants.push(p);
          this.grid[r][c] = p;
          created = true;
        }
      }
    }
    if (created) this.begStartFalling('falling');
  }
  beghouledMakeStartBoard() {
    // 原版 BeghouledMakeStartBoard 831-847: 空盘补满无三连 (含弹坑保留)
    const empty = this.beghouledLoadState();
    const st = this.beghouledLoadState();
    this.beghouledFillHoles(st, false);
    if (!this.beghouledHasMatch(st)) this.beghouledCreatePlants(empty, st);
  }
  beghouledPopulate() {
    // 原版 BeghouledPopulateBoard 831-847*: 补满 + 无可行步重摇 1 次 + 落入动画
    const old = this.beghouledLoadState();
    const allow = this.beghouledHasMatch(old);
    let st = null;
    for (let i = 0; i < 2; i++) {
      st = this.beghouledLoadState();
      this.beghouledFillHoles(st, allow);
      if (this.begCheckPossibleMovesOnState(st)) break;
    }
    this.beghouledCreatePlants(old, st);
  }
  begStartFalling(state) {
    // 原版 BeghouledStartFalling: 置状态 + counter=100
    this.begState = state;
    this.begStateT = 100;
    this._begHinted = false;
  }
  beghouledScore(c, r, n, horiz) {
    // 原版 BeghouledScore 606-673: 计分 + 阳光弹出 + 功能卡解锁 + 75 胜
    this.begScore++;
    if (!this.seedCards.length) {
      // 原版: 首次消除 → 解锁 4 张功能卡 (双发1000/大喷500/高坚果250/洗牌100)
      this.seedCards = [
        { type: 'BEG_REPEATER', cd: 0 }, { type: 'BEG_FUMESHROOM', cd: 0 },
        { type: 'BEG_TALLNUT', cd: 0 }, { type: 'BEG_SHUFFLE', cd: 0 },
      ];
      if (this.begEated.flat().some(e => e)) this.seedCards.push({ type: 'BEG_CRATER', cd: 0 });
      this.addEffect('text', 400, 300, { hold: 3, txt: '存阳光升级植物! 消除 75 次获胜', c: '#8ae87a', size: 16 });
    } else if (this.begScore < 75) {
      this.addEffect('text', 400, 120, { hold: 1.2, txt: '再消除 ' + (75 - this.begScore) + ' 次获胜', c: '#cfe8ff', size: 14 });
    }
    if (this.begScore >= 75) {
      this.begScore = 75;
      // 原版 SpawnLevelAward: 奖杯 + 全屏闪 + 全场僵尸 1800 伤
      this.addEffect('screen_flash', 0, 0, { hold: 0.4 });
      for (const z of this.zombies) { if (!z.dead && !z.isDeadOrDying) z.takeDamage(1800, 8); }
      this.triggerWin();
      return;
    }
    if (this.begScore >= 70) {
      this.addEffect('text', 400, 200, { hold: 1.5, txt: '就差一点点!', c: '#ffe86a', size: 15 });
    }
    let suns = n - 2 + this.begMatchesThisMove;
    if (n >= 5) suns += 2;
    suns = Math.max(1, Math.min(5, suns));
    const off = n === 3 ? 80 : n === 4 ? 120 : 160;
    const px = this.gridX(c) + (horiz ? off : 40);
    const py = this.cellY(r, c) + (horiz ? 40 : off);
    for (let i = 0; i < suns; i++) this.addSun(px + 20 * i - 10, py, Math.min(540, py + 36), 'coin');
    try { this.game.audio.play('points'); } catch (e) { }
    this.begMatchesThisMove++;
  }
  beghouledRemoveMatches() {
    // 原版 BeghouledRemoveMatches 675-698: 行主序逐格, 横竖同格双查, 快照全程不变
    //   (十字/T/L 形横竖各计一次分; 植物经 kill 集合只死一次)
    const st = this.beghouledLoadState();
    const kill = new Set();
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      const hl = this.beghouledMatchLen(c, r, st, true);
      if (hl >= 3) {
        for (let i = 0; i < hl; i++) kill.add((c + i) + ',' + r);
        this.beghouledScore(c, r, hl, true);
      }
      const vl = this.beghouledMatchLen(c, r, st, false);
      if (vl >= 3) {
        for (let i = 0; i < vl; i++) kill.add(c + ',' + (r + i));
        this.beghouledScore(c, r, vl, false);
      }
    }
    for (const key of kill) {
      const [c, r] = key.split(',').map(Number);
      const p = this.begPlantAt(c, r);
      if (p) { p._begRemoved = true; p.dead = true; this.grid[r][c] = null; }
    }
  }
  beghouledMakeFall() {
    // 原版 BeghouledMakePlantsFall 560-596: 自底向上逐空格, 上方最近植物落入
    //   (弹坑目标格不落入; 但供给扫描可穿过弹坑 — 原版扫描无 eated 检查)
    for (let r = 4; r >= 0; r--) {
      for (let c = 0; c < 8; c++) {
        if (this.begEated[c][r] || this.begPlantAt(c, r)) continue;
        for (let rr = r - 1; rr >= 0; rr--) {
          const p = this.begPlantAt(c, rr);
          if (p) {
            this.grid[rr][c] = null;
            p.row = r;
            this.grid[r][c] = p;
            this.begStartFalling('falling');
            break;
          }
        }
      }
    }
  }
  beghouledShuffle() {
    // 原版 BeghouledShuffle 3277-3290: 全部植物死亡 + 进入 falling — 级联结算时自动重摆
    for (const p of this.plants) {
      if (!p.dead && p.col < 8) { p._begRemoved = true; p.dead = true; }
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      if (this.grid[r][c] && this.grid[r][c].dead) this.grid[r][c] = null;
    }
    this.begStartFalling('falling');
  }
  begFlashPlant(c, r, fc, fr, tc, tr) {
    // 原版 BeghouledFlashPlant 1168-1189: 提示闪烁的是交换配对格 (300tick)
    if (c === fc && r === fr) { c = tc; r = tr; }
    else if (c === tc && r === tr) { c = fc; r = fr; }
    const p = this.begPlantAt(c, r);
    if (p && !p.begFlash) p.begFlash = 300;
  }
  begFlashAMatch() {
    // 原版 BeghouledFlashAMatch 1264-1293: 闪第一个可行步 (交换/旋转)
    const st = this.beghouledLoadState();
    if (this.begTwist) {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
        if (!this.begTwistCausesMatchOnState(c, r, st)) continue;
        for (let i = 0; i < 4; i++) {
          const p = this.begPlantAt(c + (i % 2), r + Math.floor(i / 2));
          if (p && !p.begFlash) p.begFlash = 300;
        }
        return;
      }
      return;
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      const dirs = [];
      if (c < 7) dirs.push([c + 1, r]);
      if (r < 4) dirs.push([c, r + 1]);
      for (const [tc, tr] of dirs) {
        if (this.begEated[c][r] || this.begEated[tc][tr]) continue;
        const a = st[c][r], b = st[tc][tr];
        if (a == null) continue;
        this.begStateSwap(st, c, r, tc, tr);
        let found = false;
        for (let rr = 0; rr < 5 && !found; rr++) for (let cc = 0; cc < 8 && !found; cc++) {
          const hl = this.beghouledMatchLen(cc, rr, st, true);
          if (hl >= 3) { for (let i = 0; i < 3; i++) this.begFlashPlant(cc + i, rr, c, r, tc, tr); found = true; }
          else {
            const vl = this.beghouledMatchLen(cc, rr, st, false);
            if (vl >= 3) { for (let i = 0; i < 3; i++) this.begFlashPlant(cc, rr + i, c, r, tc, tr); found = true; }
          }
        }
        this.begStateSwap(st, c, r, tc, tr);
        if (found) return;
      }
    }
  }
  begCheckStuck() {
    // 原版 BeghouledCheckStuckState 1854-1866: 无可行步 → nomoves + 500tick + 提示
    if (this.begState !== 'idle') return;
    if (!this.begCheckPossibleMovesOnState(this.beghouledLoadState())) {
      this.begState = 'nomoves';
      this.begStateT = 500;
      this.addEffect('text', 400, 200, { hold: 3, txt: '没有可消除的组合了, 即将洗牌…', c: '#ff9a6a', size: 16 });
    }
  }
  begIsValidMove(c1, r1, c2, r2) {
    return this.begIsValidMoveOnState(c1, r1, c2, r2, this.beghouledLoadState());
  }
  begTrySwap(c1, r1, c2, r2) {
    // 原版 BeghouledDragUpdate 443-498: 有效 → 交换 + MOVING; 无效 → 抖动 + floop
    const p1 = this.begPlantAt(c1, r1), p2 = this.begPlantAt(c2, r2);
    if (!this.begIsValidMove(c1, r1, c2, r2)) {
      if (p1) {
        if (c2 > c1) p1.x += 30;
        else if (c2 < c1) p1.x -= 30;
        else if (r2 > r1) p1.y += 30;
        else if (r2 < r1) p1.y -= 30;
      }
      try { this.game.audio.play('floop'); } catch (e) { }
      return;
    }
    this.grid[r1][c1] = p2; this.grid[r2][c2] = p1;
    if (p2) { p2.col = c1; p2.row = r1; }
    if (p1) { p1.col = c2; p1.row = r2; }
    this.begState = 'moving'; this.begStateT = 100;
    try { this.game.audio.play('seedlift'); } catch (e) { }
  }
  begTwistValid(c, r) {
    return c >= 0 && c <= 6 && r >= 0 && r <= 3 &&
      !this.begEated[c][r] && !this.begEated[c + 1][r] && !this.begEated[c][r + 1] && !this.begEated[c + 1][r + 1] &&
      this.begPlantAt(c, r) && this.begPlantAt(c + 1, r) && this.begPlantAt(c, r + 1) && this.begPlantAt(c + 1, r + 1);
  }
  begTwistRotate(c, r) {
    // 原版 BeghouledTwistMouseDown 397-407: 顺时针 左上→右上→右下→左下→左上
    const a1 = this.grid[r][c], a2 = this.grid[r][c + 1], a3 = this.grid[r + 1][c], a4 = this.grid[r + 1][c + 1];
    this.grid[r][c] = a3; this.grid[r][c + 1] = a1; this.grid[r + 1][c] = a4; this.grid[r + 1][c + 1] = a2;
    if (a3) { a3.row = r; a3.col = c; }
    if (a1) { a1.row = r; a1.col = c + 1; }
    if (a4) { a4.row = r + 1; a4.col = c; }
    if (a2) { a2.row = r + 1; a2.col = c + 1; }
  }
  begTryTwist(c, r) {
    // 原版 BeghouledTwistMouseDown 381-412: 有效 → 旋转 + MOVING; 无效 → 四格抖动 + floop
    if (!this.begTwistValid(c, r)) return;
    const st = this.beghouledLoadState();
    if (!this.begTwistCausesMatchOnState(c, r, st)) {
      const p1 = this.begPlantAt(c, r), p2 = this.begPlantAt(c + 1, r), p3 = this.begPlantAt(c, r + 1), p4 = this.begPlantAt(c + 1, r + 1);
      if (p1) p1.x += 20;
      if (p2) p2.y += 20;
      if (p3) p3.y -= 20;
      if (p4) p4.x -= 20;
      try { this.game.audio.play('floop'); } catch (e) { }
      return;
    }
    this.begTwistRotate(c, r);
    this.begState = 'moving'; this.begStateT = 100;
    try { this.game.audio.play('seedlift'); } catch (e) { }
  }
  begCardClick(i, game) {
    // 原版 BeghouledPacketClicked 3235-3275: 洗牌/清坑须 idle; 升级随时可买
    const card = this.seedCards[i];
    if (!card || card.used) return;
    const cost = this.BEG_COSTS()[card.type];
    if (this.sun < cost) { game.audio.play('buzzer'); return; }
    const busy = this.begState === 'falling' || this.begState === 'moving';
    if (card.type === 'BEG_SHUFFLE') {
      if (busy) return;
      this.beghouledShuffle();
    } else if (card.type === 'BEG_CRATER') {
      if (busy) return;
      // 原版 BeghouledClearCrater 584-604: 从左上扫清 1 坑; 清后补格 (进入 falling 由级联补)
      let cleared = false;
      for (let cc = 0; cc < 8 && !cleared; cc++) for (let rr = 0; rr < 5 && !cleared; rr++) {
        if (this.begEated[cc][rr]) { this.begEated[cc][rr] = false; cleared = true; }
      }
      if (!cleared) return;
      this.begStartFalling('falling');
    } else {
      // 升级卡 (一次性): 全场对应植物原位替换 (原版 Die + AddPlant, 无落动画)
      const MAP = { BEG_REPEATER: ['PEASHOOTER', 'REPEATER'], BEG_FUMESHROOM: ['PUFFSHROOM', 'FUMESHROOM'], BEG_TALLNUT: ['WALLNUT', 'TALLNUT'] };
      const [from, to] = MAP[card.type];
      if (this.begUpgrades[to]) return;
      this.begUpgrades[to] = true;
      const Plant = this._plantClass();
      for (const p of this.plants) {
        if (p.dead || p.type !== from || p.col >= 8) continue;
        const np = new Plant(to, p.row, p.col, this);
        p._begRemoved = true; p.dead = true;
        this.plants.push(np);
        this.grid[p.row][p.col] = np;
      }
      card.used = true;
    }
    this.sun -= cost;
    game.audio.play('points');
  }
  begUpdate(dt) {
    // 原版 UpdateBeghouled 1296-1376: 动画驱动级联 + 空闲提示/卡死洗牌
    const tk = Math.max(1, Math.round(dt * 100));
    // 1. 植物滑向目标格 (原版 UpdateBeghouledPlant 1133-1166)
    //    moving=3px/tick; falling=PvzpAnimateCurve(90,30,counter,1,20,EASE_IN) 由慢到快
    let moving = false;
    for (const p of this.plants) {
      if (p.dead) continue;
      if (p.begFlash > 0) p.begFlash = Math.max(0, p.begFlash - tk);
      const tx = this.gridX(p.col), ty = this.cellY(p.row, p.col);
      if (Math.abs(p.x - tx) <= 0.5 && Math.abs(p.y - ty) <= 0.5) { p.x = tx; p.y = ty; continue; }
      let spd;
      if (this.begState === 'moving') spd = 3;
      else {
        const x = Math.max(0, Math.min(1, (90 - Math.max(0, this.begStateT)) / 60));
        spd = 1 + 19 * x * x;
      }
      const step = spd * tk;
      if (Math.abs(tx - p.x) <= step) p.x = tx; else { p.x += Math.sign(tx - p.x) * step; moving = true; }
      if (Math.abs(ty - p.y) <= step) p.y = ty; else { p.y += Math.sign(ty - p.y) * step; moving = true; }
    }
    // 2. 级联结算 (无移动中植物 且 falling/moving)
    if (!moving && (this.begState === 'falling' || this.begState === 'moving')) {
      this.begState = 'idle';
      this.beghouledRemoveMatches();
      this.beghouledMakeFall();
      this.beghouledPopulate();
      if (this.begState === 'falling') { this.begStateT = 100; return; }
      this.begStateT = 1500;
      this.begMatchesThisMove = 0;
      this.begCheckStuck();
    }
    // 3. 计时器 (idle: 1500 → 闪可行步; nomoves: 500 → 全屏闪 + 洗牌)
    if (this.begStateT > 0) {
      this.begStateT -= tk;
      if (this.begStateT <= 0 && this.state === 'playing') {
        if (this.begState === 'idle') {
          this.begFlashAMatch();
          this.begStateT = 1500;
        } else if (this.begState === 'nomoves') {
          this.addEffect('screen_flash', 0, 0, { hold: 0.4 });
          this.beghouledShuffle();
        }
      }
    }
    // 4. 僵尸啃死植物 → 弹坑 (原版 ZombieAtePlant 1869-1886; 首个弹坑解锁清坑卡)
    for (const p of this.plants) {
      if (!p.dead || p._begRemoved || p._begEatenMarked || p.col >= 8) continue;
      p._begEatenMarked = true;
      this.begEated[p.col][p.row] = true;
      if (this.seedCards.length === 4) {
        this.seedCards.push({ type: 'BEG_CRATER', cd: 0 });
        this.addEffect('text', 400, 300, { hold: 2.5, txt: '僵尸吃出了弹坑! 花 200 阳光清理', c: '#8ad8ff', size: 15 });
      }
      this.begCheckStuck();
    }
    // 5. 旋转模式: 悬停 2x2 方框跟踪 (原版 UpdateBeghouled 1316-1330)
    if (this.begTwist) {
      const m = this.game.mouse;
      this.begTwistSel = null;
      if (m && this.begState === 'idle') {
        const cell = this.game.pixelToCell(m.x - 40, m.y - 40);
        if (cell && cell[0] >= 0 && cell[0] <= 6 && cell[1] >= 0 && cell[1] <= 3 && this.begTwistValid(cell[0], cell[1])) {
          this.begTwistSel = cell;
        }
      }
    }
  }

  // ============================================================
  // 僵尸水族馆 (原版 Zombiquarium — Challenge.cpp 3307-3443 + Zombie.cpp 3079-3260)
  // ============================================================
  aqSpawnSnorkle() {
    // 原版 ZombiquariumSpawnSnorkle: 随机位置 (50-650, 100-400)
    const z = this.addZombie('SNORKEL', 0);
    if (!z) return null;
    z.posX = 50 + Math.random() * 600;
    z.posY = 100 + Math.random() * 300;
    z.x = Math.floor(z.posX); z.y = Math.floor(z.posY);
    return z;
  }

  modeClickBeghouled(game, p) {
    // 功能卡银行 (y<87)
    if (p.y < 87) {
      for (let i = 0; i < this.seedCards.length; i++) {
        const x = game.packetX(i, this.seedCards.length);
        if (p.x > x && p.x < x + 50 && p.y > 7) {
          this.begCardClick(i, game);
          return true;
        }
      }
      return false;   // 阳光收集交给通用逻辑
    }
    // 原版 Challenge::MouseDown: state != NORMAL → 输入屏蔽
    if (this.begState !== 'idle') return true;
    const cell = game.pixelToCell(p.x, p.y);
    if (!cell) return false;
    const [c, r] = cell;
    if (c >= 8) return false;
    if (this.begTwist) {
      // 原版 BeghouledTwistSquareFromMouse: 以点击点减半格 (40px) 定 2x2 锚点
      const tcell = game.pixelToCell(p.x - 40, p.y - 40);
      if (tcell && tcell[0] >= 0 && tcell[0] <= 6 && tcell[1] >= 0 && tcell[1] <= 3) {
        this.begTryTwist(tcell[0], tcell[1]);
      }
      return true;
    }
    // 交换: 点击选中 + 点击相邻目标 (web 近似原版拖拽; 相邻无效也走抖动反馈)
    if (this.begSel) {
      const [c0, r0] = this.begSel;
      this.begSel = null;
      if (Math.abs(c - c0) + Math.abs(r - r0) === 1) this.begTrySwap(c0, r0, c, r);
      else if (!this.begEated[c][r] && this.begPlantAt(c, r)) this.begSel = [c, r];
    } else {
      if (!this.begEated[c][r] && this.begPlantAt(c, r)) this.begSel = [c, r];
    }
    return true;
  }
  modeClickZombiquarium(game, p) {
    // 2 卡银行: 潜水僵尸 $100 / 奖杯 $1000 (原版 GetCost)
    if (p.y < 87) {
      for (let i = 0; i < 2; i++) {
        const x = game.packetX(i, 2);
        if (p.x > x && p.x < x + 50 && p.y > 7 && p.y < 77) {
          const cost = i === 0 ? 100 : 1000;
          if (this.sun < cost) { game.audio.play('buzzer'); return true; }
          if (i === 0) {
            if (this.zombies.filter(z => !z.dead).length > 100) return true;   // 原版 CountZombiesOnScreen()>100
            this.sun -= cost;
            const z = this.aqSpawnSnorkle();
            try { game.audio.play('zombiesplash'); } catch (e) { }
            if (z) this.addEffect('dust', z.x + 60, z.y + 20);
          } else {
            this.sun -= cost;
            // 原版 SpawnLevelAward(2,0): 奖杯即收 + 全屏闪 + spawn_sun 音
            this.addEffect('screen_flash', 0, 0, { hold: 0.4 });
            try { game.audio.play('points'); } catch (e) { }
            this.triggerWin();
          }
          return true;
        }
      }
      return false;
    }
    // 喂脑子 (原版 ZombiquariumMouseDown 3360-3379: 水域 80-720/90-430, 脑<3, 5 阳光)
    if (p.x >= 80 && p.x <= 720 && p.y >= 90 && p.y <= 430) {
      const nBrains = this.brains.filter(br => !br.taken).length;
      if (nBrains < 3 && this.sun >= 5) {
        this.sun -= 5;
        this.brains.push({ x: p.x - 15, y: p.y - 15, t: 0, taken: false });
        try { game.audio.play('tap'); } catch (e) { try { game.audio.play('seedlift'); } catch (e2) { } }
      } else if (this.sun < 5) {
        this.addEffect('text', p.x, p.y - 10, { hold: 1.2, txt: '需要 5 阳光!', c: '#ffd76a', size: 14 });
      }
      return true;
    }
    return false;
  }


  updateMode(dt) {
    // 传送带在过场期间同样运转 (原版 SeedBank::UpdateConveyorBelt 不受 GameScene 门控 —
    // 1-5 挖掘教学期带面滚动/发卡, 卡片不会停在铲子槽位置)
    if (this.state !== 'playing' && !(this.state === 'intro' && this.mode === 'conveyor')) return;
    switch (this.mode) {
      case 'conveyor': {
        // 原版 SeedBank::UpdateConveyorBelt: counter 每4tick全卡左移1px (25px/s)
        const b = this.belt;
        b.counter += dt;
        b.scroll = (b.scroll || 0) + dt * 25;   // 带面滚动像素 (单调递增)
        const moveAcc = b._acc || 0;
        const movePx = Math.floor((b.counter * 25 + moveAcc));
        if (movePx > 0) {
          b.counter -= movePx / 25;
          for (const it of b.items) it.offset = Math.max(0, it.offset - movePx);
        }
        // 发卡 (原版 UpdateConveyorBelt: >8卡1000tick / >6卡500 / >4卡425 / 否则400tick; Boss ×0.875)
        b.spawnT -= dt;
        const n = b.items.length;
        if (b.spawnT <= 0 && n < 10) {
          const pool = this.beltPool;
          if (pool.length) {
            // 原版 AddSeed: 新卡 offsetX = 515-(51)*n, 不得与左卡重叠 (前卡offset+51)
            let offset = 515 - 51 * n;
            if (n > 0 && offset < b.items[n - 1].offset) offset = b.items[n - 1].offset + 51;
            // 权重池: [type, weight] 对或纯 type (默认权重 10)
            const entries = pool.map(e => Array.isArray(e) ? e : [e, 10]);
            // 原版动态权重 (Challenge.cpp 1659-1675, 仅当池中种类 >2 时):
            //   同类型≥4张权重→1, ≥3张→5, 与上一张同类减半; 保龄球(2种)不限流
            const capWeights = entries.length > 2;
            const weights = entries.map(([t, base]) => {
              let w = base;
              const cnt = b.items.filter(o => o.type === t).length;
              if (capWeights) {
                if (cnt >= 4) w = Math.min(w, 1); else if (cnt >= 3) w = Math.min(w, 5);
                if (n > 0 && t === b.items[n - 1].type) w = Math.max(1, w >> 1);
              }
              // 原版 Challenge.cpp 特殊权重调整:
              //   GRAVEBUSTER: 墓碑数 ≤ 场上+带上的总数 → 权重归 0
              //   LILYPAD: 总数 0→18 线性衰减到 1
              //   FLOWERPOT: 总数 0→35 (列队僵尸 45) 线性衰减到 1
              const totalCount = cnt + this.plants.filter(p => p.type === t).length;
              if (t === 'GRAVEBUSTER') {
                if (this.graves.length <= totalCount) w = 0;
              } else if (t === 'LILYPAD') {
                w = totalCount >= 18 ? 1 : Math.max(1, Math.round(base - (base - 1) * totalCount / 18));
              } else if (t === 'FLOWERPOT') {
                const cap = this.level.conveyorPool === 'column' ? 45 : 35;
                w = totalCount >= cap ? 1 : Math.max(1, Math.round(base - (base - 1) * totalCount / cap));
                // #1 原版 Challenge.cpp 1653: 僵王丢RV期间 FLOWERPOT 权重 = 500 (补盆窗口)
                if (b.isBoss) {
                  const boss = this.bossZombie;
                  if (boss && boss.phase === PH.BOSS_DROP_RV) w = 500;
                }
              }
              return Math.max(0, w);
            });
            let total = weights.reduce((a, c) => a + c, 0);
            let roll = Math.random() * total;
            let pick = 0;
            for (let i = 0; i < entries.length; i++) { roll -= weights[i]; if (roll <= 0) { pick = i; break; } }
            b.items.push({ type: entries[pick][0], offset, active: true });
          }
          // 原版: interval = 倍率 × (>8:1000 / >6:500 / >4:425 / 否则400) tick
          const mult = b.isBoss ? 0.875 : (b.mult || 1);
          const interval = (n > 8 ? 10 : n > 6 ? 5 : n > 4 ? 4.25 : 4) * mult;
          b.spawnT = interval;
        }
        break;
      }
      case 'whack': {
        // ---- 原版 Challenge::Update 1923: 种子银行滑入 ----
        // 首次拥有阳光(含待收集) → 银行从 -87 滑到 0 (+2/帧) + 卡片闪烁教程 (TUTORIAL_WHACK_A_ZOMBIE_*)
        if (!this.whackBankShown && (this.sun > 0 || this.suns.some(s => !s.dead && !s.collected))) {
          this.whackBankShown = true;
          this.whackFlashT = 2.5;   // 原版 BEFORE_PICK_SEED(1500tick) + PICK_SEED(400tick)
        }
        if (this.whackBankShown && this.seedBankY < 0) {
          this.seedBankY = Math.min(0, this.seedBankY + dt * 200);   // ≈原版 +2/update
        }
        if (this.whackFlashT > 0) this.whackFlashT -= dt;
        // ---- 原版 Challenge::WhackAZombieSpawning 完整移植 (100Hz tick) ----
        const tk = Math.max(1, Math.round(dt * 100));
        if (this.whackWave >= this.whackWaves && this.whackCountdown <= 0) {
          // 终波放完: 僵尸清空即胜利 (原版标准 UpdateWin)
          if (this.whackFinalSpawned && this.zombies.filter(z => !z.dead).length === 0) this.triggerWin();
          break;
        }
        if (this.whackCountdown > 0) {
          const prev = this.whackCountdown;
          this.whackCountdown -= tk;
          // 原版: 倒计时 100tick 且已有波次 → 补墓碑至 5
          if (prev > 100 && this.whackCountdown <= 100 && this.whackWave > 0) {
            this.whackPlaceGraves(Math.max(1, 5 - this.graves.length));
          }
          // 原版: 倒计时 5tick → NextWaveComing (Board.cpp:5214)
          if (prev > 5 && this.whackCountdown <= 5) {
            if (this.whackWave === 0) {
              this.game.audio.play('awooga');                       // 原版: 首波 AWOOGA
            } else if (this.whackWave === this.whackWaves - 1) {
              // 原版: 下一波为最后一波 → SIREN + FinalWave.reanim 横幅 (RENDER_LAYER_ABOVE_UI)
              this.game.audio.play('siren');
              Banners.showFinalWave(2.1, this.game.audio);
            }
          }
          if (this.whackCountdown <= 0) {
            this.whackCountdown = 2000;      // 原版: 波间隔 2000tick
            if (this.whackWave < this.whackWaves) this.whackWave++;
            this.whackSpawnCounter = this.whackWave === this.whackWaves ? 300 : 1;
          } else if (this.whackCountdown < 300) {
            break;   // 原版: 计数 <300tick 不出怪
          }
        }
        // 组生成: counter 递减到 0 触发一次
        this.whackSpawnCounter -= tk;
        if (this.whackSpawnCounter <= 0 && this.whackWave > 0) {
          this.whackSpawnGroup();
        }
        break;
      }
      case 'vasebreaker': {
        // 轮间戴夫过场优先 (冒险 4-5, 原版 IsScaryPotterDaveTalking 冻结时间线)
        if (this.vaseDave) { this.updateVaseDave(dt); break; }
        // 锤子动画推进 — 原版 Challenge::ScaryPotterUpdate (Challenge.cpp:3781):
        //   STATECHALLENGE_SCARY_POTTER_MALLETING: aMalletReanim->mLoopCount > 0
        //   (动画播完一次) → 立即 ScaryPotterOpenPot + 锤子 ReanimationDie。
        //   旧实现用固定 0.42s 计时, 动画 0.2s 播完后定格 200ms 才开罐 → 停顿僵硬 (#7)
        if (this.mallet) {
          this.mallet.t += dt;
          if (this.mallet.anim) this.mallet.anim.update(dt);
          const done = this.mallet.anim ? this.mallet.anim.loopCount > 0 : this.mallet.t >= 0.25;
          if (done && !this.mallet.opened) {
            this.mallet.opened = true;
            this.scaryPotterOpenPot(this.mallet.vase, this.game);
            this.mallet = null;              // 原版: 开罐同时锤子 Die 立即消失
          }
        }
        // 灯笼花透视 (原版 GridItem::UpdateScaryPot, GridItem.cpp:500-541):
        //   场上存在 PLANTERN 且与罐子同行/列差 ≤1 (九宫格) → mTransparentCounter++
        //   (上限 50); 否则 -- (下限 0)。50 tick ≈ 0.5s 渐变 (#8)
        if (this.vases && this.vases.length) {
          const lanterns = this.plants.filter(p => !p.dead && p.type === 'PLANTERN');
          const step = Math.max(1, Math.round(dt * 100));   // 补偿帧率: 100Hz 语义
          for (const v of this.vases) {
            if (v.broken) continue;
            const near = lanterns.some(p => Math.max(Math.abs(p.col - v.col), Math.abs(p.row - v.row)) <= 1);
            const cur = v.transparent || 0;
            v.transparent = Math.max(0, Math.min(50, cur + (near ? step : -step)));
          }
        }
        // 可用种子包物理 (原版 Coin::UpdateFall: 弹出+重力, 落地即停 + 1500tick 后消失)
        // #6 根因: 落地后 vx 未归零 → 卡牌/种子包永久缓慢平移 → 落地停稳时同时归零 vx
        for (const pk of this.vasePackets) {
          if (pk.taken) continue;
          pk.t += dt;
          pk.vy += 600 * dt;
          pk.y += pk.vy * dt;
          pk.x += pk.vx * dt;
          if (pk.y > pk.ground) {
            pk.y = pk.ground;
            if (Math.abs(pk.vy) < 40) { pk.vy = 0; pk.vx = 0; }
            else { pk.vy = -pk.vy * 0.35; pk.vx *= 0.5; }
          }
          pk.life -= dt;
        }
        this.vasePackets = this.vasePackets.filter(pk => !pk.taken && pk.life > 0);
        // 胜利/下一轮 (原版 ScaryPotterIsCompleted: 罐全开且无僵尸)
        if (!this.mallet && this.vases.length && this.vases.every(v => v.broken) && this.zombies.filter(z => !z.dead && z.fromWave !== -2).length === 0) {
          const isAdv = !this.level.mode;
          if (isAdv && this.potStage < 2) {
            // 原版: 轮间戴夫入场 → 补充罐子 (mNextSurvivalStageCounter 300tick)
            this.startVaseDave();
          } else if (!isAdv && this.level.endless) {
            // 无尽罐子: 清场进入下一轮 (巨人+1/10轮, 原版 mSurvivalStage)
            this.potStage++;
            this.vases = [];
            this.vasePackets = [];
            this.initVasebreaker();
            this.game.audio.play('plant');
            this.addEffect('text', 400, 250, { hold: 1.6, txt: '第 ' + (this.potStage + 1) + ' 轮', c: '#ffe36a', size: 30 });
          } else {
            this.triggerWin();
          }
        }
        break;
      }
      case 'izombie': {
        // 脑子被吃 (原版 IZombieEatBrain: 攻击矩形 x≤20 开始啃脑, 70口)
        for (const z of this.zombies) {
          if (z.dead || z.isDeadOrDying) continue;
          // 离场清理: 吃完脑子的僵尸继续向左走出屏幕 (原版越界移除)
          if (z.x < -80) { z.dieNoLoot(); continue; }
          const brain = this.brains.find(b => b.row === z.row && !b.eaten);
          if (brain && z.x <= 20) {
            z.velX = 0;
            z.stopEating && z.stopEating();
            if (!z._eatT || z._eatT === undefined) z._eatT = 0;
            z._eatT += dt;
            // 原版: 每4tick咬一口 (chilled×2) → 70口=2.8s
            const biteInterval = (z.chilledCounter > 0) ? 0.08 : 0.04;
            while (z._eatT >= biteInterval) {
              z._eatT -= biteInterval;
              brain.hp--;
              if (brain.hp % 10 === 0) this.game.audio.play('chomp');
              if (brain.hp <= 0) {
                brain.eaten = true;
                this.brainsEaten++;
                this.game.audio.play('gulp');
                // 原版: 吃完后僵尸继续向左离场
                z.velX = 0.25 + Math.random() * 0.12;
                try { z.updateAnimSpeed(); } catch (e) { }
                break;
              }
            }
          }
        }
        // 胜利: 吃完 5 个脑子 (原版 I_ZOMBIE_WINNING_SCORE=5)
        if (this.brainsEaten >= 5) { this.triggerWin(); return; }
        // 失败: 没僵尸且阳光不够最便宜卡 (原版 IZombieUpdate: 含场上待拾阳光)
        const minCost = Math.min(...this.zombieCards.map(c => c.cost));
        const availSun = this.sun + this.suns.filter(s => !s.collected && !s.dead).reduce((t, s) => t + s.value, 0);
        if (this.zombies.filter(z => !z.dead && !z.isDeadOrDying).length === 0 && availSun < minCost) {
          this.triggerLose(0);
        }
        break;
      }
      case 'raining': {
        // 种子包掉落 (原版 UpdateRainingSeeds: 500-999tick 随机间隔, x 100-649)
        this.rainT -= dt;
        if (this.rainT <= 0 && this.heldCards.length < 4) {
          this.rainT = 5 + Math.random() * 5;
          // 原版排除表: 升级植物/向日葵/双子/咖啡豆/叶子伞/阳光菇/模仿者 + 墓碑吞噬者(无墓碑不推荐)
          const excl = new Set(['SUNFLOWER', 'TWINSUNFLOWER', 'COFFEEBEAN', 'UMBRELLALEAF', 'SUNSHROOM', 'IMITATER', 'MARIGOLD', 'GRAVEBUSTER']);
          const pool = availablePlants(50, this.game && this.game.purchasedSet).filter(t => !excl.has(t));
          let type = pool[Math.floor(Math.random() * pool.length)];
          // 原版: 睡莲概率 30%→1% (场上睡莲数 0→18 线性) — 泳池浓雾关补给
          const lilyCount = this.plants.filter(p => !p.dead && p.type === 'LILYPAD').length;
          if (Math.random() * 100 < 30 - (30 - 1) * Math.min(18, lilyCount) / 18) type = 'LILYPAD';
          this.rainCards.push({ type, x: 100 + Math.random() * 550, y: -40, vy: 55, land: 90 + Math.random() * 60, taken: false, life: 11 });
        }
        for (const c of this.rainCards) {
          if (c.taken) continue;
          if (c.y < c.land) c.y += c.vy * dt;
          else { c.life -= dt; if (c.life <= 0) c.taken = true; }
        }
        this.rainCards = this.rainCards.filter(c => !c.taken);
        break;
      }
      case 'beghouled': {
        this.begUpdate(dt);
        break;
      }
      case 'zombiquarium': {
        // 脑子下沉 (原版 3429-3442: +0.15/tick, y≥500 消失)
        const tk2 = Math.max(1, Math.round(dt * 100));
        for (const br of this.brains) {
          if (br.taken) continue;
          br.t += tk2;
          br.y += 0.15 * tk2;
          if (br.y >= 500) br.taken = true;
        }
        this.brains = this.brains.filter(br => !br.taken);
        // 全灭 → 判负 (原版 ZombiquariumUpdate: zombies 空 → ZombiesWon)
        if (!this.zombies.some(z => !z.dead) && this.state === 'playing') {
          this.triggerLose(0);
        }
        break;
      }
      case 'slotmachine': {
        // 拉杆 reanim 懒建 (原版 Challenge 构造: SlotMachine @ (96,-20), animRate=0)
        if (!this._slotHandle && RE.hasDef('SlotMachine')) {
          const h = Assets.reanim('SlotMachine');
          h.setPosition(96, -20);
          this._slotHandle = h;
        }
        // ---- 转轮物理 (原版 SeedPacket::Update 184-208): cd 300tick;
        //      翻面速度 6→2/s 线性减速; pos≥1 → 换面, cd==0 → 停 ----
        const tk = Math.max(1, Math.round(dt * 100));
        for (let k = 0; k < tk; k++) {
          for (let i = 0; i < 3; i++) {
            const reel = this.slotReels[i];
            if (reel.cd > 0) {
              reel.cd--;
              const flips = 6 + (2 - 6) * (reel.cd / 300);
              reel.pos += flips * 0.01;
              if (reel.pos >= 1) {
                reel.type = reel.next;
                if (reel.cd === 0) { reel.pos = 0; }
                else { reel.pos -= 1; reel.next = this.pickSlotSeed(i); }
              } else if (reel.cd === 0) { reel.cd = 1; }   // 原版: 未翻到整格续 1tick
            }
          }
        }
        // 全停 → 结算 (原版 STATECHALLENGE_SLOT_MACHINE_ROLLING → NORMAL)
        if (this.slotSpinning && !this.slotReels.some(r => r.cd > 0)) {
          this.slotSpinning = false;
          if (this._slotHandle && this._slotHandle.animExists('anim_return')) {
            this._slotHandle.play('anim_return', RE.PLAY_ONCE_HOLD, 0, 24);
          }
          this.slotSettle(this.game);
        }
        // 奖励掉落物物理 (原版 COIN_MOTION_COIN: 弹出+重力)
        for (const pk of this.slotPayouts) {
          if (pk.taken) continue;
          pk.vy += 500 * dt;
          pk.x += pk.vx * dt;
          pk.y += pk.vy * dt;
          if (pk.y > pk.ground) {
            pk.y = pk.ground;
            if (Math.abs(pk.vy) > 60) { pk.vy = -pk.vy * 0.4; pk.vx *= 0.5; }
            else { pk.vy = 0; pk.vx = 0; }
          }
          pk.life -= dt;
        }
        this.slotPayouts = this.slotPayouts.filter(pk => !pk.taken && pk.life > 0);
        break;
      }
    }
  }

  // ============================================================
  // 传送门战斗 (原版 Challenge.cpp 2870-3202)
  // ============================================================
  portalPartner(p) {
    return this.portals.find(q => q !== p && q.kind === p.kind && !q.closing) || null;
  }
  updatePortals(tk) {
    // 懒建门 reanim (原版 GridItem::OpenPortal: circle (col*80-6, row0Y-65); square (-4, +25))
    for (const p of this.portals) {
      if (p.anim || p.closing) continue;
      const def = p.kind === 'square' ? 'Portal_Square' : 'Portal_Circle';
      if (!RE.hasDef(def)) continue;
      const a = Assets.reanim(def);
      // 原版 GridItem::OpenPortal: aXPos = mGridX*80-6 (方门再-4), aYPos = GridToPixelY(0, mGridY)-65 (方门+25)
      const px = p.col * 80 - 6 - (p.kind === 'square' ? 4 : 0);
      const py = this.gridY(p.row) - 65 + (p.kind === 'square' ? 25 : 0);
      a.setPosition(px, py);
      a.play('anim_appear', RE.PLAY_ONCE_HOLD, 0, 24);
      p.anim = a;
      p.appeared = false;
    }
    for (const p of this.portals) {
      const a = p.anim;
      if (!a) continue;
      if (!p.appeared && a.loopType === RE.PLAY_ONCE_HOLD && a.loopCount > 0) {
        a.play('anim_pulse', RE.LOOP, 0, 12);
        p.appeared = true;
      }
      if (p.closing) {
        // 消散完 → 旧 reanim 回收, 新位置重新开门 (原版 ClosePortal → GridItemDie)
        if (a.loopType === RE.PLAY_ONCE_HOLD && a.loopCount > 0) {
          a.reanimDie();
          p.anim = null;
          p.closing = false;
        }
        continue;
      }
      const other = this.portalPartner(p);
      if (!other || !other.anim || other.closing) continue;
      // 僵尸传送 (原版 UpdatePortal 2914-2937: |zx-(col*80+25)|≤45)
      for (const z of this.zombies) {
        if (z.dead || z.row !== p.row || z.lastPortalX === p.col) continue;
        const zx = z.x + (z.zombieRect ? z.zombieRect.x + z.zombieRect.w / 2 : 40);
        const ppx = p.col * 80 + 25;
        if (Math.abs(zx - ppx) <= 45) {
          const diffX = zx - z.x;
          z.posX = other.col * 80 - diffX;
          z.x = Math.floor(z.posX);
          z.setRow(other.row);
          z.posY = this.getPosYBasedOnRow(other.row);
          z.y = Math.floor(z.posY);
          z.lastPortalX = other.col;
          try { this.game.audio.play('portal'); } catch (e) { }
        }
      }
      // 直线子弹传送 (原版 2939-2962: |px-(col*80+55)|≤40, y 随行差 ×100)
      for (const pr of this.projectiles) {
        if (pr.dead || pr.def.lob || pr.def.cob || pr.def.gloom || pr.def.fume || pr.zombieProj) continue;
        if (pr.row !== p.row || pr.lastPortalX === p.col) continue;
        const ppx = p.col * 80 + 55;
        if (Math.abs(pr.x - ppx) <= 40) {
          const dy = (other.row - p.row) * 100;
          pr.x += other.col * 80 - pr.x + 60;
          pr.row = other.row;
          pr.y += dy;
          pr.lastPortalX = other.col;
        }
      }
      // 割草机传送 (原版 2965-2983: |mx+45-(col*80+25)|≤20)
      for (const m of this.mowers) {
        if (!m || m.state !== 'running' || m.row !== p.row || m.lastPortalX === p.col) continue;
        const mx = m.x + 45;
        const ppx = p.col * 80 + 25;
        if (Math.abs(mx - ppx) <= 20) {
          m.x = other.col * 80 + 25;
          m.row = other.row;
          m.lastPortalX = other.col;
        }
      }
    }
    // 周期搬家 (原版 UpdatePortalCombat: 首次 9000tick, 之后每 6000; 剩500时提示)
    this.portalCounter -= tk;
    if (this.portalCounter === 500) {
      this.addEffect('text', 400, 320, { hold: 2, txt: '传送门即将搬家!', c: '#9ad8ff', size: 16 });
    } else if (this.portalCounter <= 0) {
      this.portalCounter = 6000;
      this.moveAPortal();
    }
  }
  // 原版 MoveAPortal 3014-3062: 随机挑一门搬迁; 新位不得与伙伴同列/同行/压门
  moveAPortal() {
    const open = this.portals.filter(p => !p.closing);
    if (!open.length) return;
    const p = open[Math.floor(Math.random() * open.length)];
    const other = this.portalPartner(p);
    if (!other) return;
    const cands = [];
    for (let gx = 0; gx < 10; gx++) {
      for (let gy = 0; gy < 5; gy++) {
        if (gx === other.col || gy === other.row) continue;
        if (this.portals.some(q => q !== p && !q.closing && q.col === gx && q.row === gy)) continue;
        cands.push([gx, gy]);
      }
    }
    if (!cands.length) return;
    const pick = cands[Math.floor(Math.random() * cands.length)];
    if (p.anim) { p.anim.play('anim_dissapear', RE.PLAY_ONCE_HOLD, 0, 24); p.closing = true; }
    p.col = pick[0]; p.row = pick[1];
    try { this.game.audio.play('portal'); } catch (e) { }
  }
  // 原版 PortalCombatRowSpawnWeight 3096-3106: 近割草机(门链距离<5) 0.01 / 有门行 1.0 / 其他 0.2
  portalDistanceToMower(row) {
    let gx = 10, gy = row, dist = 0, guard = 8;
    while (dist < 40 && guard-- > 0) {
      const left = this.portals.filter(q => !q.closing && q.row === gy && q.col < gx)
        .sort((a, b) => b.col - a.col)[0];
      if (!left) { dist += gx; break; }
      const other = this.portalPartner(left);
      if (!other) { dist += gx - left.col; break; }
      dist += gx - left.col;
      gx = other.col;
      gy = other.row;
    }
    return dist;
  }
  portalRowWeight(r) {
    if (this.portalDistanceToMower(r) < 5) return 0.01;
    if (this.portals.some(p => !p.closing && p.row === r)) return 1.0;
    return 0.2;
  }

  // ============================================================
  // 最后防线 (原版 LastStand — Challenge.cpp 4855-4940)
  // ============================================================
  lastStandStageComplete() {
    this.lsStage++;
    const flags = this.lsStage;
    this.game.audio.play('hugewave');
    // 卡片刷新 (原版 RefreshAllPackets)
    for (const c of this.seedCards) c.cd = 0;
    if (flags >= 5) {
      // 5 面旗防守成功 → 奖杯 (原版 SurvivalCompletedStage → 奖励)
      this.triggerWin();
      return;
    }
    this.addEffect('text', 400, 300, { hold: 3, txt: '成功防守 ' + flags + ' 面旗帜!', c: '#ffe86a', size: 24 });
    // 重建下一阶段波次 (原版 points = (stage*10+wave+10)*2/5+1)
    this.lsPhase = 'build';
    this.wavesStarted = false;
    this.wave = 0;
    this.waves = this.buildWaves(this.level);
    this.totalWaves = this.waves.length;
    this.hugeWaveWarned = false;
  }
  lastStandStartOnslaught() {
    this.lsPhase = 'onslaught';
    this.wavesStarted = false;
    this.beginWaves();
    this.addEffect('text', 400, 250, { hold: 1.6, txt: '一大波僵尸正在接近!', c: '#ff6a5a', size: 22 });
  }

  // 模式点击处理 (返回 true 表示已消费)
  modeClick(game, p) {
    if (this.state !== 'playing') return false;
    // 最后防线: 建造期"开始进攻"按钮 (原版 StoreButton: (300,559,210×46) / 续期 (270,559,257×46))
    if (this.level.lastStand && this.lsPhase === 'build') {
      const first = this.lsStage === 0;
      const bx = first ? 300 : 270, bw = first ? 210 : 257;
      if (p.x >= bx && p.x <= bx + bw && p.y >= 549 && p.y <= 605) {
        game.audio.play('gravebutton');
        this.lastStandStartOnslaught();
        return true;
      }
      return false;
    }
    switch (this.mode) {
      case 'beghouled': return this.modeClickBeghouled(game, p);
      case 'zombiquarium': return this.modeClickZombiquarium(game, p);
      case 'slotmachine': {
        // 拉杆热区 (原版 SlotMachineGetHandleRect: seedBank.x+473, y, 55×80)
        if (p.x >= 473 && p.x < 528 && p.y >= 0 && p.y < 80) {
          return this.slotPull(game);
        }
        // 转轮上点击非植物符号 → 提示拉杆 (原版 SeedPacket::MouseDown 733-741)
        // 种子包拾取 (原版 COIN_USABLE_SEED_PACKET/阳光/钻石 → 点击收集)
        for (const pk of this.slotPayouts) {
          if (pk.taken) continue;
          if (Math.abs(p.x - pk.x) < 28 && Math.abs(p.y - (pk.y - 20)) < 34) {
            pk.taken = true;
            if (pk.kind === 'seed') {
              game.freePlant = pk.plant;
              game._freePlantPos = { x: pk.x, y: pk.ground };
              game.selectedCard = -1;
              game.audio.play('seedlift');
            } else if (pk.kind === 'sun') {
              this.sun = Math.min(9990, this.sun + CONST.SUN_VALUE);
              game.audio.play('points');
            } else {
              // 钻石 → 金币奖励 (原版 COIN_DIAMOND)
              game.coins += 1000;
              game.saveShop();
              game.audio.play('coin');
            }
            return true;
          }
        }
        return false;   // 其余交给通用逻辑 (选卡/种植/收阳光)
      }
      case 'whack': {
        // ---- 原版 Board::MouseHitTest: 锤子光标下 阳光/种子银行点击优先于锤击 ----
        // 种植进行中 → 交回通用逻辑 (选格种植/右键取消)
        if (game.selectedCard >= 0 || game.freePlant) return false;
        // 阳光 (原版 Coin MouseHitTest → 收集)
        for (const s of this.suns) {
          if (!s.collected && !s.dead && Math.abs(p.x - s.x) < 35 && Math.abs(p.y - s.y) < 35) return false;
        }
        // 种子银行区域 (原版 SeedBank MouseHitTest; 银行完全滑入后才可点)
        if (p.y < 87 && this.whackBankShown && this.seedBankY > -10) return false;
        // ---- 原版 Challenge::MouseDownWhackAZombie ----
        // 每次点击: 挥锤音效 + 动画重置 (FOLEY_SWING)
        if (game._whackMallet) {
          try { game._whackMallet.play('anim_whack_zombie', RE.PLAY_ONCE_HOLD, 24); } catch (e) { }
        }
        game.audio.play('swing');
        // 命中判定: 圆(x, y-20, r=45) ∩ 僵尸矩形, 取渲染序最高 (原版 GetCircleRectOverlap)
        let top = null;
        for (const z of this.zombies) {
          if (z.dead || z.isDeadOrDying) continue;
          const r = z.zombieRect;
          if (!r) continue;
          const rx = z.x + r.x, ry = z.y + r.y, rw = r.w, rh = r.h;
          const cx = Math.max(rx, Math.min(p.x, rx + rw));
          const cy = Math.max(ry, Math.min(p.y - 20, ry + rh));
          if ((cx - p.x) * (cx - p.x) + (cy - (p.y - 20)) * (cy - (p.y - 20)) <= 45 * 45) {
            if (!top || z.renderOrder >= top.renderOrder) top = z;
          }
        }
        if (top) {
          if (top.helmType) {
            // 原版: 有头盔 → TakeHelmDamage(900) (路障一锤击落; 铁桶 1100 血需两锤)
            game.audio.play(top.helmType === 'bucket' ? 'shieldhit' : 'snowpea_splat');
            top.takeHelmDamage(900, 0);
          } else {
            // 原版: 无头盔 → BONK + POW粒子 + DieWithLoot (秒杀并掉落阳光/金币)
            game.audio.play('bonk');
            this.addEffect('pow', p.x - 3, p.y + 9);
            top.dieWithLoot();
            this.whackScore += 1;
          }
        }
        return true;   // 其余点击吞掉 (锤击挥空)
      }
      case 'vasebreaker': {
        // 轮间戴夫对话优先 (原版 IsScaryPotterDaveTalking 冻结交互)
        if (this.vaseDave) return this.vaseDaveClick(game);
        // 免费植物种植中 → 放行给 gameClick 的种植逻辑 (原版 CursorObject PLANT_FROM_USABLE_COIN)
        if (game.freePlant) return false;
        // 阳光罐掉落的阳光可收集 (原版 COIN_SUN 点击 → 交给 gameClick 通用收集)
        for (const s of this.suns) {
          if (!s.collected && Math.abs(p.x - s.x) < 35 && Math.abs(p.y - s.y) < 35) return false;
        }
        // 种子银行区域 (阳光计数 + 樱桃炸弹卡 + 铲子槽) → 交给 gameClick 通用逻辑
        if (p.y < 87) return false;
        // 可用种子包拾取 (原版: 点击 → 光标变免费植物)
        for (const pk of this.vasePackets) {
          if (pk.taken) continue;
          if (Math.abs(p.x - pk.x) < 30 && Math.abs(p.y - (pk.y - 35)) < 42) {
            pk.taken = true;
            game.freePlant = pk.plant;      // 拿起免费植物 (种植不扣阳光)
            game._freePlantPos = { x: pk.x, y: pk.ground };   // 右键取消时放回原地
            game.selectedCard = -1;
            game.shovelMode = false;
            game.audio.play('seedlift');
            return true;
          }
        }
        // 罐子点击 → 锤击 (原版 MouseHitTest → ScaryPotterMalletPot; 锤动画期间锁定其它罐)
        if (!this.mallet) {
          for (const v of this.vases) {
            if (v.broken) continue;
            // 原版罐子位置: GridToPixelX-5, GridToPixelY-15 (80x90 命中区)
            const vx = this.gridX(v.col) - 5, vy = this.cellY(v.row, v.col) - 15;
            if (p.x > vx && p.x < vx + 80 && p.y > vy && p.y < vy + 95) {
              this.scaryPotterMalletPot(v, game);
              return true;
            }
          }
        }
        return true;
      }
      case 'izombie': {
        // 卡片点击 → 选中僵尸种类 (原版 SeedPacket 无冷却; 渲染位置 62+i*60)
        for (let i = 0; i < this.zombieCards.length; i++) {
          const x = 62 + i * 60;
          if (p.x > x && p.x < x + 50 && p.y > 0 && p.y < 78) {
            game.selectedZombieCard = game.selectedZombieCard === i ? -1 : i;
            game.audio.play('seedlift');
            return true;
          }
        }
        // 场地点击 → 红线右侧放置选中僵尸 (原版 CanPlantAt: theGridX >= aLimit)
        if (game.selectedZombieCard >= 0) {
          const card = this.zombieCards[game.selectedZombieCard];
          const cell = game.pixelToCell(p.x, p.y);
          if (cell) {
            const [col, row] = cell;
            if (col < this.izombieLimit) {
              game.audio.play('buzzer');   // 原版 ADVICE_I_ZOMBIE_NOT_PASSED_LINE
            } else if (this.sun >= card.cost) {
              // 原版 IZombiePlaceZombie: 生成于 GridToPixelX-30
              const z = this.spawnZombieForWave(card.type, row, this.wave);
              if (z) { z.posX = this.gridX(col) - 30; z.x = Math.floor(z.posX); this.sun -= card.cost; game.audio.play('gravebuttonchime'); }
            } else game.audio.play('buzzer');
          }
          game.selectedZombieCard = -1;
          return true;
        }
        return true;
      }
      case 'raining': {
        // 点击掉落的种子包 → 拾取
        for (const c of this.rainCards) {
          if (c.taken) continue;
          if (Math.abs(p.x - c.x) < 32 && Math.abs(p.y - c.y) < 34) {
            c.taken = true;
            this.heldCards.push({ type: c.type, life: 14 });
            game.audio.play('seedlift');
            return true;
          }
        }
        // 点击持有卡 → 选择
        for (let i = 0; i < this.heldCards.length; i++) {
          const x = 130 + i * 60;
          if (p.x > x && p.x < x + 50 && p.y > 6 && p.y < 76) {
            game.selectedCard = game.selectedCard === i ? -1 : i;
            game.audio.play('seedlift');
            return true;
          }
        }
        return false;
      }
    }
    return false;
  }

  // 原版 Challenge::ScaryPotterMalletPot — 点击罐子生成锤子动画
  scaryPotterMalletPot(v, game) {
    const x = this.gridX(v.col) - 5, y = this.cellY(v.row, v.col) - 15;
    let anim = null;
    if (RE.hasDef('Hammer')) {
      anim = Assets.reanim('Hammer');
      // 原版 (Challenge.cpp:3813): PlayReanim("anim_pot_open", PLAY_ONCE_AND_HOLD, 0, 40.0f)
      //   + FOLEY_SWING 点击瞬间挥击音效 (#7)
      anim.play('anim_open_pot', RE.PLAY_ONCE_HOLD, 40);
      anim.setPosition(x + 20, y - 45);
    }
    this.mallet = { vase: v, t: 0, anim, opened: false };
    game.audio.play('swing');   // 原版 FOLEY_SWING
  }

  // 原版 Challenge::ScaryPotterOpenPot — 开罐结果
  scaryPotterOpenPot(v, game) {
    if (v.broken) return;
    v.broken = true;
    const x = this.gridX(v.col) - 5, y = this.cellY(v.row, v.col) - 15;
    // 碎瓷粒子 (原版 PARTICLE_VASE_SHATTER)
    this.addEffect('vase_shatter', x + 40, y + 40, { leaf: v.state === 'leaf', zombie: v.state === 'zombie' });
    game.audio.play('vase_breaking');
    game.audio.play('bonk');
    if (v.isSun) {
      // 原版 SCARYPOT_SUN: AddCoin(aXPos+15*i, aYPos, COIN_SUN, FROM_PLANT) × sunCount
      for (let i = 0; i < (v.sunCount || 1); i++) {
        this.addSun(x + 40 + 15 * i, y + 30, y + 55 + Math.random() * 20, 'plant');
      }
    } else if (v.isPlant) {
      // 原版: AddCoin(x+20, y, COIN_USABLE_SEED_PACKET) — 掉出可用种子包
      this.vasePackets.push({
        plant: v.content, x: x + 30, y: y + 20, vx: (Math.random() - 0.5) * 80,
        vy: -190, ground: y + 55, life: 15, t: 0, taken: false,
      });
    } else {
      // 原版: AddZombieInRow 原地出现
      const z = this.spawnZombieForWave(v.content, v.row, this.wave);
      if (z) { z.posX = this.gridX(v.col) + 30; z.x = Math.floor(z.posX); }
    }
  }

  // 兼容旧名
  breakVase(v, game) { this.scaryPotterOpenPot(v, game); }

  // 原版 Board::GetScaryPotAt: 该格上的未开罐子
  getScaryPotAt(col, row) {
    return this.vases.find(v => !v.broken && v.col === col && v.row === row) || null;
  }

  // 原版 Challenge::ScaryPotterJackExplode: 小丑爆炸震开 3×3 格内全部罐子
  scaryPotterJackExplode(x, y) {
    const cell = this.game.pixelToCell(x, y);
    if (!cell) return;
    const [cx, cy] = cell;
    for (const v of this.vases.slice()) {
      if (v.broken) continue;
      if (Math.abs(v.col - cx) <= 1 && Math.abs(v.row - cy) <= 1) this.scaryPotterOpenPot(v, this.game);
    }
  }

  canPlantOn(row, col) {
    if (this.isWater(row, col)) return this.gridLily[row][col] && !this.grid[row][col];
    if (this.isRoof) return (this.gridPot[row][col] || this.gridLily[row][col]) && !this.grid[row][col];
    return !this.grid[row][col] && !this.craters.some(c => c.row === row && c.col === col) &&
      !this.iceTrails.some(c => c.row === row && c.col === col) && !this.graves.some(g => g.row === row && g.col === col);
  }
}

// ===== 实体类 =====
class Sun {
  constructor(x, y, targetY, from) {
    this.x = x; this.y = y; this.targetY = targetY;
    this.from = from;
    this.value = CONST.SUN_VALUE;
    this.life = CONST.SUN_LIFETIME;
    this.dead = false;
    this.collected = false;
    this.vx = (Math.random() - 0.5) * 30;
    this.vy = 0;
    this.landed = false;
    this.phase = Math.random() * Math.PI * 2;
    this.flyT = 0;
  }
  update(dt, board) {
    if (this.collected) {
      this.flyT += dt * 4;
      const tx = 30, ty = -30;
      this.x += (tx - this.x) * Math.min(1, dt * 8);
      this.y += (ty - this.y) * Math.min(1, dt * 8);
      if (this.flyT > 1.2) this.dead = true;
      return;
    }
    if (this.from === 'coin') {
      // 原版 COIN_MOTION_COIN: 掉落阳光的弹出物理 (vy 上抛 + 重力 + 落地弹跳衰减)
      if (!this.landed) {
        this.vy += 500 * dt;
        this.y += this.vy * dt;
        this.x += this.vx * dt;
        if (this.y >= this.targetY) {
          this.y = this.targetY;
          if (Math.abs(this.vy) > 80) this.vy = -this.vy * 0.4;
          else { this.vy = 0; this.vx = 0; this.landed = true; }
        }
      }
    } else if (this.y < this.targetY) {
      this.y += 40 * dt;
      if (this.from === 'sky') this.x += this.vx * dt;
    }
    this.phase += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

class Coin {
  constructor(x, y, value, type) {
    this.x = x; this.y = y; this.value = value;
    this.vy = -120; this.vx = (Math.random() - 0.5) * 40;
    this.ground = y + 30;
    this.life = 12; this.dead = false; this.collected = false; this.flyT = 0;
    this.kind = null;   // 'present' 礼物植物 / 'chocolate' 巧克力 (原版 CoinType)
    this.type = type || (Math.random() < 0.1 ? 'diamond' : 'gold');
  }
  update(dt, board) {
    if (this.collected) {
      this.flyT += dt * 4;
      this.x += (30 - this.x) * Math.min(1, dt * 8);
      this.y += (-20 - this.y) * Math.min(1, dt * 8);
      if (this.flyT > 1) { this.dead = true; board.sun += this.value; }
      return;
    }
    this.vy += 300 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    // #6 原版 Coin::UpdateFall 落地分支: mPosY=mGroundY 吸附, 速度不再使用 → 落地即停
    if (this.y > this.ground) { this.y = this.ground; this.vy = 0; this.vx = 0; }
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

class Effect {
  constructor(name, x, y, opts) {
    this.name = name; this.x = x; this.y = y;
    this.t = 0; this.dead = false;
    this.opts = opts || {};
    this.reanim = null;
    // 罐子碎裂粒子 (原版 PARTICLE_VASE_SHATTER: 8-12片碎片 弹出+重力)
    if (name === 'vase_shatter') {
      this.parts = [];
      const n = 8 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        this.parts.push({
          cx: Math.floor(Math.random() * 9) * 32, cy: Math.floor(Math.random() * 3) * 32,
          vx: (Math.random() - 0.5) * 160,
          vy: -150 - Math.random() * 120,
          vr: (Math.random() - 0.5) * 12,
          rot: Math.random() * Math.PI * 2,
        });
      }
    }
    // 小喷菇命中水滴 (原版 PuffSplat: 10 颗水滴全向爆发 + 重力下落)
    if (name === 'puffsplat') {
      this.parts = [];
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 50 + Math.random() * 30;
        this.parts.push({
          x: (Math.random() * 2 - 1) * 9.7, y: (Math.random() * 2 - 1) * 9.7,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 8,
        });
      }
    }
    // 小喷菇尾迹水滴 (原版 PARTICLE_PUFFSHROOM_TRAIL / godot bullet_003_puff 尾迹发射器:
    //   弹后-8px 处持续喷 puff2 小水滴, 9.67半径散布, 随机角度, 无重力, 0.5s 淡出)
    if (name === 'pufftrail') {
      this.fx = (Math.random() * 2 - 1) * 9.7;
      this.fy = (Math.random() * 2 - 1) * 9.7;
      this.frot = Math.random() * Math.PI * 2;
      const ang = Math.random() * Math.PI * 2;
      this.fvx = Math.cos(ang) * 8;
      this.fvy = Math.sin(ang) * 8;
    }
    if (name === 'puffmuzzle') this.life = 0.28;
    // #修复(僵王尾迹): 原版 PARTICLE_FIREBALL/ICEBALL_TRAIL 地面火苗/冰晶粒子
    //   素材条: fire 208×17 = 13帧×16, ice 152×23 = 8帧×19
    if (name === 'firetrail') this.fi = Math.floor(Math.random() * 13);
    if (name === 'icetrail') this.fi = Math.floor(Math.random() * 8);
    // #修复(碎西瓜): 原版 PARTICLE_MELONSPLASH / PARTICLE_WINTERMELON — 9 块瓜皮红瓢碎块弹飞
    //   (原素材 melonpult_particles / wintermelon_particles 334×37 精确分段盒, 尺寸递减)
    if (name === 'melonchunks') {
      this.parts = [];
      const SHEET = [ // [x0, x1, y0, y1] — 透明分段实测盒
        [4, 31, 2, 34], [39, 70, 4, 34], [76, 107, 2, 35], [115, 143, 3, 34], [152, 179, 6, 29],
        [193, 213, 7, 28], [233, 248, 8, 29], [271, 283, 12, 25], [311, 319, 15, 22],
      ];
      for (let i = 0; i < SHEET.length; i++) {
        const [x0, x1, y0, y1] = SHEET[i];
        const dir = (i % 2 === 0 ? -1 : 1) * (0.4 + Math.random() * 0.6);   // 左右交替半球向外
        this.parts.push({
          sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1,
          x: 0, y: 0,
          vx: dir * (60 + Math.random() * 110),
          vy: -(90 + Math.random() * 170),
          vr: (Math.random() - 0.5) * 14,
          rot: Math.random() * Math.PI * 2,
          sc: 1 + (i < 4 ? 0.25 : 0),   // 大块稍放大增强可见性
        });
      }
    }
  }
  update(dt, board) {
    this.t += dt;
    switch (this.name) {
      case 'splat': case 'snowsplat': case 'firesplat': if (this.t > 0.5) this.dead = true; break;
      case 'pow': if (this.t > 0.5) this.dead = true; break;   // 原版 PARTICLE_POW (锤击粉云 0.5s)
      case 'puffsplat': {
        // 原版 PuffSplat: 10 颗水滴, 重力 +100px/s², 0.5s 消散
        for (const p of this.parts || []) {
          p.vy += 100 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
        }
        if (this.t > 0.5) this.dead = true;
        break;
      }
      case 'firetrail': case 'icetrail':
        // 僵王冰火球地面尾迹 (原版 TRAIL 粒子 0.6s 淡出, 火苗轻微上飘)
        if (this.t > 0.6) this.dead = true;
        break;
      case 'puffmuzzle': if (this.t > 0.28) this.dead = true; break;   // 原版 PuffShroomMuzzle 短促喷雾
      case 'pufftrail': {
        // 尾迹水滴: 微速漂移 + 0.5s 消散 (原版 PuffShroomTrail)
        this.x += (this.fvx || 0) * dt;
        this.y += (this.fvy || 0) * dt;
        if (this.t > 0.5) this.dead = true;
        break;
      }
      case 'explosion': if (this.t > 0.9) this.dead = true; break;
      case 'spudow': if (this.t > 0.9) this.dead = true; break;
      case 'boom': if (this.t > 1.2) this.dead = true; break;
      case 'flash': if (this.t > 0.3) this.dead = true; break;
      case 'dust': if (this.t > 0.8) this.dead = true; break;
      case 'sod_dirt': if (this.t > (this.opts.dur || 0.6)) this.dead = true; break;
      case 'chomper_bite': if (this.t > 0.3) this.dead = true; break;
      case 'zag': if (this.t > 0.4) this.dead = true; break;
      case 'text': if (this.t > (this.opts.hold || 2)) this.dead = true; break;
      case 'screen_flash': if (this.t > 0.7) this.dead = true; break;
      case 'vase_shatter': {
        // 碎片物理: 重力500, 弹跳0.5, 5s清理 (原版 pot_vase_chunks)
        for (const p of this.parts || []) {
          p.vy += 500 * dt;
          p.x = (p.x === undefined ? 0 : p.x) + p.vx * dt;
          p.y = (p.y === undefined ? 0 : p.y) + p.vy * dt;
          p.rot += p.vr * dt;
        }
        if (this.t > 1.4) this.dead = true;
        break;
      }
      case 'melonchunks': {
        // #修复(碎西瓜): 9 块碎瓜弹飞 — 重力 700, 自旋, 1.1s 消散
        for (const p of this.parts || []) {
          p.vy += 700 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
        }
        if (this.t > 1.1) this.dead = true;
        break;
      }
      case 'daisy': if (this.t > 3.5) this.dead = true; break;   // 智慧树 daisies: 僵尸死处留雔菊 (停留后淡出)
      case 'candy': {
        // 智慧树 pinata: 僵尸死吐糖果 — 10 颗彩糖抛物线弹飞 (重力 520)
        if (!this.parts) {
          this.parts = [];
          const COLS = ['#ff5a6e', '#ffd34d', '#7fd4ff', '#9be564', '#d78dff', '#ffa85c'];
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i / 9 - 0.5) * Math.PI * 1.1;
            this.parts.push({ vx: Math.cos(a) * (140 + Math.random() * 90), vy: Math.sin(a) * (190 + Math.random() * 130), rot: Math.random() * 6, vr: -6 + Math.random() * 12, c: COLS[i % COLS.length], r: 3 + Math.random() * 2.5 });
          }
        }
        for (const p of this.parts) { p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
        if (this.t > 1.3) this.dead = true;
        break;
      }
      default: if (this.t > 1) this.dead = true;
    }
    if (this.reanim) this.reanim.update(dt);
  }
}

// 掉落肢体粒子 (断臂/掉头/掉盔)
class LimbParticle {
  // 原版 PARTICLE_ZOMBIE_HEAD / PARTICLE_ZOMBIE_ARM 粒子行为 (#4):
  //   向上抛出 → 重力下落 → 落到行地面反弹 (高度衰减) → 弹跳滚动 →
  //   静止停留 ~1.2s 后淡出消失 (旧实现: 一路掉出屏幕外, 无落地)
  // 抛物参数 (godot ZombieHeadDrop / ZombieArm1Drop):
  //   头: vx∈(-70,70) 双向随机上抛 vy∈(-200,-100), 转速 vx/50
  //   手臂/掉落物: vx∈(-15,15) 水平小抛 vy=0 (旧实现恒向左上大抛 — 手臂飞过远)
  constructor(kind, x, y, imgName, board, row) {
    this.kind = kind; this.x = x; this.y = y;
    this.imgName = imgName || null;
    // 地面 = 僵尸所在行格底 (#修复: 旧实现按掉落点像素反查行 — 头部生成于上一行区域,
    //   导致头颅落到上一行地面悬空; 现按僵尸行计算, 与脚线 gridY+rowH-22 对齐)
    const rowH = board && board.waterRows && board.waterRows.length ? 85 : 100;
    if (row !== undefined && row !== null && row >= 0 && board) {
      this.ground = board.gridY(row) + rowH - 22;
    } else {
      const rIdx = board ? board.pixelToGridY(x, y) : 0;
      this.ground = board ? board.gridY(rIdx) + rowH - 22 : y + 60;
    }
    if (kind === 'head') {
      this.vx = -70 + Math.random() * 140;
      this.vy = -(100 + Math.random() * 100);
      this.vr = this.vx / 50;
    } else if (kind === 'cone' || kind === 'bucket' || kind === 'helm') {
      // #4 防具上抛旋转抛物线 (原版 ZombieTrafficCone/Pail/Helmet 粒子 — XML 资产失传,
      //   数值参照原版视觉: 防具被打飞弹起 + 翻滚旋转 + 落地弹跳; 旧实现 vy=0 直坠滑落)
      this.vx = -40 + Math.random() * 80;                   // 双向随机
      this.vy = -(150 + Math.random() * 100);               // 上抛 150~250 px/s
      this.vr = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3);  // 翻滚 ±3~6 rad/s
    } else {
      this.vx = -15 + Math.random() * 30;
      this.vy = 0;
      this.vr = -2 + Math.random() * 4;
    }
    this.rot = 0;
    this.t = 0; this.dead = false;
    this.bounces = 0;
    this.rest = 0;             // 落地静止计时
  }
  update(dt) {
    this.t += dt;
    if (this.bounces >= 3 || this.rest > 0) {
      // 静止期: 停在地上, 滚动停止, 1.2s 后淡出
      this.rest += dt;
      this.rot += Math.max(0, this.vr) * dt * 0.1;
      if (this.rest > 1.2) this.dead = true;
      return;
    }
    this.vy += 500 * dt;          // godot ZombieDropBase.gravity = 500
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    if (this.y >= this.ground) {
      // 落地: 弹起 (vy 反弹衰减 0.5, 旋转衰减), 速度不足 30 进入静止
      this.y = this.ground;
      this.bounces++;
      if (Math.abs(this.vy) < 30) {
        this.rest = 0.001; this.vy = 0;
      } else {
        this.vy = -this.vy * 0.5;
        this.vx *= 0.55;
        this.vr *= 0.5;
      }
    }
  }
}

if (typeof module !== 'undefined') module.exports = { Board, Sun, Coin, Effect, LimbParticle, SCENE_BG, sceneBgName, RENDER_LAYER };

function easeOut01(p) { return 1 - (1 - p) * (1 - p); }
function shuffleB(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
