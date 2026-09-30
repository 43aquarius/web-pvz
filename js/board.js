// ============================================================
// board.js — 战场核心 (Board.cpp 移植 + 已验证波次系统)
//  - 100Hz 固定 tick (SECONDS_PER_UPDATE=0.01 语义)
//  - 原版网格: GridToPixelX=col*80+40 / GridToPixelY=行高100|85+80 / 屋顶坡度
//  - 渲染顺序系统: renderOrder = row*10000 + layer + offset
//  - GetTopPlantAt / 泳池判定 / 高地 / 梯子 / 冰道 / 践踏
//  - 割草机 → Zombie.mowDown()
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, zombieAllowedOnLevel, WAVE, MUSHROOMS, AQUATIC, GROUNDCOVER } = require('./data');
const { Zombie } = require('./zombie');
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

    // 割草机
    for (let r = 0; r < this.rows; r++) {
      if (!this.grassRows.includes(r)) continue;
      this.mowers.push({
        row: r, x: -20, state: 'idle',
        type: this.waterRows.includes(r) ? 'pool' : (this.isRoof ? 'roof' : 'lawn'),
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
          this.graves.push({ row: r, col, hp: CONST.GRAVE_HP, type: Math.floor(Math.random() * 4) });
        }
      }
    }
    this.game.audio.playBGM(level.bgm);
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
    const lv = level.id;
    const numWaves = level.waves;
    const wavesPerFlag = numWaves >= 10 ? 10 : numWaves;
    const intro = this.introZombieType();
    const out = [];
    for (let w = 0; w < numWaves; w++) {
      const isFlag = numWaves >= 10 && w % wavesPerFlag === wavesPerFlag - 1 && lv !== 1;
      const isFinal = w === numWaves - 1;
      const types = [];
      let points = Math.floor(w / 3) + 1;
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
      if (lv === 50 && isFinal && !types.some(([t]) => t === 'GARGANTUAR')) types.push(['GARGANTUAR', 1]);
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
    const ticks = Math.max(1, Math.round(dt * 100 * this.speed));
    const tickDt = dt * this.speed;
    // 波次与天降阳光 (秒)
    this.updateWaves(tickDt);
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
    // 冰道衰减
    for (let r = 0; r < this.rows; r++) {
      if (this.iceTimers[r] > 0) {
        this.iceTimers[r] -= dt * 100;
        if (this.iceTimers[r] <= 0) { this.iceTimers[r] = 0; this.iceMinXs[r] = 900; }
      }
    }
    this.shakeX *= 0.85; this.shakeY *= 0.85;
    if (this.fogClearUntil < this.time) this.fogCleared = 0;
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
        const bn = isFinalNext ? 'finalwave.png' : 'approaching.png';
        Banners.show(bn, 3.6, isFinalNext ? 'finalwave' : 'hugewave', this.game.audio);
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
  addSun(x, y, targetY, from) {
    this.suns.push(new Sun(x, y, targetY, from));
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
    if (this.time < this.fogClearUntil) return 0;
    for (const p of this.plants) {
      if (!p.dead && p.type === 'PLANTERN') {
        if (Math.abs(p.x - x) < 200) return 0;
      }
    }
    return x > 340 ? 1 : 0;
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
