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
const { Zombie, H } = require('./zombie');
const RE = require('./reanim');
const { Projectile } = require('./projectiles');
const { Banners } = require('./cutscene');

const SCENE_BG = {
  day: 'background1.jpg', night: 'background2.jpg',
  pool: 'background3.jpg', fog: 'background4.jpg', roof: 'background5.jpg',
  boss: 'background6boss.jpg',
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
    // 5-5 蹦极闪电战 (原版: NORMAL/CONE/BUCKET/LADDER)
    if (this.level.id === 45 && ['NORMAL', 'CONE', 'BUCKET', 'LADDER', 'FLAG', 'BUNGEE'].includes(ty)) return true;
    return zombieAllowedOnLevel(ty, this.level.id);
  }
  introZombieType() {
    const lv = this.level.id;
    if (lv <= 1) return null;
    for (const ty of Object.keys(ZOMBIES)) {
      const d = ZOMBIES[ty];
      if (d.unlock === lv && d.weight > 0 && !d.boss && ty !== 'DUCKY') return ty;
    }
    return null;
  }
  buildWaves(level) {
    const lv = level.id > 50 ? 50 : level.id;   // 额外模式(生存等)按满级僵尸池
    const numWaves = level.endless ? 200 : level.waves;
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
        // 5-5 蹦极闪电战 (原版: 旗波追加 5 只蹦极僵尸偷植物)
        if (lv === 45) types.push(['BUNGEE', 5]);
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
        if (!zombieAllowedOnLevel(ty, lv)) return false;
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
    // 墓碑升起动画 (原版 mGridItemCounter 0→100; 打僵尸中途补墓也走此动画)
    for (const g of this.graves) {
      if (g.rise !== undefined && g.rise < 1) g.rise = Math.min(1, g.rise + dt * 1.6);
    }
    this.updateMode(dt);
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
    // reanim 特效池
    for (const r of this.reanims) r.update(dt);
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
        this._stormT = 9 + Math.random() * 12;
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
  addLimbParticle(kind, x, y) {
    // 掉落肢体: 简化物理粒子 (原版为 AttachEffect + 掉落动画)
    this.effects.push(new LimbParticle(kind, x, y));
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
      try { z.playZombieReanim('anim_falling', RE.PLAY_ONCE_HOLD, 0, 20); } catch (e) { }
    }
  }

  spawnSkySun() {
    const col = Math.floor(Math.random() * 9);
    const targetY = this.gridY(Math.floor(Math.random() * this.rows)) + 40 + Math.random() * 30;
    this.suns.push(new Sun(this.gridX(col) + Math.random() * 40, -60, targetY, 'sky'));
  }

  // ---------- 打僵尸模式 (原版 WhackAZombie 系列) ----------
  // 原版 WhackAZombiePlaceGraves: 列3..8 随机格, 避开已有墓碑
  whackPlaceGraves(count) {
    const cells = [];
    for (let c = 3; c < 9; c++) {
      for (const r of this.grassRows) {
        if (this.graves.some(g => g.row === r && g.col === c)) continue;
        cells.push([r, c]);
      }
    }
    for (let i = 0; i < count && cells.length; i++) {
      const [r, c] = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
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
    const graves = this.graves.slice();
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
  addCoin(x, y, value = 25) {
    this.coins.push(new Coin(x, y, value));
    this.game.audio.play('coin');
  }
  // 我不是僵尸: 植物被吃时掉落的阳光 (原版 COIN_SUN + COIN_MOTION_FROM_PLANT 弹出)
  addIZombieSun(x, y) {
    const s = new Sun(x + 10, y - 20, y + 25, 'plant');
    s.vx = (Math.random() - 0.5) * 60;
    this.suns.push(s);
    this.game.audio.play('points');
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
    const f = this.level.fixed;
    this.mode = null;
    this.modeData = {};
    if (f === 'bowling' || f === 'conveyor' || f === 'boss') {
      // 传送带种子银行 (原版 HasConveyorBeltSeedBank: 无阳光经济, 卡从右侧滚动而来)
      this.mode = 'conveyor';
      const world = Math.ceil((this.level.id || 1) / 10) || 1;
      // 原版保龄球: WALLNUT 85% / EXPLODE_O_NUT 15% (Bowling2 加 GIANT_WALLNUT 15%)
      // 原版权重数组 (Challenge.cpp): WALLNUT_BOWLING_2 = 85/15/15
      this.beltPool = f === 'bowling'
        ? [['WALLNUT', 85], ['EXPLODEONUT', 15], ['GIANTWALLNUT', 15]]
        : f === 'boss'
          // 原版 Boss 关卡卡池 (Challenge.cpp 1614-1612): 花盆55/西瓜10/辣椒12/卷心菜10/玉米5/寒冰8
          ? [['FLOWERPOT', 55], ['MELONPULT', 10], ['JALAPENO', 12], ['CABBAGEPULT', 10], ['KERNELPULT', 5], ['ICESHROOM', 8]]
          : (this.level.id <= 50 ? availablePlants(this.level.id, game && game.purchasedSet) : availablePlants(50, game && game.purchasedSet));
      // 原版 SeedBank::AddSeed/UpdateConveyorBelt: 卡片 offsetX 从右侧 515-(51)*n 起, 每4tick左移1px(25px/s)
      // 槽位 x = 91 + i*50; Boss关 ×0.875 发卡间隔
      this.belt = { items: [], counter: 0, spawnT: 0.1, isBoss: f === 'boss' };
      // 原版 Challenge::StartLevel: 保龄球开局立即发一张 WALLNUT + counter=400 (4s 后下一张)
      if (f === 'bowling') {
        this.belt.items.push({ type: 'WALLNUT', offset: 515 });
        this.belt.spawnT = 4;
      }
      this.sun = 0;
      this.seedCards = [];
    } else if (f === 'whack') {
      // 打僵尸 (原版 2-5): 无种子无阳光, 墓碑出僵尸, 点击捶击
      // 原版 Challenge::StartLevel: mZombieCountDown=200 (2s 后第一波), 锤子光标
      this.mode = 'whack';
      this.whackScore = 0;
      this.sun = 0;
      this.seedCards = [];
      this.whackWaves = 12;          // 原版 12 波
      this.whackWave = 0;
      this.whackCountdown = 200;     // 原版 StartLevel: 200tick
      this.whackSpawnCounter = 0;
      this.whackFinalSpawned = false;
    } else if (f === 'vasebreaker') {
      // 罐子解谜 (原版 ScaryPotter): 右侧棋盘摆罐子, 点击锤碎 → 植物/僵尸
      // 原版 SP1 配方: 碗豆5 雪碗豆5 倭瓜5 普僵6 铁桶3 小丑1 + 2个叶子罐(植物预揭示)
      this.mode = 'vasebreaker';
      this.sun = 0;
      this.seedCards = [];
      this.vases = [];
      this.vasePackets = [];   // 砸出的可用种子包 (点击拾取 → 免费种植)
      this.mallet = null;      // 锤子动画 (Hammer.reanim anim_open_pot)
      const recipe = [
        { plant: 'PEASHOOTER', n: 5 }, { plant: 'SNOWPEA', n: 5 }, { plant: 'SQUASH', n: 5 },
        { zombie: 'NORMAL', n: 6 }, { zombie: 'BUCKET', n: 3 }, { zombie: 'JACK', n: 1 },
      ];
      // 加权随机摆罐 (原版 ScaryPotterPopulate: 列 3..8, 每格权重 1, 抽取后权重清 0)
      const cells = [];
      for (let r = 0; r < this.rows; r++) for (let c = 3; c < 9; c++) cells.push([r, c]);
      const contents = [];
      for (const item of recipe) {
        for (let i = 0; i < item.n; i++) contents.push(item);
      }
      shuffleB(contents);
      // 罐子数不超过格子数
      const nVases = Math.min(contents.length, cells.length);
      for (let i = 0; i < nVases; i++) {
        const [row, col] = cells[i];
        const item = contents[i];
        // 原版: 装巨人的罐显示 ZOMBIE 态
        const state = item.zombie === 'GARGANTUAR' ? 'zombie' : 'question';
        this.vases.push({
          row, col, broken: false, rising: 0,
          content: item.plant || item.zombie,
          isPlant: !!item.plant,
          state,   // question | leaf | zombie (原版三态贴图列)
        });
      }
      // 原版 ScaryPotterChangePotType: 随机挑 2 个种子罐 → LEAF 预揭示
      const seedVases = this.vases.filter(v => v.isPlant && v.state === 'question');
      shuffleB(seedVases);
      for (let i = 0; i < Math.min(2, seedVases.length); i++) seedVases[i].state = 'leaf';
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
    } else if (this.level.rainingSeeds) {
      // 雨天种子: 种子包从天而降 (原版 It's Raining Seeds)
      this.mode = 'raining';
      this.rainCards = [];
      this.rainT = 2;
      this.heldCards = [];
    }
    if (this.level.endless) this.mode = this.mode || 'endless';
  }

  izSetup() {
    // 我不是僵尸植物防线 (原版 IZombiePlacePlantInSquare 固定布局: 左4列 = izombieLimit)
    // 原版 IZ1 风格: 每行 向日葵×2 + 豌豆×2 (向日葵被吃掉阳阳光经济来源)
    const layouts = [
      ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'PEASHOOTER'],
      ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'SNOWPEA'],
      ['SUNFLOWER', 'SUNFLOWER', 'REPEATER', 'PEASHOOTER'],
      ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'PEASHOOTER'],
      ['SUNFLOWER', 'SUNFLOWER', 'SNOWPEA', 'REPEATER'],
      ['SUNFLOWER', 'SUNFLOWER', 'PEASHOOTER', 'PEASHOOTER'],
    ];
    const limit = this.izombieLimit || 4;
    for (let r = 0; r < this.rows; r++) {
      const lay = layouts[r % layouts.length].slice(0, limit);
      lay.forEach((ty, i) => {
        const col = i;   // 原版: 植物只出现在红线左侧列内 (0..limit-1)
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

  updateMode(dt) {
    if (this.state !== 'playing') return;
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
            // 原版动态权重: 同类型≥4张权重→1, ≥3张→5, 与上一张同类减半
            const weights = entries.map(([t, base]) => {
              let w = base;
              const cnt = b.items.filter(o => o.type === t).length;
              if (cnt >= 4) w = Math.min(w, 1); else if (cnt >= 3) w = Math.min(w, 5);
              if (n > 0 && t === b.items[n - 1].type) w = Math.max(1, w >> 1);
              return w;
            });
            let total = weights.reduce((a, c) => a + c, 0);
            let roll = Math.random() * total;
            let pick = 0;
            for (let i = 0; i < entries.length; i++) { roll -= weights[i]; if (roll <= 0) { pick = i; break; } }
            b.items.push({ type: entries[pick][0], offset });
          }
          const mult = b.isBoss ? 0.875 : 1;
          const interval = (n > 8 ? 10 : n > 6 ? 5 : n > 4 ? 4.25 : 4) * mult;
          b.spawnT = interval;
        }
        break;
      }
      case 'whack': {
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
          // 原版: 倒计时 5tick → NextWaveComing 音效
          if (prev > 5 && this.whackCountdown <= 5) {
            if (this.whackWave === 0) this.game.audio.play('awooga');
            else if (this.whackWave === this.whackWaves - 1) this.game.audio.play('siren');
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
        // 锤子动画推进
        if (this.mallet) {
          this.mallet.t += dt;
          if (this.mallet.anim) this.mallet.anim.update(dt);
          if (this.mallet.t >= 0.42 && !this.mallet.opened) {
            this.mallet.opened = true;
            this.scaryPotterOpenPot(this.mallet.vase, this.game);
          }
          if (this.mallet.t >= 0.55) this.mallet = null;
        }
        // 可用种子包物理 (原版 Coin: vy 弹出+重力, 1500tick 后消失)
        for (const pk of this.vasePackets) {
          if (pk.taken) continue;
          pk.t += dt;
          pk.vy += 600 * dt;
          pk.y += pk.vy * dt;
          pk.x += pk.vx * dt;
          if (pk.y > pk.ground) { pk.y = pk.ground; pk.vy = -pk.vy * 0.35; if (Math.abs(pk.vy) < 40) pk.vy = 0; }
          pk.life -= dt;
        }
        this.vasePackets = this.vasePackets.filter(pk => !pk.taken && pk.life > 0);
        // 胜利: 所有罐子已碎且场上无僵尸 (原版 ScaryPotterIsCompleted)
        if (!this.mallet && this.vases.every(v => v.broken) && this.zombies.filter(z => !z.dead && z.fromWave !== -2).length === 0) {
          this.triggerWin();
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
        // 种子包掉落
        this.rainT -= dt;
        if (this.rainT <= 0 && this.heldCards.length < 4) {
          this.rainT = 5 + Math.random() * 4;
          const pool = availablePlants(Math.min(this.level.id || 40, 50)).filter(t => PLANTS[t].cost <= 300);
          const type = pool[Math.floor(Math.random() * pool.length)];
          this.rainCards.push({ type, x: 120 + Math.random() * 600, y: -40, vy: 55, land: 90 + Math.random() * 60, taken: false, life: 11 });
        }
        for (const c of this.rainCards) {
          if (c.taken) continue;
          if (c.y < c.land) c.y += c.vy * dt;
          else { c.life -= dt; if (c.life <= 0) c.taken = true; }
        }
        this.rainCards = this.rainCards.filter(c => !c.taken);
        break;
      }
    }
  }

  // 模式点击处理 (返回 true 表示已消费)
  modeClick(game, p) {
    if (this.state !== 'playing') return false;
    switch (this.mode) {
      case 'whack': {
        // 锤子挥击动画 (原版光标 Hammer anim_whack_zombie)
        if (game._whackMallet) {
          try { game._whackMallet.play('anim_whack_zombie', RE.PLAY_ONCE_HOLD, 24); } catch (e) { }
        }
        // 锤击僵尸 (原版 MouseDownWhackAZombie: 命中矩形)
        for (const z of this.zombies) {
          if (z.dead || z.isDeadOrDying) continue;
          if (p.x > z.x && p.x < z.x + 100 && p.y > z.y - 20 && p.y < z.y + 120) {
            z.takeDamage(9999, this, { mowed: true });
            this.whackScore += 1;
            this.addEffect('squish', z.x + 40, z.y + 40);
            game.audio.play('bonk');
            game.audio.play('squash_hmm');
            return true;
          }
        }
        return true;   // 模式下吞掉点击
      }
      case 'vasebreaker': {
        // 免费植物种植中 → 放行给 gameClick 的种植逻辑 (原版 CursorObject PLANT_FROM_USABLE_COIN)
        if (game.freePlant) return false;
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
    if (v.isPlant) {
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
  constructor(x, y, value) {
    this.x = x; this.y = y; this.value = value;
    this.vy = -120; this.vx = (Math.random() - 0.5) * 40;
    this.ground = y + 30;
    this.life = 12; this.dead = false; this.collected = false; this.flyT = 0;
    this.type = Math.random() < 0.1 ? 'diamond' : 'gold';
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

if (typeof module !== 'undefined') module.exports = { Board, Sun, Coin, Effect, LimbParticle, SCENE_BG, sceneBgName, RENDER_LAYER };

function easeOut01(p) { return 1 - (1 - p) * (1 - p); }
function shuffleB(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
