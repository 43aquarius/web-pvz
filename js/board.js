// ============================================================
// board.js — 战场核心 (Board.cpp 移植 + 已验证波次系统)
//  - 100Hz 固定 tick (SECONDS_PER_UPDATE=0.01 语义)
//  - 原版网格: GridToPixelX=col*80+40 / GridToPixelY=行高100|85+80 / 屋顶坡度
//  - 渲染顺序系统: renderOrder = row*10000 + layer + offset
//  - GetTopPlantAt / 泳池判定 / 高地 / 梯子 / 冰道 / 践踏
//  - 割草机 → Zombie.mowDown()
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, MODE_LEVELS, zombieAllowedOnLevel, WAVE, MUSHROOMS, AQUATIC, GROUNDCOVER, availablePlants } = require('./data');
const CHM = require('./challenge');
const { Zombie, H } = require('./zombie');
const RE = require('./reanim');
const { Projectile } = require('./projectiles');
const { Banners } = require('./cutscene');

const SCENE_BG = {
  day: 'background1.jpg', night: 'background2.jpg',
  pool: 'background3.jpg', fog: 'background4.jpg', roof: 'background5.jpg',
};

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
    this.isRoof = level.scene === 'roof';
    this.isNight = level.scene === 'night' || level.scene === 'fog';
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
    this.ladders = [];         // 梯子 GridItem
    this.craters = [];
    this.iceTrails = [];
    this.iceTimers = new Array(this.rows).fill(0);
    this.iceMinXs = new Array(this.rows).fill(900);
    this.seedCards = [];
    this.shakeX = 0; this.shakeY = 0;
    this.plantsEaten = 0;
    this.time = 0;
    this.speed = 1;

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

    // 割草机 (特殊玩法关卡无割草机: 保龄球/打僵尸/罐子/我不是僵尸)
    // 原版: 泳池清洁车/屋顶清洁车需在戴夫商店购买
    const noMowerModes = ['bowling', 'whack', 'vasebreaker', 'izombie'];
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
    // 返回该格最顶层可交互植物 (原版: 南瓜壳在外层, 僵尸先吃南瓜)
    const order = { eating: ['pumpkin', 'grid'], normal: ['pumpkin', 'grid'], bungee: ['pumpkin', 'grid', 'pot', 'lily'] };
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
        z.takeDamage(1800, 1);
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
    return zombieAllowedOnLevel(ty, this.level.id);
  }
  introZombieType() {
    const lv = this.level.id;
    if (lv <= 1) return null;
    for (const ty of Object.keys(ZOMBIES)) {
      const d = ZOMBIES[ty];
      const cp = this.level.zombiePool;
      if (cp && !cp.includes(ty)) return null;
      if (d.unlock === lv && d.weight > 0 && !d.boss && ty !== 'DUCKY') return ty;
    }
    return null;
  }
  buildWaves(level) {
    // 特殊玩法: 自管理波次 (罐子/我是僵尸/老虎机/水族馆无常规波)
    if (['vasebreaker', 'izombie', 'slotmachine', 'zombiquarium'].includes(level.fixed)) return [];
    // 自定义僵尸池 (小游戏 zombiePool 字段): 只从池中刷
    const customPool = level.zombiePool || null;
    const lv = level.id > 50 ? 50 : level.id;   // 额外模式(生存等)按满级僵尸池
    let numWaves = level.endless ? 200 : level.waves;
    // 生存模式: 每段波数由 challenge 管理
    if (level.survival) numWaves = level.waves;
    const wavesPerFlag = numWaves >= 10 ? 10 : numWaves;
    const intro = this.introZombieType();
    const out = [];
    for (let w = 0; w < numWaves; w++) {
      const isFlag = numWaves >= 10 && w % wavesPerFlag === wavesPerFlag - 1 && lv !== 1;
      const isFinal = !level.endless && w === numWaves - 1;
      const types = [];
      let points = level.endless ? Math.min(26, Math.floor(w / 2.2) + 1) : Math.floor(w / 3) + 1;
      if (level.fixed === 'boss' && isFinal) {
        out.push({ flag: false, final: true, boss: true, count: 1, types: [['BOSS', 1]] });
        continue;
      }
      if (isFlag) {
        const plain = Math.min(points, 8);
        points = Math.round(points * 2.5);
        types.push(['NORMAL', plain]);
        types.push(['FLAG', 1]);
      }
      if (intro && !isFlag) {
        if (w === Math.floor(numWaves / 2) || isFinal) types.push([intro, 1]);
      }
      if (isFinal) {
        for (const ty of Object.keys(ZOMBIES)) {
          if (ty === 'FLAG' || ty === 'BOSS') continue;
          if (this.canSpawnType(ty) && !types.some(([t]) => t === ty)) types.push([ty, 1]);
        }
      }
      if (!level.endless && lv === 50 && isFinal && !types.some(([t]) => t === 'GARGANTUAR')) types.push(['GARGANTUAR', 1]);
      const pool = Object.keys(ZOMBIES).filter(ty => {
        const d = ZOMBIES[ty];
        if (d.weight <= 0 || d.boss) return false;
        if (customPool && !customPool.includes(ty)) return false;
        if (!customPool && !zombieAllowedOnLevel(ty, lv)) return false;
        if (!customPool && (d.firstWave || 1) > w + 1) return false;
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
    // 戴夫的耙子 (原版: 商店购买, 自动消灭本关第一只僵尸)
    if (this.game && this.game.purchased && this.game.purchased['rake'] && !this.rakeUsed && z.fromWave !== -2) {
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

  // ---------- 主循环: 100Hz tick ----------
  update(dt) {
    if (this.state === 'win' || this.state === 'lose') { this.updateVisuals(dt); return; }
    this.time += dt;
    // 注: dt 已是乘过 speed 的秒数 (main.js: sdt = dt * board.speed), 此处不再二次乘速
    const ticks = Math.max(1, Math.round(dt * 100));
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
    if (this.level.skySun) {
      this.skySunTimer -= tickDt;
      if (this.skySunTimer <= 0) {
        this.skySunTimer = CONST.SKY_SUN_INTERVAL[0] + Math.random() * (CONST.SKY_SUN_INTERVAL[1] - CONST.SKY_SUN_INTERVAL[0]);
        this.spawnSkySun();
      }
    }
    // 实体: 僵尸/植物按tick, 子弹按帧
    for (let i = 0; i < ticks; i++) {
      for (const z of this.zombies) if (!z.dead) z.update();
      for (const p of this.plants) if (!p.dead) p.tick && p.tick();
      this.tick++;
    }
    for (const p of this.plants) if (!p.dead) p.update(dt, this);
    for (const pr of this.projectiles) if (!pr.dead) pr.update(dt, this);
    for (const s of this.suns) s.update(dt, this);
    for (const c of this.coins) c.update(dt, this);
    for (const m of this.mowers) this.updateMower(m, dt);
    this.updateMode(dt);
    this.updateVisuals(dt);
    // 清理 (含网格引用清理 — 保证格子可复种 #14)
    for (const p of this.plants) {
      if (p.dead) this.ungGridPlantSafe(p);
    }
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

  ungGridPlantSafe(p) {
    // 死亡植物的网格引用清理 (board级兜底, 修复格子无法复种)
    if (!p || p.row == null || p.col == null) return;
    try {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < 9; c++) {
          if (this.grid[r][c] === p) this.grid[r][c] = null;
          if (this.gridLily[r][c] === p) this.gridLily[r][c] = null;
          if (this.gridPot[r][c] === p) this.gridPot[r][c] = null;
          if (this.gridPumpkin[r][c] === p) this.gridPumpkin[r][c] = null;
          if (this.gridSpikes[r][c] === p) this.gridSpikes[r][c] = null;
        }
      }
    } catch (e) { }
  }
  updateVisuals(dt) {
    // reanim 特效池
    for (const r of this.reanims) r.update(dt);
    this.reanims = this.reanims.filter(r => !r.dead);
    for (const e of this.effects) e.update(dt, this);
    this.effects = this.effects.filter(e => !e.dead);
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
  addLimbParticle(kind, x, y) {
    // 掉落肢体: 简化物理粒子 (原版为 AttachEffect + 掉落动画)
    this.effects.push(new LimbParticle(kind, x, y));
  }

  // ---------- 波次计时 (已验证原版移植) ----------
  updateWaves(dt) {
    if (this.state !== 'playing') return;
    if (!this.wavesStarted) return;
    if (!this.waves.length) return;   // 无波次模式 (打僵尸/罐子/我不是僵尸): 胜利由 updateMode 判定
    if (this.wave >= this.totalWaves) {
      if (this.zombies.filter(z => z.fromWave !== -2 && !z.dead).length === 0) this.triggerWin();
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
    if (this.waveTimer <= WAVE.HUGE_WAVE_WARN && this.waveTimer > 0 && !this.hugeWaveWarned) {
      const isFlagNext = this.waves[nextW] && this.waves[nextW].flag;
      const isFinalNext = this.waves[nextW] && this.waves[nextW].final;
      if (isFlagNext || isFinalNext) {
        this.hugeWaveWarned = true;
        if (isFinalNext) Banners.showFinalWave(3.6, this.game.audio);
        else Banners.show('approaching.png', 3.6, 'hugewave', this.game.audio);
      }
    }
    if (this.waveTimer <= 0) {
      this.spawnWave();
    }
  }

  beginWaves() {
    if (this.wavesStarted) return;
    this.wavesStarted = true;
    this.waveTimer = WAVE.FIRST_WAVE_DELAY; this._waveTimerStart = this.waveTimer;
    this.hugeWaveWarned = false;
  }

  spawnWave() {
    this.wave++;
    if (this.wave > this.totalWaves) return;
    const w = this.waves[this.wave - 1];
    this.lastWaveTime = this.time;
    this.hugeWaveWarned = false;
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
      if (zd.water) row = this.waterRows[Math.floor(Math.random() * this.waterRows.length)];
      else {
        const landRows = this.grassRows.filter(r => !this.waterRows.includes(r));
        row = landRows[Math.floor(Math.random() * landRows.length)];
      }
      this.spawnZombieForWave(type, row, this.wave - 1);
    }
    this._waveHP = hp;
    if (w.boss) {
      this.spawnZombieForWave('BOSS', 0, this.wave - 1);
      this.game.audio.play('bossintro');
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
      try { z.playZombieReanim('anim_falling', RE.PLAY_ONCE_HOLD, 20); } catch (e) { }
    }
  }

  spawnSkySun() {
    const col = Math.floor(Math.random() * 9);
    const targetY = this.gridY(Math.floor(Math.random() * this.rows)) + 40 + Math.random() * 30;
    this.suns.push(new Sun(this.gridX(col) + Math.random() * 40, -60, targetY, 'sky'));
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
  addCoin(x, y, value = 5, kind = 'gold') {
    this.coins.push(new Coin(x, y, value, kind));
    this.game.audio.play('coin');
  }
  canDropLoot() {
    // 原版: 首次冒险 level>=11 才掉钱; 非首周目始终可掉
    if (this.game.debugUnlocked) return true;
    const lv = this.level.id || 1;
    return lv >= 11 || lv > 50;
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
    for (const z of this.zombies) {
      if (!z.dead && !z.boss && z.x < -60 && z.hasHead) {
        if (z.flyingHigh) { this.triggerLose(z.row); return; }
        const m = this.mowers.find(m => m.row === z.row && m.state === 'idle');
        if (!m) { this.triggerLose(z.row); return; }
      }
    }
  }
  triggerWin() {
    if (this.state === 'win') return;
    this.state = 'win';
    this.game.audio.play('winmusic');
    this.game.onLevelWin();
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
      z.hittable !== false && !z.underwater && !z.underground && !z.boss);
  }
  firstZombieInRow(row, fromX, toX) {
    let best = null;
    for (const z of this.zombies) {
      if (z.dead || z.row !== row || z.hittable === false || z.boss) continue;
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
    // ---- 挑战系统 (原版 Challenge.cpp): challenge.js 承载全部模式逻辑 ----
    this.gridItems = [];
    this.challenge = new CHM.Challenge(this);
    this.mode = this.challenge.mode;   // 向后兼容: ui/main 引用 board.mode
    // 传送带模式: seedCards由challenge管理 (beltItems)
    if (this.mode === 'conveyor') { this.sun = 0; }
    if (this.mode === 'whack' || this.mode === 'vasebreaker' || this.mode === 'izombie') {
      // 无割草机 (原版)
      this.mowers = [];
    }
    if (this.mode === 'izombie') {
      // 我是僵尸: 植物不产阳光 (原版 UpdateProductionPlant 直接return)
      this._izNoProduction = true;
    }
    if (this.mode === 'laststand') { this._noSunProduction = true; }
    if (this.level.endless && !this.mode) this.mode = 'endless';
  }

  _plantClass() {
    const m = (window.__mods && window.__mods['plants']) || require('./plants');
    return m.Plant;
  }

  updateMode(dt) {
    if (this.challenge) this.challenge.update(dt);
    // 打僵尸波次推进 (借用波次系统, 僵尸从地里冒出由challenge处理)
    if (this.mode === 'whack' && this.challenge) {
      // 由 challenge.updateWhack 负责冒头
    }
  }

  // 模式点击处理 (返回 true 表示已消费) — 委托 challenge.js
  modeClick(game, p) {
    if (this.state !== 'playing') return false;
    if (this.challenge) {
      // 打僵尸/罐子/老虎机/坚不可摧/宝石 由 challenge 处理
      if (this.challenge.mouseDown(p.x, p.y)) return true;
      // 我是僵尸: 卡槽点击(顶部) + 场地放置
      if (this.mode === 'izombie') return this.izModeClick(game, p);
      // 天降种子: 拾取掉落卡
      if (this.mode === 'raining') return this.rainingClick(game, p);
    }
    return false;
  }

  izModeClick(game, p) {
    const ch = this.challenge;
    // 僵尸卡槽 (顶部)
    const cards = this.zombieCards || [];
    for (let i = 0; i < cards.length; i++) {
      const x = 14 + i * 60, y = 6;
      if (p.x > x && p.x < x + 54 && p.y > y && p.y < y + 76) {
        if (this.sun >= cards[i].cost) {
          ch.selectedZombieCard = ch.selectedZombieCard === i ? -1 : i;
          game.selectedCard = ch.selectedZombieCard;
          game.audio.play('seedlift');
        } else game.audio.play('buzzer');
        return true;
      }
    }
    // 场地放置
    if (ch.selectedZombieCard >= 0) {
      const cell = game.pixelToCell(p.x, p.y);
      if (cell) {
        const [col, row] = cell;
        ch.placeZombie(col, row);
      }
      return true;
    }
    return true;   // 吞掉点击防止误种植
  }

  rainingClick(game, p) {
    const ch = this.challenge;
    // 点击掉落的种子包 → 拾取
    for (const c of ch.rainCards) {
      if (c.dead) continue;
      if (Math.abs(p.x - c.x) < 32 && Math.abs(p.y - c.y) < 34) {
        c.dead = true;
        ch.heldCards.push({ type: c.type, life: 14 });
        game.audio.play('seedlift');
        return true;
      }
    }
    // 点击持有卡 → 选择
    for (let i = 0; i < ch.heldCards.length; i++) {
      const x = 130 + i * 60;
      if (p.x > x && p.x < x + 50 && p.y > 6 && p.y < 76) {
        game.selectedCard = game.selectedCard === i ? -1 : i;
        game.audio.play('seedlift');
        return true;
      }
    }
    return false;
  }

  pixelToRow(y) {
    // 像素y → 行号 (按各行实际顶点: 行高100/85, 相邻行衔接)
    for (let r = 0; r < this.rows; r++) {
      const ry = this.gridToPixelY(r);
      const rh = (r + 1 < this.rows) ? this.gridToPixelY(r + 1) - ry : 100;
      if (y >= ry && y < ry + rh) return r;
    }
    return -1;
  }
  pixelToCol(x) {
    const c = Math.floor((x - CONST.LAWN_XMIN) / CONST.CELL_W);
    return (c >= 0 && c <= 9) ? c : -1;
  }
  win() { this.triggerWin(); }
  lose() { this.triggerLose(0); }
  addPow(x, y) { this.addEffect('zag', x, y); }

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
    if (this.y < this.targetY) {
      this.y += 40 * dt;
      if (this.from === 'sky') this.x += this.vx * dt;
    }
    this.phase += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

class Coin {
  constructor(x, y, value, kind) {
    this.x = x; this.y = y; this.value = value;
    this.vy = -Math.random() * 120 - 60; this.vx = (Math.random() - 0.5) * 40;
    this.ground = Math.max(80, Math.min(521, y + 30 + (Math.random() - 0.5) * 40));
    this.life = 12; this.dead = false; this.collected = false; this.flyT = 0;
    this.type = kind || (Math.random() < 0.1 ? 'diamond' : 'gold');
  }
  update(dt, board) {
    if (this.collected) {
      this.flyT += dt * 4;
      // 飞向金币栏 (原版目标 (39,558); 金币入账走 game.addCoins)
      this.x += (39 - this.x) * Math.min(1, dt * 8);
      this.y += (558 - this.y) * Math.min(1, dt * 8);
      if (this.flyT > 1) {
        this.dead = true;
        if (board.game && board.game.addCoins) board.game.addCoins(this.value);
        board.game && board.game.audio && board.game.audio.play('coin');
      }
      return;
    }
    this.vy += 300 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y > this.ground) { this.y = this.ground; this.vy = 0; }
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
  }
  update(dt, board) {
    this.t += dt;
    switch (this.name) {
      case 'splat': case 'snowsplat': case 'firesplat': if (this.t > 0.5) this.dead = true; break;
      case 'explosion': if (this.t > 0.9) this.dead = true; break;
      case 'spudow': if (this.t > 0.9) this.dead = true; break;
      case 'boom': if (this.t > 1.2) this.dead = true; break;
      case 'flash': if (this.t > 0.3) this.dead = true; break;
      case 'dust': if (this.t > 0.8) this.dead = true; break;
      case 'sod_dirt': if (this.t > (this.opts.dur || 0.6)) this.dead = true; break;
      case 'chomper_bite': if (this.t > 0.3) this.dead = true; break;
      case 'zag': if (this.t > 0.4) this.dead = true; break;
      case 'text': if (this.t > (this.opts.hold || 2)) this.dead = true; break;
      default: if (this.t > 1) this.dead = true;
    }
    if (this.reanim) this.reanim.update(dt);
  }
}

// 掉落肢体粒子 (断臂/掉头/掉盔)
class LimbParticle {
  constructor(kind, x, y) {
    this.kind = kind; this.x = x; this.y = y;
    this.vx = 30 + Math.random() * 20;
    this.vy = -180 - Math.random() * 60;
    this.rot = 0;
    this.vr = (Math.random() - 0.5) * 8;
    this.t = 0; this.dead = false;
  }
  update(dt) {
    this.t += dt;
    this.vy += 500 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    if (this.t > 1.6) this.dead = true;
  }
}

if (typeof module !== 'undefined') module.exports = { Board, Sun, Coin, Effect, LimbParticle, SCENE_BG, RENDER_LAYER };

function easeOut01(p) { return 1 - (1 - p) * (1 - p); }
