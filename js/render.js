// ============================================================
// render.js — 战场渲染 (800x600)
// 原版对齐 (PvZ-Portable Board.cpp / GameConstants.h):
//   BOARD_OFFSET=220 → 背景绘制于 x=-220 (屏幕0 ↔ 背图像素220)
//   草皮: SOD1ROW(19,265) / SOD3ROW(15,149), 1-4关用 srcRect 揭示
// ============================================================
'use strict';

const { CONST } = require('./data');
const { SCENE_BG } = require('./board');

const BG_OFFSET_X = -220; // 原版 BOARD_OFFSET=220

const Renderer = {
  drawBoard(ctx, board) {
    const cam = board.cameraX || 0;
    ctx.save();
    if (cam > 0) { ctx.beginPath(); ctx.rect(0, 0, 800, 600); ctx.clip(); ctx.translate(-cam, 0); }
    // ---- 背景 (原版: g->DrawImage(bg, -BOARD_OFFSET, 0)) ----
    const lvl = board.level;
    const earlyDay = board.scene === 'day' && lvl && lvl.sodRoll;
    if (earlyDay) {
      // 早期关卡: 未铺草皮背景 + 草皮层 (原版 Board::DrawBackground1 1/2/4 关逻辑)
      const un = Assets.image('background1unsodded.jpg');
      if (un) ctx.drawImage(un, BG_OFFSET_X, 0);
      const sod1 = Assets.image('sod1row.jpg');
      const sod3 = Assets.image('sod3row.jpg');
      const bg1 = Assets.image('background1.jpg');
      const p = board.sodDone ? 1 : (board.cutsceneSod !== undefined ? Math.max(0, board.cutsceneSod) : 1);
      const w1 = sod1 ? sod1.width : 771;
      const w3 = sod3 ? sod3.width : 771;
      if (lvl.id === 1) {
        // 1-1: 单行草皮从左向右展开
        if (sod1) ctx.drawImage(sod1, 0, 0, Math.max(1, w1 * p), sod1.height, 19, 265, w1 * p, sod1.height);
      } else if (lvl.id === 2 || lvl.id === 3) {
        // 1-2/1-3: 中间一行已有, 上下三行展开
        if (sod1) ctx.drawImage(sod1, 19, 265);
        if (sod3) ctx.drawImage(sod3, 0, 0, Math.max(1, w3 * p), sod3.height, 15, 149, w3 * p, sod3.height);
      } else if (lvl.id === 4) {
        // 1-4: 上三行已有, 整张背景从 x=232 向右揭示
        if (sod3) ctx.drawImage(sod3, 15, 149);
        if (bg1) {
          const w = 773 * p;
          ctx.drawImage(bg1, 232, 0, Math.max(1, w), bg1.height, 232 + BG_OFFSET_X, 0, w, bg1.height);
        }
      }
    } else {
      const bg = Assets.image(SCENE_BG[board.scene]);
      if (bg) {
        if (board.scene === 'pool' || board.scene === 'fog') {
          const base = Assets.image(board.scene === 'fog' ? 'background4.jpg' : 'background3.jpg');
          if (base) ctx.drawImage(base, BG_OFFSET_X, 0);
        } else {
          ctx.drawImage(bg, BG_OFFSET_X, 0);
        }
      }
    }
    // ---- 其余场景元素渲染 ----
    this.drawScene(ctx, board);
    ctx.restore();
  },

  // ---- 草皮卷滚筒 (原版 REANIM_SODROLL, 2秒 48帧) ----
  drawSodRoll(ctx, board) {
    if (!board.sodRolls) return;
    for (const r of board.sodRolls) {
      if (!r || !r.def) continue;
      r.update(1 / 60);
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
    // ---- 冰道 ----
    for (const t of board.iceTrails) {
      const ice = Assets.image('ice');
      if (ice) {
        ctx.save(); ctx.globalAlpha = 0.8;
        ctx.drawImage(ice, board.gridX(t.col), board.gridY(t.row) + 40, 80, 50);
        ctx.restore();
      }
    }
    // ---- 弹坑 ----
    for (const c of board.craters) {
      const img = Assets.image(board.isRoof ? 'crater_roof_center' : 'crater');
      if (img) ctx.drawImage(img, board.gridX(c.col) + 8, board.cellY(c.row, c.col) + 40);
    }
    // ---- 墓碑 ----
    for (const g of board.graves) {
      const img = Assets.image('tombstones');
      if (img) {
        const cw = img.width / 4;
        ctx.drawImage(img, g.type * cw, 0, cw, img.height,
          board.gridX(g.col) + 10, board.cellY(g.row, g.col) + 18, cw, img.height);
      }
    }
    // ---- 花盆/睡莲/地刺/南瓜 (底层) ----
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < 9; c++) {
        const lily = board.gridLily[r][c];
        if (lily && !lily.dead) lily.draw(ctx, board);
        const pot = board.gridPot[r][c];
        if (pot && !pot.dead) pot.draw(ctx, board);
        const spike = board.gridSpikes[r][c];
        if (spike && !spike.dead) spike.draw(ctx, board);
      }
    }
    // ---- 梯子道具 ----
    for (const l of board.ladders) {
      const img = Assets.image('zombie_ladder_5');
      if (img) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, board.gridX(l.col) + 40, board.cellY(l.row, l.col) + 10, 40, 90);
        ctx.restore();
      }
    }
    // ---- 割草机 ----
    for (const m of board.mowers) {
      if (m.state === 'gone' || m.hidden) continue;
      const name = m.type === 'pool' ? 'PoolCleaner' : m.type === 'roof' ? 'RoofCleaner' : 'LawnMower';
      if (!m.reanim) {
        m.reanim = Assets.reanim(name);
        m.reanim.play(m.type === 'lawn' ? 'anim_normal' : 'anim_normal', 0, 0);
      }
      m.reanim.shown = m.state !== 'gone';
      const my = board.gridY(m.row) + (m.type === 'pool' ? 33 : 19);
      m.reanim.x = m.x + (m.type === 'pool' ? 25 : 12);
      m.reanim.y = my;
      m.reanim.scale = m.type === 'pool' ? 0.8 : 0.85;
      if (m.state === 'running') m.reanim.animRate = 70;
      else m.reanim.animRate = 0;
      if (m.state !== 'idle' || true) m.reanim.update(1 / 60);
      m.reanim.draw(ctx);
    }
    // ---- 街边僵尸 (开场过场, 不属于草坪行) ----
    for (const z of board.zombies) {
      if (z.streetIdle && !z.dead) z.draw(ctx, board);
    }
    // ---- 实体按行渲染 (植物→僵尸) ----
    for (let r = 0; r < board.rows; r++) {
      // 植物
      for (const p of board.plants) {
        if (p.row === r && !p.dead && p.type !== 'PUMPKIN' && !GROUNDCOVER2(p) && !board.gridSpikes[r].includes(p)) {
          if (board.gridPumpkin[r][p.col] === p) continue;
          p.draw(ctx, board);
        }
      }
      // 南瓜壳 (套在植物上, 先植物后南瓜)
      for (let c = 0; c < 9; c++) {
        const pk = board.gridPumpkin[r][c];
        if (pk && !pk.dead) pk.draw(ctx, board);
      }
      // 僵尸 (行内按x排序)
      const rowZ = board.zombies.filter(z => z.row === r && !z.dead && !z.boss);
      rowZ.sort((a, b) => a.x - b.x);
      for (const z of rowZ) z.draw(ctx, board);
    }
    // ---- Boss (最上层右侧) ----
    for (const z of board.zombies) {
      if (z.type === 'BOSS' && !z.dead) z.draw(ctx, board);
    }
    // ---- 子弹 ----
    for (const pr of board.projectiles) pr.draw(ctx, board);
    // ---- 草皮卷滚筒 (原版 RENDER_LAYER_TOP: 最上层) ----
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

  drawSun(ctx, s, board) {
    if (!s.anim) {
      s.anim = Assets.reanim('Sun');
      s.anim.play('anim_idle', 0, 8);
    }
    s.anim.update(1 / 60);
    s.anim.x = s.x + Math.sin(s.phase) * 3;
    s.anim.y = s.y;
    const sc = s.collected ? Math.max(0.3, 1 - s.flyT) : (s.life < 2 ? 0.7 + Math.sin(board.time * 8) * 0.15 : 1);
    s.anim.scale = sc;
    s.anim.draw(ctx);
  },

  drawCoin(ctx, c) {
    if (!c.anim) {
      c.anim = Assets.reanim(c.type === 'diamond' ? 'Diamond' : 'Coin_gold');
      c.anim.play('anim_idle', 0, 10);
    }
    c.anim.update(1 / 60);
    c.anim.x = c.x; c.anim.y = c.y;
    const sc = c.collected ? Math.max(0.3, 1 - c.flyT) : 1;
    c.anim.scale = sc * 0.9;
    c.anim.draw(ctx);
  },

  drawEffects(ctx, board) {
    for (const e of board.effects) {
      switch (e.name) {
        case 'powie': { // 爆炸
          const img1 = Assets.image('explosionpowie');
          const img2 = Assets.image('explosioncloud');
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
            if (e.name === 'firesplat') e.anim.additive = true;
          }
          e.anim.update(1 / 60);
          e.anim.x = e.x; e.anim.y = e.y;
          e.anim.scale = e.name === 'melonsplat' ? 1.6 : 1;
          if (e.name === 'snowsplat') e.anim.color = [0.6, 0.85, 1, 1];
          if (e.name === 'firesplat') e.anim.color = [1, 0.75, 0.5, 1];
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
          e.anim.x = e.x; e.anim.y = e.y;
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
          // 草皮卷泥土粒子 (原版 PARTICLE_SOD_ROLL)
          const p = e.t / e.dur;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = e.opts.c;
          const px = e.x + e.opts.vx * e.t;
          const py = e.y + e.opts.vy * e.t + 220 * e.t * e.t; // 重力
          ctx.beginPath();
          ctx.arc(px, py, e.opts.r * (1 - p * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
  },

  // 僵尸绘制 (在 zombies.js 的 draw 调用)
  drawZombie(ctx, z, board) {
    if (z.dead) return;
    const rowTop = board.gridY(z.row);
    let dy = 0;
    if (z.phase === 'dying') dy = Math.min(40, z.dyingT * 60);
    const oy = Z_OFF_Y + (1 - z.scale) * 120 + z.altitude * 0 - z.altitude + dy;
    z.anim.x = z.x + Z_OFF_X;
    z.anim.y = rowTop + oy;
    if (z.frozen > 0) z.anim.color = [0.65, 0.85, 1, 1];
    else if (z.chilled > 0) z.anim.color = [0.75, 0.92, 1, 1];
    else z.anim.color = null;
    if (z.flash > 0) {
      ctx.save();
      ctx.filter = 'brightness(2.4)';
      z.anim.draw(ctx);
      ctx.restore();
    } else {
      z.anim.draw(ctx);
    }
    if (z.butter > 0) {
      const img = Assets.image('icetrap');
      if (img) {
        ctx.save(); ctx.globalAlpha = 0.85;
        ctx.drawImage(img, z.x - 10, rowTop + 30, 80, 80);
        ctx.restore();
      }
    }
  },
};

function GROUNDCOVER2(p) { return p.type === 'SPIKEWEED' || p.type === 'SPIKEROCK'; }

if (typeof module !== 'undefined') module.exports = { Renderer, BG_OFFSET_X };
