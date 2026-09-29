// ============================================================
// cutscene.js — 关卡开场过场 / 转场动画
// 原版时间轴 (PvZ-Portable CutScene.cpp):
//   0-1.5s 停留房子 → 1.5-3.5s 右移看僵尸 → 4.5-6s 左移回来
//   → 6-8s 草皮卷/墓碑/割草机 → 6-7.83s READY-SET-PLANT → 开始
// ============================================================
'use strict';

const RE = require('./reanim');
const { WAVE } = require('./data');

const img = (n) => Assets.image(n);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// ease in-out (原版 CURVE_EASE_IN_OUT 近似)
function easeIO(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
// 时间区间进度
function seg(t, t0, t1) { return clamp01((t - t0) / (t1 - t0)); }

const Cutscene = {
  active: false,
  t: 0,
  phase: 'intro',        // intro / readyset / done
  cameraX: 0,            // 镜头右移像素
  sodProgress: 1,        // 草皮卷 0-1
  banners: [],           // {img, t, dur, scale}
  streetZombies: [],     // 开场街边僵尸
  blackFade: 1,          // 入场黑场

  // ---- 启动关卡开场 ----
  start(board) {
    this.active = true;
    this.t = 0;
    this.phase = 'intro';
    this.cameraX = 0;
    this.board = board;
    const level = board.level;
    // 草皮卷 (1/2/4 关)
    this.sodProgress = level.sodRoll ? 0 : 1;
    this.sodRows = level.grassRows;
    // 街边僵尸 (前 20 关): 站在屏幕右侧街道
    this.streetZombies = [];
    if (level.introZombies && !level.fixed) {
      const types = [];
      // 用该关可出现的僵尸种类摆 4-6 只
      const candidates = Object.keys(ZOMBIES_DEF).filter(ty => {
        const d = ZOMBIES_DEF[ty];
        return !d.boss && !d.bungee && ty !== 'BACKUP' && ty !== 'IMP' && ty !== 'REDEYE' &&
          board.canSpawnType(ty) && (d.firstWave || 1) <= 1;
      });
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const ty = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : 'NORMAL';
        this.streetZombies.push({ type: ty, x: 860 + Math.random() * 380, row: board.grassRows[Math.floor(Math.random() * board.grassRows.length)] });
      }
      // 保证至少有普通僵尸
      if (!this.streetZombies.length) this.streetZombies.push({ type: 'NORMAL', x: 950, row: board.grassRows[0] });
    }
    this.blackFade = 1;
    board.state = 'intro';
    // 预创建街边僵尸实体 (不移动)
    for (const sz of this.streetZombies) {
      const z = board.spawnZombie(sz.type, sz.row);
      z.x = sz.x;
      z.streetIdle = true;   // 过场期间原地踏步
      z.introOnly = false;
    }
  },

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    const board = this.board;

    // 黑场淡入
    this.blackFade = Math.max(0, 1 - t / 0.5);

    // 镜头: 1.5-3.5 右移至 570, 4.5-6 移回 0
    let cam = 0;
    if (t < 1.5) cam = 0;
    else if (t < 3.5) cam = easeIO(seg(t, 1.5, 3.5)) * 570;
    else if (t < 4.5) cam = 570;
    else if (t < 6.0) cam = 570 * (1 - easeIO(seg(t, 4.5, 6.0)));
    else cam = 0;
    this.cameraX = cam;
    board.cameraX = cam;

    // 街边僵尸: 过场时原地缓慢踏步 (不前进)
    for (const z of board.zombies) {
      if (z.streetIdle && t < 6.0) {
        z.x = Math.max(800, z.x - dt * 2); // 极缓慢
        if (z.x < 800) z.x = 800;
      } else if (z.streetIdle) {
        z.streetIdle = false; // 开始正常行进
      }
    }

    // 草皮卷 6-8s
    if (this.sodProgress < 1) {
      this.sodProgress = easeIO(seg(t, 6.0, 8.0));
      board.cutsceneSod = this.sodProgress;
      if (this.sodProgress >= 1) { board.sodDone = true; delete board.cutsceneSod; }
    }

    // READY SET PLANT: 6.0-7.83
    if (t >= 6.0 && this.phase === 'intro' && !board.level.noReadySet) {
      this.phase = 'readyset';
      board.game.audio.play('readysetplant');
    }

    // 结束
    const endT = 8.2;
    if (t >= endT) {
      this.active = false;
      this.phase = 'done';
      board.cameraX = 0;
      board.sodDone = true;
      board.state = 'playing';
      board.beginWaves();
    }
  },

  // ---- 绘制 (叠加在 board 渲染之上) ----
  draw(ctx, board) {
    const t = this.t;
    // 1. 草皮卷层 (背景已由 renderer 绘制 unsodded + 已铺部分)
    // 2. READY-SET-PLANT 横幅
    if (t >= 6.0 && t < 7.9 && !board.level.noReadySet) {
      const seq = [['startready.png', 6.0, 6.62], ['startset.png', 6.62, 7.24], ['startplant.png', 7.24, 7.9]];
      for (const [name, t0, t1] of seq) {
        if (t >= t0 && t < t1) {
          const im = img(name);
          if (im) {
            const p = seg(t, t0, t1);
            const pop = p < 0.25 ? p / 0.25 : 1;
            const sc = 0.7 + 0.3 * easeIO(pop);
            ctx.save();
            ctx.translate(400, 300);
            ctx.scale(sc, sc);
            ctx.globalAlpha = p > 0.9 ? (1 - p) / 0.1 : 1;
            ctx.drawImage(im, -150, -66, 300, 133);
            ctx.restore();
          }
          break;
        }
      }
    }
    // 3. 黑场
    if (this.blackFade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.blackFade})`;
      ctx.fillRect(0, 0, 800, 600);
    }
    // 4. "关卡开始" 提示 (前 3 秒)
    if (t < 3.2 && board && board.level) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (3.2 - t) / 0.6) * 0.95;
      pvzTextGlobal(ctx, `关卡 ${board.level.label}`, 400, 90, 30, '#ffe9a8');
      ctx.restore();
    }
  },
};

// 避免循环引用: 僵尸表延迟获取
let ZOMBIES_DEF = {};
function setZombieDefs(z) { ZOMBIES_DEF = z; }

// 全局文字 (复制自 screens.js 以避免依赖)
function pvzTextGlobal(ctx, text, x, y, size, fill) {
  ctx.save();
  ctx.font = `bold ${size}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.strokeStyle = 'rgba(20,12,0,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ============================================================
// 场内横幅系统 (一大波僵尸/最后一波/胜利提示)
// ============================================================
const Banners = {
  list: [],
  show(imgName, dur = 3.4, sound = null, audio = null) {
    this.list.push({ img: imgName, t: 0, dur, sound });
    if (sound && audio) audio.play(sound);
  },
  update(dt) {
    for (const b of this.list) b.t += dt;
    this.list = this.list.filter(b => b.t < b.dur);
  },
  draw(ctx) {
    for (const b of this.list) {
      const im = img(b.img);
      if (!im) continue;
      const p = b.t / b.dur;
      // 弹入 → 停留 → 淡出
      let sc = 1, alpha = 1;
      if (p < 0.12) { const q = p / 0.12; sc = 0.5 + 0.5 * easeIO(q); alpha = q; }
      else if (p > 0.85) { alpha = (1 - p) / 0.15; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(400, 260);
      ctx.scale(sc, sc);
      const w = im.width > 460 ? 460 : im.width;
      const h = w * im.height / im.width;
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  },
  clear() { this.list = []; },
};

// ============================================================
// 转场效果 (场景切换淡入淡出)
// ============================================================
const Transition = {
  fade: 0, target: 0, cb: null,
  to(cb, dur = 0.4) { this.target = 1; this.dur = dur; this.cb = cb; },
  update(dt) {
    if (this.target === 1) {
      this.fade = Math.min(1, this.fade + dt / (this.dur || 0.4));
      if (this.fade >= 1 && this.cb) { const cb = this.cb; this.cb = null; this.target = 0; cb(); }
    } else if (this.target === 0 && this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / (this.dur || 0.4));
    }
  },
  draw(ctx) {
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, 800, 600);
    }
  },
  busy() { return this.target === 1 || this.cb !== null; },
};

if (typeof module !== 'undefined') module.exports = { Cutscene, Banners, Transition, setZombieDefs, easeIO };
