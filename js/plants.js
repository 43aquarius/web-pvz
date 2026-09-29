// ============================================================
// plants.js — 48种植物实体与行为
// ============================================================
'use strict';

const { CONST, PLANTS, MUSHROOMS, AQUATIC, GROUNDCOVER } = require('./data');
const RE = require('./reanim');
const { Projectile } = require('./projectiles');

// 高度偏移 (原版 PlantDrawHeightOffset)
const H_OFFSET = {
  FLOWERPOT: 26, LILYPAD: 25, STARFRUIT: 10, TANGLEKELP: 24, SEASHROOM: 28,
  COFFEEBEAN: -20, PUMPKIN: 15, PUFFSHROOM: 5, SCAREDYSHROOM: -14, GRAVEBUSTER: -40,
  SPIKEWEED: 15, SPIKEROCK: 21,
};

class Plant {
  constructor(type, row, col, board, opts = {}) {
    this.type = type;
    this.def = PLANTS[type];
    this.row = row; this.col = col;
    this.board = board;
    this.x = board.gridX(col);
    this.y = board.cellY(row, col);
    this.hp = this.def.hp || CONST.PLANT_HP;
    this.maxHp = this.hp;
    this.dead = false;
    this.eatenBy = 0;
    this.state = 'idle';
    this.timer = 0;           // 通用计时
    this.sleeping = MUSHROOMS.has(type) && !board.isNight && !opts.woken;
    this.firstSun = true;
    this.grown = false;       // 阳光菇成长
    this.eatFlash = 0;
    this.fuseT = 0;
    this.chew = 0;            // 大嘴花咀嚼
    this.armed = false;       // 土豆雷
    this.cobCD = 0;
    this.aiming = false;
    this.magnetCD = 0;
    this.magnetItems = [];
    // 分层动画 (原版: 身体+头部为独立reanim实例)
    this.anims = [];
    const layerList = this.def.layers || [[this.def.anim || 'anim_idle']];
    for (const [layerAnim] of layerList) {
      const r = Assets.reanim(this.def.reanim);
      r.play(layerAnim, RE.LOOP, 9 + Math.random() * 5);
      r.shown = true;
      this.anims.push({ r, base: layerAnim, head: /head|splitpea/.test(layerAnim) });
    }
    this.anim = this.anims[0].r; // 兼容旧引用
    this.squashTarget = null;
    this.butterStun = 0;      // 被黄油定身
    this.frozen = 0;          // 被冰球冻结
    this.zzz = null;
    this.buildT = 0;          // 种植缩放动画
    if (this.sleeping) this.setSleep(true);
    this.setup();
  }

  get hitbox() { return { x: this.x, y: this.y, w: 80, h: 80, row: this.row, col: this.col }; }

  setup() {
    const d = this.def;
    switch (this.type) {
      case 'POTATOMINE': this.state = 'arming'; this.timer = d.arm; for (const L of this.anims) L.r.play('anim_rise', RE.PLAY_ONCE_HOLD, 18); break;
      case 'CHERRYBOMB': case 'DOOMSHROOM': case 'JALAPENO': case 'ICESHROOM': case 'BLOVER':
        this.state = 'fuse'; this.fuseT = d.fuse || 1; break;
      case 'SUNSHROOM':
        this.timer = 30; break;
      case 'COBCANNON':
        this.cobCD = 3; break;
    }
    // 产阳光植物首次时间
    if (d.sunRate) {
      const [a, b] = d.firstSun || [3, 10];
      this.timer = a + Math.random() * (b - a);
    }
  }

  setSleep(asleep) {
    this.sleeping = asleep;
    for (const L of this.anims) {
      if (asleep) {
        if (L.r.trackExists('anim_sleep')) L.r.play('anim_sleep', RE.LOOP, 6);
      } else {
        L.r.play(L.base, RE.LOOP, 12);
      }
    }
    if (asleep) this.zzz = { t: Math.random() * 2 };
    else { this.zzz = null; this.timer = 2 + Math.random() * 3; }
  }

  update(dt, board) {
    if (this.dead) return;
    for (const L of this.anims) L.r.update(dt);
    this.eatFlash = Math.max(0, this.eatFlash - dt);
    this.butterStun = Math.max(0, this.butterStun - dt);
    this.frozen = Math.max(0, this.frozen - dt);
    if (this.buildT < 0.25) this.buildT += dt;
    if (this.sleeping) {
      if (this.zzz) this.zzz.t += dt;
      return;
    }
    if (this.butterStun > 0) return;
    if (this.frozen > 0) return;
    const d = this.def;
    switch (this.type) {
      // ---- 瞬发植物 ----
      case 'CHERRYBOMB': case 'DOOMSHROOM': case 'JALAPENO': case 'ICESHROOM': case 'BLOVER': {
        this.fuseT -= dt;
        if (this.fuseT <= 0) this.detonate(board);
        break;
      }
      case 'POTATOMINE': {
        if (this.state === 'arming') {
          this.timer -= dt;
          if (this.timer <= 0) {
            this.state = 'armed';
            for (const L of this.anims) L.r.play('anim_armed', RE.LOOP, 12);
            board.addEffect('dust', this.x + 40, this.y + 40);
            board.game.audio.play('dirt_rise');
          }
        } else if (this.state === 'armed') {
          // 触发: 僵尸靠近
          for (const z of board.zombies) {
            if (!z.dead && z.row === this.row && !z.underwater && Math.abs(z.hitX() - (this.x + 40)) < 55 && !z.boss) {
              this.explode(board, d.radius, d.dmg);
              board.game.audio.play('spudow');
              return;
            }
          }
        }
        break;
      }
      // ---- 生产植物 ----
      case 'SUNFLOWER': case 'SUNSHROOM': case 'TWINSUNFLOWER': case 'MARIGOLD': {
        this.timer -= dt;
        if (this.timer <= 0) {
          const rate = d.sunRate + Math.random() * 2;
          this.timer = rate;
          if (this.type === 'MARIGOLD') {
            board.addCoin(this.x + 40, this.y + 20, CONST.COIN_VALUE);
            for (const L of this.anims) L.r.play(L.base, RE.LOOP, 12);
          } else {
            const val = this.type === 'SUNSHROOM' && !this.grown ? 15 : d.sunVal;
            board.addSun(this.x + 40 + (Math.random() - 0.5) * 30, this.y + 30, this.y + 55, 'flower');
            board.game.audio.play('throw');
          }
        }
        // 阳光菇成长
        if (this.type === 'SUNSHROOM' && !this.grown) {
          this.growT = (this.growT || 0) + dt;
          if (this.growT > d.growTime) {
            this.grown = true;
            for (const L of this.anims) {
              if (L.r.trackExists('anim_grow')) L.r.play('anim_grow', RE.PLAY_ONCE_HOLD, 12);
              else if (L.r.trackExists('anim_bigidle')) L.r.play('anim_bigidle', RE.LOOP, 10);
            }
          }
        }
        break;
      }
      // ---- 射手植物 ----
      case 'PEASHOOTER': case 'SNOWPEA': case 'REPEATER': case 'GATLINGPEA': case 'PUFFSHROOM': case 'FUMESHROOM':
      case 'SCAREDYSHROOM': case 'SEASHROOM': case 'SPLITPEA': case 'THREEPEATER': case 'STARFRUIT':
      case 'CACTUS': case 'GLOOMSHROOM': case 'CATTAIL': case 'CABBAGEPULT': case 'KERNELPULT': case 'MELONPULT': case 'WINTERMELON': {
        this.updateShooter(dt, board);
        break;
      }
      case 'CHOMPER': {
        if (this.chew > 0) {
          this.chew -= dt;
          if (this.chew <= 0) {
            for (const L of this.anims) L.r.play(L.base, RE.LOOP, 12);
          }
        } else {
          // 咬前方僵尸
          const z = board.zombies.find(z => !z.dead && z.row === this.row && !z.underwater &&
            Math.abs(z.hitX() - (this.x + 70)) < 55 && z.hittable !== false && !z.boss && !z.isGargantuar);
          if (z && !z.underground) {
            for (const L of this.anims) L.r.play('anim_bite', RE.PLAY_ONCE_HOLD, 24);
            this.chew = d.chew;
            z.devoured(board);
            board.game.audio.play('bigchomp');
          }
        }
        break;
      }
      case 'SQUASH': {
        if (!this.squashTarget) {
          // 找同格或前一格僵尸
          let best = null;
          for (const z of board.zombies) {
            if (z.dead || z.row !== this.row || z.underwater || z.boss || z.hittable === false) continue;
            const dx = z.hitX() - (this.x + 40);
            if (dx > -70 && dx < 110) { if (!best || z.hitX() < best.hitX()) best = z; }
          }
          if (best) {
            this.squashTarget = best;
            for (const L of this.anims) L.r.play('anim_jumpup', RE.PLAY_ONCE_HOLD, 20);
            this.squashPhase = 0;
          }
        } else {
          this.squashPhase = (this.squashPhase || 0) + dt;
          if (this.squashPhase > 0.55) {
            // 压下
            const tx = this.squashTarget.dead ? this.x + 40 : this.squashTarget.hitX();
            this.x = Math.max(this.x - 40, Math.min(this.x + 40, tx - 40));
            for (const L of this.anims) L.r.play('anim_jumpdown', RE.PLAY_ONCE_HOLD, 24);
            board.game.audio.play('squash_hmm');
            // 压死范围内僵尸
            for (const z of board.zombies) {
              if (!z.dead && z.row === this.row && Math.abs(z.hitX() - (this.x + 40)) < 60) {
                z.takeDamage(1800, board, { squashed: true });
              }
            }
            board.addEffect('squashhit', this.x + 40, this.y + 40);
            board.game.audio.play('splat3');
            this.dead = true;
          }
        }
        break;
      }
      case 'GRAVEBUSTER': {
        if (this.state === 'idle') {
          this.state = 'eating';
          this.timer = d.graveEat;
        } else {
          this.timer -= dt;
          const g = board.graves.find(g => g.row === this.row && g.col === this.col);
          if (this.timer <= 0 || !g) {
            if (g) {
              board.graves = board.graves.filter(x => x !== g);
              board.game.audio.play('gravebusterchomp');
            }
            this.dead = true;
          }
        }
        break;
      }
      case 'MAGNETSHROOM': case 'GOLDMAGNET': {
        if (this.type === 'MAGNETSHROOM') {
          this.magnetCD -= dt;
          if (this.magnetCD <= 0) {
            // 找5格内带铁器的僵尸
            const targets = board.zombies.filter(z => !z.dead && !z.mindControlled &&
              z.row >= this.row - 1 && z.row <= this.row + 1 &&
              z.x - this.x < d.magnetRange * 80 && z.x > this.x &&
              (z.helmMetal() || z.shieldMetal() || z.type === 'POGO'));
            if (targets.length) {
              const z = targets[0];
              this.magnetCD = d.magnet;
              for (const L of this.anims) L.r.play('anim_shooting', RE.PLAY_ONCE_HOLD, 12);
              z.magnetSteal(board);
              board.game.audio.play('magnetshroom');
            }
          }
        } else {
          // 吸金磁: 自动收集金币
          this.magnetCD -= dt;
          if (this.magnetCD <= 0) {
            const c = board.coins.find(c => !c.collected && Math.hypot(c.x - this.x - 40, c.y - this.y - 40) < 300);
            if (c) { c.collected = true; this.magnetCD = d.goldMagnet; }
          }
        }
        break;
      }
      case 'COBCANNON': {
        this.cobCD = Math.max(0, this.cobCD - dt);
        break;
      }
      case 'SPIKEWEED': case 'SPIKEROCK': {
        // 伤害走过的僵尸
        for (const z of board.zombies) {
          if (!z.dead && z.row === this.row && !z.flyingHigh && !z.underground && !z.boss &&
            Math.abs(z.hitX() - (this.x + 40)) < 45) {
            z.spikeDamage(d.spikeDmg * dt, board, this);
            if ((z.type === 'ZAMBONI' || z.type === 'CATAPULT')) {
              // 被压毁(地刺王撑更久)
              if (this.type === 'SPIKEWEED') { this.dead = true; }
            }
          }
        }
        break;
      }
      case 'TORCHWOOD': case 'WALLNUT': case 'TALLNUT': case 'GARLIC': case 'LILYPAD':
      case 'FLOWERPOT': case 'PUMPKIN': case 'PLANTERN': case 'UMBRELLALEAF': case 'HYPNOSHROOM':
      case 'IMITATER': case 'COFFEEBEAN': case 'TANGLEKELP': case 'SPIKEWEED_DUMMY':
        break;
      default: break;
    }
    // 受伤状态图 (坚果类)
    this.updateDamageStage();
  }

  // ---------- 射手逻辑 ----------
  updateShooter(dt, board) {
    const d = this.def;
    this.timer -= dt;
    const mouthY = this.y + 30;
    const inRow = (row) => board.zombiesInRow(row, this.x + 20, this.x + d.range * 80 + 80).length > 0;

    let hasTarget = false;
    switch (this.type) {
      case 'PEASHOOTER': case 'SNOWPEA': case 'REPEATER': case 'GATLINGPEA': case 'CACTUS':
        hasTarget = inRow(this.row);
        break;
      case 'PUFFSHROOM': case 'SCAREDYSHROOM': case 'SEASHROOM':
        hasTarget = inRow(this.row) && !(this.type === 'SCAREDYSHROOM' && this.isScared(board));
        if (this.type === 'SCAREDYSHROOM') {
          // 胆小: 僵尸太近缩头
          const near = board.zombiesInRow(this.row, this.x - 20, this.x + 130).length > 0;
          if (near !== this._scared) {
            this._scared = near;
            for (const L of this.anims) L.r.play(near ? 'anim_scaredidle' : L.base, RE.LOOP, near ? 6 : 12);
          }
          if (near) hasTarget = false;
        }
        break;
      case 'FUMESHROOM':
        hasTarget = inRow(this.row);
        break;
      case 'SPLITPEA':
        hasTarget = inRow(this.row) || board.zombiesInRow(this.row, this.x - 200, this.x + 20).length > 0;
        break;
      case 'THREEPEATER':
        hasTarget = inRow(this.row) || inRow(this.row - 1) || inRow(this.row + 1);
        break;
      case 'STARFRUIT':
        hasTarget = board.zombies.some(z => !z.dead && z.hittable !== false && !z.boss &&
          Math.abs(z.hitX() - (this.x + 40)) < 400 && Math.abs(z.row - this.row) <= 2);
        break;
      case 'GLOOMSHROOM':
        hasTarget = board.zombies.some(z => !z.dead && !z.boss && z.hittable !== false &&
          Math.hypot(z.hitX() - (this.x + 40), board.gridY(z.row) + 42 - (this.y + 40)) < 300);
        break;
      case 'CATTAIL':
        hasTarget = board.zombies.some(z => !z.dead && !z.boss && z.hittable !== false);
        break;
      case 'CABBAGEPULT': case 'KERNELPULT': case 'MELONPULT': case 'WINTERMELON':
        hasTarget = inRow(this.row);
        break;
    }

    if (hasTarget && this.timer <= 0) {
      this.timer = d.shootRate;
      this.fire(board);
    }
    if (this.timer < 0 && !hasTarget) this.timer = Math.min(this.timer + dt, 0);
  }

  fire(board) {
    const d = this.def;
    const game = board.game;
    const mouthY = this.y + 30;
    const playShoot = (a, rate) => {
      // 头层切换到射击动画
      for (const L of this.anims) {
        if (L.head) {
          const shootAnim = a || L.base.replace('idle', 'shooting');
          if (L.r.trackExists(shootAnim)) L.r.play(shootAnim, RE.PLAY_ONCE_HOLD, rate || 24);
          else if (L.r.trackExists(L.base)) L.r.play(L.base, RE.LOOP, 12);
        }
      }
    };
    switch (this.type) {
      case 'PEASHOOTER': case 'SNOWPEA': case 'REPEATER': case 'GATLINGPEA': case 'CACTUS': {
        const shots = d.shots || 1;
        for (let i = 0; i < shots; i++) {
          board.projectiles.push(new Projectile(d.proj, this.x + 55, mouthY - 6, this.row, this, { delay: i * 0.14 }));
        }
        playShoot('anim_shooting');
        game.audio.play(this.type === 'CACTUS' ? 'splat2' : 'throw');
        break;
      }
      case 'PUFFSHROOM': case 'SCAREDYSHROOM': case 'SEASHROOM': {
        board.projectiles.push(new Projectile('puff', this.x + 45, mouthY - 10, this.row, this, { maxDist: d.range * 80 }));
        playShoot('anim_shooting');
        game.audio.play('puff');
        break;
      }
      case 'FUMESHROOM': {
        board.projectiles.push(new Projectile('fume', this.x + 55, mouthY - 12, this.row, this, { maxDist: d.range * 80 }));
        playShoot('anim_shooting');
        game.audio.play('fume');
        break;
      }
      case 'GLOOMSHROOM': {
        board.projectiles.push(new Projectile('gloom', this.x + 40, this.y + 40, this.row, this, { maxDist: 320 }));
        playShoot('anim_shooting');
        game.audio.play('fume');
        break;
      }
      case 'SPLITPEA': {
        board.projectiles.push(new Projectile('pea', this.x + 55, mouthY - 6, this.row, this));
        board.projectiles.push(new Projectile('pea', this.x + 20, mouthY - 6, this.row, this, { backward: true }));
        playShoot('anim_shooting');
        game.audio.play('throw');
        break;
      }
      case 'THREEPEATER': {
        for (const r of [this.row - 1, this.row, this.row + 1]) {
          if (r >= 0 && r < board.rows) board.projectiles.push(new Projectile('pea', this.x + 40, mouthY - 6, r, this));
        }
        playShoot('anim_shooting');
        game.audio.play('throw');
        break;
      }
      case 'STARFRUIT': {
        // 5向: 前/后/上/下/斜上
        const cx = this.x + 40, cy = this.y + 35;
        board.projectiles.push(new Projectile('star', cx, cy, this.row, this, { vx: 333 }));
        board.projectiles.push(new Projectile('star', cx, cy, this.row, this, { vx: -333 }));
        board.projectiles.push(new Projectile('star', cx, cy, this.row, this, { vy: -333 }));
        board.projectiles.push(new Projectile('star', cx, cy, this.row, this, { vy: 333 }));
        board.projectiles.push(new Projectile('star', cx, cy, this.row, this, { vx: 236, vy: -236 }));
        playShoot('anim_shooting');
        game.audio.play('throw');
        break;
      }
      case 'CATTAIL': {
        const z = board.zombies.filter(z => !z.dead && z.hittable !== false && !z.boss)
          .sort((a, b) => Math.hypot(a.hitX() - this.x, a.row - this.row) - Math.hypot(b.hitX() - this.x, b.row - this.row))[0];
        if (z) {
          board.projectiles.push(new Projectile('cattail', this.x + 40, this.y + 20, this.row, this, { target: z }));
          playShoot('anim_shooting');
          game.audio.play('throw');
        }
        break;
      }
      case 'CABBAGEPULT': case 'KERNELPULT': case 'MELONPULT': case 'WINTERMELON': {
        // 抛射: 目标行内最前僵尸
        const z = board.firstZombieInRow(this.row, this.x + 80, this.x + 9 * 80);
        const tx = z ? z.hitX() : this.x + 400;
        const isButter = this.type === 'KERNELPULT' && Math.random() < d.butterChance;
        const projType = isButter ? 'butter' : d.proj;
        board.projectiles.push(new Projectile(projType, this.x + 40, this.y + 5, this.row, this, { tx }));
        playShoot('anim_shooting', 15);
        game.audio.play(isButter ? 'butter' : 'throw');
        break;
      }
    }
  }

  isScared(board) { return false; }

  // ---------- 瞬发引爆 ----------
  detonate(board) {
    const d = this.def;
    const cx = this.x + 40, cy = this.y + 40;
    switch (this.type) {
      case 'CHERRYBOMB':
        this.explode(board, d.radius, d.dmg);
        board.game.audio.play('boom');
        break;
      case 'DOOMSHROOM':
        this.explode(board, d.radius, d.dmg);
        board.craters.push({ row: this.row, col: this.col, t: 0 });
        board.game.audio.play('doomshroom');
        break;
      case 'JALAPENO':
        // 整行火焰
        board.addEffect('jala_row', this.x, this.row, { row: this.row, hold: 0.8 });
        for (const z of board.zombies) {
          if (!z.dead && z.row === this.row && !z.boss) z.takeDamage(d.dmg, board, { fire: true });
        }
        // 融化冰道
        board.iceTrails = board.iceTrails.filter(t => t.row !== this.row);
        board.game.audio.play('jalapeno');
        break;
      case 'ICESHROOM':
        board.addEffect('screen_flash', 0, 0, { hold: 0.5 });
        for (const z of board.zombies) {
          if (!z.dead && !z.boss) z.freeze(CONST.FREEZE_TIME, board);
        }
        board.game.audio.play('iceshroom');
        break;
      case 'BLOVER':
        board.fogClearUntil = board.time + 25;
        for (const z of board.zombies) {
          if (!z.dead && z.flyingHigh) z.popBalloon(board, false);
          if (z.type === 'IMP' && z.isThrown) z.takeDamage(1800, board, {});
        }
        board.game.audio.play('blover');
        break;
    }
    this.dead = true;
  }

  explode(board, radius, dmg) {
    const cx = this.x + 40, cy = this.y + 40;
    board.addEffect('powie', cx, cy);
    for (const z of board.zombies) {
      if (z.dead || z.boss) continue;
      const zy = board.gridY(z.row) + 42;
      if (Math.hypot(z.hitX() - cx, zy - cy) < radius + 30) {
        z.takeDamage(dmg, board, { exploded: true });
      }
    }
    this.dead = true;
  }

  // ---------- 受伤 ----------
  takeDamage(dmg, board, src) {
    if (this.dead) return;
    this.hp -= dmg;
    this.eatFlash = 0.15;
    if (this.hp <= 0) {
      this.dead = true;
      // 大蒜: 死前驱赶
      if (this.type === 'GARLIC') { /* 已在啃食时处理换行 */ }
    }
    this.updateDamageStage();
  }

  updateDamageStage() {
    // 坚果类损伤图
    const ratio = this.hp / this.maxHp;
    if ((this.type === 'WALLNUT' || this.type === 'TALLNUT') && this.anim) {
      const img = ratio < 0.33 ? 3 : ratio < 0.66 ? 2 : 1;
      if (this._nutStage !== img) {
        this._nutStage = img;
        // 通过 OverrideScale的y位移或轨道… 简化: 播放对应受击动画
        for (const L of this.anims) if (L.r.trackExists('anim_cracked' + img)) L.r.play('anim_cracked' + img, RE.LOOP, 12);
      }
    }
  }

  // 渲染y (浮动等)
  drawY(board) {
    let oy = H_OFFSET[this.type] || 0;
    // 水上浮动
    if (board.isWater(this.row, this.col) && !AQUATIC.has(this.type) === false) { /*lily上植物*/ }
    if (AQUATIC.has(this.type) && board.isWater(this.row, this.col)) {
      oy += Math.sin(board.time * 2 + this.row * Math.PI + this.col * 0.8) * 2;
    }
    if (this.type === 'FLOWERPOT' || this.type === 'LILYPAD') {
      if (board.isWater(this.row, this.col)) oy += Math.sin(board.time * 2 + this.col * 0.8) * 2;
    }
    return this.y + oy;
  }

  draw(ctx, board) {
    if (this.dead) return;
    const dy = this.drawY(board);
    // 阴影
    if (this.type !== 'LILYPAD' && !GROUNDCOVER.has(this.type)) {
      const sh = Assets.image('plantshadow');
      if (sh) { ctx.globalAlpha = 0.35; ctx.drawImage(sh, this.x + 40 - sh.width / 2, dy + 72 - sh.height / 2); ctx.globalAlpha = 1; }
    }
    const sc = this.buildT < 0.25 ? Math.min(1, 0.6 + this.buildT * 1.6) : 1;
    for (const L of this.anims) {
      L.r.x = this.x;
      L.r.y = dy;
      L.r.scale = sc;
      if (this.eatFlash > 0) {
        ctx.save();
        ctx.filter = 'brightness(2.2)';
        L.r.draw(ctx);
        ctx.restore();
      } else L.r.draw(ctx);
    }
    // 睡眠zzz
    if (this.sleeping && this.zzz) {
      const zimg = Assets.image('zzz');
      if (zimg) {
        const p = (this.zzz.t % 1.6) / 1.6;
        ctx.globalAlpha = 1 - p;
        ctx.drawImage(zimg, this.x + 30 + p * 10, dy - 10 - p * 25, 22, 22);
        ctx.globalAlpha = 1;
      }
    }
  }
}

if (typeof module !== 'undefined') module.exports = { Plant, H_OFFSET };
