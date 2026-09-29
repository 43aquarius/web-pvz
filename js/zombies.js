// ============================================================
// zombies.js — 26种僵尸实体与行为
// ============================================================
'use strict';

const { CONST, ZOMBIES } = require('./data');
const RE = require('./reanim');
const { Projectile } = require('./projectiles');

// 僵尸锚点: reanim原点 = (x + 15, rowTop - 8 + (1-scale)*120)
const Z_OFF_X = 15, Z_OFF_Y = -8;

class Zombie {
  constructor(type, row, board) {
    this.type = type;
    this.def = ZOMBIES[type];
    this.row = row;
    this.board = board;
    this.x = 870 + Math.random() * 40;
    this.body = this.def.body;
    this.helm = this.def.helm || 0;
    this.helmType = this.def.helmType || null;
    this.shield = this.def.shield || 0;
    this.shieldType = this.def.shieldType || null;
    this.scale = this.def.scale || 1;
    this.vel = (this.def.vel[0] + Math.random() * (this.def.vel[1] - this.def.vel[0])) / 100 * 100; // px/s
    this.baseVel = this.vel;
    this.dead = false;
    this.phase = 'walk';
    this.phaseT = 0;
    this.eating = null;       // 啃食的植物
    this.chilled = 0;         // 冰减速剩余
    this.frozen = 0;          // 冻结剩余
    this.butter = 0;          // 黄油定身
    this.mindControlled = false;
    this.flash = 0;
    this.altitude = this.def.altitude || 0;
    this.hittable = true;
    this.underwater = false;
    this.underground = false;
    this.flyingHigh = false;
    this.dyingT = 0;
    this.anim = Assets.reanim(this.def.reanim);
    this.anim.scale = this.scale;
    this.setupType();
    this.walkAnimRate = 12 * (this.vel / 30); // 速度联动动画
  }

  // ---------- 绘制 ----------
  draw(ctx, board) {
    if (this.dead) return;
    const rowTop = board.gridY(this.row);
    let dy = 0;
    if (this.phase === 'dying') dy = Math.min(60, this.dyingT * 90);
    // 原版锚点: (x+15, rowTop-8 + (1-scale)*120) + 海拔
    const oy = Z_OFF_Y + (1 - this.scale) * 120 - this.altitude + dy;
    if (this.type === 'BOSS') {
      // Boss特殊锚点: 右侧巨大机器人
      this.anim.x = -190;
      this.anim.y = -88;
    } else {
      this.anim.x = this.x + Z_OFF_X;
      this.anim.y = rowTop + oy;
    }
    // 水下裁剪
    const inPool = board.waterRows.includes(this.row);
    if (inPool && (this.underwater || (this.altitude < 0))) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 800, rowTop + 42);
      ctx.clip();
      this.anim.draw(ctx);
      ctx.restore();
      // 白色水花
      const ww = Assets.image('whitewater');
      if (ww && !this.underwater) {
        ctx.save(); ctx.globalAlpha = 0.8;
        ctx.drawImage(ww, this.x - 10, rowTop + 30, 60, 26);
        ctx.restore();
      }
    } else {
      // 冻结变蓝
      if (this.frozen > 0) this.anim.color = [0.6, 0.82, 1, 1];
      else if (this.chilled > 0) this.anim.color = [0.72, 0.9, 1, 1];
      else this.anim.color = null;
      // 受击闪白
      if (this.flash > 0) {
        ctx.save();
        ctx.filter = 'brightness(2.2)';
        this.anim.draw(ctx);
        ctx.restore();
      } else this.anim.draw(ctx);
      // 水面白色水花(泳姿)
      if (inPool && !this.flyingHigh) {
        const ww = Assets.image('whitewater');
        if (ww) {
          ctx.save(); ctx.globalAlpha = 0.55;
          const wob = Math.sin(board.time * 6 + this.x * 0.05) * 3;
          ctx.drawImage(ww, this.x - 16 + wob, rowTop + 36, 62, 22);
          ctx.restore();
        }
      }
      // 黄油/冰冻特效
      if (this.butter > 0 || this.frozen > 0) {
        const img = Assets.image(this.frozen > 0 ? 'icetrap' : 'icetrap2');
        if (img) {
          ctx.save(); ctx.globalAlpha = 0.85;
          ctx.drawImage(img, this.x - 12, rowTop - 20 - this.altitude, 84, 100);
          ctx.restore();
        }
      }
    }
  }
  bungeeY() {
    return 0;
  }

  hitX() { return this.x; }

  setupType() {
    const d = this.def;
    switch (this.type) {
      case 'NORMAL': case 'DUCKY': case 'CONE': case 'BUCKET': case 'DOOR': case 'FLAG':
        this.setupPlainZombie();
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
        if (this.type === 'FLAG') {
          // 旗帜挂载
          this.flagAnim = Assets.reanim('Zombie_flagpole');
          this.flagAnim.play('Zombie_flag', RE.LOOP, 15);
          const ti = this.anim.trackIndex('Zombie_flaghand');
          this.anim.attach[ti] = this.flagAnim;
        }
        break;
      case 'POLEVAULTER':
        this.phase = 'run';
        this.anim.play('anim_run', RE.LOOP, 26);
        break;
      case 'NEWSPAPER':
        this.phase = 'reading';
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
        break;
      case 'FOOTBALL':
        this.anim.play('anim_run', RE.LOOP, 18);
        this.setupPlainZombie({ hair: true });
        break;
      case 'DANCER':
        this.phase = 'dancing_in';
        this.phaseT = 4 + Math.random() * 0.5;
        this.anim.play('anim_moonwalk', RE.LOOP, 24);
        this.summoned = false;
        break;
      case 'BACKUP':
        this.phase = 'dancing';
        this.anim.play('anim_dance', RE.LOOP, 24);
        break;
      case 'SNORKEL':
        this.phase = 'walking';
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
        break;
      case 'ZAMBONI':
        this.anim.play('anim_drive', RE.LOOP, 12);
        break;
      case 'BOBSLED':
        this.phase = 'sliding';
        this.anim.play('anim_push', RE.LOOP, 30);
        this.sledHP = this.helm;
        break;
      case 'DOLPHIN':
        this.phase = 'walking';
        this.anim.play('anim_walkdolphin', RE.LOOP, 24);
        break;
      case 'JACK':
        this.phase = 'running';
        this.explodeDist = 450 + Math.random() * 300;
        if (Math.random() < 0.05) this.explodeDist /= 3;
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
        break;
      case 'BALLOON':
        this.flyingHigh = true;
        this.anim.play('anim_idle', RE.LOOP, 10);
        // 螺旋桨
        this.propAnim = Assets.reanim('Zombie_balloon');
        this.propAnim.setFramesForLayer('Propeller');
        const ti = this.anim.trackIndex('hat');
        if (ti !== undefined) this.anim.attach[ti] = this.propAnim;
        break;
      case 'DIGGER':
        this.phase = 'tunneling';
        this.underground = true;
        this.hittable = false;
        this.anim.play('anim_dig', RE.LOOP, 12);
        break;
      case 'POGO':
        this.phase = 'bouncing';
        this.phaseT = 0;
        this.anim.play('anim_pogo', RE.LOOP, 40);
        break;
      case 'YETI':
        this.phase = 'walking';
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
        this.walkTime = 20 + Math.random() * 10;
        break;
      case 'BUNGEE':
        this.phase = 'diving';
        this.altitude = 420 + Math.random() * 150;
        this.anim.play('anim_drop', RE.LOOP, 24);
        this.bungeeTarget = null;
        this.pickBungeeTarget();
        this.hittable = true;
        break;
      case 'LADDER':
        this.phase = 'carrying';
        this.anim.play('anim_ladderwalk', RE.LOOP, 26);
        break;
      case 'CATAPULT':
        this.ammo = d.catapult;
        this.phase = 'rolling';
        this.anim.play('anim_walk', RE.LOOP, 5.5);
        break;
      case 'GARGANTUAR': case 'REDEYE': {
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
        if (this.def.redEye) this.anim.setImageOverride('anim_head1', 'zombie_gargantuar_head_redeye');
        // 随机武器外观
        const r = Math.random();
        if (r < 0.1) this.anim.setImageOverride('Zombie_gargantuar_telephonepole', 'zombie_gargantuar_zombie');
        else if (r < 0.35) this.anim.setImageOverride('Zombie_gargantuar_telephonepole', 'zombie_gargantuar_duckxing');
        break;
      }
      case 'IMP':
        this.anim.play('anim_walk', RE.LOOP, 24);
        break;
      case 'BOSS':
        this.phase = 'enter';
        this.anim.play('anim_enter', RE.PLAY_ONCE_HOLD, 12);
        this.bossState = 'enter';
        this.bossT = 5;
        this.x = 600;
        this.hittable = false;
        this.attackCycle = 0;
        break;
    }
  }

  // 普通僵尸变体轨道设置 (原版 SetupReanimLayers)
  setupPlainZombie(opts = {}) {
    const a = this.anim;
    const hide = (p) => a.showPrefix(p, false);
    hide('anim_cone'); hide('anim_bucket'); hide('anim_screendoor');
    hide('Zombie_flaghand'); hide('Zombie_duckytube'); hide('anim_tongue'); hide('Zombie_mustache');
    // 水行显示救生圈
    if (this.board.waterRows.includes(this.row) || this.type === 'DUCKY') {
      a.showPrefix('Zombie_duckytube', true);
    }
    switch (this.type) {
      case 'CONE':
        a.showPrefix('anim_cone', true); hide('anim_hair');
        a.setImageOverride('anim_cone', 'zombie_cone1');
        break;
      case 'BUCKET':
        a.showPrefix('anim_bucket', true); hide('anim_hair');
        a.setImageOverride('anim_bucket', 'zombie_bucket1');
        break;
      case 'DOOR':
        a.showPrefix('anim_screendoor', true);
        a.showPrefix('Zombie_innerarm_screendoor', true);
        a.showPrefix('Zombie_outerarm_screendoor', true);
        a.showPrefix('Zombie_innerarm_screendoor_hand', true);
        break;
      case 'FOOTBALL':
        hide('anim_hair');
        break;
    }
  }

  // ---------- 护甲金属判定 ----------
  helmMetal() { return this.helm > 0 && ['cone', 'bucket', 'football', 'digger', 'bobsled'].includes(this.helmType); }
  shieldMetal() { return this.shield > 0 && ['screendoor', 'ladder'].includes(this.shieldType); }

  // ---------- 主更新 ----------
  update(dt, board) {
    if (this.dead) return;
    this.flash = Math.max(0, this.flash - dt);
    this.chilled = Math.max(0, this.chilled - dt);
    this.frozen = Math.max(0, this.frozen - dt);
    this.butter = Math.max(0, this.butter - dt);
    if (this.phase === 'dying') {
      this.dyingT += dt;
      this.anim.update(dt);
      if (this.dyingT > 1.0) { this.dead = true; }
      return;
    }
    if (this.frozen > 0) { this.anim.update(dt * 0.0001); return; }
    if (this.butter > 0) { this.anim.update(dt * 0.0001); return; }
    this.anim.update(dt);
    if (this.flagAnim) this.flagAnim.update(dt);
    if (this.propAnim) this.propAnim.update(dt);

    const speedMul = (this.chilled > 0 ? CONST.CHILL_FACTOR : 1) * (this.mindControlled ? -1 : 1);
    const v = this.vel * speedMul;

    // 各类型行为
    switch (this.type) {
      case 'BOSS': this.updateBoss(dt, board); return;
    }
    switch (this.phase) {
      case 'walk': case 'reading': case 'running': case 'sliding': case 'rolling':
      case 'walking': case 'dancing': case 'bouncing': case 'carrying': case 'tunneling': case 'rising': {
        this.walkUpdate(dt, board, v);
        break;
      }
      case 'eat': {
        this.eatUpdate(dt, board);
        // 巨人拍击计时
        if (this.smashT !== undefined && this.smashT > 0) {
          this.smashT -= dt;
          if (this.smashT <= 0) {
            const t = this.eating;
            if (t && !t.dead) {
              t.dead = true;
              board.addEffect('squish', t.x + 40, t.y + 40);
              const g = board.game;
              if (g.removePlant) g.removePlant(t, board);
            }
            this.eating = null;
            this.phase = 'walk';
            this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
            // 巨人半血抛小鬼
            if (!this.thrownImp && this.body < this.def.body / 2) {
              this.thrownImp = true;
              const imp = new Zombie('IMP', this.row, board);
              imp.x = this.x - 30;
              imp.phase = 'thrown'; imp.thrownT = 0;
              imp.thrownVX = 170; imp.thrownVY = 120;
              imp.altitude = 80; imp.isThrown = true;
              imp.anim.play('anim_thrown', RE.PLAY_ONCE_HOLD, 12);
              board.zombies.push(imp);
              board.game.audio.play('gargantuar_throw' in {} ? 'imp' : 'imp');
            }
          }
        }
        break;
      }
      case 'run': { // 撑杆跑
        this.x -= v * dt;
        // 遇到第一个植物起跳
        const plant = this.plantAhead(board);
        if (plant && this.x - plant.x < 90) {
          this.phase = 'vaulting';
          this.vaultFrom = this.x;
          this.vaultTargetCol = plant.col - 1;
          this.anim.play('anim_jump', RE.PLAY_ONCE_HOLD, 22);
          board.game.audio.play('polevault');
        }
        break;
      }
      case 'vaulting': {
        this.phaseT += dt;
        const dur = 0.62;
        const p = Math.min(1, this.phaseT / dur);
        this.x = this.vaultFrom - p * 160;
        if (p >= 1) {
          this.phase = 'walk';
          this.vel = this.def.walkVel;
          this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate * 0.45);
        }
        break;
      }
      case 'dancing_in': { // 舞王滑入
        this.phaseT -= dt;
        this.x -= 20 * dt;
        if (this.phaseT <= 0) {
          this.phase = 'summoning';
          this.anim.play('anim_armraise', RE.PLAY_ONCE_HOLD, 12);
          this.phaseT = 1.2;
        }
        break;
      }
      case 'summoning': {
        this.phaseT -= dt;
        if (this.phaseT <= 0 && !this.summoned) {
          this.summoned = true;
          // 召唤4个伴舞
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [dc, dr] of dirs) {
            const c = Math.round((this.x - 40) / 80) + dc, r = this.row + dr;
            if (c >= 0 && c < 9 && r >= 0 && r < board.rows) {
              const bz = new Zombie('BACKUP', r, board);
              bz.x = this.x + dc * 80;
              bz.phase = 'rising';
              bz.riseT = 0;
              board.zombies.push(bz);
              board.game.audio.play('gravedigger');
            }
          }
          this.phase = 'dancing';
          this.anim.play('anim_dance', RE.LOOP, 24);
        }
        break;
      }
      case 'rising': { // 从地升起(伴舞/墓碑)
        this.riseT = (this.riseT || 0) + dt;
        if (this.riseT > 1) this.phase = 'dancing';
        break;
      }
      case 'diving': { // 蹦极
        this.bungeeUpdate(dt, board);
        break;
      }
      case 'grabbing': { // 蹦极抓住植物上升
        this.phaseT -= dt;
        this.altitude += 200 * dt;
        if (this.stolenPlant) {
          this.stolenPlant.dead = true;
          const g = this.game || board.game;
          // 植物跟随上升 (简化: 直接消失+音效)
          this.stolenPlant = null;
          board.game.audio.play('bungee_scream');
        }
        if (this.altitude > 600 || this.phaseT <= 0 && this.altitude > 500) this.dead = true;
        if (this.phaseT <= -0.1) this.dead = true;
        break;
      }
      case 'thrown': { // 被巨人抛出
        this.thrownUpdate(dt, board);
        break;
      }
      case 'jumping': { // 海豚跳
        this.dolphinJump(dt, board);
        break;
      }
    }

    // 矿工: 挖到最左后冒头反向走
    if (this.type === 'DIGGER' && this.phase === 'tunneling' && this.x < 130) {
      this.phase = 'rising_digger';
      this.riseT2 = 0;
      this.underground = false;
      this.hittable = true;
      this.vel = 35;
      this.anim.play('anim_rising', RE.PLAY_ONCE_HOLD, 10);
      board.addEffect('dust', this.x, board.gridY(this.row) + 40);
      board.game.audio.play('dirt_rise');
    }
    if (this.phase === 'rising_digger') {
      this.riseT2 += dt;
      if (this.riseT2 > 1.2) {
        this.phase = 'walking_back';
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
      }
      return;
    }
    // 反向行走(矿工冒头后从左往右啃)
    if (this.phase === 'walking_back') {
      this.x += this.vel * 0.5 * dt;
      const col = Math.floor((this.x + 30 - 40) / 80);
      const plant = col >= 0 && col < 9 ? board.grid[this.row][col] : null;
      if (plant && !plant.dead && this.x + 60 > plant.x && this.x < plant.x + 80) {
        plant.takeDamage(CONST.ZOMBIE_EAT_DPS * dt, board, this);
        if (Math.random() < dt * 2) board.game.audio.play('chomp1');
        if (plant.dead) { /* 继续走 */ }
      }
      if (this.x > 850) this.dead = true;
      return;
    }

    // 潜水: 水中潜行
    if (this.type === 'SNORKEL') {
      const inWater = board.waterRows.includes(this.row);
      if (inWater && this.phase === 'walk' && !this.eating) {
        if (!this.underwater && this.x < 780) {
          this.underwater = true; this.hittable = false;
          this.anim.play('anim_swim', RE.LOOP, this.walkAnimRate);
        }
      }
      if (this.underwater) {
        // 遇到植物浮上来吃
        const plant = this.plantAhead(board, 30);
        if (plant) {
          this.underwater = false; this.hittable = true;
          this.anim.play('anim_uptoeat', RE.PLAY_ONCE_HOLD, 24);
        }
      }
    }
    // 气球高度
    if (this.flyingHigh) {
      this.altitude = 25 + Math.sin(board.time * 2 + this.x * 0.01) * 6;
    }
    // 冰冻轨迹上方僵尸打滑? (简化: 无)
    // 到达最左
    if (this.x < -40 && !this.mindControlled) {
      // 触发割草机或输
    }
  }

  // ---------- 行走与啃食 ----------
  walkUpdate(dt, board, v) {
    // 梯子僵尸: 高坚果前放梯子
    if (this.type === 'LADDER' && this.phase === 'carrying') {
      const plant = this.plantAhead(board, 60);
      if (plant && (plant.type === 'TALLNUT' || plant.type === 'WALLNUT' || plant.type === 'PUMPKIN')) {
        if (!board.ladders.some(l => l.row === this.row && l.col === plant.col)) {
          board.ladders.push({ row: this.row, col: plant.col });
          this.shield = 0;
          this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate * 0.5);
          this.vel = 33;
          this.phase = 'walk';
          board.game.audio.play('laddersound');
          return;
        }
      }
    }
    // 跳跳僵尸: 弹跳过植物
    if (this.type === 'POGO') {
      this.phaseT += dt * 1.4;
      if (this.phaseT > 1) this.phaseT = 0;
      const plant = this.plantAhead(board, 30);
      if (plant && plant.type === 'TALLNUT') {
        // 高坚果拦截 → 下杆行走
        this.phase = 'walk';
        this.vel = 33;
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate * 0.45);
        board.game.audio.play('pogo_stick');
        return;
      }
      if (plant && plant.type !== 'SPIKEWEED' && plant.type !== 'SPIKEROCK' && !GROUNDCOVER_SKIP(plant)) {
        // 跳过去 (视觉上弹跳高度)
        if (this.phaseT < 0.1) {
          // 无需处理, 弹跳动画自然越过
        }
      }
    }
    // 冰车: 压碎植物 + 留冰道
    if (this.type === 'ZAMBONI') {
      const plant = this.plantAhead(board, 50);
      if (plant) {
        plant.dead = true;
        board.addEffect('squish', plant.x + 40, plant.y + 40);
        board.game.audio.play('squish');
      }
      const col = Math.floor((this.x - 40) / 80);
      if (col >= 0 && col < 9 && !board.iceTrails.some(t => t.row === this.row && t.col === col) && !board.waterRows.includes(this.row)) {
        board.iceTrails.push({ row: this.row, col, t: 0 });
      }
    }
    // 读报僵尸: 报纸没了→狂暴
    if (this.type === 'NEWSPAPER' && this.shield <= 0 && this.phase !== 'running') {
      this.phase = 'running';
      this.vel = this.def.rageVel;
      this.anim.play('anim_walk', RE.LOOP, 40);
      board.game.audio.play('newspaper_rarrgh');
      return;
    }
    // 玩偶匣: 距离到了自爆
    if (this.type === 'JACK') {
      const dist = 870 - this.x;
      if (dist > this.explodeDist) {
        // 爆炸
        board.addEffect('jackbox_pop', this.x, board.gridY(this.row));
        for (const p of board.plants) {
          if (!p.dead && p.row === this.row && Math.abs(p.x + 40 - this.x) < 100) {
            p.takeDamage(1800, board);
          }
        }
        // 伤害附近僵尸? 原版不伤僵尸
        board.game.audio.play('jackbox_pop');
        this.dead = true;
        return;
      }
    }
    // 雪人: 走一段时间后逃跑
    if (this.type === 'YETI') {
      this.walkTime -= dt;
      if (this.walkTime <= 0 && this.phase === 'walking') {
        this.phase = 'running';
        this.vel = 80;
        this.anim.play('anim_walk', RE.LOOP, 30);
      }
    }
    // 投石车: 到达射程停下投篮
    if (this.type === 'CATAPULT' && this.phase === 'rolling') {
      if (this.x < 560 && this.ammo > 0) {
        this.phase = 'shooting';
        this.anim.play('anim_shoot', RE.PLAY_ONCE_HOLD, 6);
        this.shootT = 1.2;
      }
    }

    // 寻找啃食目标
    const target = this.findEatTarget(board);
    if (target && !this.underground) {
      this.eating = target;
      this.phase = 'eat';
      this.anim.play('anim_eat', RE.LOOP, 30);
      return;
    }
    // 魅惑僵尸反向走遇到僵尸"啃"
    if (this.mindControlled) {
      // 攻击其他僵尸
      const zt = board.zombies.find(z => z !== this && !z.dead && !z.mindControlled && z.row === this.row && Math.abs(z.x - this.x) < 55 && z.hittable !== false && !z.boss);
      if (zt) {
        zt.takeDamage(CONST.ZOMBIE_EAT_DPS * dt, board, { noFlash: true });
        return;
      }
    }
    this.x -= v * dt;
    // 电梯?: 水行进出水池
    // 雪橇队: 脱离冰道减速+散架
    if (this.type === 'BOBSLED' && this.phase === 'sliding') {
      const col = Math.floor((this.x - 40) / 80);
      const onIce = board.iceTrails.some(t => t.row === this.row && t.col === col);
      if (!onIce && this.x < 800) {
        // 撞毁雪橇
        this.sledHP = 0; this.helm = 0;
        this.phase = 'walk';
        this.vel = 30;
        this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate * 0.5);
        board.game.audio.play('bobsled_crash');
      }
    }
  }

  // 巨人拍碎: 到达植物时直接smash
  gargantuarSmash(board) {
    this.smashT = 0.6;
    this.anim.play('anim_smash', RE.PLAY_ONCE_HOLD, 14);
    board.game.audio.play('gargantuar');
  }

  findEatTarget(board) {
    if (this.flyingHigh) return null;
    // 攻击矩形: [x+50, x+70] 与植物格矩形重叠检测
    const ax1 = this.x + 50, ax2 = this.x + 70;
    const c1 = Math.max(0, Math.floor((ax1 - CONST.LAWN_XMIN) / 80));
    const c2 = Math.min(8, Math.floor((ax2 - CONST.LAWN_XMIN) / 80));
    for (let col = c2; col >= c1; col--) {
      // 梯子优先啃
      const ladder = board.ladders.find(l => l.row === this.row && l.col === col);
      if (ladder) {
        return { hitbox: { x: board.gridX(col), y: 0, w: 80, h: 80 }, ladder, type: 'LADDER', takeDamage: (d) => { ladder.hp -= d; if (ladder.hp <= 0) board.ladders = board.ladders.filter(l => l !== ladder); } };
      }
      const plant = board.eatTargetAt(this.row, col);
      if (plant && !plant.dead) {
        const px1 = board.gridX(col), px2 = px1 + 80;
        if (ax1 < px2 && ax2 > px1) return plant;
      }
      const lily = board.gridLily[this.row][col];
      if (lily && !lily.dead) {
        const px1 = board.gridX(col), px2 = px1 + 80;
        if (ax1 < px2 && ax2 > px1) return lily;
      }
    }
    return null;
  }

  eatUpdate(dt, board) {
    // 巨人: 拍碎
    if (this.def.smash) {
      if (this.smashT === undefined || this.smashT <= 0) this.gargantuarSmash(board);
      return;
    }
    const t = this.eating;
    if (!t || t.dead || (t.ladder && board.ladders.indexOf(t.ladder) < 0)) {
      this.eating = null;
      this.phase = 'walk';
      this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
      return;
    }
    // 大蒜: 咬一口后换行
    if (t.type === 'GARLIC') {
      t.takeDamage(40, board);
      this.eating = null;
      this.phase = 'walk';
      const dr = Math.random() < 0.5 ? -1 : 1;
      let nr = this.row + dr;
      if (nr < 0) nr = 1; if (nr >= board.rows) nr = board.rows - 2;
      // 水行约束
      if (board.waterRows.includes(nr) && !this.def.water) nr = this.row - dr;
      if (nr >= 0 && nr < board.rows && !board.waterRows.includes(nr) !== !this.def.water) {
        if (!board.waterRows.includes(nr) || this.def.water) this.row = nr;
      }
      board.game.audio.play('zombie_gargantuar2');
      return;
    }
    // 魅惑菇: 吃了变节
    if (t.type === 'HYPNOSHROOM') {
      t.dead = true;
      this.mindControlled = true;
      this.phase = 'walk';
      this.eating = null;
      this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
      board.addEffect('mindcontrol', this.x, board.gridY(this.row) + 40);
      board.game.audio.play('mindcontrol');
      return;
    }
    const dmg = CONST.ZOMBIE_EAT_DPS * dt;
    t.takeDamage(dmg, board, this);
    // 吃音效
    if (Math.random() < dt * 2.5) board.game.audio.play('chomp' + (Math.random() < 0.5 ? '1' : '2'));
    if (t.dead) {
      this.eating = null;
      this.phase = 'walk';
      this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
    }
  }

  // ---------- 蹦极 ----------
  pickBungeeTarget() {
    const board = this.board;
    const spots = [];
    for (let c = 0; c < 9; c++) for (let r = 0; r < board.rows; r++) {
      const p = board.grid[r][c] || board.gridLily[r][c] || board.gridPot[r][c];
      if (p && !p.dead) spots.push({ r, c, p });
    }
    if (!spots.length) { this.noTarget = true; return; }
    const s = spots[Math.floor(Math.random() * spots.length)];
    this.bungeeTarget = s;
    this.x = board.gridX(s.c) + 40;
    this.row = s.r;
    // 保护伞拦截
    for (const p of board.plants) {
      if (!p.dead && p.type === 'UMBRELLALEAF' && Math.abs(p.row - s.r) <= 1 && Math.abs(p.col - s.c) <= 1) {
        board.addEffect('umbrella_bounce', p.x + 40, p.y + 40);
        this.noTarget = true;
        p.anim.play('anim_bounce', RE.PLAY_ONCE_HOLD, 20);
        board.game.audio.play('umbrellaleaf');
        return;
      }
    }
  }
  bungeeUpdate(dt, board) {
    const t = this.bungeeTarget;
    const groundY = board.gridY(this.row) + 20;
    const myY = groundY - this.altitude;
    this.y = myY; // 渲染用
    if (this.noTarget) {
      this.altitude += 150 * dt;
      if (this.altitude > 600) this.dead = true;
      return;
    }
    if (!t || !t.p || t.p.dead) {
      // 没得偷: 升回
      this.altitude += 150 * dt;
      if (this.altitude > 600) this.dead = true;
      return;
    }
    if (this.altitude > 0) {
      this.altitude -= 220 * dt;
      if (this.altitude <= 0) {
        this.altitude = 0;
        this.anim.play('anim_grab', RE.PLAY_ONCE_HOLD, 24);
        this.phaseT = 0.8;
        this.phase = 'grabbing';
        // 偷植物
        const t = this.bungeeTarget;
        if (t && t.p && !t.p.dead) {
          this.stolenPlant = t.p;
          if (board.game) board.game.removePlant(t.p, board);
        }
      }
    }
  }

  // ---------- 海豚跳 ----------
  dolphinJump(dt, board) {
    this.phaseT += dt;
    const dur = 0.6;
    const p = Math.min(1, this.phaseT / dur);
    if (this.jumpFrom === undefined) { this.jumpFrom = this.x; this.jumpOver = this.plantAhead(board, 40); }
    this.x = this.jumpFrom - p * 150;
    this.altitude = Math.sin(p * Math.PI) * 80;
    if (p >= 1) {
      this.altitude = 0;
      this.phase = 'walk';
      this.vel = this.def.walkVel;
      this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate * 0.45);
      board.game.audio.play('dolphin');
    }
  }

  // ---------- 被抛出(小鬼) ----------
  thrownUpdate(dt, board) {
    this.isThrown = true;
    this.thrownT += dt;
    const g = 0.05 * 100 * 100; // px/s^2
    this.x -= this.thrownVX * dt;
    this.altitude += this.thrownVY * dt;
    this.thrownVY -= g * dt;
    if (this.altitude <= 0) {
      this.altitude = 0;
      this.phase = 'walk';
      this.isThrown = false;
      this.anim.play('anim_walk', RE.PLAY_ONCE_HOLD, 24);
      board.addEffect('dust', this.x, board.gridY(this.row) + 60);
    }
  }

  // ---------- 投石车射击 ----------
  catapultShoot(board) {
    if (this.ammo <= 0) {
      this.phase = 'rolling';
      this.vel = 20;
      return;
    }
    this.ammo--;
    this.shootT -= 1.2;
    if (this.ammo <= 0) { this.phase = 'rolling'; this.vel = 20; this.anim.play('anim_walk', RE.LOOP, 5.5); return; }
    // 找该行最左植物
    const plants = board.plants.filter(p => !p.dead && p.row === this.row && p.type !== 'SPIKEWEED' && p.type !== 'SPIKEROCK');
    let target = null;
    for (const p of plants) if (!target || p.x < target.x) target = p;
    if (!target) { this.phase = 'rolling'; this.vel = 20; return; }
    // 保护伞
    for (const p of board.plants) {
      if (!p.dead && p.type === 'UMBRELLALEAF' && Math.abs(p.row - this.row) <= 1 && Math.abs(p.col - target.col) <= 1) {
        board.addEffect('umbrella_bounce', p.x + 40, p.y + 40);
        p.anim.play('anim_bounce', RE.PLAY_ONCE_HOLD, 20);
        this.anim.play('anim_shoot', RE.PLAY_ONCE_HOLD, 6);
        this.shootT = 1.2;
        board.game.audio.play('umbrellaleaf');
        return;
      }
    }
    const pr = new Projectile('basketball', this.x - 40, board.gridY(this.row) - 40, this.row, this, { tx: target.x + 40, zProj: true });
    pr.zombieProj = true;
    board.projectiles.push(pr);
    board.game.audio.play('basketball');
    this.anim.play('anim_shoot', RE.PLAY_ONCE_HOLD, 6);
  }

  // ---------- Boss ----------
  updateBoss(dt, board) {
    this.bossT -= dt;
    // 头部动画切换
    if (this.bossState === 'enter') {
      if (this.bossT <= 0) { this.bossState = 'idle'; this.bossT = 2; this.anim.play('anim_head_idle', RE.LOOP, 12); this.hittable = true; }
      return;
    }
    // 攻击循环: 低头→碾压/火球/冰球/召唤蹦极
    this.attackCycle += dt;
    if (this.bossState === 'idle' && this.bossT <= 0) {
      const r = Math.random();
      if (r < 0.3) {
        // 火球
        this.bossState = 'fireball';
        this.anim.play('anim_head_attack1', RE.PLAY_ONCE_HOLD, 10);
        this.bossT = 2.5;
        const row = Math.floor(Math.random() * board.rows);
        const pr = new Projectile('bossfire', 700, board.gridY(row) + 30, row, this, {});
        pr.zombieProj = true;
        board.game.audio.play('bossfireball');
      } else if (r < 0.5) {
        // 冰球
        this.bossState = 'iceball';
        this.anim.play('anim_head_attack3', RE.PLAY_ONCE_HOLD, 10);
        this.bossT = 2.5;
        const row = Math.floor(Math.random() * board.rows);
        const pr = new Projectile('bossice', 700, board.gridY(row) + 30, row, this, {});
        pr.zombieProj = true;
        board.game.audio.play('bossiceball');
      } else if (r < 0.75) {
        // 召唤蹦极
        this.bossState = 'summon';
        this.anim.play('anim_head_attack2', RE.PLAY_ONCE_HOLD, 10);
        this.bossT = 2;
        for (let i = 0; i < 3; i++) {
          const z = new Zombie('BUNGEE', Math.floor(Math.random() * board.rows), board);
          z.x = 200 + Math.random() * 500;
          board.zombies.push(z);
        }
      } else {
        // 碾压(损失一排植物)
        this.bossState = 'stomp';
        this.anim.play('anim_stomp2', RE.PLAY_ONCE_HOLD, 12);
        this.bossT = 1.5;
        const row = Math.floor(Math.random() * board.rows);
        for (let c = 0; c < 9; c++) {
          const p = board.grid[row][c];
          if (p && !p.dead) { p.dead = true; board.addEffect('squish', p.x + 40, p.y + 40); }
        }
        board.game.audio.play('bossstomp');
      }
    } else if (this.bossT <= 0) {
      this.bossState = 'idle';
      this.bossT = 2 + Math.random() * 3;
      this.anim.play('anim_head_idle', RE.LOOP, 12);
    }
    // 血量阶段: 召唤杂兵
    if (this.body < 20000 && !this._summoned1) {
      this._summoned1 = true;
      for (let i = 0; i < 4; i++) board.spawnZombie(['BUCKET', 'FOOTBALL', 'LADDER', 'CATAPULT'][i], Math.floor(Math.random() * board.rows));
    }
    if (this.body < 10000 && !this._summoned2) {
      this._summoned2 = true;
      for (let i = 0; i < 3; i++) board.spawnZombie('GARGANTUAR', Math.floor(Math.random() * board.rows));
    }
  }

  // ---------- 找前方植物 ----------
  plantAhead(board, dist = 70) {
    const col = Math.floor((this.x + 20 - CONST.LAWN_XMIN) / 80);
    for (let c = col; c >= Math.max(0, col - 1); c--) {
      if (c < 0 || c > 8) continue;
      const p = board.grid[this.row][c];
      if (p && !p.dead) {
        if (this.x - p.x < 90 + dist) return p;
      }
      const lily = board.gridLily[this.row][c];
      if (lily && !lily.dead && this.def.water) {
        if (this.x - lily.x < 90 + dist) return lily;
      }
    }
    return null;
  }

  // ---------- 伤害 ----------
  takeDamage(dmg, board, flags = {}) {
    if (this.dead || this.phase === 'dying') return;
    if (this.flyingHigh && !flags.antiAir && !flags.exploded) { /* 地面攻击打不到气球 */ }
    if (!flags.noFlash) this.flash = 0.12;
    // 护盾/头盔优先
    let d = dmg;
    if (this.shield > 0) {
      this.shield -= d;
      if (this.shield <= 0) {
        this.dropShield(board);
        d = -this.shield; this.shield = 0;
      } else return;
    }
    if (this.helm > 0) {
      this.helm -= d;
      if (this.helm <= 0) { this.dropHelm(board); d = -this.helm; this.helm = 0; }
      else { this.updateHelmStage(); return; }
    }
    this.body -= d;
    if (flags.chill) this.applyChill(board);
    if (flags.fire && this.chilled > 0) this.chilled = 0;
    if (this.body <= 0) this.die(board, flags);
  }

  updateHelmStage() {
    if (!this.helmType) return;
    const ratio = this.helm / (this.def.helm || 1);
    const stage = ratio < 0.33 ? 3 : ratio < 0.66 ? 2 : 1;
    if (stage !== this._helmStage) {
      this._helmStage = stage;
      const map = {
        cone: ['zombie_cone1', 'zombie_cone2', 'zombie_cone3'],
        bucket: ['zombie_bucket1', 'zombie_bucket2', 'zombie_bucket3'],
        football: ['zombie_football_helmet', 'zombie_football_helmet2', 'zombie_football_helmet3'],
        digger: ['zombie_digger_hardhat', 'zombie_digger_hardhat2', 'zombie_digger_hardhat3'],
        bobsled: null,
      };
      const imgs = map[this.helmType];
      if (imgs) {
        const track = this.helmType === 'football' ? 'zombie_football_helmet' :
          this.helmType === 'digger' ? 'Zombie_digger_hardhat' :
            this.helmType === 'cone' ? 'anim_cone' : 'anim_bucket';
        this.anim.setImageOverride(track, imgs[stage - 1]);
      }
    }
  }

  dropHelm(board) {
    // 掉落护甲特效
    const imgKey = { cone: 'zombie_cone3', bucket: 'zombie_bucket3', football: 'zombie_football_helmet3', digger: 'zombie_digger_hardhat3', bobsled: null }[this.helmType];
    board.game.audio.play('zombie_falling_1');
    const track = this.helmType === 'football' ? 'zombie_football_helmet' : this.helmType === 'digger' ? 'Zombie_digger_hardhat' : this.helmType === 'cone' ? 'anim_cone' : 'anim_bucket';
    if (this.helmType === 'cone' || this.helmType === 'bucket') this.anim.showPrefix('anim_' + this.helmType, false);
    else if (this.helmType === 'football') this.anim.showPrefix('zombie_football_helmet', false);
    else if (this.helmType === 'digger') this.anim.showPrefix('Zombie_digger_hardhat', false);
    else if (this.helmType === 'bobsled') {
      // 雪橇散架
      this.phase = 'walk'; this.vel = 30;
      this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate * 0.5);
    }
  }
  dropShield(board) {
    if (this.shieldType === 'screendoor') {
      this.anim.showPrefix('anim_screendoor', false);
      this.anim.showPrefix('Zombie_innerarm_screendoor', false);
      this.anim.showPrefix('Zombie_outerarm_screendoor', false);
      this.anim.showPrefix('Zombie_innerarm_screendoor_hand', false);
    }
    if (this.shieldType === 'newspaper') {
      this.anim.showPrefix('Zombie_paper_paper', false);
    }
    if (this.shieldType === 'ladder') {
      this.anim.showPrefix('Zombie_ladder_ladder', false);
    }
    board.game.audio.play('shieldhit');
  }

  applyChill(board) {
    if (this.type === 'ZAMBONI' || this.type === 'CATAPULT' || this.type === 'BOSS') return;
    this.chilled = 8;
  }
  freeze(t, board) {
    if (this.type === 'BOSS') { this.bossT += 2; return; }
    this.frozen = t;
    this.underwater = false; this.hittable = true;
  }

  spikeDamage(dmg, board, spike) {
    // 地刺: 爆胎
    if ((this.type === 'ZAMBONI' || this.type === 'CATAPULT') && !this._tired) {
      this._tired = true;
      // 原版: 地刺直接杀死冰车/投石车
      this.takeDamage(99999, board, {});
      return;
    }
    if (this.type === 'BOBSLED' && !this._tired) {
      this._tired = true;
      this.takeDamage(99999, board, {});
      return;
    }
    this.takeDamage(dmg, board, { noFlash: true });
  }

  magnetSteal(board) {
    // 磁力菇吸走金属
    if (this.helmMetal()) {
      const fly = board.addEffect('magnetitem', this.x, board.gridY(this.row) + 30, { img: helmFlyImg(this.helmType) });
      this.helm = 0; this.dropHelm(board);
    } else if (this.shieldMetal()) {
      this.shield = 0; this.dropShield(board);
    } else if (this.type === 'POGO') {
      // 吸走跳杆
      this.phase = 'walk';
      this.vel = 33;
      this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate * 0.45);
      this.anim.showPrefix('Zombie_pogo_pogo', false);
    }
  }

  popBalloon(board, byCactus = true) {
    if (!this.flyingHigh) return;
    this.flyingHigh = false;
    this.altitude = 0;
    this.anim.play('anim_walk', RE.LOOP, this.walkAnimRate);
    board.addEffect('balloon_pop', this.x, board.gridY(this.row) - 20);
    board.game.audio.play('balloon_pop');
  }

  devoured(board) {
    // 被大嘴花吞
    this.dead = true;
    board.game.audio.play('biggulp');
  }

  mowed(board) {
    // 被割草机碾过
    if (this.type === 'GARGANTUAR' || this.type === 'REDEYE') {
      this.takeDamage(1000, board, {});
    } else {
      this.die(board, { mowed: true });
    }
  }

  die(board, flags = {}) {
    if (this.phase === 'dying' || this.dead) return;
    if (this.type === 'BOSS') {
      board.triggerWin();
      this.dead = true;
      board.addEffect('bossexplosion', this.x, 200);
      board.game.audio.play('bossdie');
      return;
    }
    // 雪人掉钻石
    if (this.type === 'YETI') {
      board.addCoin(this.x, board.gridY(this.row) + 20, 100);
    }
    // 巨人死亡抛小鬼
    if ((this.type === 'GARGANTUAR' || this.type === 'REDEYE') && !flags.exploded) {
      const imp = new Zombie('IMP', this.row, board);
      imp.x = this.x;
      imp.phase = 'thrown'; imp.thrownT = 0;
      imp.thrownVX = 150; imp.thrownVY = 100;
      imp.altitude = 60;
      imp.isThrown = true;
      imp.anim.play('anim_thrown', RE.PLAY_ONCE_HOLD, 12);
      board.zombies.push(imp);
    }
    this.phase = 'dying';
    this.dyingT = 0;
    this.eating = null;
    this.anim.play('anim_death', RE.PLAY_ONCE, 20);
    board.zombiesRemaining--;
    const snd = flags.fire ? 'zombie_burnt' : flags.exploded ? 'zombie_groan' : (Math.random() < 0.5 ? 'zombie_falls_1' : 'zombie_falls_2');
    board.game.audio.play(snd);
  }
}

function GROUNDCOVER_SKIP(plant) { return false; }
function helmFlyImg(helmType) {
  return { cone: 'zombie_cone3', bucket: 'zombie_bucket3', football: 'zombie_football_helmet3', digger: 'zombie_digger_hardhat3', bobsled: null }[helmType];
}

if (typeof module !== 'undefined') module.exports = { Zombie, Z_OFF_X, Z_OFF_Y };
