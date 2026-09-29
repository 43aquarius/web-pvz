// ============================================================
// screens.js — 原版界面系统: 标题屏 / 主菜单 / 图鉴 / 奖励 / 纸条 / 失败 / 选项
// 全部使用原版 SelectorScreen / Almanac / ui_remind_word 素材
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, SEED_ORDER, availablePlants, awardPlantForLevel } = require('./data');
const RE = require('./reanim');
const __getUI = () => { const m = (window.__mods && window.__mods['ui']) || require('./ui'); return m && m.UI; };

const img = (name) => Assets.image(name);

// 按钮判定
function inRect(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; }

// 阴影文字 (原版 LawnStrings 风格)
function pvzText(ctx, text, x, y, size, fill, opts = {}) {
  ctx.save();
  ctx.font = `bold ${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.strokeStyle = opts.stroke || 'rgba(20,12,0,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const Screens = {
  t: 0,             // 全局界面时间
  mouse: { x: 400, y: 300 },
  hover: null,

  update(dt) { this.t += dt; },

  // ================================================================
  // 标题屏 — titlescreen.jpg + "点击开始"
  // ================================================================
  title: {
    started: false,
    draw(ctx) {
      const bg = img('titlescreen.jpg');
      if (bg) ctx.drawImage(bg, 0, 0, 800, 600);
      else { ctx.fillStyle = '#20300a'; ctx.fillRect(0, 0, 800, 600); }
      const t = Screens.t;
      // 标题 logo (文字版)
      ctx.save();
      const bob = Math.sin(t * 1.2) * 3;
      ctx.translate(400, 150 + bob);
      ctx.font = 'bold 84px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 14; ctx.strokeStyle = '#1d3b06'; ctx.lineJoin = 'round';
      ctx.strokeText('植物大战僵尸', 0, 0);
      const g = ctx.createLinearGradient(0, -70, 0, 10);
      g.addColorStop(0, '#e9ff7a'); g.addColorStop(0.55, '#8fd63a'); g.addColorStop(1, '#3e8710');
      ctx.fillStyle = g;
      ctx.fillText('植物大战僵尸', 0, 0);
      ctx.font = 'bold 26px "Noto Sans SC", sans-serif';
      ctx.lineWidth = 6; ctx.strokeStyle = '#1d3b06';
      ctx.strokeText('Web 原版复刻', 0, 36);
      ctx.fillStyle = '#cfe89a';
      ctx.fillText('Web 原版复刻', 0, 36);
      ctx.restore();
      // 点击开始 (闪烁)
      const a = 0.55 + 0.45 * Math.sin(t * 3.2);
      pvzText(ctx, '点 击 开 始', 400, 480, 34, '#ffe9a8', { stroke: 'rgba(30,18,0,0.9)' });
      ctx.save(); ctx.globalAlpha = a; ctx.restore();
      // 底部提示
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3.2);
      pvzText(ctx, '点 击 屏 幕 任 意 处', 400, 520, 22, '#ffffff');
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.75;
      pvzText(ctx, '素材音乐来自原版 PvZ · 仅供学习交流', 400, 580, 13, '#d8cfa8');
      ctx.restore();
    },
    click(p, game) {
      game.audio.play('gravebutton');
      game.audio.playBGM('start_menu');
      game.state = 'menu';
    },
  },

  // ================================================================
  // 主菜单 — 原版 SelectorScreen 三段背景拼图 + 视差 + 原版按钮
  // ================================================================
  menu: {
    pan: 0, panTarget: 0,
    buttons: [],
    draw(ctx) {
      const t = Screens.t;
      // ---- 背景: bg.jpg 天空底层 + 三块透明拼图 (底边对齐 600) ----
      const left = img('selectorscreen_bg_left.png');
      const center = img('selectorscreen_bg_center.png');
      const right = img('selectorscreen_bg_right.png');
      const bgT = img('selectorscreen_bg.jpg');
      // 视差: 鼠标 x → 组平移 ±55
      const m = Screens.mouse;
      this.panTarget = (m.x / 800 - 0.5) * 110;
      this.pan += (this.panTarget - this.pan) * 0.045;
      const pan = this.pan;
      if (bgT) {
        // 天空底层轻微反向视差
        ctx.drawImage(bgT, -pan * 0.25, 0, 800 + Math.abs(pan) * 0.5, 600);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, 600);
        g.addColorStop(0, '#2f9be0'); g.addColorStop(0.7, '#a8d8f0'); g.addColorStop(1, '#c8e8c0');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 600);
      }
      if (center) ctx.drawImage(center, 40 + pan, 250);
      if (left) ctx.drawImage(left, 0 + pan, -80);
      if (right) ctx.drawImage(right, 70 + pan, 40);
      // ---- 装饰云 (缓慢漂移) ----
      for (let i = 0; i < 4; i++) {
        const cloud = img(`selectorscreen_cloud${[1, 2, 4, 5][i]}.png`);
        if (!cloud) continue;
        const cx = ((t * (6 + i * 2) + i * 260) % 1100) - 150;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(cloud, cx, 18 + (i % 2) * 26, cloud.width * 0.9, cloud.height * 0.9);
        ctx.restore();
      }
      // ---- 按钮 ----
      const B = [];
      const hover = Screens.hover;
      // 冒险模式大按钮 (原版 StartAdventure_Button1 331x146)
      const adv = { k: 'adventure', x: 60, y: 240, w: 331, h: 146, img: 'selectorscreen_startadventure_button1.png', glow: 'selectorscreen_startadventure_highlight.png' };
      // 图鉴 (Almanac 99x99) — 左下
      const alm = { k: 'almanac', x: 32, y: 486, w: 99, h: 99, img: 'selectorscreen_almanac.png', glow: 'selectorscreen_almanachighlight.png' };
      // 选项/帮助/退出 — 右上
      const opt = { k: 'options', x: 690, y: 12, w: 81, h: 31, img: 'selectorscreen_options1.png', glow: 'selectorscreen_options2.png' };
      const help = { k: 'help', x: 590, y: 16, w: 48, h: 22, img: 'selectorscreen_help1.png', glow: 'selectorscreen_help2.png' };
      const quit = { k: 'quit', x: 740, y: 52, w: 47, h: 27, img: 'selectorscreen_quit1.png', glow: 'selectorscreen_quit2.png' };
      // 小游戏按钮 (右侧木牌区, 锁定)
      const mini = { k: 'locked', x: 545, y: 300, w: 150, h: 88, img: 'selectorscreen_challenges_button.png' };
      const surv = { k: 'locked', x: 560, y: 402, w: 150, h: 88, img: 'selectorscreen_survival_button.png' };
      B.push(adv, alm, opt, help, quit, mini, surv);
      for (const b of B) {
        const bi = img(b.img);
        if (!bi) continue;
        const isHover = hover === b.k;
        ctx.save();
        const sc = isHover ? 1.045 : 1;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ctx.translate(cx, cy); ctx.scale(sc, sc);
        if (isHover && b.glow) {
          const gl = img(b.glow);
          if (gl) ctx.drawImage(gl, -b.w * sc / 2 - 4, -b.h * sc / 2 - 4, b.w * sc + 8, b.h * sc + 8);
        }
        ctx.drawImage(bi, -b.w / 2, -b.h / 2, b.w, b.h);
        if (b.k === 'locked') {
          ctx.globalAlpha = 0.55; ctx.fillStyle = '#222';
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.globalAlpha = 1;
          const lock = img('lock.png');
          if (lock) ctx.drawImage(lock, -14, -20, 28, 34);
        }
        ctx.restore();
      }
      this.buttons = B;
      // ---- 冒险进度文字 ----
      const game = Screens.game;
      if (game) {
        const lv = Math.min(game.progress.unlocked, 50);
        const label = lv > 50 ? '已通关全部冒险!' : `冒险模式进度  ${LEVELS[lv - 1].label}`;
        pvzText(ctx, label, 226, 418, 19, '#ffe9a8');
        pvzText(ctx, '点击开始下一关', 226, 444, 14, '#cfe89a');
      }
      // ---- 树叶装饰 (底部) ----
      const leaves = img('selectorscreen_leaves.png');
      if (leaves) ctx.drawImage(leaves, -20, 560, 840, 60);
      // 木牌装饰 (左上用户名区)
      const sign = img('selectorscreen_woodsign1.png');
      if (sign) {
        ctx.save(); ctx.globalAlpha = 0.96;
        ctx.drawImage(sign, 96, 26, 293 * 0.62, 150 * 0.62);
        pvzText(ctx, '玩家', 187, 92, 17, '#3a2a12');
        ctx.restore();
      }
    },
    click(p, game) {
      for (const b of this.buttons) {
        if (!inRect(p, b.x, b.y, b.w, b.h)) continue;
        if (b.k === 'adventure') {
          game.audio.play('gravebutton');
          game.startAdventure();
        } else if (b.k === 'almanac') {
          game.audio.play('gravebutton');
          game.state = 'almanac'; game.almanac.selected = null;
        } else if (b.k === 'options') {
          game.audio.play('buttonclick');
          game.state = 'options';
        } else if (b.k === 'help') {
          game.audio.play('buttonclick');
          game.state = 'help';
        } else if (b.k === 'quit') {
          game.audio.play('buttonclick');
          window.close();
        } else if (b.k === 'locked') {
          game.audio.play('buzzer');
        }
        return;
      }
    },
  },

  // ================================================================
  // 选项 — 原版 option_dialog.png + 滑块/复选框
  // ================================================================
  options: {
    rects: {},
    draw(ctx) {
      const game = Screens.game;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
      const dlg = img('option_dialog.png');
      const dw = 500, dh = 420, dx = 150, dy = 90;
      if (dlg) ctx.drawImage(dlg, dx, dy, dw, dh);
      else { ctx.fillStyle = '#c8b28a'; ctx.fillRect(dx, dy, dw, dh); }
      pvzText(ctx, '选  项', 400, dy + 52, 30, '#4a2f10');
      // 音量滑块
      const vol = game.audio.master !== undefined ? game.audio.master : 0.8;
      const sx = dx + 70, sy = dy + 130, sw = 260;
      const slot = img('options_sliderslot.png');
      if (slot) ctx.drawImage(slot, sx, sy, sw, 18);
      else { ctx.fillStyle = '#7a5a30'; ctx.fillRect(sx, sy, sw, 18); }
      const knob = img('options_sliderknob2.png');
      const kx = sx + vol * (sw - 30);
      if (knob) ctx.drawImage(knob, kx, sy - 8, 30, 34);
      else { ctx.fillStyle = '#e8d9a0'; ctx.fillRect(kx, sy - 8, 30, 34); }
      pvzText(ctx, '音乐音量', sx - 10, sy + 14, 16, '#4a2f10', { align: 'right' });
      this.rects.vol = { x: sx, y: sy - 12, w: sw, h: 40 };
      // 复选框: 音效
      const cbY = dy + 190;
      for (let i = 0; i < 2; i++) {
        const cbox = img(`options_checkbox${game.audio.sfxOn ? 1 : 0}.png`);
        const cy = cbY + i * 44;
        if (cbox) ctx.drawImage(cbox, sx, cy, 22, 22);
        pvzText(ctx, i === 0 ? '音效' : '全屏', sx + 36, cy + 18, 16, '#4a2f10', { align: 'left' });
        this.rects[`cb${i}`] = { x: sx, y: cy, w: 120, h: 26 };
      }
      // 返回按钮
      pvzText(ctx, '点击此处返回', 400, dy + dh - 40, 20, '#6b1c04');
      this.rects.back = { x: dx + 120, y: dy + dh - 70, w: 260, h: 50 };
    },
    click(p, game) {
      const r = this.rects;
      if (r.vol && inRect(p, r.vol.x, r.vol.y, r.vol.w, r.vol.h)) {
        game.audio.setMaster(Math.max(0, Math.min(1, (p.x - r.vol.x) / r.vol.w)));
        game.audio.play('tap');
        return;
      }
      if (r.cb0 && inRect(p, r.cb0.x, r.cb0.y, r.cb0.w, r.cb0.h)) {
        game.audio.sfxOn = !game.audio.sfxOn; game.audio.play('tap'); return;
      }
      if (r.cb1 && inRect(p, r.cb1.x, r.cb1.y, r.cb1.w, r.cb1.h)) {
        game.audio.play('tap');
        const c = document.documentElement;
        if (!document.fullscreenElement) { if (c.requestFullscreen) c.requestFullscreen(); }
        else if (document.exitFullscreen) document.exitFullscreen();
        return;
      }
      if (r.back && inRect(p, r.back.x, r.back.y, r.back.w, r.back.h)) {
        game.audio.play('buttonclick');
        game.state = 'menu';
      }
    },
  },

  // ================================================================
  // 帮助
  // ================================================================
  help: {
    draw(ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 600);
      const dlg = img('option_dialog.png');
      if (dlg) ctx.drawImage(dlg, 130, 70, 540, 470);
      pvzText(ctx, '怎 么 玩', 400, 120, 30, '#4a2f10');
      const lines = [
        ['· 收集阳光, 种植植物防守草坪', '#4a2f10'],
        ['· 点击种子卡再点击草坪即可种植', '#4a2f10'],
        ['· 铲子可以移除植物', '#4a2f10'],
        ['· 收集阳光: 天上掉的 + 向日葵产出', '#4a2f10'],
        ['', ''],
        ['· 僵尸走到最左侧会触发割草机', '#4a2f10'],
        ['· 割草机只能用一次, 失守即输', '#4a2f10'],
        ['', ''],
        ['· 冒险模式按原版顺序 1-1 → 5-10', '#6b1c04'],
        ['· 每关解锁新植物, X-5/X-10 有惊喜', '#6b1c04'],
      ];
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = '17px "Noto Sans SC", sans-serif';
      let y = 165;
      for (const [txt, col] of lines) { if (txt) { ctx.fillStyle = col; ctx.fillText(txt, 175, y); } y += 30; }
      ctx.restore();
      pvzText(ctx, '点击返回', 400, 505, 20, '#6b1c04');
    },
    click(p, game) { game.audio.play('buttonclick'); game.state = 'menu'; },
  },

  // ================================================================
  // 奖励屏 — 通关后展示新植物 (原版 AwardScreen 风格)
  // ================================================================
  award: {
    draw(ctx, game) {
      ctx.fillStyle = 'rgba(6,20,4,0.92)'; ctx.fillRect(0, 0, 800, 600);
      const t = Screens.t;
      // 光芒
      ctx.save();
      ctx.translate(400, 250);
      ctx.rotate(t * 0.3);
      const rays = img('awardrays.png') || img('awardrays1.png');
      if (rays) { ctx.globalAlpha = 0.5; ctx.drawImage(rays, -260, -260, 520, 520); }
      ctx.restore();
      const type = game.justUnlocked;
      pvzText(ctx, '通 关 奖 励 !', 400, 120, 42, '#ffe36a');
      if (type) {
        // 种子包
        const packet = img('seedpacket_larger.png');
        const px = 400 - 80, py = 165;
        ctx.save();
        const bob = Math.sin(t * 2) * 5;
        ctx.translate(400, 265 + bob);
        if (packet) ctx.drawImage(packet, -80, -100, 160, 200);
        const thumb = __getUI() ? __getUI().getThumb(type) : null;
        if (thumb) ctx.drawImage(thumb, -50, -78, 100, 120);
        ctx.restore();
        pvzText(ctx, '你获得了新植物!', 400, 420, 26, '#b8ff7a');
        pvzText(ctx, PLANTS[type] ? PLANTS[type].cn : type, 400, 458, 34, '#ffffff');
      } else {
        pvzText(ctx, '你击败了所有僵尸!', 400, 300, 30, '#b8ff7a');
        const trophy = img('trophy_hi_res.png');
        if (trophy) ctx.drawImage(trophy, 400 - 83, 200, 166, 136);
      }
      const a = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save(); ctx.globalAlpha = a;
      pvzText(ctx, '点 击 继 续', 400, 540, 24, '#ffe9a8');
      ctx.restore();
    },
    click(p, game) { game.afterAward(); },
  },

  // ================================================================
  // 纸条屏 — X-5 / X-10 僵尸纸条 (原版 ZombieNote)
  // ================================================================
  note: {
    draw(ctx) {
      ctx.fillStyle = '#0a0805'; ctx.fillRect(0, 0, 800, 600);
      const t = Screens.t;
      const note = img('zombienote.jpg');
      if (note) {
        const w = 560, h = w * 427 / 654;
        ctx.save();
        ctx.translate(400, 300);
        ctx.rotate(Math.sin(t * 0.8) * 0.012);
        // 纸条阴影
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 30;
        ctx.drawImage(note, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#d8cfa0'; ctx.fillRect(200, 140, 400, 300);
      }
      pvzText(ctx, '僵尸留下了奇怪的纸条…', 400, 60, 24, '#c8b28a');
      const a = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save(); ctx.globalAlpha = a;
      pvzText(ctx, '点 击 继 续', 400, 560, 22, '#ffe9a8');
      ctx.restore();
    },
    click(p, game) { game.afterAward(); },
  },

  // ================================================================
  // 失败屏 — 原版 ZombiesWon 大图
  // ================================================================
  lose: {
    draw(ctx) {
      ctx.fillStyle = '#050604'; ctx.fillRect(0, 0, 800, 600);
      const t = Screens.t;
      const won = img('zombieswon.png');
      if (won) {
        ctx.save();
        const sc = 1 + Math.max(0, 0.25 - t * 0.18);
        ctx.translate(400, 280);
        ctx.scale(sc, sc);
        ctx.drawImage(won, -282, -234, 564, 468);
        ctx.restore();
      }
      // 抖动的脑子
      const brain = img('brain.png');
      if (brain) {
        ctx.save();
        ctx.translate(400 + Math.sin(t * 9) * 4, 520 + Math.cos(t * 7) * 3);
        ctx.drawImage(brain, -30, -24, 60, 48);
        ctx.restore();
      }
      const a = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save(); ctx.globalAlpha = a;
      pvzText(ctx, '再 试 一 次', 400, 575, 26, '#ff8a6a');
      ctx.restore();
    },
    click(p, game) { game.retryLevel(); },
  },
};

if (typeof module !== 'undefined') module.exports = { Screens, pvzText, inRect };
