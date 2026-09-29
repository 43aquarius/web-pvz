// ============================================================
// render.js — 战场渲染 (800x600)
// ============================================================
'use strict';

const { CONST } = require('./data');
const { SCENE_BG } = require('./board');

const BG_OFFSET_X = -210; // 背景草坪与网格对齐偏移

const Renderer = {
  drawBoard(ctx, board) {
    const game = board.game;
    const cam = board.cameraX || 0;
    ctx.save();
    if (cam > 0) { ctx.beginPath(); ctx.rect(0, 0, 800, 600); ctx.clip(); ctx.translate(-cam, 0); }
    // ---- 背景 ----
    const bg = Assets.image(SCENE_BG[board.scene]);
    const isEarlyDay = board.scene === 'day' && board.level && board.level.id <= 3;
    if (isEarlyDay) {
      // 早期关卡: 未铺草皮背景 + 草皮覆盖层 (1-1单行 / 1-2·1-3三行)
      const un = Assets.image('background1unsodded.jpg');
      if (un) ctx.drawImage(un, BG_OFFSET_X + 210, 0, 1400, 600, -210, 0, 1400, 600);
      const sodImg = board.level.id === 1 ? 'sod1row.jpg' : 'sod3row.jpg';
      const sod = Assets.image(sodImg);
      if (sod) {
        if (board.sodDone) {
          // 已铺完
          const sy = board.level.id === 1 ? 252 : 143;
          ctx.drawImage(sod, 10, sy, 771, sod.height);
        } else if (board.cutsceneSod !== undefined) {
          // 铺设中: 从左向右展开 + 草皮卷滚筒
          const p = Math.max(0.02, board.cutsceneSod);
          const w = 771 * p;
          const sy = board.level.id === 1 ? 252 : 143;
          ctx.drawImage(sod, 0, 0, Math.max(1, w), sod.height, 10, sy, w, sod.height);
          const roll = Assets.image('sodroll.png');
          if (roll) {
            const rx = 10 + w - 40;
            ctx.save();
            ctx.translate(rx, sy + sod.height / 2);
            ctx.rotate(-board.time * 9);
            ctx.drawImage(roll, -34, -34, 68, 68);
            ctx.restore();
          }
        }
      }
    } else if (bg) {
      if (board.scene === 'pool' || board.scene === 'fog') {
        // 泳池背景用 base (白天/夜晚)
        const base = Assets.image(board.scene === 'fog' ? 'background4.jpg' : 'background3.jpg');
        if (base) ctx.drawImage(base, BG_OFFSET_X + 210, 0, 1400, 600, -210, 0, 1400, 600);
      } else {
        ctx.drawImage(bg, BG_OFFSET_X + 210, 0, 1400, 600, -210, 0, 1400, 600);
      }
    }
    // ---- 其余场景元素渲染 ----
    this.drawScene(ctx, board);
    ctx.restore();
  },

  drawScene(ctx, board) {
    // ---- 屋顶坡度提示(无需额外绘制, 背景自带) ----
    // ---- 泳池水面波光 ----
    if (board.waterRows.length) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(board.time * 1.5) * 0.05;
      const caustic = Assets.image('pool_caustic_effect') || Assets.image('pool_base');
      ctx.restore();
      // 水面高光条
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
      if (m.state === 'gone') continue;
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
      // 僵尸 (行内按x排序: 靠左后画? 原版: x小的先画(靠后), x大的后画(在前))
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
        // 雾双层滚动
        ctx.drawImage(fog, 0, 0, fog.width, fog.height, fx, 70, w, 470);
        ctx.restore();
      }
    }
    // ---- 大波横幅 ----
    this.drawBanners(ctx, board);
  },

  drawSun(ctx, s, board) {
    const reanim = Assets.reanim ? null : null;
    // 用Sun.reanim
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
        case 'umbrella_bounce': {
          if (!e.anim) { e.anim = Assets.reanim('Umbrellaleaf'); }
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
      }
    }
  },

  drawBanners(ctx, board) {
    const drawCenterText = (txt, y, scale, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(38 * scale)}px "Noto Sans SC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = '#3a2a10';
      ctx.strokeText(txt, 400, y);
      const g = ctx.createLinearGradient(0, y - 30, 0, y + 10);
      g.addColorStop(0, '#ffe9a8'); g.addColorStop(1, '#e8a020');
      ctx.fillStyle = g;
      ctx.fillText(txt, 400, y);
      ctx.restore();
    };
    if (board.hugeWaveBanner > 0) {
      const p = board.hugeWaveBanner;
      const s = p > 2.8 ? (3.2 - p) * 5 : Math.min(1, p * 1.2);
      drawCenterText('一大波僵尸正在接近！', 260, Math.max(0.01, s), Math.min(1, p));
    }
    if (board.finalWaveBanner > 0) {
      const p = board.finalWaveBanner;
      const s = p > 2.8 ? (3.2 - p) * 5 : Math.min(1, p * 1.2);
      drawCenterText('最后一波！', 260, Math.max(0.01, s), Math.min(1, p));
    }
  },

  // 僵尸绘制 (在 zombies.js 的 draw 调用)
  drawZombie(ctx, z, board) {
    if (z.dead) return;
    const rowTop = board.gridY(z.row);
    // 死亡沉没
    let dy = 0;
    if (z.phase === 'dying') dy = Math.min(40, z.dyingT * 60);
    const oy = Z_OFF_Y + (1 - z.scale) * 120 + z.altitude * 0 - z.altitude + dy;
    z.anim.x = z.x + Z_OFF_X;
    z.anim.y = rowTop + oy;
    // 冻结变蓝
    if (z.frozen > 0) z.anim.color = [0.65, 0.85, 1, 1];
    else if (z.chilled > 0) z.anim.color = [0.75, 0.92, 1, 1];
    else z.anim.color = null;
    // 受击闪白
    if (z.flash > 0) {
      ctx.save();
      ctx.filter = 'brightness(2.4)';
      z.anim.draw(ctx);
      ctx.restore();
    } else {
      z.anim.draw(ctx);
    }
    // 黄油定身特效
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
