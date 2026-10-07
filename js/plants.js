// ============================================================
// plants.js — 48种植物实体与行为 (Plant.cpp 移植结构)
// 头部挂载: Reanimation.attachToTrack (原版 AttachToAnotherReanimation 完整矩阵语义)
// ============================================================
'use strict';

const { CONST, PLANTS, MUSHROOMS, AQUATIC, GROUNDCOVER } = require('./data');
const RE = require('./reanim');
const { Projectile } = require('./projectiles');
const { PH, H } = require('./zombie');   // 大嘴花 miss 判定用 (撑杆跳阶段); 磁力菇筛选用 (相位/高度)
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
    // ---- 按需加载: reanim 定义未到位 → 请求分包, 加载完成后重建动画 ----
    if (!RE.hasDef(this.def.reanim) && Assets.onPackLoaded) {
      Assets.reanim(this.def.reanim);   // 触发自愈请求
      const ptype = type, boardRef = board, layerListRef = layerList;
      const off = Assets.onPackLoaded(() => {
        if (this.dead || RE.hasDef(this.def.reanim)) { if (!this.dead && RE.hasDef(this.def.reanim)) this._rebuildAnims(ptype, layerListRef); return; }
      });
      void off; void boardRef;
    }
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
    // 我是僵尸: 植物纸板化 (原版 IZombieSetupPlant: 动画速率归零, 不会还手)
    if (board.mode === 'izombie') {
      for (const L of this.anims) L.r.animRate = 0;
    }
    if (this.sleeping && board.mode !== 'izombie') this.setSleep(true);
    this.setup();
  }

  // 分包到位后重建动画层 (按需加载自愈)
  _rebuildAnims(type, layerList) {
    try {
      for (const L of this.anims) { if (L.r && L.r.reanimDie) L.r.reanimDie(); }
      this.anims = [];
      for (const [layerAnim] of layerList) {
        const r = Assets.reanim(this.def.reanim);
        r.play(layerAnim, RE.LOOP, 9 + Math.random() * 5);
        r.shown = true;
        this.anims.push({ r, base: layerAnim, head: /head|splitpea/.test(layerAnim), shooting: false, attached: false });
      }
      this.anim = this.anims[0].r;
      // 头部挂载 (同构造逻辑)
      if (this.anims.length > 1) {
        const body = this.anims[0].r;
        if (type === 'THREEPEATER') {
          ['anim_head1', 'anim_head2', 'anim_head3'].forEach((tr, i) => {
            const L = this.anims[1 + i];
            if (L && body.trackExists(tr)) body.attachToTrack(tr, L.r);
          });
        } else {
          const track = body.trackExists('anim_stem') ? 'anim_stem' : body.trackExists('anim_idle') ? 'anim_idle' : null;
          if (track) for (const L of this.anims.slice(1)) body.attachToTrack(track, L.r);
        }
      }
      if (this.board.mode === 'izombie') for (const L of this.anims) L.r.animRate = 0;
    } catch (e) { }
  }

  get hitbox() { return { x: this.x, y: this.y, w: 80, h: 80, row: this.row, col: this.col }; }

  setup() {
    const d = this.def;
    switch (this.type) {
      case 'POTATOMINE':
        this.state = 'arming'; this.timer = d.arm;
        // 原版: 埋地期只显示土堆+顶部 (anim_idle 帧0), 而非成熟贴图 (#11)
        for (const L of this.anims) if (L.r.animExists('anim_idle')) L.r.play('anim_idle', RE.PLAY_ONCE_HOLD, 0);
        break;
      case 'CHERRYBOMB': case 'DOOMSHROOM': case 'JALAPENO': case 'ICESHROOM': case 'BLOVER':
        this.state = 'fuse'; this.fuseT = d.fuse || 1;
        // 原版 Plant 构造 (Plant.cpp 320): 樱桃/辣椒 SetFramesForLayer("anim_explode") PLAY_ONCE_AND_HOLD
        // + mDoSpecialCountdown=100tick(1.67s); Animate() 每帧 ±1px 抖动 (#17)
        if (this.type === 'CHERRYBOMB' || this.type === 'JALAPENO') {
          this.fuseT = 1.0;    // 原版 mDoSpecialCountdown = 100 tick @100Hz
          for (const L of this.anims) {
            const r = L.r;
            if (r.def && r.def.anims && r.def.anims.anim_explode && r.def.anims.anim_explode[1] > 0) {
              r.play('anim_explode', RE.PLAY_ONCE_HOLD, 30);
            } else if (r.def && r.def.n >= 14) {
              // anim_explode 轨道无显式 f 帧 (转换器丢区间): 帧区 0..13 = 膨胀序列 (anim_idle 从帧14起)
              r.frameStart = 0; r.frameCount = 14; r.loopType = RE.PLAY_ONCE_HOLD;
              r.animRate = 30; r.animTime = 0; r.loopCount = 0;
            } else if (r.animExists('anim_idle')) {
              r.play('anim_idle', RE.LOOP, 26);
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
    // 我不是僵尸: 待机动画定格 (构造时 animRate=0), 射手仍开火 (原版 UpdateShooter 无 IZ 守卫)
    const iz = board.mode === 'izombie';
    for (const L of this.anims) {
      L.r.update(dt);   // animRate=0 时自然静止; 射击动画(rate>0)正常推进
      // 头部射击动画播完 → 回到基础待机 (izombie 下保持定格: 原版 PLAY_ONCE_AND_HOLD 末帧)
      if (L.head && L.shooting && L.r.loopCount > 0) {
        L.shooting = false;
        if (iz) { L.r.play(L.base, RE.PLAY_ONCE_HOLD, 0); }
        else L.r.play(L.base, RE.LOOP, 12);
      }
    }
    this.eatFlash = Math.max(0, this.eatFlash - dt);
    this.butterStun = Math.max(0, this.butterStun - dt);
    this.frozen = Math.max(0, this.frozen - dt);
    if (this.buildT < 0.25) this.buildT += dt;
    // 原版 Animate(): 樱桃/辣椒待爆期间每帧 ±1px 抖动 (#17)
    if (this.state === 'fuse' && (this.type === 'CHERRYBOMB' || this.type === 'JALAPENO')) {
      this.shakeX = Math.random() * 2 - 1;
      this.shakeY = Math.random() * 2 - 1;
    } else { this.shakeX = 0; this.shakeY = 0; }
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
              // 原版: 半径60行内0, TakeDamage(1800, 18U) → 火系致命伤 → 僵尸烧焦化灰烬 (#11)
              this.explode(board, d.radius, d.dmg, { fire: true });
              board.game.audio.play('spudow');
              return;
            }
          }
        }
        break;
      }
      // ---- 生产植物 ----
      case 'SUNFLOWER': case 'SUNSHROOM': case 'TWINSUNFLOWER': case 'MARIGOLD': {
        // 原版 UpdateProductionPlant: IZombie 关卡不产阳光 (阳光只来自吃掉的向日葵)
        if (board.mode === 'izombie') break;
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
      case 'PEASHOOTER': case 'SNOWPEA': case 'REPEATER': case 'LEFTPEATER': case 'GATLINGPEA': case 'PUFFSHROOM': case 'FUMESHROOM':
      case 'SCAREDYSHROOM': case 'SEASHROOM': case 'SPLITPEA': case 'THREEPEATER': case 'STARFRUIT':
      case 'CACTUS': case 'GLOOMSHROOM': case 'CATTAIL': case 'CABBAGEPULT': case 'KERNELPULT': case 'MELONPULT': case 'WINTERMELON': {
        this.updateShooter(dt, board);
        break;
      }
      case 'WALLNUT': case 'EXPLODEONUT': case 'GIANTWALLNUT': {
        // ---- 坚果保龄球 (原版 Plant::UpdateBowling 完整移植) ----
        // 原版: SetFramesForLayer("_ground") 播放帧43-56 (脸绕圆周转 = 滚动视觉), mX -= _ground 轨道速度
        if (this.rolling) {
          // 首次滚动: 切换到 _ground 帧区间 (原版 Plant 构造 172: 保龄球关播放 _ground 层)
          if (!this._rollAnimSet) {
            this._rollAnimSet = true;
            const body = this.anims[0] && this.anims[0].r;
            if (body && body.def && body.def.n >= 56) {
              body.frameStart = 43; body.frameCount = 13; body.loopType = RE.LOOP;
              body.animRate = this.type === 'GIANTWALLNUT' ? 6 + Math.random() * 4 : 12 + Math.random() * 6;
              body.animTime = 0;
            }
          }
          const rollSpeed = this.type === 'GIANTWALLNUT' ? 300 : 170;   // 原版巨型 ×2
          this.x += rollSpeed * dt;
          // 撞僵尸判定 (原版 FindTargetZombie 同行)
          let hitZombie = null;
          for (const z of board.zombies) {
            if (z.dead || z.row !== this.row || z.isDeadOrDying || z.boss) continue;
            if (Math.abs(z.hitX() - (this.x + 40)) < 42) { hitZombie = z; break; }
          }
          if (hitZombie) {
            const zx = this.x + 40, zy = this.y + 40;
            if (this.type === 'EXPLODEONUT') {
              // 原版: 爆炸坚果 90 半径 3x3 清场 + ShakeBoard (火系 → 灰烬化)
              board.addEffect('powie', zx, zy);
              for (const z2 of board.zombies) {
                if (z2.dead || z2.boss) continue;
                if (Math.abs(z2.hitX() - zx) < 115 && Math.abs(z2.row - this.row) <= 1) {
                  z2.takeDamage(1800, board, { exploded: true, noFlash: true, fire: true });
                }
              }
              board.game.audio.play('cherrybomb');
              board.game.audio.play('bowlingpin');
              board.shakeX += 3; board.shakeY -= 2;
              this.dead = true;
              break;
            }
            // 原版伤害: 门盾直伤 1800; 其他盾 400 盾伤; 头盔 900 盔伤; 无防具 1800
            if (hitZombie.shield) {
              hitZombie.takeShieldDamage && hitZombie.takeShieldDamage(400, board);
              hitZombie.takeDamage(400, board, { bowling: true });
            } else if (hitZombie.helm > 0) {
              hitZombie.takeDamage(this.type === 'GIANTWALLNUT' ? 1800 : 900, board, { bowling: true });
            } else {
              hitZombie.takeDamage(1800, board, { bowling: true });
            }
            board.addEffect('squish', hitZombie.x + 40, hitZombie.y + 30);
            board.game.audio.play('bowling');
            board.game.audio.play('bowlingpin');
            board.shakeX += 1; board.shakeY -= 1;
            // 原版: 巨型不换行, 普通坚果连击奖励 (第2/3/4/5+次命中掉银/金币)
            if (this.type !== 'GIANTWALLNUT') {
              this.bowlHits = (this.bowlHits || 0) + 1;
              if (this.bowlHits >= 2 && board.addCoin) {
                const n = this.bowlHits >= 5 ? 1 : this.bowlHits - 1;
                for (let ci = 0; ci < n; ci++) board.addCoin(zx + (ci - (n - 1) / 2) * 10, zy, this.bowlHits >= 5 ? 25 : 10);
                board.game.audio.play('points');
              }
              // 换行弹跳 (原版: row4/向下走 → 向上; row0/向上走 → 向下; 否则随机)
              let newRow;
              if (this.row === board.rows - 1 || this.bowlDir === -1) newRow = this.row - 1;
              else if (this.row === 0 || this.bowlDir === 1) newRow = this.row + 1;
              else newRow = this.row + (Math.random() < 0.5 ? 1 : -1);
              if (newRow >= 0 && newRow < board.rows) {
                this.bowlDir = newRow > this.row ? 1 : -1;
                this.bowlFromY = this.y;
                this.row = newRow;
                this.bowlLerp = 0;   // 行间过渡 (原版 mY ±2/tick 滑至对齐)
              }
            }
          }
          // 行间滑动至目标行
          if (this.bowlLerp !== undefined && this.bowlLerp < 1) {
            this.bowlLerp = Math.min(1, this.bowlLerp + dt * 3.2);
            const targetY = board.cellY(this.row, this.col);
            this.y = this.bowlFromY + (targetY - this.bowlFromY) * this.bowlLerp;
          } else {
            this.y = board.cellY(this.row, this.col);
          }
          if (this.x > 810) this.dead = true;   // 原版: mX > 800 消失
        }
        break;
      }
      case 'CHOMPER': {
        // 原版 UpdateChomper 状态机 (Plant.cpp 1751): READY → BITING(70tick判定) → GOT_ONE/MISS
        //   → 播 chew 消化 4000tick → swallow → READY; 巨人/Boss 只咬 40 伤; pogo/撑杆跳中 miss
        const body = this.anims[0].r;
        const biteFind = () => {
          // 原版攻击矩形 Rect(mX+80, mY, 40, mH) × 僵尸盒~90px 重叠 → 锚点窗口 (mX-10, mX+120)
          let best = null;
          for (const z of board.zombies) {
            if (z.dead || z.row !== this.row || z.hittable === false || z.boss) continue;
            if (z.underground || z.underwater || z.flyingHigh) continue;
            if (z.x > this.x - 10 && z.x < this.x + 120) {
              if (!best || z.x < best.x) best = z;
            }
          }
          return best;
        };
        if (this.state === 'idle' || this.state === 'ready') {
          if (biteFind()) {
            for (const L of this.anims) L.r.play('anim_bite', RE.PLAY_ONCE_HOLD, 24);
            this.state = 'biting';
            this.timer = 0.7;   // 原版 mStateCountdown = 70 tick (100Hz)
          }
        } else if (this.state === 'biting') {
          this.timer -= dt;
          if (this.timer <= 0) {
            board.game.audio.play('bigchomp');
            const z = biteFind();
            let heavy = false, miss = false;
            if (!z) miss = true;
            else if (z.type === 'GARGANTUAR' || z.type === 'REDEYE' || z.boss) heavy = true;
            else if (!z.isImmobilized && (z.isBouncingPogo ||
              z.phase === PH.POLEVAULTER_IN_VAULT || z.phase === PH.POLEVAULTER_PRE_VAULT)) miss = true;
            if (heavy) {
              board.game.audio.play('splat1');
              z.takeDamage(40, board, {});
              this.state = 'bite_miss';
            } else if (miss) {
              this.state = 'bite_miss';
            } else {
              z.dieWithLoot();          // 原版 DieWithLoot 吞噬
              this.state = 'got_one';
            }
          }
        } else if (this.state === 'got_one') {
          if (body.loopCount > 0) {     // bite 播完 → 咀嚼
            for (const L of this.anims) L.r.play('anim_chew', RE.LOOP, 15);
            if (board.mode === 'izombie') body.animRate = 0;
            this.state = 'digesting';
            this.timer = 40;            // 原版 4000 tick @100Hz
          }
        } else if (this.state === 'digesting') {
          this.timer -= dt;
          if (this.timer <= 0) {
            for (const L of this.anims) L.r.play('anim_swallow', RE.PLAY_ONCE_HOLD, 12);
            this.state = 'swallowing';
          }
        } else if (this.state === 'swallowing' || this.state === 'bite_miss') {
          if (body.loopCount > 0) {
            for (const L of this.anims) L.r.play(L.base, RE.LOOP, 12);
            this.state = 'idle';
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
            this.die();   // 清除网格 → 格子立即可复种
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
            // 原版 UpdateMagnetShroom (Plant.cpp:2050-2130):
            //   有头/非魅惑/地面正常/非破土; 行差≤2; 挖地矿工与腾极需持物;
            //   铁桶/橄榄球盔/铁门/梯子/杰克盒可吸; 半径270(吃食中320)取最近
            let best = null, bestDist = Infinity;
            for (const z of board.zombies) {
              if (z.dead || z.mindControlled || !z.hasHead) continue;
              if (z.zombieHeight !== H.NORMAL || z.phase === PH.RISING_FROM_GRAVE) continue;
              const diffY = z.row - this.row;
              if (diffY > 2 || diffY < -2) continue;
              const isDiggerOrPogo = (z.type === 'DIGGER' && (z.phase === PH.DIGGER_TUNNELING || z.phase === PH.DIGGER_STUNNED || z.phase === PH.DIGGER_WALKING)) || z.type === 'POGO';
              if (isDiggerOrPogo) { if (!z.hasObject) continue; }
              else if (!(z.helmMetal() || z.shieldMetal() || z.phase === PH.JACK_RUNNING)) continue;
              const radius = z.isEating ? 320 : 270;
              // 圆-僵尸包围盒相交 (原版 GetCircleRectOverlap)
              const zx = Math.max(this.x, Math.min(z.x + 40, this.x + radius));
              const zy = Math.max(this.y + 20, Math.min(z.y + 55, this.y + 20 + radius));
              if (Math.hypot(zx - this.x, zy - (this.y + 20)) > radius) continue;
              const dist = Math.hypot(z.x + 40 - this.x, z.y + 55 - (this.y + 20)) + Math.abs(diffY) * 80;
              if (dist < bestDist) { best = z; bestDist = dist; }
            }
            if (best) {
              this.magnetCD = d.magnet;
              for (const L of this.anims) L.r.play('anim_shooting', RE.PLAY_ONCE_HOLD, 12);
              best.magnetSteal(board);
              board.game.audio.play('magnetshroom');
            } else {
              // 原版: 无僵尸目标 → 吸走≤2格内的场上梯子 (GridItem LADDER)
              let bestL = null, bestLD = Infinity;
              for (const l of board.ladders) {
                if (l.dead) continue;
                const dx = Math.abs(l.col - this.col), dy = Math.abs(l.row - this.row);
                const sq = Math.max(dx, dy);
                if (sq <= 2) {
                  const dist = sq + dy * 0.05;
                  if (dist < bestLD) { bestL = l; bestLD = dist; }
                }
              }
              if (bestL) {
                this.magnetCD = d.magnet;
                for (const L of this.anims) L.r.play('anim_shooting', RE.PLAY_ONCE_HOLD, 12);
                const lx = board.gridX ? board.gridX(bestL.col) + 40 : bestL.col * 80 + 40;
                const ly = board.cellY ? board.cellY(bestL.row, bestL.col) + 40 : bestL.row * 100 + 40;
                try { board.addEffect('magnetitem', lx, ly, { img: 'zombie_ladder_1' }); } catch (e) { }
                bestL.dead = true;
                board.game.audio.play('magnetshroom');
              }
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
    const inRow = (row) => board.zombiesInRow(row, this.x + 20, 900).length > 0;  // 原版攻击矩形: mX+60 → 屏幕右缘

    let hasTarget = false;
    switch (this.type) {
      case 'PEASHOOTER': case 'SNOWPEA': case 'REPEATER': case 'LEFTPEATER': case 'GATLINGPEA': case 'CACTUS':
        hasTarget = this.type === 'LEFTPEATER'
          ? board.zombiesInRow(this.row, -100, this.x + 20).length > 0     // 向左射手: 目标在左侧 (原版攻击矩形镜像)
          : inRow(this.row);
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
        hasTarget = board.zombies.some(z => !z.dead && z.hittable !== false && !z.boss && !z.mindControlled &&
          Math.abs(z.hitX() - (this.x + 40)) < 400 && Math.abs(z.row - this.row) <= 2);
        break;
      case 'GLOOMSHROOM':
        hasTarget = board.zombies.some(z => !z.dead && !z.boss && z.hittable !== false && !z.mindControlled &&
          Math.hypot(z.hitX() - (this.x + 40), board.gridY(z.row) + 42 - (this.y + 40)) < 300);
        break;
      case 'CATTAIL':
        hasTarget = board.zombies.some(z => !z.dead && !z.boss && z.hittable !== false && !z.mindControlled);
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
      case 'LEFTPEATER': {
        // 向左双发射手 (原版 Plant.cpp:4503 PROJECTILE_PEA + MOTION_BACKWARDS × 2)
        const shots = d.shots || 2;
        for (let i = 0; i < shots; i++) {
          board.projectiles.push(new Projectile(d.proj, this.x + 20, mouthY - 6, this.row, this, { backward: true, delay: i * 0.14 }));
        }
        playShoot('anim_shooting');
        game.audio.play('throw');
        break;
      }
      case 'PUFFSHROOM': case 'SCAREDYSHROOM': case 'SEASHROOM': {
        // 原版 Plant::FireWeapon 发射点 (Plant.cpp:4556-4565, 4603):
        //   PUFFSHROOM (mX+40, mY+40) / SEASHROOM (mX+45, mY+63) / SCAREDYSHROOM (mX+29, mY+21)
        //   弹种 PROJECTILE_PUFF: MOTION_PUFF 直线 3.33px/tick, 75tick 寿命 (#2)
        const [ox, oy] = this.type === 'PUFFSHROOM' ? [40, 40]
          : this.type === 'SEASHROOM' ? [45, 63] : [29, 21];
        board.projectiles.push(new Projectile('puff', this.x + ox, this.y + oy, this.row, this, { maxDist: d.range * 80 }));
        // 原版 PARTICLE_PUFFSHROOM_MUZZLE (Plant.cpp:4670/4675):
        //   PUFFSHROOM 嘴前 +18/+13, SCAREDYSHROOM +27/+13 的喷雾云
        const muzzleOff = this.type === 'SCAREDYSHROOM' ? 27 : 18;
        board.addEffect('puffmuzzle', this.x + ox + muzzleOff, this.y + oy + 13);
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
        const z = board.zombies.filter(z => !z.dead && z.hittable !== false && !z.boss && !z.mindControlled)
          .sort((a, b) => Math.hypot(a.hitX() - this.x, a.row - this.row) - Math.hypot(b.hitX() - this.x, b.row - this.row))[0];
        if (z) {
          board.projectiles.push(new Projectile('cattail', this.x + 40, this.y + 20, this.row, this, { target: z }));
          playShoot('anim_shooting');
          game.audio.play('throw');
        }
        break;
      }
      case 'CABBAGEPULT': case 'KERNELPULT': case 'MELONPULT': case 'WINTERMELON': {
        // 原版 Plant::Fire (Plant.cpp 4688): 攻击矩形 Rect(mX+60, mY, BOARD_WIDTH, mH) — 全屏找本行最左僵尸
        // 瞄准: ZombieTargetLeadX(50) - aOriginX - 30 = 僵尸中心 - 速度×50tick - 30px (120tick 飞行落点补偿)
        const z = board.firstZombieInRow(this.row, this.x + 60, this.x + 900);
        let tx, ty;
        if (z) {
          let spd = z.velX || 0;   // px/frame (原版 tick 单位同语义)
          if (z.isMovingAtChilledSpeed) spd *= 0.5;
          if (z.isEating || z.butter > 0 || z.frozen > 0 || z.stunTimer > 0) spd = 0;  // 原版 ZombieNotWalking
          tx = z.hitX() - spd * 50 - 30;
          ty = z.y + 35;
        } else {
          tx = this.x + 400;
          ty = board.gridY(this.row) + 40;
        }
        if (tx < this.x + 10 + 40) tx = this.x + 10 + 40;   // 原版 aRangeX >= 40
        const isButter = this.type === 'KERNELPULT' && Math.random() < d.butterChance;
        const projType = isButter ? 'butter' : d.proj;
        board.projectiles.push(new Projectile(projType, this.x + 10, this.y + 5, this.row, this, { tx, ty }));
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
        // 原版 Plant::DoSpecial → IceZombies: 全场僵尸 HitIceTrap (内部 ApplyChill+CanBeFrozen 守卫)
        board.addEffect('screen_flash', 0, 0, { hold: 0.5 });
        for (const z of board.zombies) {
          if (!z.dead) z.hitIceTrap();
        }
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
    this.die();   // 清除网格引用 → 格子立即可复种
  }

  explode(board, radius, dmg, opts = {}) {
    const cx = this.x + 40, cy = this.y + 40;
    board.addEffect('powie', cx, cy);
    // 原版 KillAllZombiesInRadius: 圆-矩形相交 + 行范围 ≤1
    for (const z of board.zombies) {
      if (z.dead || z.boss) continue;
      if (Math.abs(z.row - this.row) > 1) continue;
      const zy = board.gridY(z.row) + 42;
      if (Math.hypot(z.hitX() - cx, zy - cy) < radius + 30) {
        // 樱桃炸弹/末日菇/土豆雷 burn=true → 烧焦僵尸化灰烬 (原版 ApplyBurn)
        const fire = !!opts.fire || this.type === 'CHERRYBOMB' || this.type === 'DOOMSHROOM' || this.type === 'EXPLODEONUT';
        z.takeDamage(dmg, board, { exploded: true, noFlash: true, fire });
      }
    }
    this.dead = true;
    this.die();   // 清除网格引用 → 格子立即可复种 (#18)
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
    // 我不是僵尸: 向日葵死亡掉剩余阳光 (原版 IZombiePlantDropRemainingSun: remainingHP/40+1 个)
    if (!this.dead && this.board && this.board.mode === 'izombie' && this.type === 'SUNFLOWER') {
      const n = Math.min(Math.floor(Math.max(0, this.hp) / 40) + 1, 8);
      for (let i = 0; i < n; i++) this.board.addIZombieSun(this.x + 5 * i, this.y);
    }
    this.hp = 0;
    this.dead = true;
    this._clearGrid();
  }

  _clearGrid() {
    // 从网格移除
    try {
      if (this.board.grid[this.row][this.col] === this) this.board.grid[this.row][this.col] = null;
      if (this.board.gridPumpkin[this.row][this.col] === this) this.board.gridPumpkin[this.row][this.col] = null;
      if (this.board.gridLily[this.row][this.col] === this) this.board.gridLily[this.row][this.col] = null;
      if (this.board.gridPot[this.row][this.col] === this) this.board.gridPot[this.row][this.col] = null;
      if (this.board.gridSpikes && this.board.gridSpikes[this.row] && this.board.gridSpikes[this.row][this.col] === this) this.board.gridSpikes[this.row][this.col] = null;
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
    // ---- 我不是僵尸: 纸牌植物 (原版 IZombieDrawPlant 四层纸版画效果) ----
    // 白剪影+4px 深棕偏移 → +2/-2 中棕偏移 → 本体肉色调 (255,201,160)
    // 原版用 g 平移整幅绘制 render group (含头部附件), 此处同步设置所有层 solidColor/tint
    if (board.mode === 'izombie') {
      if (this.type !== 'LILYPAD' && !GROUNDCOVER.has(this.type)) {
        const sh = Assets.image('plantshadow');
        if (sh) { ctx.globalAlpha = 0.35; ctx.drawImage(sh, this.x + 40 - sh.width / 2, dy + 72 - sh.height / 2); ctx.globalAlpha = 1; }
      }
      const sc = (this.def.scale || 1);
      const passes = [
        [4, 4, [122, 86, 58], true],
        [2, 2, [171, 135, 107], true],
        [-2, -2, [171, 135, 107], true],
        [0, 0, [255, 201, 160], false],
      ];
      for (const [ox, oy, color, solid] of passes) {
        for (const L of this.anims) {
          L.r.solidColor = solid ? color : null;
          if (!solid) L.r.colorOverride = [color[0], color[1], color[2], 255];
        }
        for (const L of this.anims) {
          if (L.attached) continue;   // 附件随宿主轨道矩阵绘制
          L.r.setPosition(this.x + ox, dy + oy);
          L.r.overrideScale(sc, sc);
          L.r.refreshAttachments();
          L.r.draw(ctx);
        }
      }
      for (const L of this.anims) {
        L.r.solidColor = null;
        L.r.colorOverride = [255, 255, 255, 255];
      }
      return;
    }
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
      L.r.setPosition(this.x + (this.shakeX || 0), dy + (this.shakeY || 0));   // 樱桃/辣椒待爆抖动 (#17)
      // 向左射手镜像 (原版 Plant.cpp:2792: aScaleX *= -1, 附件头随之镜像)
      if (this.def.mirror) L.r.overrideScale(-sc, sc);
      else L.r.overrideScale(sc, sc);
      // 坚果保龄球滚动: 旋转由 reanim _ground 帧区间自带 (脸绕圆周) — 无需手动 overlay 旋转
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
