// ============================================================
// render.js — 战场渲染 (800x600, 渲染顺序系统)
// 原版对齐 (Board.cpp / GameConstants.h):
//   BOARD_OFFSET=220 → 背景绘制于 x=-220
//   渲染顺序: renderOrder = row*10000 + layer + offset (排序绘制)
//   层: 墓碑301000 < 植物302000 < 僵尸303000 < 割草机306000
// 草皮: SOD1ROW(19,265) / SOD3ROW(15,149)
// ============================================================
'use strict';

const { CONST } = require('./data');
const { SCENE_BG, RENDER_LAYER } = require('./board');

const BG_OFFSET_X = -220; // 原版 BOARD_OFFSET=220

const Renderer = {
  drawBoard(ctx, board) {
    const cam = board.cameraX || 0;
    ctx.save();
    if (cam > 0) { ctx.beginPath(); ctx.rect(0, 0, 800, 600); ctx.clip(); ctx.translate(-cam, 0); }
    const lvl = board.level;
    const firstTime = board.game && board.game.progress ? board.game.progress.unlocked <= lvl.id : true;
    const earlyDay = board.scene === 'day' && lvl && lvl.id <= 4 && firstTime;
    if (earlyDay) {
      const un = Assets.image('background1unsodded.jpg');
      if (un) ctx.drawImage(un, BG_OFFSET_X, 0);
      const sod1 = Assets.image('sod1row_alpha.png') || Assets.image('sod1row.jpg');
      const sod3 = Assets.image('sod3row_alpha.png') || Assets.image('sod3row.jpg');
      const bg1 = Assets.image('background1.jpg');
      const p = board.sodDone ? 1 : (board.cutsceneSod !== undefined ? Math.max(0, board.cutsceneSod) : 1);
      const w1 = sod1 ? sod1.width : 771;
      const w3 = sod3 ? sod3.width : 771;
      if (lvl.id === 1) {
        if (sod1) ctx.drawImage(sod1, 0, 0, Math.max(1, w1 * p), sod1.height, 19, 265, w1 * p, sod1.height);
      } else if (lvl.id === 2) {
        if (sod1) ctx.drawImage(sod1, 19, 265);
        if (sod3) ctx.drawImage(sod3, 0, 0, Math.max(1, w3 * p), sod3.height, 15, 149, w3 * p, sod3.height);
      } else if (lvl.id === 3) {
        if (sod1) ctx.drawImage(sod1, 19, 265);
        if (sod3) ctx.drawImage(sod3, 15, 149);
      } else if (lvl.id === 4) {
        if (sod3) ctx.drawImage(sod3, 15, 149);
        if (bg1) {
          const w = 773 * p;
          ctx.drawImage(bg1, 232, 0, Math.max(1, w), bg1.height, 232 + BG_OFFSET_X, 0, w, bg1.height);
        }
      }
    } else {
      const bg = Assets.image(SCENE_BG[board.scene]);
      if (bg) ctx.drawImage(bg, BG_OFFSET_X, 0);
    }
    this.drawScene(ctx, board);
    ctx.restore();
  },

  // ---- 草皮卷滚筒 (REANIM_SODROLL; animTime 直接绑定 cutsceneSod 进度严格同步) ----
  drawSodRoll(ctx, board) {
    if (!board.sodRolls) return;
    for (const r of board.sodRolls) {
      if (!r || !r.def) continue;
      if (board.cutsceneSod !== undefined) {
        r.animTime = Math.max(0, Math.min(1, board.cutsceneSod));
        r.loopCount = r.animTime >= 1 ? 1 : 0;
      }
      r.draw(ctx);
    }
  },

  drawScene(ctx, board) {
    // ---- 泳池水面波光 ----
    if (board.waterRows.length) {
      for (const r of board.waterRows) {
        const y = board.gridY(r);
        ctx.save();
        ctx.globalAlpha = 0.12 + Math.sin(board.time * 2 + r) * 0.04;
        ctx.fillStyle = '#bfe8ff';
        ctx.fillRect(250, y + 18, 730, 55);
        ctx.restore();
      }
    }
    // ---- 冰道 (Zamboni/Bobsled) ----
    for (let r = 0; r < board.rows; r++) {
      if (board.iceTimers[r] > 0) {
        const ice = Assets.image('ice');
        const minX = board.iceMinX(r) || 900;
        if (ice && minX < 850) {
          ctx.save(); ctx.globalAlpha = 0.75;
          ctx.drawImage(ice, minX, board.gridY(r) + 38, 800 - minX + 40, 55);
          ctx.restore();
        }
      }
    }
    // ---- 弹坑 ----
    for (const c of board.craters) {
      const img = Assets.image(board.isRoof ? 'crater_roof_center' : 'crater');
      if (img) ctx.drawImage(img, board.gridX(c.col) + 8, board.cellY(c.row, c.col) + 40);
    }
    // ---- 墓碑 (RENDER_LAYER_GRAVE_STONE) ----
    for (const g of board.graves) {
      const img = Assets.image('tombstones');
      if (img) {
        const cw = img.width / 4;
        ctx.drawImage(img, g.type * cw, 0, cw, img.height,
          board.gridX(g.col) + 10, board.cellY(g.row, g.col) + 18, cw, img.height);
      }
    }
    // ---- 花盆/睡莲 (底层) ----
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < 9; c++) {
        const lily = board.gridLily[r][c];
        if (lily && !lily.dead) lily.draw(ctx, board);
        const pot = board.gridPot[r][c];
        if (pot && !pot.dead) pot.draw(ctx, board);
      }
    }
    // ---- 渲染顺序列表 (植物+僵尸统一排序) ----
    const list = [];
    for (const p of board.plants) {
      if (p.dead) continue;
      if (board.gridPumpkin[p.row] && board.gridPumpkin[p.row][p.col] === p) {
        // 南瓜壳: 植物层之上 (原版 PLANT_LAYER_ON_TOP → +4)
        list.push({ o: p.row * 10000 + RENDER_LAYER.PLANT + 6, d: () => p.draw(ctx, board) });
      } else {
        list.push({ o: p.row * 10000 + RENDER_LAYER.PLANT + (p.col || 0), d: () => p.draw(ctx, board) });
      }
    }
    // 街边僵尸 (开场过场, row=-1 → 不在草坪, 直接画)
    for (const z of board.zombies) {
      if (z.row === -1 && !z.dead) {
        list.push({ o: z.renderOrder || 303000, d: () => { z.drawShadow(ctx); z.draw(ctx); } });
      }
    }
    for (const z of board.zombies) {
      if (z.dead || z.row === -1) continue;
      list.push({ o: z.renderOrder || (z.row * 10000 + RENDER_LAYER.ZOMBIE), d: () => { z.drawShadow(ctx); z.draw(ctx); } });
    }
    // 梯子道具 (僵尸层)
    for (const l of board.ladders) {
      list.push({
        o: l.row * 10000 + RENDER_LAYER.ZOMBIE + 5,
        d: () => {
          const img = Assets.image('zombie_ladder_5');
          if (img) {
            ctx.save(); ctx.globalAlpha = 0.92;
            ctx.drawImage(img, board.gridX(l.col) + 40, board.cellY(l.row, l.col) + 10, 40, 90);
            ctx.restore();
          }
        }
      });
    }
    // 割草机 (RENDER_LAYER_LAWN_MOWER)
    for (const m of board.mowers) {
      if (m.state === 'gone' || m.hidden) continue;
      list.push({ o: m.row * 10000 + RENDER_LAYER.MOWER, d: () => this.drawMower(ctx, m, board) });
    }
    // reanim特效池 (水花/尘土/掉落dirt — 粒子层)
    for (const r of board.reanims) {
      list.push({ o: r.renderOrder || RENDER_LAYER.PARTICLE, d: () => r.draw(ctx) });
    }
    list.sort((a, b) => a.o - b.o);
    for (const it of list) it.d();
    // ---- 掉落肢体粒子 ----
    for (const e of board.effects) if (e instanceof LimbParticleInstance) this.drawLimb(ctx, e);
    // ---- 子弹 ----
    for (const pr of board.projectiles) pr.draw(ctx, board);
    // ---- 草皮卷滚筒 (RENDER_LAYER_TOP) ----
    this.drawSodRoll(ctx, board);
    // ---- 特效 ----
    this.drawEffects(ctx, board);
    // ---- 阳光/金币 ----
    for (const s of board.suns) s.draw ? s.draw(ctx, board) : this.drawSun(ctx, s, board);
    for (const c of board.coins) this.drawCoin(ctx, c);
    // ---- 浓雾 ----
    if (board.scene === 'fog') {
      const fog = Assets.image('fog');
      if (fog && board.fogLevel(500) > 0) {
        ctx.save();
        ctx.globalAlpha = 0.95;
        const w = 460;
        const fx = 340 + Math.sin(board.time * 0.7) * 8;
        ctx.drawImage(fog, 0, 0, fog.width, fog.height, fx, 70, w, 470);
        ctx.restore();
      }
    }
  },

  drawMower(ctx, m, board) {
    const name = m.type === 'pool' ? 'PoolCleaner' : m.type === 'roof' ? 'RoofCleaner' : 'LawnMower';
    if (!m.reanim) {
      m.reanim = Assets.reanim(name);
      m.reanim.play('anim_normal', 0, 0);
    }
    const my = board.gridY(m.row) + (m.type === 'pool' ? 33 : 19);
    m.reanim.setPosition(m.x + (m.type === 'pool' ? 25 : 12), my);
    const sc = m.type === 'pool' ? 0.8 : 0.85;
    m.reanim.overrideScale(sc, sc);
    m.reanim.animRate = m.state === 'running' ? 70 : 0;
    m.reanim.update(1 / 60);
    m.reanim.draw(ctx);
  },

  drawSun(ctx, s, board) {
    if (!s.anim) {
      s.anim = Assets.reanim('Sun');
      s.anim.play('anim_idle', 0, 8);
    }
    s.anim.update(1 / 60);
    s.anim.setPosition(s.x + Math.sin(s.phase) * 3, s.y);
    const sc = s.collected ? Math.max(0.3, 1 - s.flyT) : (s.life < 2 ? 0.7 + Math.sin(board.time * 8) * 0.15 : 1);
    s.anim.overrideScale(sc, sc);
    s.anim.draw(ctx);
  },

  drawCoin(ctx, c) {
    if (!c.anim) {
      c.anim = Assets.reanim(c.type === 'diamond' ? 'Diamond' : 'Coin_gold');
      c.anim.play('anim_idle', 0, 10);
    }
    c.anim.update(1 / 60);
    c.anim.setPosition(c.x, c.y);
    const sc = (c.collected ? Math.max(0.3, 1 - c.flyT) : 1) * 0.9;
    c.anim.overrideScale(sc, sc);
    c.anim.draw(ctx);
  },

  drawLimb(ctx, e) {
    // 掉落肢体 (断臂/掉头/掉盔)
    const img = Assets.image(e.kind === 'head' ? 'zombie_head' : e.kind === 'arm' ? 'zombie_arm' :
      e.kind === 'cone' ? 'zombie_cone' : e.kind === 'bucket' ? 'zombie_bucket' :
        e.kind === 'helm' ? 'zombie_football_helmet' : 'zombie_screendoor');
    ctx.save();
    ctx.globalAlpha = Math.min(1, 1.6 - e.t);
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    if (img) ctx.drawImage(img, -img.width / 2, -img.height / 2);
    else { ctx.fillStyle = '#7a6a5a'; ctx.fillRect(-8, -8, 16, 16); }
    ctx.restore();
  },

  drawEffects(ctx, board) {
    for (const e of board.effects) {
      if (e instanceof LimbParticleInstance) continue;
      switch (e.name) {
        case 'powie': {
          const img1 = Assets.image('explosionpowie');
          const p = e.t / 0.9;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          if (img1) ctx.drawImage(img1, 0, Math.floor(p * 5) * (img1.height / 6), img1.width, img1.height / 6,
            e.x - 90, e.y - 90, 180, 180);
          ctx.restore();
          break;
        }
        case 'spudow': {
          const img = Assets.image('explosionspudow');
          const p = e.t / 0.9;
          if (img) {
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, 0, Math.floor(p * 5) * (img.height / 6), img.width, img.height / 6,
              e.x - 80, e.y - 80, 160, 160);
            ctx.restore();
          }
          break;
        }
        case 'jackbox_pop': case 'boom': {
          const img = Assets.image('explosioncloud');
          const p = e.t / 1.2;
          if (img) {
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 90 * (0.5 + p), e.y - 90 * (0.5 + p), 180 * (0.5 + p), 180 * (0.5 + p));
            ctx.restore();
          }
          break;
        }
        case 'jala_row': {
          const img = Assets.image('explosioncloud');
          const p = e.t / 0.8;
          const y = board.gridY(e.opts.row);
          ctx.save();
          ctx.globalAlpha = 1 - p;
          for (let x = 20; x < 800; x += 110) {
            ctx.drawImage(img, x, y - 30 + Math.sin(x + p * 6) * 10, 110, 110);
          }
          ctx.restore();
          break;
        }
        case 'splat': case 'snowsplat': case 'firesplat': case 'melonsplat': case 'basketballsplat': {
          if (!e.anim) {
            e.anim = Assets.reanim('Puff');
            e.anim.play('anim_idle', 1, 20);
          }
          e.anim.update(1 / 60);
          e.anim.setPosition(e.x, e.y);
          const sc = e.name === 'melonsplat' ? 1.6 : 1;
          e.anim.overrideScale(sc, sc);
          if (e.name === 'snowsplat') e.anim.colorOverride = [153, 217, 255, 255];
          if (e.name === 'firesplat') e.anim.colorOverride = [255, 190, 128, 255];
          e.anim.draw(ctx);
          break;
        }
        case 'screen_flash': {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 0.7 - e.t);
          ctx.fillStyle = '#cfe8ff';
          ctx.fillRect(0, 0, 800, 600);
          ctx.restore();
          break;
        }
        case 'dust': {
          const img = Assets.image('dust_puffs');
          if (img) {
            const p = e.t / 0.8;
            ctx.save(); ctx.globalAlpha = 0.8 - p * 0.8;
            ctx.drawImage(img, 0, 0, img.width / 3, img.height, e.x - 25 - p * 10, e.y - 20 - p * 15, 50, 40);
            ctx.restore();
          }
          break;
        }
        case 'squish': case 'squashhit': {
          const img = Assets.image('pow');
          if (img) {
            const p = e.t / 0.5;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 40, e.y - 30 - p * 20, 80, 50);
            ctx.restore();
          }
          break;
        }
        case 'fire': {
          if (!e.anim) { e.anim = Assets.reanim('fire'); e.anim.play('anim_idle', 0, 24); }
          e.anim.update(1 / 60);
          e.anim.setPosition(e.x, e.y);
          e.anim.draw(ctx);
          break;
        }
        case 'mindcontrol': {
          const img = Assets.image('mindcontrol');
          if (img) {
            const p = e.t / 1;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 40, e.y - 60 - p * 30, 80, 80);
            ctx.restore();
          }
          break;
        }
        case 'balloon_pop': {
          const img = Assets.image('puff');
          if (img) {
            ctx.save(); ctx.globalAlpha = 1 - e.t * 2;
            ctx.drawImage(img, e.x - 20, e.y - 20, 40, 40);
            ctx.restore();
          }
          break;
        }
        case 'magnetitem': {
          const img = Assets.image(e.opts.img);
          if (img) {
            const p = e.t / 0.5;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 20, e.y - p * 60, 40, 40);
            ctx.restore();
          }
          break;
        }
        case 'bossexplosion': {
          const img = Assets.image('bossexplosion1');
          if (img) {
            const p = e.t / 1.5;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, 300, 100, 500, 400);
            ctx.restore();
          }
          break;
        }
        case 'sod_dirt': {
          const p = e.t / e.dur;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = e.opts.c;
          const px = e.x + e.opts.vx * e.t;
          const py = e.y + e.opts.vy * e.t + 220 * e.t * e.t;
          ctx.beginPath();
          ctx.arc(px, py, e.opts.r * (1 - p * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
  },
};

// LimbParticle 实例检测 (避免循环引用 board 模块)
const { LimbParticle } = require('./board');
const LimbParticleInstance = LimbParticle;

if (typeof module !== 'undefined') module.exports = { Renderer, BG_OFFSET_X };
