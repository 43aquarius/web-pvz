// ============================================================
// ui.js — HUD / 种子银行 / 选卡 / 图鉴
// 原版布局 (PvZ-Portable Board.cpp / SeedPacket.cpp / SeedChooserScreen.cpp):
//   SeedBank(0,0) 446x87 + 扩展 | 阳光计数 (34,78)
//   卡包: ≤7张 x=i*59+85 | 8张 x=i*54+81 | 9张 x=i*52+80 | 10张 x=i*51+79 (50x70)
//   铲子槽 (extra+456, 0) | FlagMeter(600,575) | 石质菜单按钮 (681,-10,117,46)
//   选卡: SeedChooser_Background(0,87) 网格 col*53+22 row*73+128 | 开始按钮(154,545)
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, MUSHROOMS, UPGRADES, availablePlants } = require('./data');
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
    // ---- 传送带种子银行 (原版 SeedBank::Draw: BACKDROP@83,0 + 6帧带面@90,63 + clip 90..591) ----
    if (board.mode === 'conveyor' && board.belt) {
      const bankY = cs.active ? cs.seedBankY : 0;
      if (bankY > -87) {
        const backdrop = Assets.image('conveyorbelt_backdrop.png');
        if (backdrop) {
          ctx.drawImage(backdrop, 83, bankY);
        } else {
          ctx.fillStyle = '#6a5232';
          ctx.fillRect(83, bankY, 516, 86);
        }
        // 带面: 6帧垂直条带 (502x96 → 每帧502x16), 原版 mConveyorBeltCounter/4 % 6
        const belt = Assets.image('conveyorbelt.png');
        if (belt) {
          const frame = Math.floor((board.belt.scroll || 0) / 4) % 6;
          ctx.save();
          ctx.beginPath();
          ctx.rect(90, bankY, 501, 87);
          ctx.clip();
          ctx.drawImage(belt, 0, frame * 16, belt.width, 16, 90, bankY + 63, 502, 16);
          ctx.restore();
        } else {
          ctx.fillStyle = '#4a3a20';
          ctx.fillRect(90, bankY + 63, 501, 16);
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          const sc = Math.floor(board.belt.scroll || 0) % 24;
          for (let x = 90; x < 591; x += 24) ctx.fillRect(x + sc, bankY + 63, 12, 16);
        }
        // 带上卡片 (原版: x = 91 + i*50 + offsetX, 裁剪到带区)
        ctx.save();
        ctx.beginPath();
        ctx.rect(90, bankY, 501, 87);
        ctx.clip();
        for (let i = 0; i < board.belt.items.length; i++) {
          const it = board.belt.items[i];
          const x = 91 + i * 50 + it.offset;
          ctx.save();
          this.drawSeedCard(ctx, it.type, x, 8 + bankY, {});
          ctx.restore();
        }
        ctx.restore();
        // 已取卡 (选中的那一张)
        if (game.selectedCard >= 0 && board.seedCards[0]) {
          ctx.save();
          this.drawSeedCard(ctx, board.seedCards[0].type, 20, 8 + bankY, { selected: true });
          ctx.restore();
        }
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
    // 原版 DoNewOptions: 暂停对话框 (dialog_bg 原版素材 + 石质按钮)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 800, 600);
    const dlg = Assets.image('dialog_bg.png');
    const dx = 175, dy = 92, dw = 450, dh = 432;
    if (dlg) {
      ctx.drawImage(dlg, dx, dy, dw, dh);
    } else {
      // 兜底: 分段九宫格 (dialog_* 素材)
      const tl = Assets.image('dialog_topleft.png');
      const tm = Assets.image('dialog_topmiddle.png');
      const hd = Assets.image('dialog_header.png');
      if (tl && tm) {
        ctx.drawImage(tl, dx, dy);
        ctx.drawImage(tm, dx + tl.width, dy, dw - tl.width * 2, tl.height);
        ctx.drawImage(Assets.image('dialog_topright.png'), dx + dw - tl.width, dy);
        ctx.drawImage(Assets.image('dialog_centerleft.png'), dx, dy + tl.height, tl.width, dh - tl.height * 2);
        ctx.drawImage(Assets.image('dialog_centermiddle.png'), dx + tl.width, dy + tl.height, dw - tl.width * 2, dh - tl.height * 2);
        ctx.drawImage(Assets.image('dialog_centerright.png'), dx + dw - tl.width, dy + tl.height, tl.width, dh - tl.height * 2);
        ctx.drawImage(Assets.image('dialog_bottomleft.png'), dx, dy + dh - tl.height);
        ctx.drawImage(Assets.image('dialog_bottommiddle.png'), dx + tl.width, dy + dh - tl.height, dw - tl.width * 2, tl.height);
        ctx.drawImage(Assets.image('dialog_bottomright.png'), dx + dw - tl.width, dy + dh - tl.height);
      } else {
        const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
        g.addColorStop(0, '#e8d5a8'); g.addColorStop(1, '#c8ab72');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 14); ctx.fill();
        ctx.strokeStyle = '#7a5222'; ctx.lineWidth = 4; ctx.stroke();
      }
    }
    // 标题 (原版 "游戏已暂停")
    ctx.font = 'bold 30px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#4a2f10';
    ctx.fillText('菜 单', 400, dy + 62);
    ctx.font = '15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#6a4a20';
    ctx.fillText('游戏已暂停', 400, dy + 88);
    // 按钮 (原版石质三段按钮: button_left/middle/right)
    const m = game.mouse;
    for (const b of game.menuDialogButtons()) {
      const hov = m && m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;
      ctx.save();
      if (hov) ctx.filter = 'brightness(1.25)';
      this.drawStoneButton(ctx, b.x, b.y, b.w, b.h, b.label, 20);
      if (hov) { ctx.filter = 'none'; }
      ctx.restore();
    }
    ctx.restore();
  },

  drawModeOverlay(ctx, board) {
    if (!board || !board.mode) return;
    const game = this.game;
    switch (board.mode) {
      case 'vasebreaker': {
        // 罐子 (原版 GridItem::DrawScaryPot: 三态列 0问号/1叶子/2僵尸, 行1正面, 位置 grid-5/-15)
        const pot = Assets.image('scary_pot.png');
        const shadow = Assets.image('plantshadow2.png') || Assets.image('plantshadow.png');
        for (const v of board.vases) {
          if (v.broken) continue;
          const x = board.gridX(v.col) - 5, y = board.cellY(v.row, v.col) - 15;
          // 影子 (原版 PLANTSHADOW2 ×1.3 @ x-5, y+72)
          if (shadow) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.drawImage(shadow, x - 5, y + 72, shadow.width * 1.3, shadow.height * 1.3);
            ctx.restore();
          }
          const col = v.state === 'leaf' ? 1 : v.state === 'zombie' ? 2 : 0;
          if (pot) {
            // 行1 = 正面完整罐 (80x100/格)
            ctx.drawImage(pot, col * 80, 100, 80, 100, x, y, 80, 100);
          } else {
            // 兜底: 程序化陶罐
            ctx.save();
            const g = ctx.createLinearGradient(x, y, x + 80, y + 90);
            g.addColorStop(0, '#c89a5a'); g.addColorStop(0.5, '#a8743a'); g.addColorStop(1, '#8a5a2a');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x + 18, y + 14);
            ctx.quadraticCurveTo(x + 8, y + 40, x + 14, y + 62);
            ctx.quadraticCurveTo(x + 18, y + 86, x + 40, y + 88);
            ctx.quadraticCurveTo(x + 62, y + 86, x + 66, y + 62);
            ctx.quadraticCurveTo(x + 72, y + 40, x + 62, y + 14);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#5a3a16'; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.restore();
          }
          // 叶子/僵尸态标记 (罐上符号, 原版烘焙在贴图中)
          if (pot && v.state !== 'question') {
            ctx.save();
            if (v.state === 'leaf') {
              // 叶子图标
              ctx.translate(x + 40, y + 40);
              ctx.fillStyle = 'rgba(46,94,20,0.9)';
              ctx.beginPath();
              ctx.ellipse(0, 0, 16, 9, -0.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = 'rgba(26,60,10,0.9)'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(14, -6); ctx.stroke();
            } else {
              // 僵尸脸图标
              ctx.translate(x + 40, y + 42);
              ctx.fillStyle = 'rgba(40,40,46,0.85)';
              ctx.beginPath(); ctx.ellipse(0, 0, 13, 15, 0, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = '#d8d8d0';
              ctx.beginPath(); ctx.arc(-5, -3, 2.5, 0, Math.PI * 2); ctx.arc(5, -3, 2.5, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#d8d8d0'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(-6, 5); ctx.lineTo(6, 5); ctx.stroke();
            }
            ctx.restore();
          }
        }
        // 锤子动画 (原版 STATECHALLENGE_SCARY_POTTER_MALLETING: Hammer.reanim)
        if (board.mallet && board.mallet.anim) {
          board.mallet.anim.draw(ctx);
        }
        // 可用种子包 (原版 COIN_USABLE_SEED_PACKET: 闪烁提示 + 剩余时间渐隐)
        for (const pk of board.vasePackets) {
          if (pk.taken) continue;
          ctx.save();
          const flash = pk.life < 3 ? (Math.sin(pk.t * 10) > 0 ? 0.4 : 1) : 1;
          ctx.globalAlpha = flash;
          this.drawSeedCard(ctx, pk.plant, pk.x - 25, pk.y - 35, {});
          ctx.restore();
        }
        break;
      }
      case 'izombie': {
        // 红线 (原版 Challenge::DrawBackdrop: IMAGE_WALLNUT_BOWLINGSTRIPE @ 352,73, IZ1-5=前4列)
        const stripe = Assets.image('wallnut_bowlingstripe.png');
        const lineX = 40 + board.izombieLimit * 80 - 8;
        if (stripe) {
          ctx.drawImage(stripe, lineX, 73);
        } else {
          ctx.save();
          ctx.fillStyle = 'rgba(216,48,40,0.85)';
          ctx.fillRect(lineX, 90, 6, 400);
          ctx.restore();
        }
        // 脑子 (原版 GRIDITEM_IZOMBIE_BRAIN: 每行最左)
        const brainImg = Assets.image('brain.png');
        for (const b of board.brains) {
          if (b.eaten) continue;
          const y = board.gridY(b.row) + 40;
          ctx.save();
          if (brainImg) {
            const bob = Math.sin(board.time * 2 + b.row) * 2;
            ctx.drawImage(brainImg, 12, y - 14 + bob, 34, 28);
          } else {
            ctx.fillStyle = '#e8a0b0';
            ctx.beginPath(); ctx.ellipse(28, y, 16, 12, 0, 0, Math.PI * 2); ctx.fill();
          }
          // 血量指示 (被啃食中)
          if (b.hp < 70) {
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#c04040';
            ctx.fillRect(14, y + 20, 30 * (b.hp / 70), 4);
          }
          ctx.restore();
        }
        // 僵尸卡银行 (原版 SeedBank + 僵尸卡)
        ctx.save();
        const bank = Assets.image('seedbank.png');
        const n = board.zombieCards.length;
        if (bank) {
          ctx.drawImage(bank, 0, 0, 446, 87, 0, 0, 246, 87);
        } else {
          ctx.fillStyle = '#8a6642';
          ctx.fillRect(0, 0, 246, 87);
        }
        // 阳光计数 (左上, 原版 (34,78))
        ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(String(board.sun), 34, 78);
        // 阳光图标
        const sunIcon = this.getSunIcon ? this.getSunIcon() : null;
        if (sunIcon) ctx.drawImage(sunIcon, 8, 18, 52, 52);
        board.zombieCards.forEach((card, i) => {
          const x = 62 + i * 60;
          const sel = game.selectedZombieCard === i;
          const afford = board.sun >= card.cost;
          ctx.save();
          // 卡底 (原版 seeds.png 种子包)
          const seeds = Assets.image('seeds.png');
          if (seeds) {
            ctx.drawImage(seeds, 0, 0, 50, 70, x, 8, 50, 70);
          } else {
            ctx.fillStyle = '#c9a86b';
            ctx.fillRect(x, 8, 50, 70);
          }
          // 僵尸头像
          const th = this.getZombieThumb(card.type);
          if (th) ctx.drawImage(th, x + 2, 12, 46, 44);
          // 价格 (黑字底部)
          ctx.font = 'bold 12px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000';
          ctx.fillText(String(card.cost), x + 25, 74);
          // 不可用变暗
          if (!afford) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = 'rgb(80,80,80)';
            ctx.fillRect(x, 8, 50, 70);
          }
          // 选中高亮
          if (sel) {
            ctx.strokeStyle = '#ffef7a'; ctx.lineWidth = 3;
            ctx.strokeRect(x - 1.5, 6.5, 53, 73);
          }
          ctx.restore();
        });
        // 吃脑进度 (原版 IZombieScoreBrain 进度条: 5脑)
        ctx.save();
        const eaten = board.brainsEaten || 0;
        ctx.font = 'bold 14px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'left';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,0,0.8)';
        const label = `脑子 ${eaten} / 5`;
        ctx.strokeText(label, 260, 30);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(label, 260, 30);
        for (let i = 0; i < 5; i++) {
          const bx = 260 + i * 26;
          ctx.beginPath();
          ctx.arc(bx + 8, 48, 9, 0, Math.PI * 2);
          if (i < eaten) { ctx.fillStyle = '#ff8a9a'; ctx.fill(); }
          else { ctx.strokeStyle = 'rgba(255,233,168,0.7)'; ctx.lineWidth = 2; ctx.stroke(); }
        }
        ctx.restore();
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

  // ---------- 图鉴 (原版 Almanac 布局) ----------
  // Screens 延迟引用 (加载顺序: ui 先于 screens)
  _screens() {
    const m = (window.__mods && window.__mods['screens']) || (typeof require !== 'undefined' && require('./screens'));
    return m && m.Screens;
  },
  // ---------- 图鉴 (原版 AlmanacDialog: 三页 索引/植物/僵尸) ----------
  // 数据键映射 (我们的键 → almanac_data.json 键)
  ALMANAC_PLANT_KEY: {
    PEASHOOTER: 'PeaShooterSingle', SUNFLOWER: 'SunFlower', CHERRYBOMB: 'CherryBomb', WALLNUT: 'WallNut',
    POTATOMINE: 'PotatoMine', SNOWPEA: 'SnowPea', CHOMPER: 'Chomper', REPEATER: 'PeaShooterDouble',
    PUFFSHROOM: 'PuffShroom', SUNSHROOM: 'SunShroom', FUMESHROOM: 'FumeShroom', GRAVEBUSTER: 'GraveBuster',
    HYPNOSHROOM: 'HypnoShroom', SCAREDYSHROOM: 'ScaredyShroom', ICESHROOM: 'IceShroom', DOOMSHROOM: 'DoomShroom',
    LILYPAD: 'LilyPad', SQUASH: 'Squash', THREEPEATER: 'ThreePeater', TANGLEKELP: 'TangleKelp',
    JALAPENO: 'Jalapeno', SPIKEWEED: 'Caltrop', TORCHWOOD: 'TorchWood', TALLNUT: 'TallNut',
    SEASHROOM: 'SeaShroom', PLANTERN: 'Plantern', CACTUS: 'Cactus', BLOVER: 'Blover',
    SPLITPEA: 'SplitPea', STARFRUIT: 'StarFruit', PUMPKIN: 'Pumpkin', MAGNETSHROOM: 'MagnetShroom',
    CABBAGEPULT: 'CabbagePult', FLOWERPOT: 'FlowerPot', KERNELPULT: 'CornPult', COFFEEBEAN: 'CoffeeBean',
    GARLIC: 'Garlic', UMBRELLALEAF: 'UmbrellaLeaf', MARIGOLD: 'MariGold', MELONPULT: 'MelonPult',
    GATLINGPEA: 'GatlingPea', TWINSUNFLOWER: 'TwinSunFlower', GLOOMSHROOM: 'GloomShroom', CATTAIL: 'Cattail',
    WINTERMELON: 'WinterMelon', GOLDMAGNET: 'GoldMagnet', SPIKEROCK: 'SpikeRock', COBCANNON: 'CobCannon',
    IMITATER: 'Imitater', EXPLODEONUT: 'ExplodeONut', GIANTWALLNUT: 'GiantWallNut',
  },
  ALMANAC_ZOMBIE_KEY: {
    NORMAL: 'ZombieNorm', FLAG: 'ZombieFlag', CONE: 'ZombieCone', POLEVAULTER: 'ZombiePoleVaulter',
    BUCKET: 'ZombieBucket', NEWSPAPER: 'ZombiePaper', DOOR: 'ZombieScreenDoor', FOOTBALL: 'ZombieFootball',
    DANCER: 'ZombieDancer', BACKUP: 'ZombieDancer', DUCKY: 'ZombieDuckytube', SNORKEL: 'ZombieSnorkle',
    ZAMBONI: 'ZombieZamboni', BOBSLED: 'ZombieBobsled', DOLPHIN: 'ZombieDolphinrider', JACK: 'ZombieJackbox',
    BALLOON: 'ZombieBallon', DIGGER: 'ZombieDigger', POGO: 'ZombiePogo', YETI: 'ZombieYeti',
    BUNGEE: 'ZombieBungi', LADDER: 'ZombieLadder', CATAPULT: 'ZombieCatapult', GARGANTUAR: 'ZombieGargantuar',
    REDEYE: 'ZombieGargantuar', IMP: 'ZombieImp', BOSS: 'ZombieBoss',
  },
  almanacData(tab) {
    return (Assets.data('almanac_data') || {})[tab === 'plants' ? 'Plant' : 'Zombie'] || {};
  },
  almanacEntry(tab, key) {
    const dk = (tab === 'plants' ? this.ALMANAC_PLANT_KEY : this.ALMANAC_ZOMBIE_KEY)[key];
    return dk ? this.almanacData(tab)[dk] : null;
  },
  // 图鉴植物清单 (冒险植物顺序 + 商店升级)
  almanacPlantList() {
    const { SEED_ORDER, UPGRADE_ORDER } = require('./data');
    const game = this.game;
    const owned = new Set(game && game.purchasedSet || []);
    const list = SEED_ORDER.filter(t => this.almanacEntry('plants', t));
    for (const t of UPGRADE_ORDER) {
      if (owned.has(t) && this.almanacEntry('plants', t)) list.push(t);
    }
    return list;
  },
  almanacZombieList() {
    return Object.keys(ZOMBIES).filter(t => this.almanacEntry('zombies', t) && t !== 'BACKUP' && t !== 'REDEYE');
  },
  // 活体展示模型 (缓存 reanim 实例)
  almanacModel(tab, key) {
    if (!this._almModels) this._almModels = {};
    const ck = tab + ':' + key;
    if (this._almModels[ck]) return this._almModels[ck];
    let r = null;
    try {
      if (tab === 'plants') {
        const def = PLANTS[key];
        if (def && RE.hasDef(def.reanim)) {
          r = Assets.reanim(def.reanim);
          const base = def.anim || 'anim_idle';
          r.play(r.animExists(base) ? base : 'anim_idle', RE.LOOP, 12);
        }
      } else {
        const def = ZOMBIES[key];
        if (def && RE.hasDef(def.reanim)) {
          r = Assets.reanim(def.reanim);
          const anim = key === 'POGO' ? 'anim_pogo' : 'anim_idle';
          r.play(r.animExists(anim) ? anim : 'anim_walk', RE.LOOP, 12);
          // 隐藏普通僵尸的附件 (锥/桶/门)
          if (['NORMAL', 'CONE', 'BUCKET', 'DOOR', 'DUCKY', 'FLAG'].includes(key)) {
            r.showPrefix('anim_cone', false); r.showPrefix('anim_bucket', false);
            r.showPrefix('anim_screendoor', false); r.showPrefix('Zombie_flaghand', false);
            r.showPrefix('Zombie_duckytube', false);
            if (key === 'CONE') { r.showPrefix('anim_cone', true); r.setImageOverride('anim_cone', 'zombie_cone1.png'); }
            if (key === 'BUCKET') { r.showPrefix('anim_bucket', true); r.setImageOverride('anim_bucket', 'zombie_bucket1.png'); }
          }
        }
      }
    } catch (e) { r = null; }
    this._almModels[ck] = r;
    return r;
  },

  drawAlmanac(ctx) {
    const game = this.game;
    const a = game.almanac;
    // ---- 索引页 (原版 ALMANAC_PAGE_INDEX) ----
    if (a.tab === 'index') {
      const bg = Assets.image('almanac_indexback.jpg');
      if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
      else { ctx.fillStyle = '#4a3720'; ctx.fillRect(0, 0, 800, 600); }
      // 标题 (原版 [SUBURBAN_ALMANAC_INDEX])
      ctx.save();
      ctx.font = 'bold 34px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(60,40,10,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText('城郊植物大图鉴', 400, 78);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('城郊植物大图鉴', 400, 78);
      ctx.restore();
      // 左: 向日葵模型 / 右: 普通僵尸模型 (原版真实模型)
      const sunflower = this.almanacModel('plants', 'SUNFLOWER');
      if (sunflower) {
        sunflower.update(1 / 60);
        ctx.save(); ctx.translate(200, 260); ctx.scale(1.3, 1.3);
        sunflower.setPosition(0, 0); sunflower.draw(ctx);
        ctx.restore();
      }
      const norm = this.almanacModel('zombies', 'NORMAL');
      if (norm) {
        norm.update(1 / 60);
        ctx.save(); ctx.translate(600, 270); ctx.scale(1.2, 1.2);
        norm.setPosition(0, 0); norm.draw(ctx);
        ctx.restore();
      }
      // 两大按钮 (原版 VIEW_PLANTS (130,345,156x42) / VIEW_ZOMBIES (487,345,210x48))
      this._almIndexBtns = [
        { k: 'plants', x: 130, y: 345, w: 230, h: 56, label: '查看植物', c: '#5a9a3a' },
        { k: 'zombies', x: 460, y: 345, w: 230, h: 56, label: '查看僵尸', c: '#a05a3a' },
      ];
      const hover = this._screens() ? this._screens().hover : null;
      for (const b of this._almIndexBtns) {
        const hov = hover === 'alm_' + b.k;
        ctx.save();
        ctx.fillStyle = hov ? '#7ac85a' : b.c;
        ctx.strokeStyle = '#2a1f0a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 12); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 24px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 8);
        ctx.restore();
      }
      // 返回按钮 (原版右上 CLOSE (676,567))
      this._almClose = { x: 700, y: 552, w: 84, h: 36 };
      const cb = Assets.image('almanac_closebutton.png');
      if (cb) {
        const cbh = Assets.image('almanac_closebuttonhighlight.png');
        ctx.drawImage(hover === 'alm_close' && cbh ? cbh : cb, 676, 548);
      } else {
        ctx.fillStyle = '#a03a3a';
        ctx.beginPath(); ctx.roundRect(700, 552, 84, 36, 6); ctx.fill();
        ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.fillText('关 闭', 742, 576);
      }
      return;
    }
    // ---- 植物/僵尸页 (原版网格 + 展示区 + 信息卡) ----
    const isPlant = a.tab === 'plants';
    const bg = Assets.image(isPlant ? 'almanac_plantback.jpg' : 'almanac_zombieback.jpg');
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = isPlant ? '#3a4a20' : '#3a2a2a'; ctx.fillRect(0, 0, 800, 600); }
    // 标题
    ctx.save();
    ctx.font = 'bold 30px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(60,40,10,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(isPlant ? '植物图鉴' : '僵尸图鉴', 400, 52);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(isPlant ? '植物图鉴' : '僵尸图鉴', 400, 52);
    ctx.restore();
    // ---- 网格 (原版 GetSeedPosition: 8列 x = i%8*52+26, y = i/8*78+92) ----
    const entries = isPlant ? this.almanacPlantList() : this.almanacZombieList();
    this.almanacCells = [];
    entries.forEach((key, i) => {
      const gx = 26 + (i % 8) * 52, gy = 92 + Math.floor(i / 8) * 78;
      const sel = a.selected === key;
      this.almanacCells.push({ key, x: gx, y: gy, w: 52, h: 76 });
      const hov = (this._screens() ? this._screens().hover : null) === 'almcell' + i;
      ctx.save();
      // 悬停闪卡 (原版 SEEDPACKETFLASH)
      if (hov || sel) {
        const flash = Assets.image('seedpacketflash.png');
        if (flash) ctx.drawImage(flash, gx - 3, gy - 3, 58, 82);
        else { ctx.strokeStyle = '#ffef7a'; ctx.lineWidth = 2; ctx.strokeRect(gx, gy, 52, 76); }
      }
      // 缩略图
      ctx.beginPath(); ctx.rect(gx, gy, 52, 76); ctx.clip();
      if (isPlant) {
        const th = this.getThumb(key);
        if (th) ctx.drawImage(th, gx - 1, gy - 4, 56, 80);
      } else {
        const th = this.getZombieThumb(key);
        if (th) ctx.drawImage(th, gx - 2, gy, 56, 76);
      }
      ctx.restore();
    });
    // ---- 展示区 (原版: 信息卡垫底 → 地面 → 活体模型最上层 → 下方文字) ----
    if (a.selected) {
      const entry = this.almanacEntry(a.tab, a.selected);
      const def = isPlant ? PLANTS[a.selected] : ZOMBIES[a.selected];
      // 信息卡 (原版 ALMANAC_PLANTCARD @ (459,86) / ZOMBIECARD @ (455,78)) — 半透明羊皮纸垫底
      const card = Assets.image(isPlant ? 'almanac_plantcard.png' : 'almanac_zombiecard.png');
      const cx = isPlant ? 459 : 455, cy = isPlant ? 86 : 78;
      if (card) ctx.drawImage(card, cx, cy);
      else {
        ctx.fillStyle = 'rgba(240,228,190,0.95)';
        ctx.strokeStyle = '#6a5222'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(cx, cy, 300, 420, 12); ctx.fill(); ctx.stroke();
      }
      // 地面 (原版按植物背景切换: Day/Night/Pool/Ice/Roof/Fog)
      const bgField = entry && entry['背景'];
      const groundMap = {
        Day: 'almanac_groundday.jpg', Night: 'almanac_groundnight.jpg', Pool: 'almanac_groundpool.jpg',
        Ice: 'almanac_groundice.jpg', Roof: 'almanac_groundroof.jpg', Fog: 'almanac_groundnightpool.jpg',
        NightPool: 'almanac_groundnightpool.jpg',
      };
      const gName = groundMap[bgField] || (isPlant ? 'almanac_groundday.jpg' : 'almanac_groundnight.jpg');
      const ground = Assets.image(gName) || Assets.image('almanac_groundday.jpg');
      if (ground) ctx.drawImage(ground, 505, 95, 240, 170);
      // 活体模型 (最上层; 植物 reanim 锚点=顶部, 身体向下延伸 → 锚点放窗口上部)
      const model = this.almanacModel(a.tab, a.selected);
      if (model) {
        model.update(1 / 60);
        ctx.save();
        if (isPlant) {
          ctx.translate(592, 118);
          ctx.scale(1.15, 1.15);
        } else {
          // 僵尸 reanim 锚点=脚底 → 放窗口底部
          ctx.translate(600, 248);
          ctx.scale(1.0, 1.0);
        }
        model.setPosition(0, 0);
        model.draw(ctx);
        ctx.restore();
      }
      // 名称 (原版居中 (617,288))
      ctx.save();
      ctx.font = 'bold 24px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3a2a10';
      const cn = (entry && entry['名字']) || def.cn || a.selected;
      ctx.fillText(cn, 617, 330);
      // 描述 (原版 (485,309) 左对齐 258宽)
      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#4a3820';
      let yy = 356;
      const desc = (entry && entry['描述']) || def.desc || '';
      yy = this._almWrap(ctx, desc, 485, yy, 258, 19);
      // 参数 (键值对)
      if (entry && entry['参数']) {
        yy += 6;
        ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
        yy = this._almWrap(ctx, '· 属性', 485, yy, 258, 17);
        ctx.font = '12px "Noto Sans SC", sans-serif';
        for (const [k, v] of Object.entries(entry['参数'])) {
          yy = this._almWrap(ctx, `${k}: ${v}`, 492, yy, 250, 16);
        }
      }
      // 简介 (原版 趣味小知识)
      if (entry && entry['简介']) {
        yy += 6;
        ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
        yy = this._almWrap(ctx, '· 趣味知识', 485, yy, 258, 17);
        ctx.font = '12px "Noto Sans SC", sans-serif';
        ctx.fillStyle = '#5a4830';
        yy = this._almWrap(ctx, entry['简介'], 485, yy, 258, 16);
      }
      // 底部: 费用/冷却 (原版 Cost 左下 + Recharge 右下)
      if (isPlant && def) {
        ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3a2a10';
        ctx.fillText('费用: ' + def.cost, 485, 492);
        const recharge = def.cd === 7500 ? '快' : def.cd <= 30000 ? '慢' : '非常慢';
        ctx.textAlign = 'right';
        ctx.fillText('恢复: ' + recharge, 733, 492);
      }
      ctx.restore();
    }
    // ---- 返回索引按钮 (原版左下 (32,567)) ----
    this._almBack = { x: 20, y: 548, w: 150, h: 42 };
    const hov = (this._screens() ? this._screens().hover : null) === 'alm_back';
    ctx.save();
    ctx.fillStyle = hov ? '#8a6a3a' : '#6a5230';
    ctx.strokeStyle = '#2a1f0a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(20, 548, 150, 42, 8); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 16px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#f4e6b0';
    ctx.fillText('返 回 目 录', 95, 575);
    ctx.restore();
    // 关闭
    this._almClose = { x: 700, y: 552, w: 84, h: 36 };
    const cb2 = Assets.image('almanac_closebutton.png');
    if (cb2) {
      const cb2h = Assets.image('almanac_closebuttonhighlight.png');
      const hovC = (this._screens() ? this._screens().hover : null) === 'alm_close';
      ctx.drawImage(hovC && cb2h ? cb2h : cb2, 676, 548);
    }
  },
  _almWrap(ctx, text, x, y, maxW, lineH) {
    let line = '', yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lineH; }
      else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy + lineH;
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
