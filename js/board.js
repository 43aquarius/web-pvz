// ============================================================
// board.js — 战场核心: 网格/场景/波次/阳光/割草机/墓碑
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, MUSHROOMS, AQUATIC, GROUNDCOVER } = require('./data');
const { Zombie } = require('./zombies');

const SCENE_BG = {
  day: 'background1.jpg', night: 'background2.jpg',
  pool: 'background3.jpg', fog: 'background4.jpg', roof: 'background5.jpg',
};

class Board {
  constructor(game, level) {
    this.game = game;
    this.level = level;
    this.scene = level.scene;
    this.rows = level.rows;
    this.time = 0;
    this.sun = level.startSun;
    this.paused = false;
    this.speed = 1;

    // 实体容器
    this.plants = [];      // 按行种植: plants[row][col] 直接网格 + 列表
    this.grid = Array.from({ length: this.rows }, () => new Array(9).fill(null));
    this.gridPot = Array.from({ length: this.rows }, () => new Array(9).fill(null)); // 花盆层
    this.gridLily = Array.from({ length: this.rows }, () => new Array(9).fill(null)); // 睡莲层
    this.gridPumpkin = Array.from({ length: this.rows }, () => new Array(9).fill(null)); // 南瓜层
    this.gridSpikes = Array.from({ length: this.rows }, () => new Array(9).fill(null)); // 地刺层(地面)
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.coins = [];
    this.effects = [];
    this.mowers = [];
    this.graves = [];      // {row, col, hp, reanim}
    this.ladders = [];     // 梯子道具
    this.iceTrails = [];   // 冰道
    this.craters = [];     // 弹坑
    this.pots = [];        // 花盆(渲染用) — 用gridPot
    this.fogCleared = 0;   // 雾清除时间戳
    this.fogClearUntil = 0;
    this.lanternCols = new Set(); // 路灯花照亮的列

    // 水行(泳池/雾): 行2-3为水
    this.waterRows = (this.scene === 'pool' || this.scene === 'fog') ? [2, 3] : [];
    // 屋顶
    this.isRoof = this.scene === 'roof';
    // 夜晚
    this.isNight = this.scene === 'night';

    // 波次
    this.wave = 0;
    this.waves = this.buildWaves(level);
    this.waveTimer = 20;      // 第一波前倒计时
    this.totalWaves = this.waves.length;
    this.zombiesRemaining = this.waves.reduce((s, w) => s + w.count, 0);
    this.state = 'intro';     // intro/playing/lastwave/win/lose
    this.hugeWaveBanner = 0;
    this.finalWaveBanner = 0;

    // 天降阳光
    this.skySunTimer = 5;
    // 割草机
    for (let r = 0; r < this.rows; r++) {
      this.mowers.push({
        row: r, x: -20, state: 'idle', type: this.waterRows.includes(r) ? 'pool' : (this.isRoof ? 'roof' : 'lawn'),
        reanim: null,
      });
    }
    // 墓碑
    if (level.graves) {
      const n = level.graves;
      const spots = [];
      for (let c = 4; c < 9; c++) for (let r = 0; r < this.rows; r++) if (!this.waterRows.includes(r)) spots.push([c, r]);
      for (let i = 0; i < n && spots.length; i++) {
        const j = Math.floor(Math.random() * spots.length);
        const [c, r] = spots.splice(j, 1)[0];
        this.graves.push({ row: r, col: c, hp: CONST.GRAVE_HP, type: Math.floor(Math.random() * 4) });
      }
    }
    // 屋顶坡度
    // BGM
    this.game.audio.playBGM(level.bgm);
  }

  // ---------- 网格坐标 ----------
  gridX(col) { return col * CONST.CELL_W + CONST.LAWN_XMIN; }
  gridY(row) {
    if (this.scene === 'pool' || this.scene === 'fog') return row * CONST.CELL_H_POOL + CONST.LAWN_YMIN;
    return row * CONST.CELL_H_LAWN + CONST.LAWN_YMIN;
  }
  roofOffset(col) { return this.isRoof && col < 5 ? (5 - col) * 20 : 0; }
  cellY(row, col) { return this.gridY(row) - this.roofOffset(col); }
  isWater(row, col) { return this.waterRows.includes(row); }
  canPlantOn(row, col) {
    if (this.isWater(row, col)) return this.gridLily[row][col] && !this.grid[row][col];
    if (this.isRoof) return (this.gridPot[row][col] || this.gridLily[row][col]) && !this.grid[row][col];
    return !this.grid[row][col] && !this.craters.some(c => c.row === row && c.col === col) &&
      !this.iceTrails.some(c => c.row === row && c.col === col) && !this.graves.some(g => g.row === row && g.col === col);
  }

  // ---------- 波次构建 ----------
  buildWaves(level) {
    const waves = [];
    const lv = level.id;
    // 可用僵尸类型 (原版解锁表)
    const avail = Object.entries(ZOMBIES).filter(([k, z]) => z.unlock <= lv && z.weight > 0 && !z.boss);
    const nWaves = level.waves;
    for (let w = 1; w <= nWaves; w++) {
      const isFlag = w % 10 === 0;                 // 每10波一大波
      const isFinal = w === nWaves;
      let count = Math.round(1 + lv * 0.35 + w * 0.22);
      if (isFlag || isFinal) count = Math.round(count * 2.2) + 2;
      count = Math.min(count, 30);
      // 类型池: 后期波次引入高级僵尸
      const pool = avail.filter(([k, z]) => z.unlock <= lv);
      // Boss关
      if (level.fixed === 'boss' && isFinal) {
        waves.push({ flag: isFlag, final: true, boss: true, count: 1, types: [['BOSS', 1]] });
        continue;
      }
      const types = [];
      // 加权选择
      let remaining = count;
      // 大波保证多样性
      const picks = Math.max(1, Math.min(6, 1 + Math.floor(lv / 8) + (isFlag ? 2 : 0)));
      const used = new Set();
      for (let p = 0; p < picks && remaining > 0; p++) {
        const cands = pool.filter(([k]) => !used.has(k));
        if (!cands.length) break;
        const totalW = cands.reduce((s, [, z]) => s + z.weight, 0);
        let r = Math.random() * totalW, pick = cands[0];
        for (const c of cands) { r -= c[1].weight; if (r <= 0) { pick = c; break; } }
        used.add(pick[0]);
        // 高级僵尸限制数量
        let maxN = pick[1].unlock >= 46 ? 1 : pick[1].unlock >= 26 ? 2 : 5;
        if (isFlag) maxN = Math.ceil(maxN * 1.5);
        const n = Math.max(1, Math.min(remaining, Math.min(maxN, Math.ceil(remaining / (picks - p || 1)))));
        types.push([pick[0], n]);
        remaining -= n;
      }
      if (remaining > 0) types.push(['NORMAL', remaining]);
      waves.push({ flag: isFlag, final: isFinal, count, types });
    }
    return waves;
  }

  // ---------- 主循环 ----------
  update(dt) {
    if (this.state === 'win' || this.state === 'lose') { this.updateEffects(dt); return; }
    this.time += dt;
    // 波次
    this.updateWaves(dt);
    // 天降阳光
    if (this.level.skySun) {
      this.skySunTimer -= dt;
      if (this.skySunTimer <= 0) {
        this.skySunTimer = CONST.SKY_SUN_INTERVAL[0] + Math.random() * (CONST.SKY_SUN_INTERVAL[1] - CONST.SKY_SUN_INTERVAL[0]);
        this.spawnSkySun();
      }
    }
    // 实体
    for (const p of this.plants) if (!p.dead) p.update(dt, this);
    for (const z of this.zombies) if (!z.dead) z.update(dt, this);
    for (const pr of this.projectiles) if (!pr.dead) pr.update(dt, this);
    for (const s of this.suns) s.update(dt, this);
    for (const c of this.coins) c.update(dt, this);
    for (const m of this.mowers) this.updateMower(m, dt);
    this.updateEffects(dt);
    // 清理
    this.plants = this.plants.filter(p => !p.dead);
    this.zombies = this.zombies.filter(z => !z.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.suns = this.suns.filter(s => !s.dead);
    this.coins = this.coins.filter(c => !c.dead);
    // 胜负判定
    this.checkWinLose();
  }

  updateWaves(dt) {
    if (this.state !== 'playing' && this.state !== 'intro') return;
    if (this.state === 'intro') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) { this.state = 'playing'; this.waveTimer = 0; }
      return;
    }
    if (this.wave >= this.totalWaves) {
      if (this.zombies.length === 0 && this.state !== 'win') this.triggerWin();
      return;
    }
    // 下一波触发: 场上僵尸血量比例低 或 超时
    const aliveHP = this.zombies.reduce((s, z) => s + (z.body + (z.helm || 0) + (z.shield || 0)), 0);
    const spawnHP = this.currentWaveHP;
    this.waveTimer -= dt;
    const lowHP = spawnHP > 0 && aliveHP < spawnHP * 0.35;
    const timeout = this.waveTimer <= 0;
    if (timeout || (lowHP && this.time - this.lastWaveTime > 4)) {
      this.spawnWave();
    }
  }

  get currentWaveHP() { return this._waveHP || 0; }

  spawnWave() {
    this.wave++;
    if (this.wave > this.totalWaves) return;
    const w = this.waves[this.wave - 1];
    this.lastWaveTime = this.time;
    this.waveTimer = 24 + Math.random() * 6;
    if (w.flag) {
      this.hugeWaveBanner = 3.2;
      this.game.audio.play('hugewave');
      // 旗帜僵尸领头
      this.spawnZombie('FLAG', Math.floor(Math.random() * this.rows));
    }
    if (w.final && !w.boss) {
      this.finalWaveBanner = 3.2;
      this.game.audio.play('hugewave');
    }
    const list = [];
    for (const [type, n] of w.types) {
      for (let i = 0; i < n; i++) list.push(type);
    }
    // 水僵尸必须进水行
    let hp = 0;
    for (const type of list) {
      const z = ZOMBIES[type];
      hp += z.body + (z.helm || 0) + (z.shield || 0);
      let row;
      if (z.water) row = this.waterRows[Math.floor(Math.random() * this.waterRows.length)];
      else {
        const landRows = [];
        for (let r = 0; r < this.rows; r++) if (!this.waterRows.includes(r)) landRows.push(r);
        row = landRows[Math.floor(Math.random() * landRows.length)];
      }
      // 避免过度扎堆
      this.spawnZombie(type, row, list.length > 12 ? Math.random() * 150 : Math.random() * 60);
    }
    this._waveHP = hp;
    // Boss
    if (w.boss) {
      this.spawnZombie('BOSS', 0);
      this.game.audio.play('bossintro');
    }
  }

  spawnZombie(type, row, extraX = 0) {
    const Z = new Zombie(type, row, this);
    Z.x = 870 + extraX + Math.random() * 40;
    this.zombies.push(Z);
    return Z;
  }

  spawnSkySun() {
    const col = Math.floor(Math.random() * 9);
    const targetY = this.gridY(Math.floor(Math.random() * this.rows)) + 40 + Math.random() * 30;
    this.suns.push(new Sun(this.gridX(col) + Math.random() * 40, -60, targetY, 'sky'));
  }

  // ---------- 割草机 ----------
  updateMower(m, dt) {
    if (m.state === 'idle') {
      // 触发: 僵尸接近
      for (const z of this.zombies) {
        if (!z.dead && z.row === m.row && z.x < 90 && !z.flyingHigh && z.phase !== 'dying' && !z.boss) {
          m.state = 'running';
          m.x = 0;
          this.game.audio.play(m.type === 'pool' ? 'pool_cleaner' : 'lawnmower');
          break;
        }
      }
    } else if (m.state === 'running') {
      m.x += 320 * dt;
      // 杀僵尸 (单次命中)
      for (const z of this.zombies) {
        if (!z.dead && !z._mowedHit && z.row === m.row && !z.boss && Math.abs(z.x + 40 - m.x) < 60 && !z.isThrown) {
          z._mowedHit = true;
          z.mowed(this);
        }
      }
      if (m.x > 900) m.state = 'gone';
    }
  }

  // ---------- 阳光 ----------
  addSun(x, y, targetY, from) {
    this.suns.push(new Sun(x, y, targetY, from));
  }
  collectSun(s) {
    if (s.collected || s.dead) return;
    s.collected = true;
    this.sun += s.value;
    this.game.audio.play('points');
    this.game.ui.sunPulse = 1;
  }
  addCoin(x, y, value = 25) {
    this.coins.push(new Coin(x, y, value));
    this.game.audio.play('coin');
  }

  // ---------- 特效 ----------
  addEffect(name, x, y, opts = {}) {
    const e = new Effect(name, x, y, opts);
    this.effects.push(e);
    return e;
  }
  updateEffects(dt) {
    for (const e of this.effects) e.update(dt, this);
    this.effects = this.effects.filter(e => !e.dead);
    if (this.hugeWaveBanner > 0) this.hugeWaveBanner -= dt;
    if (this.finalWaveBanner > 0) this.finalWaveBanner -= dt;
    if (this.fogClearUntil < this.time) this.fogCleared = 0;
  }

  // ---------- 胜负 ----------
  checkWinLose() {
    // 输: 僵尸走到最左且该行割草机没了
    for (const z of this.zombies) {
      if (!z.dead && !z.boss && z.x < -30) {
        if (z.flyingHigh) { this.triggerLose(z.row); return; } // 气球直接进屋
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
      z.hittable !== false && z.phase !== 'dying' && !z.underwater && !z.underground && !z.boss);
  }
  firstZombieInRow(row, fromX, toX) {
    let best = null;
    for (const z of this.zombies) {
      if (z.dead || z.row !== row || z.hittable === false || z.phase === 'dying' || z.boss) continue;
      const zx = z.hitX();
      if (zx >= fromX && zx <= toX) {
        if (!best || zx < best.hitX()) best = z;
      }
    }
    return best;
  }
  plantAt(row, col) { return this.grid[row][col]; }
  // 僵尸要啃食的目标 (含南瓜/地刺不算)
  eatTargetAt(row, col) {
    const pk = this.gridPumpkin[row][col];
    if (pk && !pk.dead) return pk;
    return this.grid[row][col];
  }
  // 雾是否清除
  fogLevel(x) {
    if (this.scene !== 'fog') return 0;
    if (this.time < this.fogClearUntil) return 0;
    // 路灯花: 照亮周围
    for (const p of this.plants) {
      if (!p.dead && p.type === 'PLANTERN') {
        if (Math.abs(p.x - x) < 200) return 0;
      }
    }
    return x > 340 ? 1 : 0;
  }
}

// ===== 实体类 (sun/coin/effect 也放这里) =====
class Sun {
  constructor(x, y, targetY, from) {
    this.x = x; this.y = y; this.targetY = targetY;
    this.from = from;        // sky / flower
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
      // 飞向阳光计数器
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
    this.opts = opts;
    this.reanim = null;
    // reanim类特效
    const REANIMS = {
      splat: 'Puff', snowsplat: 'Puff', firesplat: 'fire', powie: null, explosion: null,
      spudow: null, boom: null, chomp: null, ice: null, freeze: null,
    };
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
      case 'chomper_bite': if (this.t > 0.3) this.dead = true; break;
      case 'zag': if (this.t > 0.4) this.dead = true; break;
      case 'text': if (this.t > (this.opts.hold || 2)) this.dead = true; break;
      default: if (this.t > 1) this.dead = true;
    }
    if (this.reanim) this.reanim.update(dt);
  }
}

if (typeof module !== 'undefined') module.exports = { Board, Sun, Coin, Effect, SCENE_BG };
