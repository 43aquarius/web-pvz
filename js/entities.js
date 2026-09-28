/* web-pvz — entities.js
 * 游戏实体：植物 / 僵尸 / 子弹 / 阳光 / 割草机 / 粒子 / 浮动文字
 * 数值源自 data.js（PvZ-Portable / PVZ-Godot-Dream 提取）
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});
  const { U, G, PLANTS, ZOMBIES, ZOMBIE_DPS, CHILL_FACTOR } = PVZ;
  const { SP, SZ, A } = PVZ;

  /* ============ 基类 ============ */
  class Entity {
    constructor() {
      this.dead = false;
      this.anim = { t: U.rand(0, 10) };
      this.seed = Math.random();
    }
    update(dt) { this.anim.t += dt; }
  }

  /* ============ 植物 ============ */
  class Plant extends Entity {
    constructor(type, row, col) {
      super();
      const def = PLANTS[type];
      this.type = type;
      this.def = def;
      this.row = row;
      this.col = col;
      this.x = G.cellCenterX(col);
      this.y = G.GRID_Y + (row + 1) * G.CELL_H - 8;
      this.hp = def.hp;
      this.maxHp = def.hp;
      this.eatenBy = 0;

      /* 状态 */
      this.shootTimer = 0;
      this.sunTimer = U.rand(def.sun ? def.sun.first[0] : 0, def.sun ? def.sun.first[1] : 0);
      this.sunGlow = 0;
      this.armed = type !== 'potatomine';
      this.armTimer = def.arm || 0;
      this.fuse = null;         /* 樱桃/辣椒引信剩余 */
      this.chewTimer = 0;       /* 大嘴花咀嚼 */
      this.state = 'idle';
      this.biteAnim = 0;
      this.recoil = 0;
      this.squashState = 'wait';
      this.squashJumpT = 0;
      this.squashTargetX = 0;
      this.squashLook = 0;
      this.eatingShake = 0;
    }

    update(dt, board) {
      super.update(dt);
      const def = this.def;
      this.recoil = Math.max(0, this.recoil - dt * 5);
      if (this.eatenBy > 0) this.eatingShake = Math.sin(this.anim.t * 22) * 1.2;
      else this.eatingShake = 0;

      switch (this.type) {
        case 'sunflower': {
          this.sunTimer -= dt;
          this.sunGlow = this.sunTimer < 1.5 ? 1 - this.sunTimer / 1.5 : 0;
          if (this.sunTimer <= 0) {
            this.sunTimer = U.rand(def.sun.next[0], def.sun.next[1]);
            board.spawnSunAt(this.x + U.rand(-14, 14), this.y - 40, 25, 'flower');
            A.S.sunspawn();
          }
          break;
        }
        case 'peashooter':
        case 'snowpea':
        case 'repeater': {
          this.shootTimer -= dt;
          if (this.shootTimer <= 0) {
            const zombieAhead = board.zombieInRowAhead(this.row, this.x - 30);
            if (zombieAhead) {
              this.shootTimer = def.shoot.interval;
              const count = def.shoot.count || 1;
              for (let i = 0; i < count; i++) {
                board.delayed(i * 0.16, () => {
                  if (this.dead) return;
                  board.projectiles.push(new Projectile(
                    def.shoot.chill ? 'snow' : 'pea',
                    this.x + 26, this.y - 52, this.row, def.shoot.dmg
                  ));
                  this.recoil = 1;
                  A.S.shoot();
                });
              }
            } else {
              this.shootTimer = 0.1;
            }
          }
          break;
        }
        case 'potatomine': {
          if (!this.armed) {
            this.armTimer -= dt;
            this.anim.armProgress = 1 - this.armTimer / (def.arm || 1);
            if (this.armTimer <= 0) {
              this.armed = true;
              A.S.plant();
            }
          } else {
            const z = board.zombieNearRow(this.row, this.x, 46);
            if (z) {
              board.explode(this.x, this.row, 55, def.dmg, 'potato');
              this.dead = true;
            }
          }
          break;
        }
        case 'cherrybomb': {
          if (this.fuse == null) this.fuse = def.fuse;
          this.fuse -= dt;
          this.anim.fuse = this.fuse / def.fuse;
          if (this.fuse <= 0) {
            board.explode(this.x, this.row, def.radius * G.CELL_W * 0.75, def.dmg, 'cherry');
            this.dead = true;
          }
          break;
        }
        case 'jalapeno': {
          if (this.fuse == null) this.fuse = def.fuse;
          this.fuse -= dt;
          this.anim.fuse = this.fuse / def.fuse;
          if (this.fuse <= 0) {
            board.fireRow(this.row, def.dmg);
            this.dead = true;
          }
          break;
        }
        case 'squash': {
          if (this.squashState === 'wait') {
            const z = board.zombieNearRow(this.row, this.x, 62);
            this.squashLook = Math.sin(this.anim.t * 1.5) * 1.2;
            if (z) {
              this.squashState = 'jump';
              this.squashJumpT = 0;
              this.squashTargetX = z.x;
              A.S.vault();
            }
          } else if (this.squashState === 'jump') {
            this.squashJumpT += dt;
            if (this.squashJumpT >= 0.75) {
              board.explode(this.squashTargetX, this.row, 55, def.dmg, 'squash');
              A.S.explode();
              this.dead = true;
            }
          }
          break;
        }
        case 'chomper': {
          if (this.state === 'chewing') {
            this.chewTimer -= dt;
            if (this.chewTimer <= 0) this.state = 'idle';
          } else if (this.state === 'biting') {
            this.biteAnim += dt;
            if (this.biteAnim >= 0.4) {
              const z = this.biteTarget;
              if (z && !z.dead && !z.anim.dying) {
                z.instantKill(board);
                A.S.chomp();
                board.delayed(0.35, () => A.S.swallow());
              }
              this.state = 'chewing';
              this.chewTimer = def.chew;
              this.anim.state = 'chewing';
            }
          } else {
            /* 待机：寻找近处僵尸 */
            const z = board.zombieNearRow(this.row, this.x + 30, 78);
            if (z && z.x > this.x - 20) {
              this.state = 'biting';
              this.biteAnim = 0;
              this.biteTarget = z;
              this.anim.state = 'biting';
            }
          }
          break;
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x + this.eatingShake, this.y);
      /* 倭瓜跳跃 */
      if (this.type === 'squash' && this.squashState === 'jump') {
        const p = this.squashJumpT / 0.75;
        const jumpX = U.lerp(this.x, this.squashTargetX, U.clamp(p * 1.6, 0, 1));
        const jumpY = -Math.sin(U.clamp(p * 1.6, 0, 1) * Math.PI) * 70;
        ctx.restore();
        ctx.save();
        ctx.translate(jumpX, this.y + jumpY);
        ctx.scale(1.15, 0.92);
      }
      /* 大嘴花咀嚼鼓包进度传递 */
      if (this.type === 'chomper') {
        this.anim.state = this.state === 'chewing' ? 'chewing' : (this.state === 'biting' ? 'biting' : 'idle');
      }
      SP.plant(ctx, this.type, this);
      ctx.restore();
    }
  }

  /* ============ 僵尸 ============ */
  class Zombie extends Entity {
    constructor(type, row, board) {
      super();
      const def = ZOMBIES[type];
      this.type = type;
      this.def = def;
      this.row = row;
      this.board = board;
      this.x = G.SPAWN_X + U.rand(0, 50);
      this.y = G.GRID_Y + (row + 1) * G.CELL_H - 6;
      this.bodyHp = def.body;
      this.bodyMaxHp = def.body;
      this.helmHp = def.helm || 0;
      this.helmMaxHp = def.helm || 0;
      this.shieldHp = def.shield || 0;
      this.shieldMaxHp = def.shield || 0;
      this.speed = U.rand(def.speed[0], def.speed[1]);
      this.chill = 0;
      this.eating = null;
      this.anim.eating = false;
      this.anim.dying = false;
      this.anim.deathT = 0;
      this.anim.walkRate = 2.2 + this.speed * 0.14;
      this.anim.jaw = 0;
      this.eatSoundT = 0;
      this.groanT = U.rand(2, 9);
      /* 撑杆跳 */
      this.hasVaulted = false;
      this.vaultT = 0;
      this.vaultFrom = 0;
      this.vaultTo = 0;
      this.anim.poleAngle = -0.9;
      /* 报纸狂暴 */
      this.rage = false;
      this.ragePause = 0;
      /* 铁桶掉落 */
      this.helmFallT = 0;
    }

    get alive() { return !this.dead && !this.anim.dying; }

    hit(dmg, opts = {}) {
      if (!this.alive) return;
      let remaining = dmg;
      /* 火焰伤害解除冰冻 */
      if (opts.fire && this.chill > 0) this.chill = 0;
      /* 报纸 */
      if (this.shieldHp > 0) {
        const absorbed = Math.min(this.shieldHp, remaining);
        this.shieldHp -= absorbed;
        remaining -= absorbed;
        if (this.shieldHp <= 0 && this.type === 'news') {
          this.rage = true;
          this.ragePause = 0.6;
          this.speed = U.rand(this.def.rageSpeed[0], this.def.rageSpeed[1]);
          this.anim.walkRate = 5;
          A.S.rip();
          A.S.groan();
        }
      }
      /* 头部护甲 */
      if (remaining > 0 && this.helmHp > 0) {
        const absorbed = Math.min(this.helmHp, remaining);
        this.helmHp -= absorbed;
        remaining -= absorbed;
        if (this.helmHp <= 0) {
          /* 护甲脱落粒子 */
          this.board.spawnHelmFall(this.type, this.x, this.y - 80);
        }
      }
      /* 身体 */
      if (remaining > 0) {
        this.bodyHp -= remaining;
        if (opts.chill) {
          this.chill = Math.max(this.chill, opts.chill);
          A.S.freeze();
        }
        if (this.bodyHp <= 0) this.die();
      } else if (opts.chill) {
        this.chill = Math.max(this.chill, opts.chill);
      }
    }

    instantKill(board) {
      if (!this.alive) return;
      this.bodyHp = 0;
      this.helmHp = 0;
      this.shieldHp = 0;
      this.die(true);
    }

    die(swallowed) {
      if (this.anim.dying) return;
      this.anim.dying = true;
      this.anim.deathT = 0;
      this.anim.eating = false;
      this.eating = null;
      if (!swallowed) {
        this.board.spawnHeadFall(this.x, this.y - 78, this.chill > 0);
        A.S.groan();
      }
      this.board.onZombieDeath(this);
    }

    update(dt, board) {
      super.update(dt);
      /* 死亡动画推进 */
      if (this.anim.dying) {
        this.anim.deathT += dt;
        if (this.anim.deathT > 1.7) this.dead = true;
        return;
      }
      /* 冰冻计时 */
      if (this.chill > 0) this.chill -= dt;
      const chillF = this.chill > 0 ? CHILL_FACTOR : 1;

      /* 狂暴停顿 */
      if (this.ragePause > 0) {
        this.ragePause -= dt;
        return;
      }

      /* 撑杆跳空中 */
      if (this.vaultT > 0) {
        this.vaultT -= dt;
        const p = 1 - this.vaultT / 0.65;
        this.x = U.lerp(this.vaultFrom, this.vaultTo, U.clamp(p, 0, 1));
        this.anim.poleAngle = -0.9 - p * 0.8;
        if (this.vaultT <= 0) {
          this.hasVaulted = true;
          this.speed = U.rand(13.8, 20);
          this.anim.walkRate = 2.4;
        }
        return;
      }

      /* 随机低吼 */
      this.groanT -= dt;
      if (this.groanT <= 0) {
        this.groanT = U.rand(6, 14);
        if (Math.random() < 0.5) A.S.groan();
      }

      /* 寻找面前的植物 */
      const mouthX = this.x - 18;
      const plant = board.plantAtZombie(this.row, mouthX);
      if (plant && !plant.dead) {
        /* 撑杆跳触发（高坚果不可跳过） */
        if (this.type === 'pole' && !this.hasVaulted && plant.type !== 'tallnut') {
          this.vaultT = 0.65;
          this.vaultFrom = this.x;
          this.vaultTo = plant.x - 38;
          A.S.vault();
          return;
        }
        /* 啃食（引用只登记一次） */
        if (this.eating !== plant) {
          if (this.eating && !this.eating.dead) {
            this.eating.eatenBy = Math.max(0, this.eating.eatenBy - 1);
          }
          this.eating = plant;
          plant.eatenBy++;
        }
        this.anim.eating = true;
        const dps = ZOMBIE_DPS * chillF * (this.rage ? 1.5 : 1);
        plant.hp -= dps * dt;
        this.eatSoundT -= dt;
        if (this.eatSoundT <= 0) {
          this.eatSoundT = 0.42;
          A.S.eat();
        }
        if (plant.hp <= 0) {
          this.eating = null;
          this.anim.eating = false;
          board.killPlant(plant, 'eaten');
        }
      } else {
        if (this.eating) {
          if (!this.eating.dead) this.eating.eatenBy = Math.max(0, this.eating.eatenBy - 1);
          this.eating = null;
        }
        this.anim.eating = false;
        /* 移动 */
        this.x -= this.speed * chillF * dt;
      }

      /* 到达割草机线/房子 */
      if (this.x < G.MOWER_X + 45) {
        board.zombieReachedHouse(this);
      }
    }

    draw(ctx) {
      /* 阴影 */
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 4, 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.vaultT > 0) {
        SZ.drawVaulting(ctx, this);
      } else {
        SZ.draw(ctx, this);
      }
      ctx.restore();
    }
  }

  /* ============ 子弹 ============ */
  class Projectile extends Entity {
    constructor(type, x, y, row, dmg) {
      super();
      this.type = type;   /* pea | snow | fire */
      this.x = x;
      this.y = y;
      this.row = row;
      this.dmg = dmg;
      this.speed = 330;
      this.passedTorch = false;
    }
    update(dt, board) {
      super.update(dt);
      this.x += this.speed * dt;
      if (this.x > G.W + 30) { this.dead = true; return; }
      /* 火炬树桩转换 */
      if (!this.passedTorch && this.type !== 'fire') {
        const torch = board.getPlantAtRowColByX(this.row, this.x - 12);
        if (torch && torch.type === 'torchwood') {
          this.type = 'fire';
          this.dmg = 40;
          this.passedTorch = true;
          board.spawnFireTrail(this.x, this.y);
        }
      }
      /* 命中检测：僵尸在前方 30px 内（防穿透容差） */
      let best = null;
      for (const z of board.zombies) {
        if (!z.alive || z.row !== this.row || z.vaultT > 0) continue;
        if (z.x >= this.x - 12 && z.x <= this.x + 30) {
          if (!best || z.x < best.x) best = z;
        }
      }
      if (best) {
        best.hit(this.dmg, {
          chill: this.type === 'snow' ? (PLANTS.snowpea.shoot.chill || 8) : 0,
          fire: this.type === 'fire',
        });
        board.spawnSplat(this.x + 6, this.y, this.type);
        A.S.splat();
        this.dead = true;
      }
    }
    draw(ctx) {
      SP.drawPea(ctx, this);
    }
  }

  /* ============ 阳光 ============ */
  class Sun extends Entity {
    constructor(x, y, value, from) {
      super();
      this.x = x;
      this.y = y;
      this.value = value;
      this.from = from;            /* sky | flower */
      this.r = 26;
      this.state = from === 'sky' ? 'falling' : 'pop';
      this.targetY = 0;
      this.vy = 0;
      this.life = 11;
      this.collecting = false;
      this.cx = 0; this.cy = 0;
      this.anim.t = U.rand(0, 10);
    }
    update(dt, board) {
      super.update(dt);
      if (this.collecting) {
        const tx = 70, ty = 44;
        this.x = U.lerp(this.x, tx, Math.min(1, dt * 9));
        this.y = U.lerp(this.y, ty, Math.min(1, dt * 9));
        if (Math.abs(this.x - tx) < 14 && Math.abs(this.y - ty) < 14) {
          this.dead = true;
          board.sun += this.value;
          board.floatText('+' + this.value, tx + 20, ty + 18, '#FFE060');
        }
        return;
      }
      if (this.state === 'falling') {
        this.y += 42 * dt;
        if (this.y >= this.targetY) this.state = 'idle';
      } else if (this.state === 'pop') {
        /* 从向日葵弹出的小抛物线 */
        this.vy += 260 * dt;
        this.y += this.vy * dt;
        if (this.y > this.targetY) { this.y = this.targetY; this.state = 'idle'; }
      } else {
        this.y += Math.sin(this.anim.t * 2.4) * 8 * dt;
      }
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    collect() {
      if (this.collecting || this.dead) return false;
      this.collecting = true;
      A.S.sun();
      return true;
    }
    draw(ctx) {
      const blink = this.life < 3 && Math.sin(this.anim.t * 12) < 0;
      if (!blink) SP.drawSun(ctx, this);
    }
  }

  /* ============ 割草机 ============ */
  class Mower extends Entity {
    constructor(row) {
      super();
      this.row = row;
      this.x = G.MOWER_X;
      this.y = G.GRID_Y + (row + 1) * G.CELL_H - 10;
      this.state = 'idle';
    }
    update(dt, board) {
      super.update(dt);
      if (this.state === 'running') {
        this.x += 340 * dt;
        /* 碾压僵尸 */
        for (const z of board.zombies) {
          if (z.alive && z.row === this.row && Math.abs(z.x - this.x) < 34) {
            z.instantKill(board);
            board.spawnMowerBits(z.x, z.y - 40);
          }
        }
        if (this.x % 3 < 1) board.spawnGrass(this.x - 10, this.y);
        if (this.x > G.W + 60) this.dead = true;
      }
    }
    trigger(board) {
      if (this.state !== 'idle') return;
      this.state = 'running';
      A.S.mower();
    }
    draw(ctx) {
      SP.drawMower(ctx, this);
    }
  }

  /* ============ 粒子 ============ */
  class Particle extends Entity {
    constructor(kind, x, y, opt = {}) {
      super();
      this.kind = kind;
      this.x = x; this.y = y;
      this.vx = opt.vx || 0;
      this.vy = opt.vy || 0;
      this.g = opt.g != null ? opt.g : 300;
      this.life = opt.life || 1;
      this.maxLife = this.life;
      this.color = opt.color || '#78C840';
      this.r = opt.r || 4;
      this.rot = opt.rot || 0;
      this.vr = opt.vr || 0;
      this.data = opt;
    }
    update(dt) {
      super.update(dt);
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.vy += this.g * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.vr * dt;
      if (this.kind === 'ring') {
        this.r += 380 * dt;
        this.g = 0;
      }
    }
    draw(ctx) {
      const a = U.clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.translate(this.x, this.y);
      switch (this.kind) {
        case 'drop':
          ctx.globalAlpha = a;
          ctx.fillStyle = this.color;
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = this.color;
          ctx.lineWidth = 5 * a + 1;
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'flash':
          ctx.globalAlpha = a;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r);
          g.addColorStop(0, this.color);
          g.addColorStop(1, 'rgba(255,200,60,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
          break;
        case 'smoke':
          ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = this.color;
          ctx.beginPath(); ctx.arc(0, 0, this.r * (2 - a), 0, Math.PI * 2); ctx.fill();
          break;
        case 'flame': {
          ctx.globalAlpha = a;
          const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 1.6);
          fg.addColorStop(0, '#FFE080');
          fg.addColorStop(0.5, '#FF8828');
          fg.addColorStop(1, 'rgba(230,60,10,0)');
          ctx.fillStyle = fg;
          ctx.beginPath(); ctx.arc(0, 0, this.r * 1.6, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'zhead':
          ctx.rotate(this.rot);
          ctx.globalAlpha = Math.min(1, a * 2);
          SZ.PAL.normal && 0;
          ctx.scale(0.9, 0.9);
          /* 简化头颅 */
          const pal = this.data.chilled ? SZ.PAL.chilled : SZ.PAL.normal;
          ctx.fillStyle = pal.skin;
          ctx.beginPath(); ctx.ellipse(0, 0, 13, 14.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = pal.skinLine;
          ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = '#3A4A28';
          ctx.beginPath();
          ctx.ellipse(3, -3, 3.4, 4, 0, 0, Math.PI * 2);
          ctx.ellipse(-6, -2, 2.6, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2A3218';
          ctx.beginPath(); ctx.ellipse(2, 7, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 'helm':
          ctx.rotate(this.rot);
          ctx.globalAlpha = Math.min(1, a * 2);
          if (this.data.htype === 'cone') {
            ctx.fillStyle = '#E88828';
            ctx.beginPath();
            ctx.moveTo(-12, 8); ctx.lineTo(0, -22); ctx.lineTo(12, 8);
            ctx.closePath(); ctx.fill();
          } else if (this.data.htype === 'bucket') {
            ctx.fillStyle = '#989CA2';
            ctx.fillRect(-13, -18, 26, 26);
            ctx.fillStyle = '#C8CCD0';
            ctx.fillRect(-13, -18, 26, 5);
          } else {
            ctx.fillStyle = '#D84848';
            ctx.beginPath(); ctx.ellipse(0, 0, 14, 12, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
          }
          break;
        case 'grass':
          ctx.globalAlpha = a;
          ctx.fillStyle = this.color;
          ctx.rotate(this.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, this.r * 1.6, this.r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'spark':
          ctx.globalAlpha = a;
          ctx.fillStyle = this.color;
          ctx.rotate(this.rot);
          ctx.beginPath();
          ctx.moveTo(0, -this.r);
          ctx.lineTo(this.r * 0.3, 0); ctx.lineTo(0, this.r); ctx.lineTo(-this.r * 0.3, 0);
          ctx.closePath(); ctx.fill();
          break;
      }
      ctx.restore();
    }
  }

  /* 浮动文字 */
  class FloatText extends Entity {
    constructor(str, x, y, color = '#fff') {
      super();
      this.str = str;
      this.x = x; this.y = y;
      this.color = color;
      this.life = 1.1;
    }
    update(dt) {
      super.update(dt);
      this.y -= 30 * dt;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    draw(ctx) {
      const a = U.clamp(this.life / 0.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      U.text(ctx, this.str, this.x, this.y, {
        size: 17, fill: this.color, stroke: 'rgba(0,0,0,0.7)', strokeW: 3,
      });
      ctx.restore();
    }
  }

  PVZ.Entity = Entity;
  PVZ.Plant = Plant;
  PVZ.Zombie = Zombie;
  PVZ.Projectile = Projectile;
  PVZ.Sun = Sun;
  PVZ.Mower = Mower;
  PVZ.Particle = Particle;
  PVZ.FloatText = FloatText;
})(window);
