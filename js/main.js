/* web-pvz — main.js
 * 入口：游戏循环（固定时间步长）、场景管理、输入路由、存档、快捷键
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});
  const { U, G, LEVELS } = PVZ;
  const { A } = PVZ;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.canvas._dpr = 1;
      this.scene = null;
      this.save = {
        unlocked: U.load('unlocked', 1),
        cleared: U.load('cleared', 0),
        endlessUnlocked: U.load('endlessUnlocked', false),
      };
      this.audioUnlocked = false;
      this.lastTime = 0;
      this.acc = 0;
      this.stepSize = 1 / 60;
      this._bindInput();
      this._fit();
      window.addEventListener('resize', () => this._fit());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.scene instanceof PVZ.GameScene && !this.scene.paused) {
          this.scene.togglePause();
        }
      });
    }

    _fit() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas._dpr = dpr;
      this.canvas.width = G.W * dpr;
      this.canvas.height = G.H * dpr;
      this.scale = Math.min(window.innerWidth / G.W, window.innerHeight / G.H);
      this.offsetX = (window.innerWidth - G.W * this.scale) / 2;
      this.offsetY = (window.innerHeight - G.H * this.scale) / 2;
      /* 等比缩放 + 居中信箱式布局 */
      this.canvas.style.width = Math.round(G.W * this.scale) + 'px';
      this.canvas.style.height = Math.round(G.H * this.scale) + 'px';
      this.canvas.style.position = 'absolute';
      this.canvas.style.left = Math.round(this.offsetX) + 'px';
      this.canvas.style.top = Math.round(this.offsetY) + 'px';
      this.canvas.style.right = 'auto';
      this.canvas.style.bottom = 'auto';
    }

    _bindInput() {
      U.onPointer(this.canvas, (p) => {
        A.unlock();
        if (this.scene) this.scene.handlePointer(p);
      });
      window.addEventListener('keydown', (e) => {
        if (this.scene instanceof PVZ.GameScene) {
          if (e.key === 'p' || e.key === 'P') this.scene.togglePause();
          if (e.key === 'f' || e.key === 'F') {
            this.scene.board.gameSpeed = this.scene.board.gameSpeed > 1 ? 1 : 2;
          }
          if (e.key === 'm' || e.key === 'M') A.setMusicOn(!A.musicOn);
          if (e.key === 'Escape') {
            this.scene.board.selected = -1;
            this.scene.board.shovelMode = false;
          }
        }
      });
    }

    goto(scene) {
      this.scene = scene;
    }

    startLevel(levelDef, chosen) {
      const picked = chosen && chosen.length ? chosen : levelDef.plants.slice(0, Math.min(levelDef.slots, levelDef.plants.length));
      this.goto(new PVZ.GameScene(this, levelDef, picked));
    }

    nextLevel(levelDef) {
      if (levelDef.id === 'endless') return null;
      const idx = LEVELS.findIndex((l) => l.id === levelDef.id);
      if (idx < 0 || idx >= LEVELS.length - 1) return null;
      return LEVELS[idx + 1];
    }

    onLevelWin(levelDef) {
      if (levelDef.id === 'endless') return;
      const next = this.nextLevel(levelDef);
      if (next) {
        this.save.unlocked = Math.max(this.save.unlocked, next.id);
        this.save.cleared = Math.max(this.save.cleared, levelDef.id);
        if (next.id === 'endless' || levelDef.id === 5) {
          this.save.endlessUnlocked = true;
          this.save.cleared = 5;
        }
      } else {
        this.save.cleared = 5;
        this.save.endlessUnlocked = true;
      }
      U.save('unlocked', this.save.unlocked);
      U.save('cleared', this.save.cleared);
      U.save('endlessUnlocked', this.save.endlessUnlocked);
    }

    /* 无尽模式最高纪录 */
    recordEndless(wave) {
      const best = U.load('bestWave', 0);
      if (wave > best) U.save('bestWave', wave);
    }

    /* 顶部圆形小按钮（由 GameScene 定义，Game 统一绘制） */
    drawTopButtons(ctx) {
      const gs = this.scene;
      if (!(gs instanceof PVZ.GameScene)) return;
      const btns = gs.roundButtons || [];
      for (const b of btns) {
        ctx.save();
        ctx.fillStyle = b.hover ? 'rgba(250,235,190,0.95)' : 'rgba(120,90,50,0.8)';
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,20,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        const label = typeof b.label === 'function' ? b.label() : b.label;
        U.text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 1, { size: b.labelSize || 16 });
        ctx.restore();
      }
    }

    update(dt) {
      if (this.scene) this.scene.update(dt);
    }

    draw() {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(this.canvas._dpr, 0, 0, this.canvas._dpr, 0, 0);
      /* 黑边 */
      ctx.fillStyle = '#101418';
      ctx.fillRect(0, 0, G.W, G.H);
      if (this.scene) this.scene.draw(ctx);
      ctx.restore();
    }

    loop(t) {
      requestAnimationFrame((tt) => this.loop(tt));
      if (!this.lastTime) this.lastTime = t;
      let delta = (t - this.lastTime) / 1000;
      this.lastTime = t;
      if (delta > 0.1) delta = 0.1;
      this.acc += delta;
      while (this.acc >= this.stepSize) {
        this.update(this.stepSize);
        this.acc -= this.stepSize;
      }
      this.draw();
    }

    start() {
      this.goto(new PVZ.TitleScene(this));
      requestAnimationFrame((tt) => this.loop(tt));
    }
  }

  /* ============ 启动 ============ */
  function boot() {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    const game = new Game(canvas);
    PVZ.game = game;
    game.start();

    /* 首次交互前显示音频提示遮罩 */
    const hint = document.getElementById('audio-hint');
    const dismiss = () => {
      if (hint) hint.style.display = 'none';
      A.unlock();
      window.removeEventListener('pointerdown', dismiss);
    };
    window.addEventListener('pointerdown', dismiss);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
