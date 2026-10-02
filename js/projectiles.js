// ============================================================
// projectiles.js — 全部子弹类型与碰撞
// ============================================================
'use strict';

const { CONST, PROJECTILES } = require('./data');
const RE = require('./reanim');

class Projectile {
  constructor(type, x, y, row, owner, opts = {}) {
    this.type = type;
    this.def = PROJECTILES[type];
    this.x = x; this.y = y; this.row = row;
    this.owner = owner;
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
    }
    // 追踪弹
    if (this.def.homing && opts.target) {
      this.target = opts.target;
    }
    // 图片类
    this.img = this.def.img ? Assets.image(this.def.img) : null;
    this.reanim = this.def.reanim && RE.hasDef(this.def.reanim) ? Assets.reanim(this.def.reanim) : null;
    if (this.reanim) {
      // Puff 只有 anim_puff 区间; FirePea 用 anim_idle (兜底)
      const a = this.reanim.animExists('anim_puff') ? 'anim_puff' : 'anim_idle';
      this.reanim.play(a, RE.LOOP, 24);
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
      if (this.x - this.startX > this.maxDist) { this.dead = true; return; }
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
      // 原版: 上升中不判定碰撞, 下落中开始命中检测
      if (this.velZ > 0) {
        const groundZ = (board.gridY(this.row) + 30) - this.baseY;
        // 落点行僵尸碰撞 (命中窗口: 距地面 30px 内)
        if (this.z >= groundZ - 32) {
          for (const z of board.zombies) {
            if (z.dead || z.row !== this.row || z.hittable === false || z.boss || z.underground || z.underwater) continue;
            if (Math.abs(z.hitX() - this.x) < 50) {
              const flags = { chill: this.def.chill };
              z.takeDamage(this.def.dmg, board, flags);
              if (this.def.stun) z.butter = this.def.stun;
              if (this.type === 'butter') board.game.audio.play('butterhit');
              this.splat(board, this.x);
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
        for (const z of board.zombies) {
          if (z.dead || z.boss) continue;
          if (Math.abs(z.hitX() - this.tx) < 160 && Math.abs(z.row - this.row) <= 1) {
            z.takeDamage(this.def.dmg, board, { exploded: true });
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
      // 换目标
      this.target = board.zombies.filter(z => !z.dead && z.hittable !== false && !z.boss)
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
    for (const z of board.zombies) {
      if (z.dead || z.row !== this.row || z.hittable === false || z.phase === 'dying' || z.boss) continue;
      if (z.underground || z.underwater) continue;
      // 气球: 只有对空子弹能打
      if (z.flyingHigh && !(this.def.antiAir || this.def.homing || this.type === 'cattail')) continue;
      // 高度判定(简化: 同行即命中, 抛物线除外)
      const zx = z.hitX();
      const halfW = 14 + 20;
      if (zx + halfW > this.x && zx - halfW < this.x) {
        // 铁门僵尸: 正面子弹先打盾 (盾在hitZombies里通过takeDamage处理)
        const flags = { noFlash: false };
        if (this.def.chill) flags.chill = true;
        if (this.def.fire) flags.fire = true;
        if (this.def.antiAir && z.flyingHigh) {
          // 对空加倍
          z.takeDamage(this.def.dmg * this.def.antiAir, board, flags);
          if (z.flyingHigh) z.popBalloon(board);
        } else {
          z.takeDamage(this.def.dmg, board, flags);
        }
        // 溅射
        if (this.def.splash) {
          for (const z2 of board.zombies) {
            if (z2 === z || z2.dead || z2.row !== this.row || z2.boss || z2.hittable === false) continue;
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
    const y = board.gridY(this.row) + 35;
    board.addEffect(this.def.splat || 'splat', x, y);
    const snd = this.type === 'snowpea' ? 'snowpea_splat' : this.type === 'firepea' ? 'firepea' : 'splat';
    board.game.audio.play(snd);
  }

  land(board) {
    const y = board.gridY(this.row) + 35;
    // 落点僵尸判定
    let hitAny = false;
    for (const z of board.zombies) {
      if (z.dead || z.row !== this.row || z.hittable === false || z.boss || z.underground || z.underwater) continue;
      if (Math.abs(z.hitX() - this.x) < 55) {
        hitAny = true;
        const flags = { chill: this.def.chill };
        z.takeDamage(this.def.dmg, board, flags);
        if (this.def.stun) z.butter = this.def.stun;
        // 黄油命中音
        if (this.type === 'butter') board.game.audio.play('butterhit');
      } else if (this.def.splash && Math.abs(z.hitX() - this.x) < 110) {
        z.takeDamage(this.def.splash, board, { chill: this.def.chill, noFlash: true });
        hitAny = true;
      }
    }
    // 落点植物(僵尸篮球)
    if (this.zombieProj) { /* handled elsewhere */ }
    // 特效
    board.addEffect(this.type === 'melon' || this.type === 'wintermelon' ? 'melonsplat' : 'splat', this.x, y);
    board.game.audio.play(this.type === 'melon' || this.type === 'wintermelon' ? 'melonimpact' : 'splat3');
    this.dead = true;
  }

  // ---------- 僵尸方子弹 ----------
  updateZombieProj(dt, board) {
    if (this.type === 'bossfire' || this.type === 'bossice') {
      this.x -= this.def.speed * dt;
      // 命中植物
      for (const p of board.plants) {
        if (p.dead || p.row !== this.row) continue;
        if (Math.abs(p.x + 40 - this.x) < 40) {
          // 火球烧毁一列植物(到左边?) 原版: 摧毁接触的植物
          p.dead = true;
          board.addEffect('fire', p.x + 40, p.y + 40, { hold: 0.6 });
          board.game.audio.play('firepea');
        }
      }
      if (this.x < -60) this.dead = true;
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
    if (this.reanim) {
      this.reanim.setPosition(this.x, this.y);
      this.reanim.draw(ctx);
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
