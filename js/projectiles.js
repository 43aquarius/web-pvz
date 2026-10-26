// ============================================================
// projectiles.js — 全部子弹类型与碰撞
// ============================================================
'use strict';

const { CONST, PROJECTILES } = require('./data');
const RE = require('./reanim');

// 僵王冰火球发光层渲染组 (原版 RENDER_GROUP_BOSS_FIREBALL_ADDITIVE)
const RG_BALL_GLOW = 15;

class Projectile {
  constructor(type, x, y, row, owner, opts = {}) {
    this.type = type;
    this.def = PROJECTILES[type];
    this.x = x; this.y = y; this.row = row;
    this.owner = owner;
    if (opts && opts.owner) this.owner = opts.owner;   // addProjectile 路径经 opts 传递属主 (僵王吐球)
    this.dead = false;
    this.t = 0;
    this.delay = opts.delay || 0;
    this.backward = !!opts.backward;
    this.maxDist = opts.maxDist || 900;
    this.startX = x;
    this.zombieProj = !!opts.zProj;
    // 直线弹
    this.vx = (opts.vx !== undefined ? opts.vx : (this.def.speed || 0)) * (this.backward ? -1 : 1);
    this.vy = opts.vy || 0;
    // 抛物线弹 (原版 Plant::DoLaunch + Projectile::UpdateLobMotion)
    // velX = rangeX/120tick, velZ初 = rangeY/120 - 7, accZ = +0.115/tick² (100Hz → px/s)
    if (this.def.lob) {
      const tx = opts.tx !== undefined ? opts.tx : x + 320;
      const ty = opts.ty !== undefined ? opts.ty : y + 35;
      this.tx = tx;
      this.sx = x; this.sy = y;
      this.baseY = y;
      this.z = 0;
      this.velX = (tx - x) / 1.2;              // 恒定水平速度 (120tick 到达)
      this.velZ = (ty - y) / 1.2 - 700;        // 初速 -700px/s 向上
      this.accZ = 1150;                        // 重力 (0.115/tick²)
      this.arcH = this.def.arcH || 180;
      // 原版 Projectile 构造旋转 (#2): cabbage/butter -50.4° 慢转, melon -72° 慢转, kernel 快转
      const rs = () => -(0.08 - Math.random() * 0.06);   // rand(-0.08,-0.02) rad/frame
      if (this.type === 'cabbage' || this.type === 'butter') {
        this.spin = -50.4; this.spinSpeed = rs() * 60;
      } else if (this.type === 'melon' || this.type === 'wintermelon') {
        this.spin = -72; this.spinSpeed = rs() * 60;
      } else if (this.type === 'kernel') {
        this.spin = 0; this.spinSpeed = -(0.2 - Math.random() * 0.12) * 60;
      }
    }
    // #fix(cob-nodamage) 玉米加农炮弹着点初始化 — 旧实现 fireCob 传 {tx} 但构造函数
    //   仅 lob 分支读取 → this.tx=undefined → 弹道/爆炸 NaN → 无伤害无特效 (静默失效)
    if (this.def.cob) {
      this.tx = opts.tx !== undefined ? opts.tx : x + 320;
      this.sx = x; this.sy = y;
      this.dur = 0.9;
      this.arcH = this.def.arcH || 250;
    }
    // 追踪弹
    if (this.def.homing && opts.target) {
      this.target = opts.target;
    }
    // 图片类
    this.img = this.def.img ? Assets.image(this.def.img) : null;
    this.reanim = this.def.reanim && RE.hasDef(this.def.reanim) ? Assets.reanim(this.def.reanim) : null;
    if (this.reanim) {
      if (this.type === 'bossfire' || this.type === 'bossice') {
        // #修复(僵王吐球) 原版 BossHeadSpitContact (Zombie.cpp 10114-10141):
        //   anim_form 聚形 → anim_role 循环滚动 (rate 2.0 慢滚)
        //   发光层 (火: additive/superglow, 冰: ice_highlight) 归入自定义组 → additive 混合绘制
        this.reanim.play('anim_form', RE.PLAY_ONCE_HOLD, 16);
        if (this.type === 'bossfire') {
          this.reanim.assignRenderGroupToTrack('additive', RG_BALL_GLOW);
          this.reanim.assignRenderGroupToTrack('superglow', RG_BALL_GLOW);
        } else {
          this.reanim.assignRenderGroupToTrack('ice_highlight', RG_BALL_GLOW);
        }
      } else {
        // Puff 只有 anim_puff 区间; FirePea 用 anim_idle (兜底)
        const a = this.reanim.animExists('anim_puff') ? 'anim_puff' : 'anim_idle';
        this.reanim.play(a, RE.LOOP, 24);
      }
    }
    this.trail = [];
  }

  update(dt, board) {
    if (this.delay > 0) { this.delay -= dt; return; }
    this.t += dt;
    if (this.reanim) this.reanim.update(dt);

    // ---- 僵尸方子弹(篮球/火球/冰球) ----
    if (this.zombieProj) {
      this.updateZombieProj(dt, board);
      return;
    }

    // ---- gloom 范围脉冲 ----
    if (this.def.gloom) {
      // 立即伤害并消失
      for (const z of board.zombies) {
        if (z.dead || z.boss || z.hittable === false || z.underground) continue;
        const zy = board.gridY(z.row) + 42;
        if (Math.hypot(z.hitX() - this.x, zy - this.y) < 300) {
          z.takeDamage(this.def.dmg, board, { noFlash: true, chill: false });
        }
      }
      this.dead = true;
      return;
    }

    // ---- 雾气类(fume/puff): 短程飞行 ----
    if (this.def.fume) {
      this.x += this.vx * dt;
      // 原版 PUFF 尾迹 (Projectile.cpp:130): 构造时 AttachParticle(PARTICLE_PUFFSHROOM_TRAIL)
      //   — 弹体后持续喷小水滴 (godot: 弹后-8px, ~20颗/s) (#2)
      if (this.def.puffAge) {
        this._trailAcc = (this._trailAcc || 0) + dt;
        if (this._trailAcc >= 0.05) {
          this._trailAcc = 0;
          board.addEffect('pufftrail', this.x - 8, this.y);
        }
      }
      // 原版 Projectile::CheckForCollision: PROJECTILE_PUFF 按 mProjectileAge>=75 tick (0.75s) 消亡
      //   — 按寿命而非距离判定 (#2)
      if (this.def.life) {
        if (this.t >= this.def.life) { this.dead = true; return; }
      } else if (this.x - this.startX > this.maxDist) { this.dead = true; return; }
      this.hitZombies(board);
      if (this.dead) return;
      return;
    }

    // ---- 抛物线弹 (原版物理: 初速-700px/s + 重力1150px/s², ~1.2s飞行, 峰值213px) ----
    if (this.def.lob) {
      this.z += this.velZ * dt;
      this.velZ += this.accZ * dt;
      this.x += this.velX * dt;
      this.y = this.baseY + this.z;
      if (this.spinSpeed) this.spin = (this.spin || 0) + this.spinSpeed * dt;
      // 原版 UpdateLobMotion: 上升中不判定; mProjectileAge>20 且下落中, z 高于 aMinCollisionZ 才检测
      if (this.velZ > 0 && this.t > 0.33) {
        // 原版 aMinCollisionZ: butter -32 / melon -35 / cabbage-kernel -30, 池子行 +40
        let minColZ = this.type === 'butter' ? -32
          : (this.type === 'melon' || this.type === 'wintermelon') ? -35 : -30;
        if (board.isPoolRow(this.row)) minColZ += 40;
        const groundZ = (board.gridY(this.row) + 30) - this.baseY;
        // 命中高度窗口 (z 相对发射点)
        if (this.z >= minColZ) {
          // #1 僵王可被任意行抛射命中 (原版 Projectile.cpp 237/441: BOSS 行差强制归零,
          //   命中矩形 (700,80,90,430) 覆盖全部行)
          const boss = board.bossZombie;
          if (boss && !boss.dead && !boss.isDeadOrDying && this.x > 690 && this.x < 800) {
            // #修复(西瓜溅射): 僵王命中同样走原版 DoImpact → DoSplashDamage (直击 80 + 溅射区 26)
            if (this.def.splashDmg) this.splashDamage(board, boss);
            else boss.takeDamage(this.def.dmg, board, { chill: this.def.chill, bypassesShield: this.def.lob });
            this.impactFx(board);
            this.dead = true;
            return;
          }
          for (const z of board.zombies) {
            if (z.dead || z.row !== this.row || z.hittable === false || z.boss || z.underground || z.underwater) continue;
            // 原版碰撞盒重叠: 僵尸盒~90px宽 × 子弹盒~40px宽 → 中心距<62
            if (Math.abs(z.hitX() - this.x) < 62) {
              if (this.def.splashDmg) {
                // #修复(西瓜溅射): 中弹走 DoSplashDamage — 直击全额 + 溅射区(行±1)内其余僵尸 dmg/3
                this.splashDamage(board, z);
                this.impactFx(board);
              } else {
                // 原版 GetDamageFlags: 抛物线非溅射弹 BYPASSES_SHIELD (卷心菜/玉米/黄油直穿铁门盾)
                z.takeDamage(this.def.dmg, board, { chill: this.def.chill, bypassesShield: this.def.lob });
                if (this.def.stun) z.butter = this.def.stun;
                if (this.type === 'butter') board.game.audio.play('butterhit');
                this.splat(board, this.x);
              }
              this.dead = true;
              return;
            }
          }
        }
        // 落地 (z 回到行基准面)
        if (this.z >= groundZ) {
          this.land(board);
          return;
        }
      }
      // 出界保险
      if (this.x > 860 || this.x < -60) { this.dead = true; return; }
      return;
    }

    // ---- 玉米加农炮 ----
    if (this.def.cob) {
      const p = Math.min(1, this.t / this.dur);
      this.x = this.sx + (this.tx - this.sx) * p;
      this.y = this.sy - Math.sin(p * Math.PI) * this.arcH;
      if (p >= 1) {
        // 大爆炸
        board.addEffect('powie', this.tx, board.gridY(this.row) + 40);
        // #fix(烧灰防具掉落) 原版玉米炮 Projectile.cpp:626 KillAllZombiesInRadius(115, 1, theBurn=true)
        //   → ApplyBurn — 烧杀不走护盾/头盔扣血, 防具随本体蒸发不掉粒子
        for (const z of board.zombies) {
          if (z.dead || z.boss) continue;
          if (Math.abs(z.hitX() - this.tx) < 160 && Math.abs(z.row - this.row) <= 1) {
            try { z.removeColdEffects && z.removeColdEffects(); } catch (e) { }
            try { z.applyBurn && z.applyBurn(); } catch (e) { z.takeDamage(this.def.dmg, board, { exploded: true }); }
          }
        }
        // #fix(boss-attackable) 原版 KillAllZombiesInRadius: BOSS 行差归零 +
        //   GetCircleRectOverlap(弹着点, 160, (700,80,90,430)) — 命中即受满额伤害
        const boss = board.bossZombie;
        if (boss && !boss.dead && !boss.isDeadOrDying) {
          const cx = this.tx, cy = board.gridY(this.row) + 40;
          const nx = Math.max(700, Math.min(cx, 790));
          const ny = Math.max(80, Math.min(cy, 510));
          if (Math.hypot(nx - cx, ny - cy) < 160) {
            try { boss.removeColdEffects && boss.removeColdEffects(); } catch (e) { }
            try { boss.applyBurn && boss.applyBurn(); } catch (e) { boss.takeDamage(this.def.dmg, board, { exploded: true, noFlash: true }); }
          }
        }
        board.game.audio.play('coblauncher');
        this.dead = true;
        return;
      }
      return;
    }

    // ---- 直线弹 ----
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // 追踪
    if (this.target && (this.target.dead || this.target.phase === 'dying')) {
      // 换目标 (原版: 魅惑僵尸不可选为目标)
      this.target = board.zombies.filter(z => !z.dead && z.hittable !== false && !z.boss && !z.mindControlled)
        .sort((a, b) => Math.hypot(a.hitX() - this.x, board.gridY(a.row) - this.y) - Math.hypot(b.hitX() - this.x, board.gridY(b.row) - this.y))[0] || null;
    }
    if (this.target) {
      const ty = board.gridY(this.target.row) + 35 - this.target.altitude;
      const dx = this.target.hitX() - this.x, dyv = ty - this.y;
      const d = Math.hypot(dx, dyv) || 1;
      const sp = this.def.speed;
      this.vx = dx / d * sp; this.vy = dyv / d * sp;
    }
    // 出界
    if (this.x > 850 || this.x < -50 || this.y > 620 || this.y < -60) { this.dead = true; return; }
    // 射程
    if (Math.abs(this.x - this.startX) > this.maxDist) { this.dead = true; return; }

    // 火炬树桩: 豌豆过火
    if ((this.type === 'pea' || this.type === 'snowpea') && !this._fired) {
      for (const p of board.plants) {
        if (!p.dead && p.type === 'TORCHWOOD' && p.row === this.row) {
          if (Math.abs(this.x - (p.x + 40)) < 30) {
            this.upgradeToFire(board);
          }
        }
      }
    }

    this.hitZombies(board);
  }

  upgradeToFire(board) {
    this._fired = true;
    this.type = 'firepea';
    this.def = PROJECTILES.firepea;
    this.img = null;
    this.reanim = Assets.reanim('FirePea');
    this.reanim.play('anim_idle', RE.LOOP, 24);
    if (this.chillVisual) this.chillVisual = false;
  }

  hitZombies(board) {
    // #1 僵王可被直线弹命中 (原版: BOSS 行差归零 + 矩形重叠)
    const boss = board.bossZombie;
    if (boss && !boss.dead && !boss.isDeadOrDying && !boss.mindControlled && this.x > 690 && this.x < 800) {
      boss.takeDamage(this.def.dmg, board, { chill: this.def.chill });
      this.splat(board, this.x);
      this.dead = true;
      return;
    }
    for (const z of board.zombies) {
      if (z.dead || z.row !== this.row || z.hittable === false || z.phase === 'dying' || z.boss) continue;
      if (z.underground || z.underwater) continue;
      // 原版 EffectedByDamage: 普通子弹对被魅惑僵尸不生效 → 直接穿过
      if (z.mindControlled) continue;
      // 气球: 只有对空子弹能打
      if (z.flyingHigh && !(this.def.antiAir || this.def.homing || this.type === 'cattail')) continue;
      // 高度判定(简化: 同行即命中, 抛物线除外)
      const zx = z.hitX();
      const halfW = 14 + 20;
      if (zx + halfW > this.x && zx - halfW < this.x) {
        // 铁门僵尸: 正面子弹先打盾 (盾在hitZombies里通过takeDamage处理)
        const flags = { noFlash: false };
        if (this.def.chill) flags.chill = true;
        // 火豌豆不触发灰烬化 (原版 ApplyBurn 仅由爆炸类调用, 火豌豆只是更高伤害)
        if (this.def.antiAir && z.flyingHigh) {
          // 对空加倍
          z.takeDamage(this.def.dmg * this.def.antiAir, board, flags);
          if (z.flyingHigh) z.popBalloon(board);
        } else {
          z.takeDamage(this.def.dmg, board, flags);
        }
        // 溅射 (原版: 被魅惑僵尸同样不受溅射)
        if (this.def.splash) {
          for (const z2 of board.zombies) {
            if (z2 === z || z2.dead || z2.row !== this.row || z2.boss || z2.hittable === false || z2.mindControlled) continue;
            if (Math.abs(z2.hitX() - zx) < 80) z2.takeDamage(this.def.splash, board, { chill: this.def.chill, noFlash: true });
          }
        }
        if (this.def.stun) z.butter = this.def.stun;
        // 命中特效
        this.splat(board, zx);
        this.dead = true;
        return;
      }
    }
  }

  splat(board, x) {
    // 原版 DoImpact: aSplatPosX -= 20 (PUFF); 特效 y —— 豌豆类打在行基准面,
    // PUFF 打在子弹实际高度 (原版 aSplatPosY = mPosY + 12, 否则命中云错行观感) (#2)
    let y = board.gridY(this.row) + 35;
    if (this.def.puffAge) {
      y = this.y + 12;
      x -= 20;
    }
    board.addEffect(this.def.splat || 'splat', x, y);
    if (!this.def.puffAge) {
      // 原版豌豆命中音效: splat1/splat2/splat3 随机 (#12)
      const snd = this.type === 'snowpea' ? 'snowpea_splat'
        : this.type === 'firepea' ? 'firepea'
        : 'splat' + (1 + Math.floor(Math.random() * 3));
      board.game.audio.play(snd);
    }
  }

  land(board) {
    const y = board.gridY(this.row) + 35;
    // 落点植物(僵尸篮球)
    if (this.zombieProj) { /* handled elsewhere */ }
    if (this.def.splashDmg) {
      // #修复(西瓜溅射): 原版落地 = DoImpact(null) → DoSplashDamage(null)
      //   溅射区内 (投影矩形×行±1) 全部僵尸吃 dmg/3 (26), 无直击全额目标
      this.splashDamage(board, null);
      this.impactFx(board);
    } else {
      // 落点僵尸判定 (卷心菜/玉米/黄油)
      for (const z of board.zombies) {
        if (z.dead || z.row !== this.row || z.hittable === false || z.boss || z.underground || z.underwater) continue;
        if (Math.abs(z.hitX() - this.x) < 55) {
          z.takeDamage(this.def.dmg, board, { chill: this.def.chill, bypassesShield: true });
          if (this.def.stun) z.butter = this.def.stun;
          if (this.type === 'butter') board.game.audio.play('butterhit');
        }
      }
      board.addEffect('splat', this.x, y);
      board.game.audio.play('splat3');
    }
    this.dead = true;
  }

  // ---------- #修复(西瓜溅射) 原版 DoSplashDamage (Projectile.cpp 460-494) ----------
  // 西瓜/冰西瓜命中(直击僵尸或落地): 直击目标吃全额 80 (HITS_SHIELD_AND_BODY);
//   溅射区 (IsZombieHitBySplash: 投影矩形 Rect(x+20,y,60,80) × 僵尸矩形重叠, 行差±1, BOSS 归零)
  //   内其余僵尸各吃 dmg/3 (26); 总量上限 dmg*7, 超限按原版公式重分配
  splashDamage(board, directTarget) {
    const def = this.def;
    const chill = !!def.chill;
    const inZone = (z) => {
      if (z.dead || z.isDeadOrDying) return false;
      if (z.mindControlled) return false;              // 原版 EffectedByDamage: 魅惑僵尸不受友方弹溅射
      if (z.underground || z.underwater) return false;
      let rowDev = z.row - this.row;
      if (z.boss) rowDev = 0;                          // 原版: BOSS 行差强制归零
      if (rowDev > 1 || rowDev < -1) return false;
      const pr = { x: this.x + 20, y: this.y, w: 60, h: 80 };   // 原版 GetProjectileRect(西瓜)
      const zr = z.getZombieRect();
      const ow = Math.min(pr.x + pr.w, zr.x + zr.w) - Math.max(pr.x, zr.x);
      const oh = Math.min(pr.y + pr.h, zr.y + zr.h) - Math.max(pr.y, zr.y);
      return ow > 0 && oh > 0;
    };
    // 统计溅射人数 (不含直击目标 — 原版 aZombiesGetSplashed)
    let n = 0;
    for (const z of board.zombies) {
      if (z === directTarget) continue;
      if (inZone(z)) n++;
    }
    const original = def.dmg;
    let splash = Math.floor(original / 3);              // 原版 aSplashDamage = mDamage/3
    const maxTotal = original * 7;                     // 原版 aMaxSplashDamageAmount
    const total = splash * n;
    if (total > maxTotal) {
      splash = Math.max(1, Math.floor(original * maxTotal / (total * 3)));
    }
    for (const z of board.zombies) {
      if (!inZone(z)) continue;
      if (z === directTarget) {
        // 直击: 全额 + 盾身同伤 (原版 DAMAGE_HITS_SHIELD_AND_BODY) + 冬瓜冰冻
        z.takeDamage(original, board, { chill, hitsShieldAndBody: true });
      } else {
        z.takeDamage(splash, board, { chill, noFlash: false, hitsShieldAndBody: true });
      }
    }
  }

  // ---------- #修复(碎西瓜) 命中特效/音效 — 中弹与落地统一 ----------
  impactFx(board) {
    if (this.def.splashDmg) {
      const y = board.gridY(this.row) + 35;
      const winter = this.type === 'wintermelon';
      // 碎西瓜块粒子 (原版 PARTICLE_MELONSPLASH/WINTERMELON) + 汁液飞溅云
      board.addEffect('melonchunks', this.x, y, { winter });
      board.addEffect('melonsplat', this.x + 12, y, { winter });
      board.game.audio.play('melonimpact');
    } else {
      this.splat(board, this.x);
    }
  }

  // ---------- 僵尸方子弹 ----------
  updateZombieProj(dt, board) {
    if (this.type === 'bossfire' || this.type === 'bossice') {
      // #修复(僵王吐球) 原版 Zombie::UpdateBossFireball (Zombie.cpp 10141-10216):
      //   速度 = _ground 轨道速度 × SECONDS_PER_UPDATE × animRate (px/tick)
      //   → anim_form(16fps)期间缓慢右移聚形, anim_role(2fps)时以 ~37px/s 左滚;
      //   y 跟随屋顶坡度 (GetPosYBasedOnRow(x+75, row) - 90)
      const v = this.reanim ? this.reanim.getTrackVelocity('_ground') : 0;
      this.x -= (isFinite(v) ? v : 0) * 100 * dt;   // px/tick → px/s
      this.y = board.getPosYBasedOnRow(this.x + 75, this.row) - 90;
      if (this.reanim) {
        if (this.reanim.loopType === RE.PLAY_ONCE_HOLD && this.reanim.loopCount > 0) {
          // 原版: anim_form 播完 → anim_role LOOP @ rate 2.0 (慢滚)
          this.reanim.play('anim_role', RE.LOOP, 2);
          this._rolling = true;
        }
        this.reanim.setPosition(this.x, this.y);
      }
      // 压毁所过格子的植物 (原版 SquishAllInSquare: 即死)
      const col = Math.floor((this.x + 75 - CONST.LAWN_XMIN) / 80);
      for (const p of board.plants) {
        if (p.dead || p.row !== this.row || p.col !== col) continue;
        try { p.squish(); } catch (e) { p.dead = true; }
      }
      // 割草机被压毁 (原版 LawnMower::SquishMower)
      for (const m of board.mowers) {
        if (m.row !== this.row || m.state !== 'idle') continue;
        if (m.x > this.x && m.x < this.x + 50) {
          m.state = 'gone';
          board.addEffect('boom', m.x, board.gridY(this.row) + 30, {});
        }
      }
      // #修复(尾迹): 原版每 tick 1/10 概率在球后方地面刷 FIREBALL/ICEBALL_TRAIL 粒子
      if (this._rolling) {
        this._trailAcc = (this._trailAcc || 0) + dt;
        if (this._trailAcc >= 0.1) {
          this._trailAcc = 0;
          const tx = this.x + 100 + Math.random() * 20;
          const ty = board.getPosYBasedOnRow(tx - 40, this.row) + 90 - Math.random() * 50;
          board.addEffect(this.type === 'bossfire' ? 'firetrail' : 'icetrail', tx, ty);
        }
      }
      if (this.x < -180) this.dead = true;
      return;
    }
    // 篮球(抛物线, 原版物理)
    this.z += this.velZ * dt;
    this.velZ += this.accZ * dt;
    this.x += this.velX * dt;
    this.y = this.baseY + this.z;
    const groundZ = (board.gridY(this.row) + 30) - this.baseY;
    if (this.velZ > 0 && this.z >= groundZ) {
      // 砸植物
      const col = Math.floor((this.x - CONST.LAWN_XMIN) / 80);
      const plant = board.grid[this.row][col] || board.gridPot[this.row][col];
      if (plant && !plant.dead) {
        plant.takeDamage(30, board);
        board.addEffect('basketballsplat', this.x, board.gridY(this.row) + 30);
        board.game.audio.play('basketballhit');
      }
      this.dead = true;
    }
  }

  draw(ctx, board) {
    if (this.delay > 0) return;
    if (this.dead) return;
    // 原版 Projectile::Draw PUFF 分支: IMAGE_PUFFSHROOM_PUFF1 静态水滴孢子
    //   + 年龄缩放 CURVE_LINEAR(0,30tick, 0.3→1.0) + 无阴影 (#2)
    if (this.def.puffAge) {
      const img = Assets.image(this.def.img);
      if (img) {
        const age = Math.min(1, this.t / 0.3);           // 30 tick = 0.3s
        const s = 0.3 + 0.7 * age;
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, this.x - w / 2, this.y - h / 2, w, h);
        return;
      }
    }
    if (this.reanim) {
      this.reanim.setPosition(this.x, this.y);
      this.reanim.draw(ctx);
      // #修复(僵王吐球): 发光层 additive 混合 (原版 DrawBossFireBall: DRAWMODE_ADDITIVE)
      if (this.type === 'bossfire' || this.type === 'bossice') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        this.reanim.drawRenderGroup(ctx, RG_BALL_GLOW);
        ctx.restore();
      }
      return;
    }
    if (this.img) {
      // 多cel图: 豌豆3帧
      const cel = this.def.cel || 1;
      let frame = 0;
      if (cel > 1) frame = Math.min(cel - 1, Math.floor(this.t * 12));
      const w = this.img.width / cel;
      if (this.def.lob && this.spin !== undefined) {
        // #20: 抛物线弹飞行中旋转 (原版卷心菜/玉米/西瓜旋转)
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.spin * Math.PI / 180);
        ctx.drawImage(this.img, frame * w, 0, w, this.img.height, -w / 2, -this.img.height / 2, w, this.img.height);
        ctx.restore();
      } else {
        ctx.drawImage(this.img, frame * w, 0, w, this.img.height, this.x - w / 2, this.y - this.img.height / 2, w, this.img.height);
      }
      return;
    }
    // 兜底: 圆点
    ctx.fillStyle = this.type === 'snowpea' ? '#9fd8ff' : this.type === 'firepea' ? '#ff8833' : '#7ad61e';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

if (typeof module !== 'undefined') module.exports = { Projectile };
