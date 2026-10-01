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
    // ---- 传送带种子银行 (原版 SeedPacket.cpp 946-951: backdrop(83,0)+belt(90,63)6cel+clip(90,0,501)) ----
    if (board.mode === 'conveyor' && board.challenge && board.challenge.beltItems) {
      const bankY = cs.active ? cs.seedBankY : 0;
      const ch = board.challenge;
      if (bankY > -87) {
        const backdrop = Assets.image('conveyorbelt_backdrop.png');
        const belt = Assets.image('conveyorbelt.png');
        ctx.save();
        ctx.translate(0, bankY);
        // 背景板 (原版 (83,0) 516x86)
        if (backdrop) ctx.drawImage(backdrop, 83, 0);
        else { ctx.fillStyle = '#6a5232'; ctx.fillRect(83, 0, 516, 86); }
        // 传送带 (纹理周期15px, 与卡片同速滚动: beltScroll/4 % 15)
        if (belt) {
          ctx.save();
          ctx.beginPath(); ctx.rect(90, 0, 501, 160); ctx.clip();
          const scroll = Math.floor(ch.beltScroll / 4) % 15;
          ctx.drawImage(belt, 90 - scroll, 63);
          ctx.drawImage(belt, 90 - scroll + 502, 63);
          ctx.restore();
        } else {
          ctx.fillStyle = '#464646';
          ctx.fillRect(90, 63, 501, 33);
        }
        ctx.restore();
        // 带上卡片 (原版: index*50+91, offsetX逐px左移; 我们用offsetX直接定位)
        ctx.save();
        ctx.beginPath(); ctx.rect(90, 0, 501, 200); ctx.clip();
        ctx.translate(0, bankY);
        for (const it of ch.beltItems) {
          this.drawSeedCard(ctx, it.type, 91 + it.offsetX, 7, {});
        }
        ctx.restore();
        // 手持卡 (跟随鼠标)
        if (game.selectedCard >= 0 && ch.heldType) {
          const m = game.mouse;
          if (m) this.drawSeedCard(ctx, ch.heldType, m.x - 25, m.y - 35, {});
        }
      }
      // 进度条 + 菜单按钮
      this.drawProgressBar(ctx, board);
      this.drawStoneButton(ctx, 681, -10, 117, 46, '菜 单', 18);
      this.drawLevelText(ctx, board);
      return;
    }
    // ---- 我是僵尸: 僵尸卡槽 (原版: 种子银行外观 + 僵尸卡) ----
    if (board.mode === 'izombie' && board.zombieCards) {
      const ch = board.challenge;
      const bankY = cs.active ? cs.seedBankY : 0;
      if (bankY > -87) {
        const bank = Assets.image('seedbank.png');
        const n = board.zombieCards.length;
        const extra = this.seedBankExtraWidth(n);
        if (bank) {
          ctx.drawImage(bank, 0, 0, 446, 87, 0, bankY, 446, 87);
          if (extra > 0) ctx.drawImage(bank, 446 - 12, 0, 12, 87, 446 - 12, bankY, extra + 12, 87);
        } else { ctx.fillStyle = '#8a6642'; ctx.fillRect(0, bankY, 446 + extra, 87); }
        // 阳光计数
        ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(String(Math.max(0, board.sun)), 34, bankY + 78);
        // 僵尸卡 (脑图图标 + 价格)
        for (let i = 0; i < n; i++) {
          const c = board.zombieCards[i];
          const x = this.packetX(i, n), y = 7 + bankY;
          const sel = (ch && ch.selectedZombieCard === i) || game.selectedCard === i;
          const afford = board.sun >= c.cost;
          this.drawZombieCard(ctx, c.type, x, y, { selected: sel, disabled: !afford, cost: c.cost });
        }
      }
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
    // ---- 金币栏 (原版 DrawCoinBank: CoinBank@(57,599-高) 淡入淡出, 拾取时显示) ----
    this.drawCoinBank(ctx, board);
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

  // ---- 金币栏 (原版 Board::DrawCoinBank: IMAGE_COINBANK @ (57,599-高), ShowCoinBank 1000tick) ----
  drawCoinBank(ctx, board) {
    if (!board._coinBankT) board._coinBankT = 0;
    // 拾取金币/有余额进入关卡时显示
    if (board.coins.some(c => c.collected)) board._coinBankT = 2.0;
    if (board._coinBankT > 0) board._coinBankT -= 1 / 60;
    const bank = Assets.image('coinbank.png');
    if (!bank) return;
    const a = Math.min(1, board._coinBankT);
    if (a <= 0) return;
    const x = 57, y = 599 - bank.height;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(bank, x, y);
    // 金币数 (原版: 右对齐 余额绿色)
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgb(180,255,90)';
    const game = this.game;
    ctx.fillText(String(game && game.coins ? game.coins : 0), x + 128, y + 28);
    ctx.restore();
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

  // ---------- 特殊模式叠加层 (challenge.js 绘制: 罐子/警戒线/脑子/锤子/按钮) ----------
  drawModeOverlay(ctx, board) {
    if (!board || !board.mode) return;
    const game = this.game;
    const ch = board.challenge;
    // challenge 统一绘制 (罐子/红线/脑子/坚不可摧按钮/老虎机/宝石HUD)
    if (ch && ch.drawOverlay) ch.drawOverlay(ctx);
    // 雨天种子: 掉落卡 + 持有卡
    if (board.mode === 'raining' && ch) {
      for (const c of (ch.rainCards || [])) {
        ctx.save();
        ctx.globalAlpha = 0.92;
        this.drawSeedCard(ctx, c.type, c.x - 25, c.y - 35, {});
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(c.x, c.y + 40, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < (ch.heldCards || []).length; i++) {
        const h = ch.heldCards[i];
        const x = 130 + i * 60;
        const sel = game.selectedCard === i;
        ctx.save();
        this.drawSeedCard(ctx, h.type, x, 6, { selected: sel });
        const p = Math.max(0, Math.min(1, h.life / 14));
        ctx.fillStyle = 'rgba(255,80,80,0.85)';
        ctx.fillRect(x, 76 - 4 * p, 50, 4);
        ctx.restore();
      }
    }
    // 打僵尸: 分数
    if (board.mode === 'whack' && ch) {
      ctx.save();
      ctx.font = 'bold 20px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,0,0.8)';
      const total = board.numWaves || 12;
      ctx.strokeText(`波次 ${board.wave}/${total}`, 400, 120);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(`波次 ${board.wave}/${total}`, 400, 120);
      ctx.restore();
    }
    // 墓地/罐子等 gridItems 中的墓碑绘制归 render.js; 此处画罐子锤子由challenge处理
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


  // ---------- 图鉴 (原版 Almanac 布局) ----------
  drawAlmanac(ctx) {
    const game = this.game;
    const a = game.almanac;
    // 背景 (原版: ALMANAC_INDEXBACK 全屏)
    const indexBg = Assets.image('almanac_indexback.jpg');
    const plantBg = Assets.image('almanac_plantback.jpg');
    const zombieBg = Assets.image('almanac_zombieback.jpg');
    const bg = a.tab === 'plants' ? (plantBg || indexBg) : (zombieBg || indexBg);
    if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
    else { ctx.fillStyle = '#4a3720'; ctx.fillRect(0, 0, 800, 600); }
    // 标题
    ctx.font = 'bold 30px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
    ctx.fillText(a.tab === 'plants' ? '植物图鉴' : '僵尸图鉴', 400, 42);
    // 标签切换
    ctx.save();
    ctx.fillStyle = a.tab === 'plants' ? '#5ad04a' : '#777';
    roundRect(ctx, 300, 55, 90, 30, 6); ctx.fill();
    ctx.fillStyle = a.tab === 'zombies' ? '#a03a3a' : '#777';
    roundRect(ctx, 410, 55, 90, 30, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('植物', 345, 75);
    ctx.fillText('僵尸', 455, 75);
    ctx.restore();
    this.almanacTabs = [{ x: 300, y: 55, w: 90, h: 30 }, { x: 410, y: 55, w: 90, h: 30 }];
    // 网格 (13列×4行单页显示全部)
    this.almanacCells = [];
    const entries = a.tab === 'plants' ? Object.keys(PLANTS) : Object.keys(ZOMBIES);
    entries.forEach((key, i) => {
      const gx = 26 + (i % 13) * 58, gy = 98 + Math.floor(i / 13) * 88;
      const sel = a.selected === key;
      this.almanacCells.push({ key, x: gx, y: gy, w: 52, h: 80 });
      ctx.save();
      ctx.fillStyle = sel ? 'rgba(255,240,140,0.9)' : 'rgba(255,255,255,0.12)';
      roundRect(ctx, gx, gy, 52, 80, 5); ctx.fill();
      if (a.tab === 'plants') {
        ctx.save();
        ctx.beginPath(); ctx.rect(gx + 1, gy + 1, 50, 66); ctx.clip();
        const th = this.getThumb(key);
        ctx.drawImage(th, gx + 1, gy - 2, 50, 72);
        ctx.restore();
      } else {
        ctx.save();
        ctx.beginPath(); ctx.rect(gx + 1, gy + 1, 50, 66); ctx.clip();
        const r = this.getZombieThumb(key);
        if (r) ctx.drawImage(r, gx + 1, gy + 1, 50, 70);
        ctx.restore();
      }
      ctx.restore();
    });
    // 详情面板
    if (a.selected) {
      const isPlant = a.tab === 'plants';
      const def = isPlant ? PLANTS[a.selected] : ZOMBIES[a.selected];
      ctx.save();
      ctx.fillStyle = 'rgba(20,14,4,0.92)';
      roundRect(ctx, 20, 500, 760, 84, 8); ctx.fill();
      if (isPlant) {
        const th = this.getThumb(a.selected);
        ctx.drawImage(th, 28, 502, 70, 80);
      } else {
        const th = this.getZombieThumb(a.selected);
        if (th) ctx.drawImage(th, 18, 502, 90, 80);
      }
      ctx.font = 'bold 22px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'left';
      ctx.fillText(def.cn, 120, 528);
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#e8d9b5';
      ctx.fillText(def.desc || '', 120, 552);
      ctx.fillStyle = '#a8d0ff';
      const stats = isPlant
        ? `阳光: ${def.cost}  血量: ${def.hp}  冷却: ${(def.cd / 1000).toFixed(0)}s`
        : `血量: ${def.body}${def.helm ? ` + 护甲${def.helm}` : ''}${def.shield ? ` + 盾${def.shield}` : ''}`;
      ctx.fillText(stats, 120, 574);
      ctx.restore();
    }
    // 返回
    ctx.save();
    ctx.fillStyle = '#a03a3a';
    roundRect(ctx, 700, 8, 84, 32, 6); ctx.fill();
    ctx.font = 'bold 15px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('返回', 742, 29);
    ctx.restore();
    this.backButton = { x: 700, y: 8, w: 84, h: 32 };
  },

  // ---------- 我是僵尸卡 (原版: 种子包外观 + 僵尸头像 + 价格) ----------
  drawZombieCard(ctx, type, x, y, opts = {}) {
    const w = 50, h = 70;
    const seeds = Assets.image('seeds');
    if (seeds) ctx.drawImage(seeds, 2 * 50, 0, 50, 70, x, y, w, h);
    else { ctx.fillStyle = '#b0a080'; ctx.fillRect(x, y, w, h); }
    // 僵尸头像 (半身)
    const r = this.getZombieThumb(type);
    if (r) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h - 14); ctx.clip();
      ctx.drawImage(r, x - 14, y - 2, 78, 62);
      ctx.restore();
    }
    // 价格
    ctx.font = 'bold 13px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = opts.disabled ? '#a00' : '#000';
    ctx.fillText(String(opts.cost != null ? opts.cost : 50), x + 25, y + h - 6);
    // 不可用
    if (opts.disabled) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = 'rgb(80,80,80)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    // 选中
    if (opts.selected) {
      ctx.save();
      ctx.strokeStyle = '#ffef7a'; ctx.lineWidth = 3;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      ctx.restore();
    }
    // 名称 (中文小字)
    const CHM = require('./challenge');
    const nm = CHM.IZ_NAMES[type] || ZOMBIES[type].cn;
    if (nm) {
      ctx.save();
      ctx.font = '10px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(nm.slice(0, 5), x + 25, y + 12);
      ctx.restore();
    }
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
