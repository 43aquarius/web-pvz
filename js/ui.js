// ============================================================
// ui.js — HUD / 种子银行 / 选卡 / 图鉴
// 原版布局 (PvZ-Portable Board.cpp / SeedPacket.cpp / SeedChooserScreen.cpp):
//   SeedBank(0,0) 446x87 + 扩展 | 阳光计数 (34,78)
//   卡包: ≤7张 x=i*59+85 | 8张 x=i*54+81 | 9张 x=i*52+80 | 10张 x=i*51+79 (50x70)
//   铲子槽 (extra+456, 0) | FlagMeter(600,575) | 石质菜单按钮 (681,-10,117,46)
//   选卡: SeedChooser_Background(0,87) 网格 col*53+22 row*73+128 | 开始按钮(154,545)
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, MUSHROOMS, UPGRADES, availablePlants, STR } = require('./data');
const RE = require('./reanim');

// 原版 SeedPacketDrawSeed 每植物缩放/偏移表 (aScale, aOffsetX, aOffsetY)
const SEED_DRAW_TABLE = {
  TALLNUT: [0.3, 12, 22], COFFEEBEAN: [0.55, 0, 9], COBCANNON: [0.26, 6, 22],
  CACTUS: [0.5, 9, 13], POTATOMINE: [0.4, 8, 12], MAGNETSHROOM: [0.5, 5, 12],
  FUMESHROOM: [0.4, 8, 12], PUMPKIN: [0.4, 8, 12], CHOMPER: [0.4, 8, 12],
  DOOMSHROOM: [0.4, 8, 12], SQUASH: [0.4, 8, 12], HYPNOSHROOM: [0.4, 8, 12],
  SPIKEWEED: [0.4, 8, 12], SPIKEROCK: [0.4, 8, 12], PLANTERN: [0.4, 8, 12],
  TORCHWOOD: [0.4, 8, 12], TANGLEKELP: [0.4, 8, 12],
  TWINSUNFLOWER: [0.45, 7, 14], GLOOMSHROOM: [0.45, 7, 14],
  CATTAIL: [0.45, 5, 10], KERNELPULT: [0.4, 13, 14], CABBAGEPULT: [0.4, 15, 14],
  MELONPULT: [0.35, 18, 19], WINTERMELON: [0.35, 18, 19],
  GRAVEBUSTER: [0.4, 10, 15], SPLITPEA: [0.45, 12, 12], BLOVER: [0.4, 8, 17],
  STARFRUIT: [0.5, 6, 8], THREEPEATER: [0.5, 5, 10], GATLINGPEA: [0.5, 2, 8],
};

// 原版 SeedPacketDrawSeed 每植物缩放 (aScale)
function scaleOf(type) {
  const e = SEED_DRAW_TABLE[type];
  return e ? e[0] : 0.5;
}

const UI = {
  init(game) {
    this.game = game;
    this.cardThumbs = new Map();   // 植物名 -> canvas缩略图 (已含缩放, 50x70 内)
    this.sunPulse = 0;
    this.hoverCard = -1;
    this.selectedCard = -1;
    this.seedFlash = 0;
  },

  // ---------- 植物缩略图 (原版 SeedPacketDrawSeed: reanim 首帧, 按植物缩放偏移) ----------
  getThumb(type) {
    if (this.cardThumbs.has(type)) return this.cardThumbs.get(type);
    const def = PLANTS[type];
    const cv = document.createElement('canvas');
    cv.width = 50; cv.height = 70;
    const c = cv.getContext('2d');
    try {
      const layerList = def.layers || [[def.anim || 'anim_idle']];
      const layers = layerList.map(([layerAnim]) => {
        const r = Assets.reanim(def.reanim);
        r.play(layerAnim, RE.LOOP, 12);
        return r;
      });
      for (const r of layers) r.animTime = 0.15;
      // 头部挂载到身体轨道 (原版 AttachToAnotherReanimation, 与 Plant 构造一致)
      if (layers.length > 1) {
        const body = layers[0];
        if (type === 'THREEPEATER') {
          ['anim_head1', 'anim_head2', 'anim_head3'].forEach((tr, i) => {
            const L = layers[1 + i];
            if (L && body.trackExists(tr)) body.attachToTrack(tr, L);
          });
        } else if (type === 'SPLITPEA') {
          // 裂荚: 前头挂 anim_idle, 后头挂 anim_idle (原版双头都挂 anim_idle)
          for (const L of layers.slice(1)) body.attachToTrack('anim_idle', L);
        } else {
          const track = body.trackExists('anim_stem') ? 'anim_stem'
            : body.trackExists('anim_idle') ? 'anim_idle' : null;
          if (track) for (const L of layers.slice(1)) body.attachToTrack(track, L);
        }
      }
      // 像素级包围盒 (probe: 植物原点置于 (150,150), 含挂载头)
      const body = layers[0];
      body.setPosition(150, 150);
      body.refreshAttachments();
      const probe = document.createElement('canvas');
      probe.width = 300; probe.height = 300;
      const pc = probe.getContext('2d');
      body.draw(pc);
      const d = pc.getImageData(0, 0, 300, 300).data;
      let minX = 999, minY = 999, maxX = -999, maxY = -999;
      for (let y = 0; y < 300; y++) {
        for (let x = 0; x < 300; x++) {
          if (d[(y * 300 + x) * 4 + 3] > 12) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) { minX = 150; minY = 150; maxX = 210; maxY = 220; }
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      let fit = Math.min(scaleOf(type), 44 / bw, 52 / bh);
      if (!isFinite(fit) || fit <= 0) fit = scaleOf(type);
      // 包围盒中心相对植物原点的偏移 (probe 原点在 150,150)
      const cx0 = (minX + maxX) / 2 - 150, cy0 = (minY + maxY) / 2 - 150;
      // 视觉中心对到卡包中心 (25, 33) — 定位后再刷新附件 (头跟随身体矩阵)
      body.setPosition(25 - cx0 * fit, 30 - cy0 * fit + 3);
      body.overrideScale(fit, fit);
      body.refreshAttachments();
      body.animTime = 0.15;
      body.draw(c);
    } catch (e) { console.warn('缩略图失败', type, e); }
    this.cardThumbs.set(type, cv);
    return cv;
  },

  // ---------- 种子卡绘制 (原版 DrawSeedPacket) ----------
  drawSeedCard(ctx, type, x, y, opts = {}) {
    const def = PLANTS[type];
    const w = 50, h = 70;
    // 包底: seeds.png 9 槽 cel (0=模仿者 1=升级 2=普通 ...)
    const seeds = Assets.image('seeds');
    const cel = UPGRADES.has(type) ? 1 : 2;
    if (seeds) {
      ctx.drawImage(seeds, cel * 50, 0, 50, 70, x, y, w, h);
    } else {
      ctx.fillStyle = '#c9a86b'; ctx.fillRect(x, y, w, h);
    }
    // 缩略图
    const thumb = this.getThumb(type);
    if (thumb) ctx.drawImage(thumb, x, y, w, h);
    // 费用 (原版: 黑色, 包底部)
    ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(String(def.cost), x + 25 + 1, y + h - 8);
    // 冷却遮罩 (原版: 从顶部往下变暗, 深灰64)
    if (opts.cooldown > 0) {
      const cd = opts.cooldown / (def.cd / 1000);
      const dh = Math.round(68 * cd) + 2;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgb(64,64,64)';
      ctx.fillRect(x, y, w, Math.min(h, dh));
      ctx.restore();
    }
    // 不可用 (原版: 灰度 128)
    if (opts.disabled) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgb(80,80,80)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    // 选中高亮
    if (opts.selected) {
      ctx.save();
      ctx.strokeStyle = '#ffef7a'; ctx.lineWidth = 3;
      ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
      ctx.restore();
    }
  },

  // ---------- 原版卡包位置 (Board::GetSeedPacketPositionX) ----------
  packetX(i, n) {
    if (n <= 7) return i * 59 + 85;
    if (n === 8) return i * 54 + 81;
    if (n === 9) return i * 52 + 80;
    return i * 51 + 79;
  },
  seedBankExtraWidth(n) {
    return n <= 6 ? 0 : n === 7 ? 60 : n === 8 ? 76 : n === 9 ? 112 : 153;
  },

  // ---------- 游戏内HUD (原版布局) ----------
  drawGameHUD(ctx, board) {
    const game = this.game;
    const Cutscene = require('./cutscene').Cutscene;
    const cs = Cutscene;
    const nCards = board.seedCards.length;
    // ---- 传送带种子银行 (原版: 传送带背景 + 卡片滚动, 无阳光计数) ----
    if (board.mode === 'conveyor' && board.belt) {
      const bankY = cs.active ? cs.seedBankY : 0;
      if (bankY > -87) {
        // 传送带底 (原版 conveyorbelt.png 平铺)
        const belt = Assets.image('conveyorbelt.png');
        ctx.save();
        if (belt) {
          // 滚动的带面
          const scroll = Math.floor(board.time * board.belt.speed) % belt.width;
          ctx.drawImage(belt, 0, 0, belt.width, 87, -scroll, bankY, belt.width, 87);
          ctx.drawImage(belt, 0, 0, belt.width, 87, -scroll + belt.width, bankY, belt.width, 87);
          ctx.drawImage(belt, 0, 0, belt.width, 87, -scroll + belt.width * 2, bankY, belt.width, 87);
        } else {
          ctx.fillStyle = '#6a5232';
          ctx.fillRect(0, bankY, 800, 87);
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          const sc = Math.floor(board.time * 40) % 24;
          for (let x = -24; x < 820; x += 24) ctx.fillRect(x + sc, bankY + 12, 12, 62);
        }
        ctx.restore();
        // 带上卡片 (滚动)
        for (const it of board.belt.items) {
          ctx.save();
          this.drawSeedCard(ctx, it.type, it.x, 7 + bankY, {});
          ctx.restore();
        }
        // 持卡: 跟随鼠标 (原版: 拿起的卡贴在光标上, 点草坪种植) — 由 drawPreview 绘制
      }
      // 进度条 + 菜单按钮
      this.drawProgressBar(ctx, board);
      this.drawStoneButton(ctx, 681, -10, 117, 46, '菜 单', 18);
      this.drawLevelText(ctx, board);
      return;
    }
    // ---- 无种子银行模式 (打僵尸/罐子/我不是僵尸) ----
    if (board.mode === 'whack' || board.mode === 'vasebreaker' || board.mode === 'izombie') {
      this.drawProgressBar(ctx, board);
      this.drawStoneButton(ctx, 681, -10, 117, 46, '菜 单', 18);
      this.drawLevelText(ctx, board);
      if (board.state === 'intro' && !cs.active) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, board.waveTimer);
        ctx.font = 'bold 40px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = '#3a2a10';
        const t = Math.ceil(board.waveTimer);
        const txt = t > 2 ? '准备！' : '僵尸来了！';
        ctx.strokeText(txt, 400, 250);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(txt, 400, 250);
        ctx.restore();
      }
      return;
    }
    // ---- 雨天种子: 无常规银行 (持有卡由 drawModeOverlay 绘制) ----
    if (board.mode === 'raining') {
      this.drawProgressBar(ctx, board);
      this.drawStoneButton(ctx, 681, -10, 117, 46, '菜 单', 18);
      this.drawLevelText(ctx, board);
      // 阳光计数 (右上小字)
      ctx.save();
      ctx.font = 'bold 17px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,0,0.8)';
      ctx.strokeText('阳光 ' + board.sun, 14, 110);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('阳光 ' + board.sun, 14, 110);
      ctx.restore();
      return;
    }
    // ---- 常规: 种子银行 (原版 SeedBank::Draw) ----
    const bankY = cs.active ? cs.seedBankY : 0;
    if (bankY > -87) {
      const bank = Assets.image('seedbank.png');
      const extra = this.seedBankExtraWidth(nCards);
      if (bank) {
        ctx.drawImage(bank, 0, 0, 446, 87, 0, bankY, 446, 87);
        if (extra > 0) {
          // 原版: 尾部 12px 拉伸扩展
          ctx.drawImage(bank, 446 - 12, 0, 12, 87, 446 - 12, bankY, extra + 12, 87);
        }
      } else {
        ctx.fillStyle = '#8a6642'; ctx.fillRect(0, bankY, 446 + extra, 87);
      }
      // ---- 阳光计数 (原版: seedbank 自带太阳图, 文本 (34,78) 黑色) ----
      const sunTxt = String(Math.max(0, board.sun));
      ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      const red = board._outOfSun > 0 && (Math.floor(board.time * 4) % 2 === 0);
      ctx.fillStyle = red ? '#c00' : '#000';
      ctx.fillText(sunTxt, 34, bankY + 78);
      // ---- 卡包 ----
      for (let i = 0; i < nCards; i++) {
        const c = board.seedCards[i];
        const x = this.packetX(i, nCards), y = 7 + bankY;
        this.drawSeedCard(ctx, c.type, x, y, {
          cooldown: c.cd,
          disabled: board.sun < PLANTS[c.type].cost || c.cd > 0,
          selected: game.selectedCard === i,
        });
      }
      // ---- 铲子槽 (原版: (extra+456, 0) 70x72; 1-4 关无铲子, 1-5 戴夫赠送) ----
      if (game.shovelUnlocked) {
        const shovelBank = Assets.image('shovelbank.png');
        const shX = extra + 456;
        if (shovelBank) ctx.drawImage(shovelBank, shX, bankY);
        else { ctx.fillStyle = '#8a6642'; ctx.fillRect(shX, bankY, 70, 72); }
        const shovel = Assets.image('shovel.png');
        if (shovel && !game.shovelMode) ctx.drawImage(shovel, shX + 4, bankY + 4);
        if (game.shovelMode) {
          ctx.strokeStyle = '#ffef7a'; ctx.lineWidth = 3;
          ctx.strokeRect(shX - 2, bankY - 2, 74, 76);
        }
      }
    }
    // ---- 进度条 (原版 DrawProgressMeter: FlagMeter@600,575) ----
    this.drawProgressBar(ctx, board);
    // ---- 菜单按钮 (原版石质按钮 681,-10 117x46) ----
    this.drawStoneButton(ctx, 681, -10, 117, 46, '菜 单', 18);
    // ---- 关卡文字 (原版 DrawLevel: (593,595) 右对齐 土黄) ----
    this.drawLevelText(ctx, board);
    // ---- 开场提示 (过渡期间) ----
    if (board.state === 'intro' && !cs.active) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, board.waveTimer);
      ctx.font = 'bold 40px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = '#3a2a10';
      const t = Math.ceil(board.waveTimer);
      const txt = t > 2 ? '准备种植！' : '僵尸来了！';
      ctx.strokeText(txt, 400, 250);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(txt, 400, 250);
      ctx.restore();
    }
  },

  // ---- 关卡文字 (原版 DrawLevel) ----
  drawLevelText(ctx, board) {
    ctx.save();
    ctx.font = '16px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e0bb62';
    ctx.fillText(`关卡 ${board.level.label}`, 593, 595);
    ctx.restore();
  },

  // ---- 石质按钮 (原版 button_left/middle/right 三段拉伸) ----
  drawStoneButton(ctx, x, y, w, h, label, fontSize) {
    const bl = Assets.image('button_left.png');
    const bm = Assets.image('button_middle.png');
    const br = Assets.image('button_right.png');
    if (bl && bm && br) {
      ctx.drawImage(bl, x, y, 36, h);
      ctx.drawImage(bm, x + 36, y, w - 36 - 35, h);
      ctx.drawImage(br, x + w - 35, y, 35, h);
      if (label) {
        ctx.save();
        ctx.font = `bold ${fontSize}px "Noto Sans SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(label, x + w / 2, y + h / 2 + fontSize * 0.35);
        ctx.fillStyle = '#f8ecd0';
        ctx.fillText(label, x + w / 2, y + h / 2 + fontSize * 0.35);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = 'rgba(70,50,25,0.9)';
      ctx.fillRect(x, y, w, h);
    }
  },

  // ---- 进度条 (原版 DrawProgressMeter 完整移植) ----
  drawProgressBar(ctx, board) {
    if (board.level.id === 1 && board.game.progress.unlocked <= 1) return; // 原版: 1-1首次无进度条
    const fm = Assets.image('flagmeter.png');
    const parts = Assets.image('flagmeterparts.png');
    const levelLabel = Assets.image('flagmeterlevelprogress.png');
    const celW = 158, celH = 27;
    // 底条 (cell 0)
    if (fm) ctx.drawImage(fm, 0, 0, celW, celH, 600, 575, celW, celH);
    // 进度填充 (cell 1 从右揭示, 原版 aClipWidth 0..143)
    const total = board.totalWaves;
    const cur = board.wave;
    // 原版 UpdateProgressMeterWidth: 波次+血量比例 → 此处用波次与计时近似
    let progress;
    if (cur >= total) progress = 150;
    else if (cur > 0) {
      const per = 150 / Math.max(1, total - 1);
      const inWave = 1 - Math.max(0, board.waveTimer) / Math.max(0.1, board._waveTimerStart || 20);
      progress = Math.min(150, (cur - 1) * per + per * clamp01(inWave));
    } else progress = 0;
    const clip = Math.round(progress / 150 * 143);
    if (fm && clip > 0) {
      const srcX = celW - clip - 7;
      ctx.drawImage(fm, srcX, celH, clip, celH, celW - clip + 593, 575, clip, celH);
    }
    // 旗帜 (原版: 每10波1旗, 波次到达时升起)
    if (fm && total >= 10) {
      const perFlag = total >= 10 ? 10 : total;
      const nFlagWaves = Math.floor(total / perFlag);
      const flagsPosEnd = 590 + celW;
      for (let fw = 1; fw <= nFlagWaves; fw++) {
        let height = 0;
        const totalWavesAtFlag = fw * perFlag;
        if (totalWavesAtFlag < cur) height = 14;
        else if (totalWavesAtFlag === cur) height = 14; // 简化: 立即升起
        const fx = Math.round(flagsPosEnd + (606 - flagsPosEnd) * (totalWavesAtFlag / total));
        if (parts) {
          ctx.drawImage(parts, 25, 0, 25, 25, fx, 571, 25, 25);            // 旗杆 (cel 1)
          ctx.drawImage(parts, 50, 0, 25, 25, fx, 572 - height, 25, 25);   // 旗头 (cel 2)
        }
      }
    }
    // 等级标签 (原版 FlagMeterLevelProgress @638,589)
    if (levelLabel) ctx.drawImage(levelLabel, 638, 589);
    // 僵尸头进度标记 (原版 cel 0, 580+158-progress)
    if (parts) {
      const headProgress = Math.round(progress / 150 * 135);
      ctx.drawImage(parts, 0, 0, 25, 25, celW - headProgress + 580, 572, 25, 25);
    }
  },

  // ---------- 选卡界面 (原版 SeedChooserScreen: 原版素材 + 滑入滑出) ----------
  drawSeedChooser(ctx, board) {
    const game = this.game;
    const Cutscene = require('./cutscene').Cutscene;
    const yOff = Cutscene.active ? Cutscene.chooserY : 0;
    if (yOff >= 516) return;
    ctx.save();
    ctx.translate(0, yOff);
    // 背景 (原版: SeedChooser_Background @ (0,87))
    const bg = Assets.image('seedchooser_background.png');
    if (bg) ctx.drawImage(bg, 0, 87);
    else { ctx.fillStyle = '#4a3720'; ctx.fillRect(0, 87, 465, 513); }
    // 标题 (原版: (229,110) 居中)
    ctx.font = 'bold 19px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeText('选择你的植物', 229, 110);
    ctx.fillStyle = '#fff';
    ctx.fillText('选择你的植物', 229, 110);
    // 卡槽数提示
    ctx.font = '13px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#e8d9b5';
    ctx.fillText(`已选 ${board.chosenSeeds.length}/${board.seedSlots}`, 229, 126);
    // 植物网格 (原版: col*53+22, row*73+128, 8列)
    const pool = availablePlants(game.levelId, game.purchasedSet);
    pool.forEach((type, i) => {
      const gx = (i % 8) * 53 + 22;
      const gy = Math.floor(i / 8) * 73 + 128;
      const chosen = board.chosenSeeds.includes(type);
      this.drawSeedCard(ctx, type, gx, gy, { selected: chosen });
    });
    // 已选卡提示: 选中后卡包变暗 (原版 SEED_IN_BANK 状态 → 灰度55)
    pool.forEach((type, i) => {
      if (!board.chosenSeeds.includes(type)) return;
      const gx = (i % 8) * 53 + 22;
      const gy = Math.floor(i / 8) * 73 + 128;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgb(60,60,60)';
      ctx.fillRect(gx, gy, 50, 70);
      ctx.restore();
    });
    // 开始按钮 (原版 SeedChooser_Button @ (154,545) 156x42 "让我们摇滚吧!")
    const startBtn = Assets.image('seedchooser_button.png');
    const canStart = board.chosenSeeds.length > 0;
    if (startBtn) {
      ctx.drawImage(startBtn, 154, 545, 156, 42);
      ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = canStart ? '#fff' : '#999';
      ctx.fillText('让我们摇滚吧!', 232, 571);
    }
    // 随机按钮 (原版: (332,546) 100x30)
    ctx.save();
    ctx.font = '13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('随机选择', 382, 566);
    ctx.restore();
    ctx.restore();
  },

  // ---------- 主菜单 (由 screens.js 的 reanim 版实现) ----------
  drawMenu(ctx) {},

  // ---------- 游戏内菜单对话框 (原版 DoNewOptions: 暂停+按钮) ----------
  drawMenuDialog(ctx, game) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 800, 600);
    // 对话框底
    const dlg = Assets.image('option_dialog.png');
    const dx = 185, dy = 140, dw = 430, dh = 380;
    if (dlg) ctx.drawImage(dlg, dx, dy, dw, dh);
    else {
      const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
      g.addColorStop(0, '#e8d5a8'); g.addColorStop(1, '#c8ab72');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 14); ctx.fill();
      ctx.strokeStyle = '#7a5222'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.font = 'bold 32px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#4a2f10';
    ctx.fillText('菜 单', 400, dy + 58);
    ctx.font = '15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#6a4a20';
    ctx.fillText('游戏已暂停', 400, dy + 84);
    // 按钮 (game.menuDialogButtons)
    const m = game.mouse;
    for (const b of game.menuDialogButtons()) {
      const hov = m && m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;
      ctx.save();
      const g2 = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      if (b.k === 'resume') { g2.addColorStop(0, '#7ac83c'); g2.addColorStop(1, '#4a9418'); }
      else if (b.k === 'mainmenu') { g2.addColorStop(0, '#c86a3c'); g2.addColorStop(1, '#944018'); }
      else { g2.addColorStop(0, hov ? '#b9955c' : '#a8804a'); g2.addColorStop(1, hov ? '#8a6a38' : '#6a4a24'); }
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(40,25,5,0.7)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = 'bold 21px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 7);
      ctx.restore();
    }
    ctx.restore();
  },

  // ---------- 特殊模式叠加层 (罐子/我不是僵尸卡/雨天种子/传送带) ----------
  drawModeOverlay(ctx, board) {
    if (!board || !board.mode) return;
    const game = this.game;
    switch (board.mode) {
      case 'vasebreaker': {
        // 罐子 (原版外观: 绿罐+问号=植物 / 棕罐+鬼脸=僵尸)
        for (const v of board.vases) {
          if (v.broken) continue;
          const x = board.gridX(v.col), y = board.cellY(v.row, v.col);
          ctx.save();
          const isPlant = v.isPlant;
          // 罐体 (陶罐轮廓, 底部锚定格中)
          const bx = x + 40, by = y + 16;   // 罐口中心
          const g = ctx.createLinearGradient(bx - 30, by, bx + 30, by + 74);
          if (isPlant) { g.addColorStop(0, '#9ac85a'); g.addColorStop(0.5, '#6a9a3a'); g.addColorStop(1, '#4a7a24'); }
          else { g.addColorStop(0, '#c89a5a'); g.addColorStop(0.5, '#a8743a'); g.addColorStop(1, '#8a5a2a'); }
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(bx - 20, by);
          ctx.quadraticCurveTo(bx - 32, by + 34, bx - 24, by + 54);
          ctx.quadraticCurveTo(bx - 18, by + 72, bx, by + 74);
          ctx.quadraticCurveTo(bx + 18, by + 72, bx + 24, by + 54);
          ctx.quadraticCurveTo(bx + 32, by + 34, bx + 20, by);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = isPlant ? '#2a4a12' : '#5a3a16'; ctx.lineWidth = 2.5; ctx.stroke();
          // 罐口
          ctx.fillStyle = isPlant ? '#3a5a1a' : '#7a4e22';
          ctx.beginPath(); ctx.ellipse(bx, by, 21, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = isPlant ? '#2a4a12' : '#5a3a16'; ctx.stroke();
          // 高光
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(bx - 12, by + 26, 6, 15, -0.2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          // 标识: 植物罐 = 白色问号; 僵尸罐 = 涂鸦鬼脸 (原版字迹)
          if (isPlant) {
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.font = 'bold 30px "Noto Sans SC", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('?', bx, by + 48);
          } else {
            ctx.strokeStyle = 'rgba(40,24,10,0.8)';
            ctx.lineWidth = 2.4;
            // 鬼脸 (两个X眼 + 锯齿嘴)
            for (const ex of [-10, 10]) {
              ctx.beginPath();
              ctx.moveTo(bx + ex - 5, by + 28); ctx.lineTo(bx + ex + 5, by + 38);
              ctx.moveTo(bx + ex + 5, by + 28); ctx.lineTo(bx + ex - 5, by + 38);
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(bx - 12, by + 52);
            for (let k = 0; k < 5; k++) ctx.lineTo(bx - 12 + (k + 1) * 6, by + 52 + (k % 2 ? -6 : 0));
            ctx.stroke();
          }
          ctx.restore();
        }
        break;
      }
      case 'izombie': {
        // 僵尸卡银行 (顶部, 原版 SeedBank 风格)
        ctx.save();
        ctx.fillStyle = 'rgba(30,20,8,0.82)';
        ctx.beginPath(); ctx.roundRect(8, 2, 9 * 100 + 8, 80, 10); ctx.fill();
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3; ctx.stroke();
        board.zombieCards.forEach((card, i) => {
          const x = 20 + i * 100;
          const sel = game.selectedZombieCard === i;
          const afford = board.sun >= card.cost;
          ctx.save();
          if (!afford) ctx.globalAlpha = 0.45;
          ctx.fillStyle = sel ? '#c8a028' : '#6a5a3a';
          ctx.beginPath(); ctx.roundRect(x, 8, 90, 66, 8); ctx.fill();
          ctx.strokeStyle = sel ? '#ffe9a8' : '#3a2f1a'; ctx.lineWidth = 2.5; ctx.stroke();
          // 僵尸头像 (缩略图)
          const th = this.getZombieThumb(card.type);
          if (th) ctx.drawImage(th, x + 8, 10, 56, 48);
          ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
          ctx.fillText(String(card.cost), x + 78, 62);
          ctx.restore();
        });
        // 脑子计数 (原版: brain 图标 + 数字, 红褐色)
        const brainImg = Assets.image('brain.png');
        ctx.fillStyle = 'rgba(30,20,8,0.82)';
        ctx.beginPath(); ctx.roundRect(560, 8, 170, 62, 10); ctx.fill();
        if (brainImg) ctx.drawImage(brainImg, 572, 16, 46, 40);
        ctx.font = 'bold 24px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'left'; ctx.fillStyle = '#ffb8a8';
        ctx.fillText(String(board.sun), 632, 52);
        ctx.restore();
        // 红线 (原版: 僵尸不能种到红线左边; 植物区右边界)
        const lineX = board.gridX((board.izLineCol || 4) + 1) - 6;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#e83828';
        ctx.lineWidth = 4;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(lineX, 130);
        ctx.lineTo(lineX, 560);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // 提示 (原版 ADVICE_I_ZOMBIE 语义)
        ctx.save();
        ctx.font = '13px "Noto Sans SC", sans-serif';
        ctx.fillStyle = 'rgba(255,233,168,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText('选僵尸卡 → 点击红线右侧放置 · 僵尸走到最左边吃到脑子就赢了!', 400, 112);
        ctx.restore();
        break;
      }
      case 'raining': {
        // 掉落中的种子包
        for (const c of board.rainCards) {
          ctx.save();
          const x = c.x, y = c.y;
          ctx.globalAlpha = 0.9;
          // 降落伞风格下落
          this.drawSeedCard(ctx, c.type, x - 25, y - 35, {});
          // 阴影
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(x, y + 40, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // 持有卡 (顶部)
        board.heldCards.forEach((h, i) => {
          const x = 130 + i * 60;
          const sel = game.selectedCard === i;
          ctx.save();
          this.drawSeedCard(ctx, h.type, x, 6, { selected: sel });
          // 剩余时间条
          const p = Math.max(0, Math.min(1, h.life / 14));
          ctx.fillStyle = 'rgba(255,80,80,0.85)';
          ctx.fillRect(x, 76 - 4 * p, 50, 4);
          ctx.restore();
        });
        break;
      }
      case 'whack': {
        // 分数
        ctx.save();
        ctx.font = 'bold 20px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,0,0.8)';
        ctx.strokeText(`击杀 ${board.whackScore || 0} / 30`, 400, 120);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(`击杀 ${board.whackScore || 0} / 30`, 400, 120);
        ctx.restore();
        break;
      }
    }
  },

  // ---------- 图鉴 (原版 Suburban Almanac: 索引页 → 详情页) ----------
  // 官方文案解析: {SHORTLINE}=分隔线 {KEYWORD}=标签 {STAT}=数值 {FLAVOR}=故事
  parseAlmanacText(ctx, text, x, y, maxW) {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    let cy = y;
    ctx.textAlign = 'left';
    for (const raw of lines) {
      let line = raw;
      if (line.includes('{SHORTLINE}')) {
        // 分隔线
        ctx.save();
        ctx.strokeStyle = 'rgba(90,60,20,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, cy - 8); ctx.lineTo(x + maxW, cy - 8); ctx.stroke();
        ctx.restore();
        line = line.replace(/\{SHORTLINE\}/g, '');
        if (!line.trim()) { cy += 10; continue; }
      }
      // 分段绘制 KEYWORD/STAT/FLAVOR (不同颜色)
      const parts = line.split(/(\{KEYWORD\}|\{STAT\}|\{FLAVOR\})/).filter(s => s !== '');
      let px = x;
      for (const part of parts) {
        if (part === '{KEYWORD}') { ctx.fillStyle = '#7a5a20'; ctx.font = 'bold 15px "Noto Sans SC", sans-serif'; }
        else if (part === '{STAT}') { ctx.fillStyle = '#2a4a7a'; ctx.font = 'bold 15px "Noto Sans SC", sans-serif'; }
        else if (part === '{FLAVOR}') { ctx.fillStyle = '#5a4a2a'; ctx.font = 'italic 14px "Noto Sans SC", sans-serif'; }
        else if (part.trim()) {
          // 换行支持
          const words = Array.from(part);
          let cur = '';
          for (const ch of words) {
            if (ctx.measureText(cur + ch).width > maxW - (px - x)) {
              ctx.fillText(cur, px, cy);
              cy += 22; px = x;
              cur = ch;
            } else cur += ch;
          }
          if (cur) { ctx.fillText(cur, px, cy); px += ctx.measureText(cur).width; }
          continue;
        }
        void part;
      }
      // 非 tag 内容为空则只画 tag 后文字 (上面已画)
      if (parts.every(s => /^\{[A-Z]+\}$/.test(s))) { }
      cy += 24;
    }
    return cy;
  },

  drawAlmanac(ctx) {
    const game = this.game;
    const a = game.almanac;
    const S = STR;
    const isPlant = a.tab === 'plants';
    // ---- 详情页 (原版: 选中后整页: 大图 + 名字 + 图鉴正文) ----
    if (a.selected) {
      const bg = Assets.image(isPlant ? 'almanac_plantback.jpg' : 'almanac_zombieback.jpg');
      if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
      else { ctx.fillStyle = '#e8d9b5'; ctx.fillRect(0, 0, 800, 600); }
      const def = isPlant ? PLANTS[a.selected] : ZOMBIES[a.selected];
      const str = isPlant ? (S.plants[a.selected] || {}) : (S.zombies[a.selected] || {});
      // 大图 (原版: 页面左侧大渲染)
      ctx.save();
      if (isPlant) {
        const th = this.getThumb(a.selected);
        if (th) ctx.drawImage(th, 52, 150, 190, 266);
      } else {
        const zt = this.getZombieThumb(a.selected);
        if (zt) ctx.drawImage(zt, 40, 160, 220, 195);
      }
      ctx.restore();
      // 名字 (原版: 顶部木牌风格)
      ctx.save();
      ctx.font = 'bold 34px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(60,36,10,0.9)'; ctx.lineJoin = 'round';
      const nm = str.cn || def.cn || a.selected;
      ctx.strokeText(nm, 420, 100);
      ctx.fillStyle = '#f8ecd0';
      ctx.fillText(nm, 420, 100);
      ctx.restore();
      // 图鉴头 (一句话描述)
      ctx.save();
      ctx.font = 'bold 17px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#4a2f10';
      this.wrapTextA(ctx, str.header || def.desc || '', 290, 150, 440, 24);
      ctx.restore();
      // 图鉴正文 (含属性/故事)
      ctx.save();
      ctx.font = '15px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#4a3418';
      this.parseAlmanacText(ctx, str.desc || '', 290, 230, 440);
      ctx.restore();
      // 数值补充 (无文案兜底)
      if (!str.desc) {
        ctx.save();
        ctx.font = '15px "Noto Sans SC", sans-serif';
        ctx.fillStyle = '#4a3418';
        const stats = isPlant
          ? `阳光: ${def.cost}   血量: ${def.hp}   冷却: ${(def.cd / 1000).toFixed(0)}s`
          : `血量: ${def.body}${def.helm ? ` + 护甲${def.helm}` : ''}${def.shield ? ` + 盾${def.shield}` : ''}`;
        ctx.fillText(stats, 290, 260);
        ctx.restore();
      }
      // 返回索引
      this.drawAlmanacBack(ctx, '返回图鉴', 400, 560);
      this.almanacBack = { x: 300, y: 535, w: 200, h: 44 };
      this.almanacTabs = null;
      this.almanacCells = null;
      return;
    }
    // ---- 索引页 (原版: ALMANAC_INDEXBACK + 网格) ----
    const bg = Assets.image('almanac_indexback.jpg');
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#e8d9b5'; ctx.fillRect(0, 0, 800, 600); }
    // 标题 (原版: 大图鉴)
    ctx.save();
    ctx.font = 'bold 40px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(60,36,10,0.9)'; ctx.lineJoin = 'round';
    const title = isPlant ? (S.misc.almanac_plants || '大图鉴 — 植物') : (S.misc.almanac_zombies || '大图鉴 — 僵尸');
    ctx.strokeText(title, 400, 66);
    ctx.fillStyle = '#f8ecd0';
    ctx.fillText(title, 400, 66);
    ctx.restore();
    // 标签切换 (原版: 书页翻角)
    ctx.save();
    ctx.fillStyle = isPlant ? 'rgba(120,170,70,0.95)' : 'rgba(150,90,60,0.6)';
    ctx.beginPath(); ctx.roundRect(290, 82, 100, 32, 8); ctx.fill();
    ctx.fillStyle = !isPlant ? 'rgba(150,90,60,0.95)' : 'rgba(120,170,70,0.6)';
    ctx.beginPath(); ctx.roundRect(410, 82, 100, 32, 8); ctx.fill();
    ctx.font = 'bold 16px "Noto Sans SC", sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('植物', 340, 104);
    ctx.fillText('僵尸', 460, 104);
    ctx.restore();
    this.almanacTabs = [{ x: 290, y: 82, w: 100, h: 32 }, { x: 410, y: 82, w: 100, h: 32 }];
    // 网格 (12列, 悬停放大)
    this.almanacCells = [];
    const entries = isPlant ? Object.keys(PLANTS) : Object.keys(ZOMBIES);
    const hovered = game.mouse;
    entries.forEach((key, i) => {
      const gx = 30 + (i % 12) * 62, gy = 130 + Math.floor(i / 12) * 90;
      const sel = a.selected === key;
      const hov = hovered && hovered.x >= gx && hovered.x <= gx + 56 && hovered.y >= gy && hovered.y <= gy + 84;
      this.almanacCells.push({ key, x: gx, y: gy, w: 56, h: 84 });
      ctx.save();
      if (hov || sel) {
        // 原版: 悬停格子亮起
        ctx.fillStyle = 'rgba(255,244,180,0.55)';
        ctx.beginPath(); ctx.roundRect(gx - 3, gy - 3, 62, 90, 6); ctx.fill();
      }
      if (isPlant) {
        ctx.save();
        ctx.beginPath(); ctx.rect(gx + 1, gy + 1, 54, 70); ctx.clip();
        const th = this.getThumb(key);
        if (th) ctx.drawImage(th, gx + 1, gy - 4, 54, 76);
        ctx.restore();
      } else {
        ctx.save();
        ctx.beginPath(); ctx.rect(gx + 1, gy + 1, 54, 70); ctx.clip();
        const r = this.getZombieThumb(key);
        if (r) ctx.drawImage(r, gx + 1, gy + 1, 54, 74);
        ctx.restore();
      }
      ctx.restore();
    });
    // 底部返回
    this.drawAlmanacBack(ctx, '返回主菜单', 400, 560);
    this.almanacBack = { x: 300, y: 535, w: 200, h: 44 };
  },

  drawAlmanacBack(ctx, label, x, y) {
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    ctx.beginPath(); ctx.roundRect(x - 100, y - 25, 200, 40, 8); ctx.fill();
    ctx.strokeStyle = '#6a1c1c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 17px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(label, x, y);
    ctx.restore();
  },

  wrapTextA(ctx, text, x, y, maxW, lineH) {
    const chars = Array.from(text || '');
    let cur = '', cy = y;
    for (const ch of chars) {
      if (ctx.measureText(cur + ch).width > maxW) { ctx.fillText(cur, x, cy); cy += lineH; cur = ch; }
      else cur += ch;
    }
    if (cur) ctx.fillText(cur, x, cy);
  },

  getZombieThumb(type) {
    if (!this._zThumbs) this._zThumbs = new Map();
    if (this._zThumbs.has(type)) return this._zThumbs.get(type);
    const def = ZOMBIES[type];
    const cv = document.createElement('canvas');
    cv.width = 90; cv.height = 80;
    const c = cv.getContext('2d');
    try {
      const r = Assets.reanim(def.reanim);
      const anim = type === 'POGO' ? 'anim_pogo' : type === 'POLEVAULTER' ? 'anim_walk' : 'anim_idle';
      r.play(anim, RE.LOOP, 12);
      if (type === 'CONE' || type === 'BUCKET' || type === 'DOOR' || type === 'DUCKY' || type === 'FLAG' || type === 'NORMAL') {
        r.showPrefix('anim_cone', false); r.showPrefix('anim_bucket', false); r.showPrefix('anim_screendoor', false);
        r.showPrefix('Zombie_flaghand', false); r.showPrefix('Zombie_duckytube', false);
        if (type === 'CONE') { r.showPrefix('anim_cone', true); r.setImageOverride('anim_cone', 'zombie_cone1'); }
        if (type === 'BUCKET') { r.showPrefix('anim_bucket', true); r.setImageOverride('anim_bucket', 'zombie_bucket1'); }
        if (type === 'DUCKY') r.showPrefix('Zombie_duckytube', true);
      }
      r.animTime = 0.4;
      let minX = 999, minY = 999, maxX = -999, maxY = -999;
      const ft = r.frameTime();
      for (let ti = 0; ti < r.def.tracks.length; ti++) {
        const t = r.curTransform(ti, ft);
        if (t.f < 0) continue;
        const idx = r.def.tracks[ti].IM[ft[0]];
        const key = idx >= 0 ? r.def.images[idx] : null;
        const img = key ? RE.resolveImage(key) : null;
        if (!img) continue;
        const w = img.width * t.sx, h = img.height * t.sy;
        minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + w); maxY = Math.max(maxY, t.y + h);
      }
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      const sc = Math.min(86 / bw, 76 / bh, 1);
      r.setPosition(45 - (minX + maxX) / 2 * sc, 40 - (minY + maxY) / 2 * sc);
      r.overrideScale(sc, sc);
      r.draw(c);
    } catch (e) { console.warn('僵尸缩略图失败', type, e); }
    this._zThumbs.set(type, cv);
    return cv;
  },

  // ---------- 暂停菜单 ----------
  drawPause(ctx, board) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 800, 600);
    const dlg = Assets.image('option_dialog.png');
    const dw = 380, dh = 260, dx = 210, dy = 170;
    if (dlg) ctx.drawImage(dlg, dx, dy, dw, dh);
    else { ctx.fillStyle = '#c8b28a'; ctx.fillRect(dx, dy, dw, dh); }
    ctx.font = 'bold 34px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a2f10';
    ctx.fillText('游戏已暂停', 400, dy + 62);
    ctx.font = '17px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#6a4a20';
    ctx.fillText('点击任意处继续', 400, dy + 120);
    ctx.fillText('按 Esc 或 P 键也可暂停', 400, dy + 150);
    ctx.restore();
  },
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

if (typeof module !== 'undefined') module.exports = { UI, roundRect };
