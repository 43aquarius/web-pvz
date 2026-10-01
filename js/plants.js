// ============================================================
// plants.js — 48种植物实体与行为 (Plant.cpp 移植结构)
// 头部挂载: Reanimation.attachToTrack (原版 AttachToAnotherReanimation 完整矩阵语义)
// ============================================================
'use strict';

const { CONST, PLANTS, MUSHROOMS, AQUATIC, GROUNDCOVER } = require('./data');
const RE = require('./reanim');
const { Projectile } = require('./projectiles');
// Sun 类延迟获取 (board 在 plants 之后加载)
const getSunClass = () => { const m = (window.__mods && window.__mods['board']) || require('./board'); return m && m.Sun; };

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
    // 分层动画 (原版: 身体+头部为独立reanim实例, 头部 AttachToAnotherReanimation 到身体轨道)
    this.anims = [];
    const layerList = this.def.layers || [[this.def.anim || 'anim_idle']];
    for (const [layerAnim] of layerList) {
      const r = Assets.reanim(this.def.reanim);
      r.play(layerAnim, RE.LOOP, 9 + Math.random() * 5);
      r.shown = true;
      this.anims.push({ r, base: layerAnim, head: /head|splitpea/.test(layerAnim), shooting: false, attached: false });
    }
    this.anim = this.anims[0].r; // 兼容旧引用
    // ---- 头部挂载 (原版 Plant::Plant 219-287: AttachToAnotherReanimation) ----
    // 原版: PEASHOOTER/SNOWPEA/REPEATER/GATLINGPEA → anim_stem(无则anim_idle)
    //       SPLITPEA → 双头都挂 anim_idle | THREEPEATER → 头1/2/3 挂 anim_head1/2/3
    if (this.anims.length > 1) {
      const body = this.anims[0].r;
      if (this.type === 'THREEPEATER') {
        ['anim_head1', 'anim_head2', 'anim_head3'].forEach((tr, i) => {
          const L = this.anims[1 + i];
          if (!L) return;
          if (body.trackExists(tr)) {
            body.attachToTrack(tr, L.r);
            L.attached = true;
          }
        });
      } else {
        // 单头/双头(SPLITPEA): 挂到 anim_stem (存在) 否则 anim_idle
        const track = body.trackExists('anim_stem') ? 'anim_stem'
          : body.trackExists('anim_idle') ? 'anim_idle' : null;
        if (track) {
          for (const L of this.anims.slice(1)) {
            body.attachToTrack(track, L.r);
            L.attached = true;
          }
        }
      }
    }
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
      case 'POTATOMINE':
        // 原版: NOTREADY 15s 只显示土堆尖端 (anim_idle帧0), 到时 anim_rise → anim_armed
        this.state = 'arming'; this.timer = d.arm;
        for (const L of this.anims) {
          if (L.r.animExists('anim_idle')) L.r.play('anim_idle', RE.LOOP, 0);
        }
        break;
      case 'CHERRYBOMB': case 'DOOMSHROOM': case 'JALAPENO': case 'ICESHROOM': case 'BLOVER':
        this.state = 'fuse'; this.fuseT = d.fuse || 1;
        // 引信动画 (原版: 樱桃膨胀/辣椒爆闪 anim_explode 播完→爆)
        {
          const anim = this.type === 'CHERRYBOMB' ? 'anim_explode' :
            this.type === 'JALAPENO' ? 'anim_explode' :
            this.type === 'DOOMSHROOM' ? 'anim_explode' : null;
          if (anim) {
            for (const L of this.anims) {
              if (L.r.animExists(anim)) L.r.play(anim, RE.PLAY_ONCE_HOLD, L.r.def.fps * 0.9);
            }
          }
        }
        break;
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
        // 阳光菇: 小睡 anim_sleep / 大睡 anim_bigsleep (原版)
        if (this.type === 'SUNSHROOM' && this.grown && L.r.animExists('anim_bigsleep')) L.r.play('anim_bigsleep', RE.LOOP, 6);
        else if (L.r.animExists('anim_sleep')) L.r.play('anim_sleep', RE.LOOP, 6);
      } else {
        if (this.type === 'SUNSHROOM' && this.grown && L.r.animExists('anim_bigidle')) L.r.play('anim_bigidle', RE.LOOP, 12);
        else L.r.play(L.base, RE.LOOP, 12);
      }
    }
    if (asleep) this.zzz = { t: Math.random() * 2 };
    else { this.zzz = null; this.timer = 2 + Math.random() * 3; }
  }

  update(dt, board) {
    if (this.dead) return;
    for (const L of this.anims) {
      L.r.update(dt);
      // 头部射击动画播完 → 回到基础待机 (原版 UpdatePlant: mHeadReanim 播完重置)
      if (L.head && L.shooting && L.r.loopCount > 0) {
        L.shooting = false;
        L.r.play(L.base, RE.LOOP, 12);
      }
    }
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
        // 原版 UpdatePotato 三态: NOTREADY(埋地15s) → RISING(破土动画) → ARMED(亮灯)
        if (this.state === 'arming') {
          this.timer -= dt;
          if (this.timer <= 0) {
            this.state = 'rising';
            board.addEffect('dust', this.x + 40, this.y + 30);
            for (const L of this.anims) L.r.play('anim_rise', RE.PLAY_ONCE_HOLD, 18);
            board.game.audio.play('dirt_rise');
          }
        } else if (this.state === 'rising') {
          const body = this.anims[0].r;
          if (body.loopCount > 0) {
            this.state = 'armed';
            for (const L of this.anims) L.r.play('anim_armed', RE.LOOP, 12 + Math.random() * 3);
            // 原版: 附加 anim_glow 发光轨道 (挂在 anim_light)
            if (body.animExists('anim_glow') && body.trackExists('anim_light')) {
              try {
                const glow = Assets.reanim(this.def.reanim);
                glow.play('anim_glow', RE.LOOP, 10);
                glow.frameCount = Math.max(1, glow.getAnimRange('anim_glow')[1]);
                glow.showOnlyTrack('anim_glow');
                glow.setTruncateDisappearingFrames('anim_glow', false);
                body.attachToTrack('anim_light', glow);
                this.glowAnim = glow;
              } catch (e) { }
            }
          }
        } else if (this.state === 'armed') {
          // 触发: 僵尸靠近
          for (const z of board.zombies) {
            if (!z.dead && z.row === this.row && !z.underwater && Math.abs(z.hitX() - (this.x + 40)) < 55 && !z.boss) {
              // 原版: anim_mashed (土豆泥!) + SPUDOW 粒子
              for (const L of this.anims) {
                if (L.r.animExists('anim_mashed')) L.r.play('anim_mashed', RE.PLAY_ONCE_HOLD, 24);
              }
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
        // 我不是僵尸/坚不可摧: 不产阳光 (原版 UpdateProductionPlant 直接return; LastStand仅非onslaught暂停)
        if (board._izNoProduction || (board._noSunProduction && !(board.challenge && board.challenge.onslaught))) break;
        this.timer -= dt;
        if (this.timer <= 0) {
          const rate = d.sunRate + Math.random() * 2;
          this.timer = rate;
          if (this.type === 'MARIGOLD') {
            board.addCoin(this.x + 40, this.y + 20, CONST.COIN_VALUE);
            for (const L of this.anims) L.r.play(L.base, RE.LOOP, 12);
          } else if (this.type === 'TWINSUNFLOWER') {
            // 原版: 双子向日葵一次产出两颗普通阳光 (各25)
            const SunC = getSunClass();
            if (SunC) {
              board.suns.push(new SunC(this.x + 28, this.y + 30, this.y + 55, 'flower'));
              board.suns.push(new SunC(this.x + 52, this.y + 30, this.y + 55, 'flower'));
            } else {
              board.addSun(this.x + 28, this.y + 30, this.y + 55, 'flower', 25);
              board.addSun(this.x + 52, this.y + 30, this.y + 55, 'flower', 25);
            }
            board.game.audio.play('throw');
          } else {
            // 原版: 阳光菇小形态产 COIN_SMALLSUN(15), 大形态产 COIN_SUN(25)
            const val = this.type === 'SUNSHROOM' && !this.grown ? 15 : d.sunVal;
            board.addSun(this.x + 40 + (Math.random() - 0.5) * 30, this.y + 30, this.y + 55, 'flower', val);
            board.game.audio.play('throw');
          }
        }
        // 阳光菇成长 (原版 STATE_SUNSHROOM_SMALL countdown 12000 tick = 120秒)
        if (this.type === 'SUNSHROOM' && !this.grown) {
          this.growT = (this.growT || 0) + dt;
          if (this.growT > d.growTime) {
            this.grown = true;
            this.growAnimDone = false;
            for (const L of this.anims) {
              if (L.r.animExists('anim_grow')) L.r.play('anim_grow', RE.PLAY_ONCE_HOLD, 12);
            }
            board.game.audio.play('plantgrow');
          }
        }
        // 成长动画播完 → 大形态待机 (原版 STATE_SUNSHROOM_GROWING → BIG)
        if (this.type === 'SUNSHROOM' && this.grown && !this.growAnimDone) {
          const body = this.anims[0].r;
          if (!body.animExists('anim_grow') || body.loopCount > 0) {
            this.growAnimDone = true;
            if (!this.sleeping) {
              for (const L of this.anims) {
                if (L.r.animExists('anim_bigidle')) L.r.play('anim_bigidle', RE.LOOP, 12 + Math.random() * 3);
              }
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
      case 'WALLNUT': case 'EXPLODEONUT': case 'GIANTWALLNUT': {
        // 坚果保龄球 (原版 Plant::UpdateBowling 2361-2511):
        // 向右滚 (轨道速度驱动) | 斜向2px/tick | 上下反弹 | 命中1800/盔900/盾400 | >800消亡
        if (this.rolling) {
          const giant = this.type === 'GIANTWALLNUT';
          const speed = giant ? 550 : 300;              // px/s (原版巨型×2)
          this.x += speed * dt;
          this.rollSpin = (this.rollSpin || 0) + dt * (giant ? 260 : 500);
          // 斜向状态 (原版 STATE_BOWLING_UP/DOWN: 每tick 2px, 仅贴行中线时处理)
          if (!giant && this.bowlDir) {
            this.y += (this.bowlDir === 'up' ? -2 : 2) * 60 * dt;
            const rowTop = board.gridToPixelY(this.row);
            // 到达目标行中线 → 贴齐, 结束斜向
            const near = this.bowlDir === 'up'
              ? (this.y <= rowTop)
              : (this.y >= rowTop);
            if (near) { this.y = rowTop; this.bowlDir = null; }
          } else if (!giant && !this.bowlDir) {
            // 贴行中线时才转向 (原版 |GridToPixelY(0,row)-mY| <= 2)
            const rowTop = board.gridToPixelY(this.row);
            if (Math.abs(this.y - rowTop) <= 2.5) this.y = rowTop;
          }
          // 命中判定 (攻击矩形 x..x+w-20)
          for (const z of board.zombies) {
            if (z.dead || z.isDeadOrDying || z.boss) continue;
            // 斜向滚动的坚果跨行命中 (原版按僵尸矩形)
            const zr = z.getZombieRect ? z.getZombieRect() : { x: z.x, y: z.y, w: 80, h: 115 };
            const myRect = { x: this.x, y: this.y + 10, w: 60, h: 70 };
            const ovX = Math.min(myRect.x + myRect.w, zr.x + zr.w) - Math.max(myRect.x, zr.x);
            const ovY = Math.min(myRect.y + myRect.h, zr.y + zr.h) - Math.max(myRect.y, zr.y);
            if (ovX > 10 && ovY > 10) {
              if (!z._bowlHitT || board.time - z._bowlHitT > 0.15) {
                z._bowlHitT = board.time;
                // 爆炸坚果: 半径90一行爆炸 + 自毁
                if (this.type === 'EXPLODEONUT') {
                  board.addEffect('powie', this.x + 40, this.y + 40);
                  board.shake(3, -4);
                  for (const z2 of board.zombies) {
                    if (z2.dead || z2.boss) continue;
                    if (Math.abs(z2.hitX() - (this.x + 40)) < 115 && Math.abs(z2.row - this.row) <= 1) {
                      z2.takeDamage(1800, board, { exploded: true });
                    }
                  }
                  board.game.audio.play('cherrybomb');
                  this.dead = true;
                  break;
                }
                // 原版伤害链: 铁门盾/已起跳撑杆→1800 | 其他盾→盾伤400 | 头盔→盔伤900 | 裸体→1800
                let applied = false;
                if (z.shieldType && z.shieldHealth > 0) {
                  if (z.shieldType === 'door' || (z.phase !== undefined && z.phase === 7)) {
                    z.takeDamage(1800, board, { bowling: true });
                  } else {
                    z.takeShieldDamage && z.takeShieldDamage(400);
                    if (z.shieldHealth <= 0) applied = true;
                  }
                } else if (z.helmType && z.helmHealth > 0) {
                  z.takeHelmDamage && z.takeHelmDamage(900);
                  if (z.helmHealth <= 0) applied = true;
                } else {
                  z.takeDamage(1800, board, { bowling: true });
                  applied = true;
                }
                // 命中后转向 (原版 2482-2496: 非巨型, 行4/向下→上, 行0/向上→下, 中间随机)
                if (!giant && this.row === Math.round(this.row)) {
                  if (this.row >= board.rows - 1) this.bowlDir = 'up';
                  else if (this.row <= 0) this.bowlDir = 'down';
                  else this.bowlDir = Math.random() < 0.5 ? 'up' : 'down';
                  if (this.bowlDir) this.row = this.bowlDir === 'up' ? this.row - 1 : this.row + 1;
                }
                board.addEffect('squish', z.x + 40, z.y + 30);
                board.game.audio.play('bowling');
                // 连击金币 (原版 2453-2480: 2击1银 3击2银 4击3银 5击1金)
                this.launchCounter = (this.launchCounter || 0) + 1;
                if (this.launchCounter >= 2 && board.game.addCoins) {
                  const n = Math.min(this.launchCounter - 1, 3);
                  board.game.addCoins(n >= 3 ? 5 : n);
                }
              }
            }
          }
          // 出屏消亡 (原版 mX > 800)
          if (this.x > 800) this.dead = true;
        }
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
          // 胆小 (原版 UpdateScaredyShroom 1313-1345):
          // 圆(mX, mY+20) r=120 与僵尸矩形相交, 行差±1, 非魅惑非濒死
          let near = false;
          for (const z of board.zombies) {
            if (z.dead || z.mindControlled || z.isDeadOrDying) continue;
            const dy = (z.type === 'BOSS') ? 0 : z.row - this.row;
            if (dy > 1 || dy < -1) continue;
            const zr = z.getZombieRect ? z.getZombieRect() : { x: z.x, y: z.y, w: 80, h: 115 };
            const nx = Math.max(zr.x, Math.min(this.x, zr.x + zr.w));
            const ny = Math.max(zr.y, Math.min(this.y + 20, zr.y + zr.h));
            if ((nx - this.x) ** 2 + (ny - this.y - 20) ** 2 <= 120 * 120) { near = true; break; }
          }
          if (near !== this._scared) {
            this._scared = near;
            // 原版状态机: 缩下 anim_scared(once+hold) → scaredidle循环 / 抬起回idle
            for (const L of this.anims) {
              if (near) {
                if (L.r.animExists('anim_scared')) L.r.play('anim_scared', RE.PLAY_ONCE_HOLD, 10);
                else if (L.r.animExists('anim_scaredidle')) L.r.play('anim_scaredidle', RE.LOOP, 6);
              } else {
                L.r.play(L.base, RE.LOOP, 12);
              }
            }
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
          if (L.r.animExists(shootAnim)) { L.r.play(shootAnim, RE.PLAY_ONCE_HOLD, rate || 24); L.shooting = true; }
          else if (L.r.animExists(L.base)) L.r.play(L.base, RE.LOOP, 12);
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
        // 原版 Plant::Fire: FumeShroom 不发射子弹 — DoRowAreaDamage(20, 2U) + PARTICLE_FUMECLOUD
        // 攻击矩形: Rect(mX+60, mY, 340, mHeight)
        board.addEffect('fumecloud', this.x + 85, this.y + 31, { dir: 1 });
        for (const z of board.zombies) {
          if (z.dead || z.row !== this.row || z.hittable === false || z.boss) continue;
          const zx = z.hitX();
          if (zx > this.x + 60 && zx < this.x + 60 + 340) z.takeDamage(20, board, { noFlash: true });
        }
        playShoot('anim_shooting');
        game.audio.play('fume');
        break;
      }
      case 'GLOOMSHROOM': {
        // 原版: 4 相位 GLOOMCLOUD 环 + DoRowAreaDamage; 攻击矩形 Rect(mX-80, mY-80, 240, 240)
        for (let k = 0; k < 4; k++) {
          const ang = k * Math.PI / 2 + Math.PI / 4;
          board.addEffect('fumecloud', this.x + 40 + Math.cos(ang) * 55, this.y + 40 + Math.sin(ang) * 40, { dir: 0, scale: 1.4 });
        }
        for (const z of board.zombies) {
          if (z.dead || z.boss || z.hittable === false) continue;
          if (Math.abs(z.row - this.row) > 1) continue;
          const zx = z.hitX(), zy = board.gridY(z.row) + 42;
          if (zx > this.x - 80 && zx < this.x + 160 && zy > this.y - 80 && zy < this.y + 160) {
            z.takeDamage(20, board, { noFlash: true });
          }
        }
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

  isScared(board) { return !!this._scared; }

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
        // 原版: 吹走浓雾 (mFogBlownCountDown=2000 tick=20s) + 气球/被抛小鬼
        if (board.blowFog) board.blowFog(20);
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
        for (const L of this.anims) if (L.r.animExists('anim_cracked' + img)) L.r.play('anim_cracked' + img, RE.LOOP, 12);
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

  // ---------- C++ 兼容层 (Zombie.cpp 交互接口) ----------
  get plantHealth() { return this.hp; }
  set plantHealth(v) { this.hp = v; }
  get recentlyEatenCountdown() { return this._recentlyEaten || 0; }
  set recentlyEatenCountdown(v) { this._recentlyEaten = v; if (v > 0) this.eatFlash = Math.min(0.3, v / 200); }
  get isAsleep() { return this.sleeping; }
  get notOnGround() { return this.type === 'COFFEEBEAN' || this.type === 'GRAVEBUSTER' || this.type === 'SQUASH' && this.state === 'rising'; }
  get isSpiky() { return this.type === 'SPIKEWEED' || this.type === 'SPIKEROCK'; }
  getPlantRect() { return { x: this.x, y: this.y + 10, w: 80, h: 70 }; }
  spikeRockTakeDamage() { this.hp -= 20; if (this.hp <= 0) this.dead = true; }
  die() {
    if (this.dead) return;
    this.hp = 0;
    this.dead = true;
    // 我不是僵尸: 僵尸吃掉植物 → 掉落剩余阳光 (原版 IZombiePlantDropRemainingSun)
    if (this.board && this.board.mode === 'izombie' && this.board.challenge) {
      this.board.challenge.plantDropSun(this);
    }
    // 从网格移除
    try {
      if (this.board.grid[this.row][this.col] === this) this.board.grid[this.row][this.col] = null;
      if (this.board.gridPumpkin[this.row][this.col] === this) this.board.gridPumpkin[this.row][this.col] = null;
      if (this.board.gridLily[this.row][this.col] === this) this.board.gridLily[this.row][this.col] = null;
      if (this.board.gridPot[this.row][this.col] === this) this.board.gridPot[this.row][this.col] = null;
    } catch (e) { }
  }
  squish() {
    // 被巨人/冰车/投石压扁
    this.board.addEffect('squish', this.x + 40, this.y + 40);
    this.board.game.audio.play('squish');
    this.die();
  }
  doSpecial() {
    // 即时触发 (Blover/ICESHROOM被啃时)
    if (this.state === 'fuse' || this.state === 'idle') {
      this.fuseT = 0.01;
      this.state = 'fuse';
    }
  }
  drawAt(ctx, x, y) {
    // 被蹦极抓走的植物
    ctx.save();
    ctx.translate(x - this.x, y - this.y);
    this.draw(ctx, this.board);
    ctx.restore();
  }

  draw(ctx, board) {
    if (this.dead) return;
    const dy = this.drawY(board);
    // 阴影
    if (this.type !== 'LILYPAD' && !GROUNDCOVER.has(this.type)) {
      const sh = Assets.image('plantshadow');
      if (sh) { ctx.globalAlpha = 0.35; ctx.drawImage(sh, this.x + 40 - sh.width / 2, dy + 72 - sh.height / 2); ctx.globalAlpha = 1; }
    }
    const sc = (this.def.scale || 1) * (this.buildT < 0.25 ? Math.min(1, 0.6 + this.buildT * 1.6) : 1);
    // 爆炸坚果: 红色色调 (原版 tint)
    if (this.type === 'EXPLODEONUT') {
      for (const L of this.anims) { if (L.r.colorOverride[0] === 255 && !L._redTint) { L.r.colorOverride = [255, 96, 80, 255]; L._redTint = true; } }
    }
    for (const L of this.anims) {
      if (L.attached) continue;   // 已由身体轨道挂载绘制 (完整矩阵跟随: 旋转/缩放/位移)
      L.r.setPosition(this.x, dy);
      L.r.overrideScale(sc, sc);
      // 坚果保龄球滚动旋转 (绕格心)
      if (this.rolling && this.rollSpin !== undefined) {
        const th = this.rollSpin * Math.PI / 180;
        const cx = this.x + 40, cy = dy + 40;
        const a = Math.cos(th), b = Math.sin(th);
        const ov = L.r.overlay;
        ov[0] = a; ov[1] = b; ov[2] = -b; ov[3] = a;
        ov[4] = cx - (a * cx - b * cy);
        ov[5] = cy - (b * cx + a * cy);
      }
      L.r.refreshAttachments();   // 头部等附件立即同步 (消除一帧滞后)
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
