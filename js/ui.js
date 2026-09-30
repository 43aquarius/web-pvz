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
      // 头部挂载到身体轨道 (与 Plant 构造一致, 保证缩略图与场景中形态相同)
      const headIdx = [];   // 被挂载的层索引
      if (layers.length > 1) {
        const body = layers[0];
        if (type === 'THREEPEATER') {
          ['anim_head1', 'anim_head2', 'anim_head3'].forEach((tr, i) => {
            const L = layers[1 + i];
            if (!L) return;
            if (body.trackExists(tr)) { body.attach[body.trackIndex(tr)] = [L]; headIdx.push(1 + i); }
          });
        } else {
          const track = body.trackExists('anim_stem') ? 'anim_stem'
            : body.trackExists('anim_idle') ? 'anim_idle' : null;
          if (track) {
            const ti = body.trackIndex(track);
            const heads = layers.slice(1);
            body.attach[ti] = heads.length === 1 ? heads[0] : heads;
            for (let i = 1; i < layers.length; i++) headIdx.push(i);
          }
        }
      }
      // 合并包围盒 (头的轨道坐标需加上身体挂点偏移)
      const body = layers[0];
      const bt = body.frameTime();
      let attachX = 0, attachY = 0;
      if (headIdx.length) {
        // 找到挂载轨道的当前变换
        for (let ti = 0; ti < body.def.tracks.length; ti++) {
          if (body.attach[ti]) {
            const t = body.curTransform(ti, bt);
            attachX = t.x; attachY = t.y;
            break;
          }
        }
      }
      let minX = 999, minY = 999, maxX = -999, maxY = -999;
      layers.forEach((r, li) => {
        const offX = headIdx.includes(li) ? attachX : 0;
        const offY = headIdx.includes(li) ? attachY : 0;
        const ft = r.frameTime();
        for (let ti = 0; ti < r.def.tracks.length; ti++) {
          const t = r.curTransform(ti, ft);
          if (t.f < 0) continue;
          const idx = r.def.tracks[ti].IM[ft[0]];
          const key = idx >= 0 ? r.def.images[idx] : null;
          const img = key ? RE.resolveImage(key) : null;
          if (!img) continue;
          const w = img.width * t.sx, h = img.height * t.sy;
          minX = Math.min(minX, t.x + offX); minY = Math.min(minY, t.y + offY);
          maxX = Math.max(maxX, t.x + offX + w); maxY = Math.max(maxY, t.y + offY + h);
        }
      });
      // 原版直接在 (x+offsetX, y+offsetY) 以 scale 绘制 reanim 原点
      // 此处把植物视觉中心对到卡包中心 (25, 33), 并限制在包内
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      let fit = Math.min(scaleOf(type), 44 / bw, 52 / bh);
      if (!isFinite(fit) || fit <= 0) fit = scaleOf(type);
      // 只画身体实例 — 头部经挂载自动绘制在正确位置
      body.x = 25 - (minX + maxX) / 2 * fit;
      body.y = 30 - (minY + maxY) / 2 * fit + 3;
      body.scale = fit;
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
    // ---- 种子银行 (原版 SeedBank::Draw: seedbank.png + 扩展区) ----
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
    ctx.save();
    ctx.font = '16px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e0bb62';
    ctx.fillText(`关卡 ${board.level.label}`, 593, 595);
    ctx.restore();
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
    // ---- 暂停 ----
    if (board.paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, 800, 600);
      ctx.font = 'bold 46px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('已暂停', 400, 280);
      ctx.font = '20px "Noto Sans SC", sans-serif';
      ctx.fillText('点击任意处继续', 400, 330);
      ctx.restore();
    }
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
    const pool = availablePlants(game.levelId);
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
      r.x = 45 - (minX + maxX) / 2 * sc;
      r.y = 40 - (minY + maxY) / 2 * sc;
      r.scale = sc;
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
