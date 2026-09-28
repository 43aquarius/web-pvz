/* web-pvz — board.js
 * 棋盘：网格、波次系统、种植交互、割草机、胜负判定、战场渲染
 * 波次机制参考 PVZ-Godot-Dream（每 10 波大波 + 旗帜僵尸）与原版进度条
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});
  const { U, G, PLANTS, ZOMBIES, waveBudget, isFlagWave } = PVZ;
  const { SP, SZ, A } = PVZ;

  class Board {
    constructor(game, levelDef, chosenPlants) {
      this.game = game;
      this.level = levelDef;
      this.chosen = chosenPlants.slice();
      this.sun = levelDef.startSun;

      this.plants = [];            /* 所有植物（含已死，过滤渲染） */
      this.grid = Array.from({ length: G.ROWS }, () => Array(G.COLS).fill(null));
      this.zombies = [];
      this.projectiles = [];
      this.suns = [];
      this.mowers = [];
      this.particles = [];
      this.texts = [];
      this.timers = [];            /* 延迟回调 {t, fn} */

      /* 卡片 */
      this.cards = this.chosen.map((type) => ({
        type, cd: 0, total: PLANTS[type].recharge,
      }));
      this.selected = -1;
      this.shovelMode = false;

      /* 波次 */
      this.totalWaves = levelDef.waves;
      this.wave = 0;
      this.waveAliveHp = 0;        /* 当前波剩余血量（用于推进度） */
      this.waveSpawned = false;
      this.waveTime = 0;
      this.firstWaveDelay = 22;
      this.spawnQueue = [];        /* {t, type, row} */
      this.banner = null;          /* {text, t, dur} */
      this.zombiesSpawnedTotal = 0;
      this.zombiesKilled = 0;

      /* 流程状态 */
      this.state = 'preview';      /* preview → ready → playing → win/lose */
      this.stateT = 0;
      this.readyStep = 0;
      this.gameSpeed = 1;
      this.loseT = 0;
      this.winT = 0;
      this.naturalSunT = U.rand(6, 9);
      this.ambienceT = 5;

      /* 割草机 */
      for (let r = 0; r < G.ROWS; r++) this.mowers.push(new PVZ.Mower(r));

      /* 选卡面板已在外部完成 */
      this.state = 'preview';
      this.showIntro();
    }

    showIntro() {
      const types = this.level.spawns.map((s) => ZOMBIES[s[0]].name).join('、');
      this.banner = { text: `${types}出现了！`, t: 0, dur: 2.6 };
    }

    delayed(t, fn) { this.timers.push({ t, fn }); }

    /* ============ 查询 ============ */
    plantAt(row, col) {
      if (row < 0 || row >= G.ROWS || col < 0 || col >= G.COLS) return null;
      return this.grid[row][col];
    }
    plantAtZombie(row, x) {
      /* 僵尸嘴部坐标 → 是否有植物 */
      const col = G.colAt(x);
      if (col < 0 || col >= G.COLS) return null;
      const p = this.grid[row][col];
      if (!p) return null;
      /* 接近格子中心才算咬到 */
      if (x < p.x + 30 && x > p.x - 42) return p;
      return null;
    }
    getPlantAtRowColByX(row, x) {
      const col = G.colAt(x);
      return this.plantAt(row, col);
    }
    zombieInRowAhead(row, x, ahead = 880) {
      let best = null;
      for (const z of this.zombies) {
        if (!z.alive || z.row !== row) continue;
        if (z.x > x && z.x < x + ahead) {
          if (!best || z.x < best.x) best = z;
        }
      }
      return best;
    }
    zombieNearRow(row, x, range) {
      for (const z of this.zombies) {
        if (!z.alive || z.row !== row) continue;
        if (Math.abs(z.x - x) < range) return z;
      }
      return null;
    }

    canPlantAt(row, col) {
      if (row < 0 || row >= G.ROWS || col < 0 || col >= G.COLS) return false;
      return this.grid[row][col] == null;
    }

    /* ============ 种植 / 铲除 ============ */
    tryPlant(row, col) {
      const card = this.cards[this.selected];
      if (!card) return false;
      const def = PLANTS[card.type];
      if (this.sun < def.cost || card.cd > 0) return false;
      if (!this.canPlantAt(row, col)) return false;
      const p = new PVZ.Plant(card.type, row, col);
      this.plants.push(p);
      this.grid[row][col] = p;
      this.sun -= def.cost;
      card.cd = card.total;
      this.selected = -1;
      A.S.plant();
      /* 种植尘土 */
      for (let i = 0; i < 8; i++) {
        this.particles.push(new PVZ.Particle('drop', p.x + U.rand(-24, 24), p.y - 6, {
          vx: U.rand(-60, 60), vy: U.rand(-140, -40), g: 420,
          color: '#8A6B4A', r: U.rand(2, 4), life: 0.5,
        }));
      }
      return true;
    }

    killPlant(p, reason) {
      if (p.dead) return;
      p.dead = true;
      if (this.grid[p.row][p.col] === p) this.grid[p.row][p.col] = null;
      if (reason === 'eaten') {
        for (let i = 0; i < 6; i++) {
          this.particles.push(new PVZ.Particle('drop', p.x + U.rand(-18, 18), p.y - 30, {
            vx: U.rand(-80, 80), vy: U.rand(-120, -30), g: 400,
            color: '#5A8A3A', r: U.rand(2, 3.5), life: 0.5,
          }));
        }
      } else {
        this.particles.push(new PVZ.Particle('smoke', p.x, p.y - 24, {
          vy: -40, g: 0, color: 'rgba(120,120,120,0.8)', r: 12, life: 0.6,
        }));
      }
    }

    shovelAt(row, col) {
      const p = this.plantAt(row, col);
      if (!p) return false;
      this.killPlant(p, 'shovel');
      A.S.shovel();
      return true;
    }

    /* ============ 阳光 ============ */
    spawnSunAt(x, y, value, from) {
      const s = new PVZ.Sun(x, y, value, from);
      if (from === 'sky') {
        s.targetY = G.GRID_Y + U.rand(60, G.GRID_H - 60);
      } else {
        s.targetY = Math.min(G.GRID_Y + G.GRID_H - 30, y + 52);
        s.vy = -120;
      }
      this.suns.push(s);
      return s;
    }

    collectSunAt(x, y) {
      /* 后绘制的优先（数组尾部） */
      for (let i = this.suns.length - 1; i >= 0; i--) {
        const s = this.suns[i];
        if (s.dead || s.collecting) continue;
        if (U.dist2(x, y, s.x, s.y) < 38 * 38) {
          s.collect();
          return true;
        }
      }
      return false;
    }

    /* ============ 爆炸类攻击 ============ */
    explode(x, row, radius, dmg, kind) {
      A.S.explode();
      this.particles.push(new PVZ.Particle('flash', x, G.cellCenterY(row), {
        g: 0, r: radius * 0.9, life: 0.35, color: kind === 'potato' ? 'rgba(255,240,150,0.95)' : 'rgba(255,200,80,0.95)',
      }));
      this.particles.push(new PVZ.Particle('ring', x, G.cellCenterY(row), {
        g: 0, r: 20, life: 0.5, color: 'rgba(255,160,60,0.9)',
      }));
      for (let i = 0; i < 14; i++) {
        this.particles.push(new PVZ.Particle('smoke', x + U.rand(-radius * 0.5, radius * 0.5), G.cellCenterY(row) + U.rand(-30, 30), {
          vy: U.rand(-90, -20), vx: U.rand(-50, 50), g: -30,
          color: 'rgba(90,80,70,0.9)', r: U.rand(10, 18), life: U.rand(0.6, 1.1),
        }));
      }
      for (const z of this.zombies) {
        if (!z.alive) continue;
        const dx = Math.abs(z.x - x);
        const dy = Math.abs(z.row - row) * G.CELL_H * 0.8;
        if (dx * 0.6 + dy < radius) {
          z.hit(dmg, { fire: true });
        }
      }
      if (kind === 'squash') {
        this.particles.push(new PVZ.Particle('ring', x, G.cellCenterY(row) - 20, {
          g: 0, r: 10, life: 0.4, color: 'rgba(200,240,140,0.9)',
        }));
      }
    }

    fireRow(row, dmg) {
      A.S.explode();
      A.S.rip();
      for (let i = 0; i < 26; i++) {
        this.particles.push(new PVZ.Particle('flame', G.GRID_X + U.rand(0, G.GRID_W), G.cellCenterY(row) + U.rand(-40, 30), {
          vy: U.rand(-120, -40), vx: U.rand(-20, 20), g: -60,
          r: U.rand(10, 22), life: U.rand(0.4, 0.9),
        }));
      }
      for (const z of this.zombies) {
        if (!z.alive || z.row !== row) continue;
        z.hit(dmg, { fire: true });
      }
      /* 地面焦痕 */
      this.particles.push(new PVZ.Particle('smoke', G.GRID_X + G.GRID_W / 2, G.cellCenterY(row), {
        g: 0, r: 60, life: 1.4, color: 'rgba(60,40,30,0.4)', vy: -6,
      }));
    }

    /* ============ 粒子辅助 ============ */
    spawnSplat(x, y, type) {
      const color = type === 'snow' ? '#A8DCF8' : type === 'fire' ? '#FF8828' : '#78C840';
      for (let i = 0; i < 5; i++) {
        this.particles.push(new PVZ.Particle('drop', x, y + U.rand(-6, 6), {
          vx: U.rand(-90, -20), vy: U.rand(-120, -20), g: 420,
          color, r: U.rand(1.8, 3.4), life: 0.4,
        }));
      }
    }
    spawnFireTrail(x, y) {
      this.particles.push(new PVZ.Particle('flame', x, y, {
        vx: 60, vy: U.rand(-30, 30), g: -40, r: 10, life: 0.3,
      }));
    }
    spawnHeadFall(x, y, chilled) {
      this.particles.push(new PVZ.Particle('zhead', x, y, {
        vx: U.rand(-30, 50), vy: -180, g: 500, vr: U.rand(2, 5),
        life: 1.4, chilled,
      }));
    }
    spawnHelmFall(type, x, y) {
      this.particles.push(new PVZ.Particle('helm', x, y, {
        vx: U.rand(40, 90), vy: -160, g: 520, vr: U.rand(3, 6),
        life: 1.1, htype: type,
      }));
    }
    spawnMowerBits(x, y) {
      for (let i = 0; i < 6; i++) {
        this.particles.push(new PVZ.Particle('drop', x + U.rand(-10, 10), y + U.rand(-20, 20), {
          vx: U.rand(-120, 120), vy: U.rand(-260, -80), g: 500,
          color: '#8A9A5A', r: U.rand(2, 4), life: 0.7,
        }));
      }
    }
    spawnGrass(x, y) {
      if (this.particles.length > 240) return;
      this.particles.push(new PVZ.Particle('grass', x, y - 6, {
        vx: U.rand(-70, -10), vy: U.rand(-150, -60), g: 480,
        color: U.pick(['#5FA83A', '#6FBF44']), r: U.rand(2, 3.5), life: 0.5, vr: U.rand(-8, 8),
      }));
    }
    floatText(str, x, y, color) {
      this.texts.push(new PVZ.FloatText(str, x, y, color));
    }

    /* ============ 波次系统 ============ */
    startWave() {
      this.wave++;
      this.waveTime = 0;
      this.waveSpawned = false;
      const flag = isFlagWave(this.wave, 10);
      const isFinal = this.wave === this.totalWaves;
      const budget = waveBudget(this.wave, 10);

      if (isFinal) {
        this.banner = { text: '最后一波！', t: 0, dur: 2.2 };
        A.S.rise();
      } else if (flag) {
        this.banner = { text: '一大波僵尸正在接近！', t: 0, dur: 2.4 };
        A.S.rise();
      }

      /* 生成出怪队列 */
      const items = [];
      let spent = 0;
      const pool = this.level.spawns.map(([type, w]) => ({ type, w }));
      let guard = 0;
      while (spent < budget && guard++ < 60) {
        const it = U.weighted(pool);
        items.push(it.type);
        spent += ZOMBIES[it.type].value;
      }
      /* 大波前置旗帜僵尸 */
      if (flag || isFinal) items.unshift('flag');

      const baseDelay = flag || isFinal ? 2.5 : 0.5;
      items.forEach((type, i) => {
        this.spawnQueue.push({
          t: baseDelay + (flag || isFinal ? i * U.rand(0.25, 0.6) : i * U.rand(0.4, 1.2)),
          type,
          row: U.randInt(0, G.ROWS - 1),
        });
      });
      this.waveAliveHp = 0;
    }

    onZombieDeath(z) {
      this.zombiesKilled++;
    }

    waveCleared() {
      /* 当前波僵尸（含队列未出）全部死亡 */
      if (this.spawnQueue.length > 0) return false;
      for (const z of this.zombies) {
        if (z.row != null && !z.dead) {
          if (z.alive || z.anim.dying) return false;
        }
      }
      return true;
    }

    /* ============ 失败/胜利 ============ */
    zombieReachedHouse(z) {
      const mower = this.mowers.find((m) => m.row === z.row && m.state === 'idle' && !m.dead);
      if (mower) {
        mower.trigger(this);
      } else if (z.x < G.HOUSE_X && this.state === 'playing') {
        this.state = 'lose';
        this.stateT = 0;
        A.stopMusic();
        A.S.lose();
      }
    }

    checkWin() {
      if (this.state !== 'playing') return;
      if (this.totalWaves !== Infinity && this.wave >= this.totalWaves && this.waveCleared()) {
        this.state = 'win';
        this.stateT = 0;
        A.stopMusic();
        A.S.win();
        this.game.onLevelWin(this.level);
      }
    }

    /* ============ 更新 ============ */
    update(dt) {
      /* 横幅计时（各状态通用） */
      if (this.banner) {
        this.banner.t += dt;
        if (this.banner.t > this.banner.dur) this.banner = null;
      }

      /* 延迟回调 */
      for (const tm of this.timers) tm.t -= dt;
      this.timers = this.timers.filter((tm) => {
        if (tm.t <= 0) { tm.fn(); return false; }
        return true;
      });

      if (this.state === 'preview') {
        this.stateT += dt;
        if (this.stateT > 2.8) {
          this.state = 'ready';
          this.stateT = 0;
          this.readyStep = 0;
        }
        return;
      }
      if (this.state === 'ready') {
        this.stateT += dt;
        const step = Math.floor(this.stateT / 0.8);
        if (step !== this.readyStep) {
          this.readyStep = step;
          A.S.click();
        }
        if (this.stateT > 2.4) {
          this.state = 'playing';
          this.banner = null;
          A.playMusic('day');
        }
        return;
      }
      if (this.state === 'win' || this.state === 'lose') {
        this.stateT += dt;
        if (this.state === 'lose') {
          /* 脑子被吃演出 */
          if (this.stateT > 0.5 && this.stateT % 0.6 < dt * 2) A.S.eat();
        }
      }

      const gdt = this.state === 'win' || this.state === 'lose' ? dt * 0.3 : dt;

      /* 卡片冷却 */
      for (const c of this.cards) c.cd = Math.max(0, c.cd - gdt);

      /* 自然阳光 */
      if (this.state === 'playing') {
        this.naturalSunT -= gdt;
        if (this.naturalSunT <= 0) {
          this.naturalSunT = U.rand(8.5, 10.5);
          this.spawnSunAt(G.GRID_X + U.rand(40, G.GRID_W - 40), -30, 25, 'sky');
        }
        /* 鸟鸣氛围 */
        this.ambienceT -= gdt;
        if (this.ambienceT <= 0) {
          this.ambienceT = U.rand(7, 15);
          A.S.ambience();
        }
      }

      /* 波次调度 */
      if (this.state === 'playing') {
        this.waveTime += gdt;
        if (this.wave === 0) {
          if (this.waveTime > this.firstWaveDelay) this.startWave();
        } else {
          const timeout = this.waveTime > 32;
          const mostlyDead = this.waveKillRatio() > 0.7;
          const allDead = this.waveCleared();
          if (this.wave < this.totalWaves && (allDead || mostlyDead || timeout)) {
            this.startWave();
          }
        }
        /* 出怪队列 */
        for (const s of this.spawnQueue) s.t -= gdt;
        const toSpawn = this.spawnQueue.filter((s) => s.t <= 0);
        this.spawnQueue = this.spawnQueue.filter((s) => s.t > 0);
        for (const s of toSpawn) {
          const z = new PVZ.Zombie(s.type, s.row, this);
          this.zombies.push(z);
          this.zombiesSpawnedTotal++;
          this.waveAliveHp += z.bodyHp + z.helmHp + z.shieldHp;
          if (Math.random() < 0.3) A.S.groan();
        }
        this.checkWin();
      }

      /* 实体更新 */
      for (const p of this.plants) if (!p.dead) p.update(gdt, this);
      for (const z of this.zombies) z.update(gdt, this);
      for (const pr of this.projectiles) pr.update(gdt, this);
      for (const s of this.suns) s.update(gdt, this);
      for (const m of this.mowers) m.update(gdt, this);
      for (const pt of this.particles) pt.update(gdt);
      for (const tx of this.texts) tx.update(gdt);

      /* 清理 */
      this.plants = this.plants.filter((p) => !p.dead);
      this.zombies = this.zombies.filter((z) => !z.dead);
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this.suns = this.suns.filter((s) => !s.dead);
      this.mowers = this.mowers.filter((m) => !m.dead);
      this.particles = this.particles.filter((p) => !p.dead);
      this.texts = this.texts.filter((t) => !t.dead);
    }

    waveKillRatio() {
      /* 当前波未出完时不计进度（防止连续触发） */
      if (this.spawnQueue.length > 0) return 0;
      if (this.waveAliveHp <= 0) return 1;
      let hp = 0;
      for (const z of this.zombies) {
        if (!z.dead && z.row != null) hp += z.alive ? (z.bodyHp + z.helmHp + z.shieldHp) : 0;
      }
      return 1 - U.clamp(hp / this.waveAliveHp, 0, 1);
    }

    progress() {
      if (this.totalWaves === Infinity) {
        return Math.min(1, this.wave / 40);
      }
      return U.clamp(this.wave / this.totalWaves, 0, 1);
    }

    /* ============ 渲染 ============ */
    draw(ctx) {
      /* 背景 */
      SP.drawBackground(ctx);

      /* 悬停格子高亮 */
      if (this.hoverCell && (this.selected >= 0 || this.shovelMode) && this.state === 'playing') {
        const { row, col } = this.hoverCell;
        if (row >= 0 && row < G.ROWS && col >= 0 && col < G.COLS) {
          ctx.save();
          if (this.selected >= 0) {
            ctx.fillStyle = this.canPlantAt(row, col) ? 'rgba(255,255,180,0.28)' : 'rgba(255,80,80,0.25)';
          } else {
            ctx.fillStyle = this.plantAt(row, col) ? 'rgba(255,255,180,0.3)' : 'rgba(200,200,200,0.12)';
          }
          ctx.fillRect(G.GRID_X + col * G.CELL_W, G.GRID_Y + row * G.CELL_H, G.CELL_W, G.CELL_H);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.strokeRect(G.GRID_X + col * G.CELL_W + 1, G.GRID_Y + row * G.CELL_H + 1, G.CELL_W - 2, G.CELL_H - 2);
          ctx.restore();
        }
      }

      /* 按行排序绘制（上行先画，保证遮挡） */
      const byRow = (a, b) => a.row - b.row || a.y - b.y;

      /* 割草机 */
      for (const m of this.mowers) m.draw(ctx);

      /* 植物 + 僵尸按行交织 */
      const drawables = [];
      for (const p of this.plants) drawables.push(p);
      for (const z of this.zombies) drawables.push(z);
      drawables.sort(byRow);
      for (const d of drawables) d.draw(ctx);

      /* 子弹 */
      for (const pr of this.projectiles) pr.draw(ctx);

      /* 粒子 */
      for (const pt of this.particles) pt.draw(ctx);

      /* 阳光（最上层，方便点击） */
      for (const s of this.suns) s.draw(ctx);

      /* 浮动文字 */
      for (const t of this.texts) t.draw(ctx);

      /* 种植预览幽灵 */
      if (this.selected >= 0 && this.hoverCell && this.hoverCell.col < G.COLS && this.hoverCell.col >= 0) {
        const { row, col } = this.hoverCell;
        if (row >= 0 && row < G.ROWS && this.canPlantAt(row, col)) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.translate(G.cellCenterX(col), G.GRID_Y + (row + 1) * G.CELL_H - 8);
          const ghost = { anim: { t: 0 }, seed: 1, hp: 1, maxHp: 1, armed: true };
          SP.plant(ctx, this.cards[this.selected].type, ghost);
          ctx.restore();
        }
      }

      /* UI：种子栏 / 阳光数 / 铲子 / 进度条 / 横幅 */
      this.drawHUD(ctx);

      /* Ready-Set-Plant */
      if (this.state === 'ready') {
        const labels = ['准备……', '安放……', '种植！'];
        const step = Math.min(2, Math.floor(this.stateT / 0.8));
        const p = (this.stateT % 0.8) / 0.8;
        ctx.save();
        ctx.globalAlpha = 1 - Math.max(0, p - 0.75) * 4;
        const scale = 1 + p * 0.25;
        ctx.translate(G.W / 2, G.H / 2 - 40);
        ctx.scale(scale, scale);
        U.text(ctx, labels[step], 0, 0, {
          size: 52, fill: step === 2 ? '#FFE060' : '#FFFFFF',
          stroke: '#3A2A10', strokeW: 8,
        });
        ctx.restore();
      }

      /* 失败演出 */
      if (this.state === 'lose') {
        ctx.save();
        const a = U.clamp(this.stateT / 1.2, 0, 1);
        ctx.fillStyle = `rgba(20,0,0,${a * 0.75})`;
        ctx.fillRect(0, 0, G.W, G.H);
        if (this.stateT > 0.8) {
          const shake = Math.sin(this.stateT * 30) * 3 * (1 - U.clamp((this.stateT - 0.8) / 2, 0, 1));
          ctx.translate(shake, 0);
          U.text(ctx, '僵尸吃掉了你的脑子！', G.W / 2, G.H / 2 - 30, {
            size: 46, fill: '#D82818', stroke: '#2A0000', strokeW: 8,
          });
        }
        ctx.restore();
      }
    }

    drawHUD(ctx) {
      /* —— 种子栏木框（宽度随卡数自适应） —— */
      const cw = 56, chh = G.BANK_H - 22;
      const bankW = Math.min(G.W - 200, 88 + this.cards.length * (cw + 5) + 62);
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, 0, G.BANK_H);
      g.addColorStop(0, '#B08A50');
      g.addColorStop(1, '#8A6238');
      ctx.fillStyle = g;
      U.rr(ctx, 6, 5, bankW, G.BANK_H - 10, 10);
      ctx.fill();
      ctx.strokeStyle = '#5A3A1A';
      ctx.lineWidth = 2;
      U.rr(ctx, 6, 5, bankW, G.BANK_H - 10, 10);
      ctx.stroke();

      /* 阳光计数区 */
      ctx.fillStyle = '#F8E8B8';
      U.rr(ctx, 14, 12, 64, G.BANK_H - 24, 8);
      ctx.fill();
      ctx.strokeStyle = '#B09050';
      ctx.lineWidth = 1.5;
      U.rr(ctx, 14, 12, 64, G.BANK_H - 24, 8);
      ctx.stroke();
      SP.sunIcon(ctx, 46, 38, 16);
      U.text(ctx, String(Math.floor(this.sun)), 46, 66, { size: 16, fill: '#2A2A2A' });

      /* 卡片 */
      for (let i = 0; i < this.cards.length; i++) {
        const c = this.cards[i];
        const x = 88 + i * (cw + 5), y = 11;
        SP.drawCard(ctx, c.type, x, y, cw, chh, {
          selected: this.selected === i,
          cooldown: c.cd / c.total,
          disabled: this.sun < PLANTS[c.type].cost,
        });
      }

      /* 铲子槽 */
      const sx = 88 + this.cards.length * (cw + 5) + 8;
      {
        ctx.fillStyle = this.shovelMode ? '#F8E8B0' : '#9A7444';
        U.rr(ctx, sx, 11, 50, chh, 8);
        ctx.fill();
        ctx.strokeStyle = this.shovelMode ? '#FFE090' : '#5A3A1A';
        ctx.lineWidth = 2;
        U.rr(ctx, sx, 11, 50, chh, 8);
        ctx.stroke();
        SP.drawShovel(ctx, sx + 25, 44, 0.85, this.shovelMode ? -0.5 : 0.2);
      }
      ctx.restore();

      /* —— 顶部右侧按钮 —— */
      this.game.drawTopButtons(ctx);

      /* —— 波次进度条 —— */
      if (this.totalWaves !== Infinity) {
        const bw = 210, bh = 18;
        const bx = G.W - bw - 18, by = G.H - 26;
        ctx.save();
        ctx.fillStyle = 'rgba(60,40,20,0.75)';
        U.rr(ctx, bx - 4, by - 4, bw + 8, bh + 8, 9);
        ctx.fill();
        const g2 = ctx.createLinearGradient(0, by, 0, by + bh);
        g2.addColorStop(0, '#4A8A2E');
        g2.addColorStop(1, '#7ABF4E');
        ctx.fillStyle = g2;
        U.rr(ctx, bx, by, bw * this.progress(), bh, 7);
        ctx.fill();
        ctx.strokeStyle = '#2A4A18';
        ctx.lineWidth = 1.5;
        U.rr(ctx, bx, by, bw, bh, 7);
        ctx.stroke();
        /* 旗帜节点 */
        const flags = Math.floor(this.totalWaves / 10);
        for (let i = 1; i <= flags; i++) {
          SP.flagIcon(ctx, bx + bw * (i * 10 / this.totalWaves), by - 2, 0.9);
        }
        /* 僵尸头标记 */
        const prog = this.progress();
        SP.zombieHeadIcon(ctx, bx + bw * prog, by + bh / 2, 1);
        U.text(ctx, `第 ${Math.min(this.wave + (this.waveCleared() ? 0 : 1), this.totalWaves)}/${this.totalWaves} 波`, bx + bw / 2, by - 16, {
          size: 13, fill: '#F0E8C8', stroke: 'rgba(0,0,0,0.6)', strokeW: 3,
        });
        ctx.restore();
      } else {
        /* 无尽模式波数 */
        U.text(ctx, `第 ${this.wave} 波 · 击杀 ${this.zombiesKilled}`, G.W - 100, G.H - 18, {
          size: 15, fill: '#F0E8C8', stroke: 'rgba(0,0,0,0.6)', strokeW: 3,
        });
      }

      /* —— 横幅 —— */
      if (this.banner) {
        const b = this.banner;
        const p = b.t / b.dur;
        let a = 1;
        if (p < 0.12) a = p / 0.12;
        else if (p > 0.85) a = (1 - p) / 0.15;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(40,20,10,0.55)';
        ctx.fillRect(0, G.H / 2 - 52, G.W, 74);
        const shake = Math.sin(b.t * 18) * 2 * (p < 0.3 ? 1 : 0.3);
        ctx.translate(shake, 0);
        U.text(ctx, b.text, G.W / 2, G.H / 2 - 15, {
          size: 38, fill: '#E83020', stroke: '#FFF0D0', strokeW: 7,
        });
        ctx.restore();
      }
    }
  }

  PVZ.Board = Board;
})(window);
