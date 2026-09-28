/* web-pvz — scenes.js
 * 场景管理：标题、选关、选卡、游戏（含暂停/胜负面板）、图鉴、设置
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});
  const { U, G, PLANTS, ZOMBIES, LEVELS } = PVZ;
  const { SP, SZ, A } = PVZ;

  /* ============ 按钮组件 ============ */
  let _btnId = 0;
  class Button {
    constructor(x, y, w, h, label, opt = {}) {
      this.id = _btnId++;
      this.x = x; this.y = y; this.w = w; this.h = h;
      this.label = label;
      this.opt = opt;
      this.hover = false;
      this.disabled = opt.disabled || false;
      this.onClick = opt.onClick || (() => {});
    }
    contains(px, py) {
      return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
    }
    handle(p) {
      if (p.type === 'pointermove') {
        const h = this.contains(p.x, p.y) && !this.disabled;
        if (h && !this.hover) A.S.hover();
        this.hover = h;
      } else if (p.type === 'pointerdown' && this.contains(p.x, p.y)) {
        A.S.click();
        this.onClick(this);
        return true;
      }
      return false;
    }
    draw(ctx) {
      ctx.save();
      const h = this.hover && !this.disabled;
      const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
      if (this.disabled) {
        g.addColorStop(0, '#9A9A9A'); g.addColorStop(1, '#7A7A7A');
      } else if (h) {
        g.addColorStop(0, this.opt.hoverTop || '#FFE9A0');
        g.addColorStop(1, this.opt.hoverBottom || '#E8B040');
      } else {
        g.addColorStop(0, this.opt.top || '#F8D878');
        g.addColorStop(1, this.opt.bottom || '#C89828');
      }
      ctx.fillStyle = g;
      U.rr(ctx, this.x, this.y, this.w, this.h, 10);
      ctx.fill();
      ctx.strokeStyle = this.disabled ? '#5A5A5A' : '#8A6818';
      ctx.lineWidth = 2.5;
      U.rr(ctx, this.x, this.y, this.w, this.h, 10);
      ctx.stroke();
      /* 高光 */
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      U.rr(ctx, this.x + 4, this.y + 3, this.w - 8, this.h * 0.35, 8);
      ctx.fill();
      U.text(ctx, this.label, this.x + this.w / 2, this.y + this.h / 2 + 1, {
        size: this.opt.size || 18,
        fill: this.disabled ? '#C8C8C8' : (this.opt.color || '#5A3A10'),
      });
      ctx.restore();
    }
  }

  /* ============ 场景基类 ============ */
  class Scene {
    constructor(game) {
      this.game = game;
      this.buttons = [];
      this.t = 0;
    }
    update(dt) { this.t += dt; }
    draw(ctx) {}
    handlePointer(p) {
      for (const b of this.buttons) if (b.handle(p)) return true;
      return false;
    }
  }

  /* ============ 标题场景 ============ */
  class TitleScene extends Scene {
    constructor(game) {
      super(game);
      const cx = G.W / 2;
      this.buttons = [
        new Button(cx - 110, 300, 220, 52, '冒 险 模 式', {
          size: 22,
          onClick: () => game.goto(new LevelSelectScene(game)),
        }),
        new Button(cx - 110, 366, 220, 52, game.save.endlessUnlocked ? '无 尽 模 式' : '无尽模式（未解锁）', {
          size: game.save.endlessUnlocked ? 22 : 17, disabled: !game.save.endlessUnlocked,
          onClick: () => {
            if (game.save.endlessUnlocked) game.startLevel(LEVELS.find((l) => l.id === 'endless'));
          },
        }),
        new Button(cx - 110, 432, 220, 52, '植 物 图 鉴', {
          size: 22,
          onClick: () => game.goto(new AlmanacScene(game)),
        }),
        new Button(cx - 110, 498, 220, 52, '设 置', {
          size: 22,
          onClick: () => game.goto(new SettingsScene(game)),
        }),
      ];
      A.playMusic('menu');
    }
    draw(ctx) {
      /* 背景 */
      SP.drawBackground(ctx);
      /* 装饰：两侧植物与僵尸剪影 */
      ctx.save();
      ctx.translate(140, 520);
      ctx.scale(1.4, 1.4);
      const deco = { anim: { t: this.t }, seed: 2, hp: 1, maxHp: 1, armed: true };
      SP.plant(ctx, 'sunflower', deco);
      ctx.restore();
      ctx.save();
      ctx.translate(300, 520);
      ctx.scale(1.4, 1.4);
      SP.plant(ctx, 'peashooter', deco);
      ctx.restore();
      ctx.save();
      ctx.translate(700, 520);
      ctx.scale(1.35, 1.35);
      const zDeco = {
        type: 'normal', chill: 0, helmHp: 0, shieldHp: 0,
        anim: { t: this.t, eating: false, dying: false, walkRate: 2.4 },
      };
      SZ.draw(ctx, zDeco);
      ctx.restore();
      ctx.save();
      ctx.translate(840, 520);
      ctx.scale(1.35, 1.35);
      const zDeco2 = {
        type: 'cone', chill: 0, helmHp: 370, shieldHp: 0,
        anim: { t: this.t + 2, eating: false, dying: false, walkRate: 2.2 },
      };
      SZ.draw(ctx, zDeco2);
      ctx.restore();

      /* 标题 */
      ctx.save();
      const cx = G.W / 2;
      const bounce = Math.sin(this.t * 1.8) * 6;
      ctx.translate(cx, 130 + bounce);
      ctx.rotate(-0.02);
      U.text(ctx, '植物大战僵尸', 0, 0, {
        size: 72, fill: '#FFE060', stroke: '#3A5A10', strokeW: 12,
      });
      U.text(ctx, 'WEB EDITION', 0, 52, {
        size: 26, fill: '#FFFFFF', stroke: '#3A5A10', strokeW: 6,
      });
      ctx.restore();

      /* 太阳装饰 */
      ctx.save();
      ctx.translate(G.W - 90, 80);
      ctx.scale(1.6, 1.6);
      SP.drawSun(ctx, { x: 0, y: 0, r: 24, anim: { t: this.t } });
      ctx.restore();

      for (const b of this.buttons) b.draw(ctx);

      U.text(ctx, '机制参考 PvZ-Portable · 数值取自 PVZ-Godot-Dream · 全程序化绘制', cx, G.H - 16, {
        size: 12, fill: 'rgba(255,255,255,0.85)', stroke: 'rgba(0,0,0,0.4)', strokeW: 3,
      });
    }
  }

  /* ============ 选关场景 ============ */
  class LevelSelectScene extends Scene {
    constructor(game) {
      super(game);
      const cx = G.W / 2;
      this.buttons = [
        new Button(24, 20, 100, 44, '← 返回', { onClick: () => game.goto(new TitleScene(game)) }),
      ];
      /* 关卡卡片 */
      this.levelCards = [];
      const cardW = 160, cardH = 190, gap = 18;
      const count = 5;
      const totalW = count * cardW + (count - 1) * gap;
      const x0 = cx - totalW / 2;
      LEVELS.filter((l) => l.id !== 'endless').forEach((lv, i) => {
        const x = x0 + i * (cardW + gap), y = 140;
        const unlocked = game.save.unlocked >= lv.id;
        this.levelCards.push({ lv, x, y, w: cardW, h: cardH, unlocked });
        this.buttons.push(new Button(x, y, cardW, cardH, '', {
          top: unlocked ? '#A8D878' : '#9A9A9A',
          bottom: unlocked ? '#5A9838' : '#6E6E6E',
          hoverTop: '#C8EC9A', hoverBottom: '#78B448',
          disabled: !unlocked,
          onClick: () => game.goto(new SeedSelectScene(game, lv)),
        }));
      });
      /* 无尽卡片（下方） */
      this.endlessCard = {
        x: cx - 130, y: 360, w: 260, h: 90,
        unlocked: game.save.endlessUnlocked,
      };
      this.buttons.push(new Button(cx - 130, 360, 260, 90, this.endlessCard.unlocked ? '无 尽 模 式' : '🔒 通关第 5 关解锁', {
        size: 24,
        top: this.endlessCard.unlocked ? '#D89028' : '#9A9A9A',
        bottom: this.endlessCard.unlocked ? '#A05808' : '#6E6E6E',
        disabled: !this.endlessCard.unlocked,
        onClick: () => {
          const lv = LEVELS.find((l) => l.id === 'endless');
          game.goto(new SeedSelectScene(game, lv));
        },
      }));
      this.bestWave = U.load('bestWave', 0);
    }
    draw(ctx) {
      SP.drawBackground(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, G.W, G.H);
      U.text(ctx, '选择关卡', G.W / 2, 70, {
        size: 40, fill: '#FFE060', stroke: '#3A2A10', strokeW: 7,
      });

      for (const b of this.buttons) b.draw(ctx);

      /* 关卡卡片内容 */
      for (const c of this.levelCards) {
        const { x, y, w, h, lv, unlocked } = c;
        U.text(ctx, lv.name, x + w / 2, y + 34, {
          size: 24, fill: unlocked ? '#2A3A10' : '#B8B8B8',
        });
        U.text(ctx, `${lv.waves} 波僵尸`, x + w / 2, y + 70, { size: 15, fill: '#3A3A3A' });
        U.text(ctx, `${lv.plants.length} 种植物可选`, x + w / 2, y + 94, { size: 15, fill: '#3A3A3A' });
        U.text(ctx, unlocked ? lv.intro.slice(0, 11) : '尚未解锁', x + w / 2, y + 130, {
          size: 13, fill: unlocked ? '#5A5A5A' : '#989898',
        });
        if (!unlocked) {
          ctx.save();
          ctx.globalAlpha = 0.7;
          U.text(ctx, '🔒', x + w / 2, y + 158, { size: 26 });
          ctx.restore();
        } else if (this.game.save.cleared >= lv.id) {
          U.text(ctx, '★ 已通关', x + w / 2, y + 160, { size: 15, fill: '#B88018' });
        }
      }
      if (this.endlessCard.unlocked && this.bestWave > 0) {
        U.text(ctx, `最高纪录：第 ${this.bestWave} 波`, G.W / 2, 478, {
          size: 16, fill: '#F0E8C8', stroke: 'rgba(0,0,0,0.5)', strokeW: 4,
        });
      }
      U.text(ctx, '通关任意关卡后进度自动保存（localStorage）', G.W / 2, G.H - 20, {
        size: 13, fill: 'rgba(255,255,255,0.8)', stroke: 'rgba(0,0,0,0.4)', strokeW: 3,
      });
    }
  }

  /* ============ 选卡场景 ============ */
  class SeedSelectScene extends Scene {
    constructor(game, level) {
      super(game);
      this.level = level;
      this.maxSlots = Math.min(level.slots, level.plants.length);
      this.picked = level.plants.slice(0, this.maxSlots); /* 默认全选 */
      this.cards = level.plants.map((t) => ({ type: t }));
      this.layout();
      A.playMusic('menu');
    }
    layout() {
      const cols = 7;
      const cw = 92, chh = 118, gap = 12;
      const totalW = cols * cw + (cols - 1) * gap;
      const x0 = G.W / 2 - totalW / 2, y0 = 160;
      this.cards.forEach((c, i) => {
        c.x = x0 + (i % cols) * (cw + gap);
        c.y = y0 + Math.floor(i / cols) * (chh + gap);
        c.w = cw; c.h = chh;
      });
      this.buttons = [
        new Button(G.W / 2 - 180, G.H - 74, 160, 50, '← 返回', {
          onClick: () => this.game.goto(new LevelSelectScene(this.game)),
        }),
        new Button(G.W / 2 + 20, G.H - 74, 160, 50, `开 始 战 斗`, {
          size: 20,
          onClick: () => this.game.startLevel(this.level, this.picked),
        }),
      ];
    }
    handlePointer(p) {
      for (const b of this.buttons) if (b.handle(p)) return true;
      if (p.type === 'pointerdown') {
        for (const c of this.cards) {
          if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
            const idx = this.picked.indexOf(c.type);
            if (idx >= 0) {
              if (this.picked.length > 1) this.picked.splice(idx, 1);
            } else {
              this.picked.push(c.type);
            }
            A.S.click();
            return true;
          }
        }
      }
      return false;
    }
    draw(ctx) {
      SP.drawBackground(ctx);
      ctx.fillStyle = 'rgba(20,30,15,0.55)';
      ctx.fillRect(0, 0, G.W, G.H);

      U.text(ctx, `${this.level.name} — 选择植物`, G.W / 2, 60, {
        size: 34, fill: '#FFE060', stroke: '#3A2A10', strokeW: 6,
      });
      U.text(ctx, `${this.level.intro}`, G.W / 2, 100, {
        size: 16, fill: '#F0E8D0', stroke: 'rgba(0,0,0,0.5)', strokeW: 4,
      });
      U.text(ctx, `已选 ${this.picked.length} / ${this.maxSlots}（至少选 1 种）`, G.W / 2, 130, {
        size: 15, fill: '#C8E8A0', stroke: 'rgba(0,0,0,0.5)', strokeW: 4,
      });

      /* 卡片 */
      for (const c of this.cards) {
        const picked = this.picked.includes(c.type);
        ctx.save();
        ctx.fillStyle = picked ? 'rgba(250,240,200,0.95)' : 'rgba(120,118,100,0.55)';
        U.rr(ctx, c.x, c.y, c.w, c.h, 10);
        ctx.fill();
        ctx.strokeStyle = picked ? '#B89040' : 'rgba(80,80,70,0.8)';
        ctx.lineWidth = 2.5;
        U.rr(ctx, c.x, c.y, c.w, c.h, 10);
        ctx.stroke();
        ctx.restore();
        /* 植物图 */
        ctx.save();
        ctx.translate(c.x + c.w / 2, c.y + c.h - 26);
        ctx.scale(0.62, 0.62);
        SP.plant(ctx, c.type, { anim: { t: this.t + this.cards.indexOf(c) }, seed: 1, hp: 1, maxHp: 1, armed: true });
        ctx.restore();
        U.text(ctx, PLANTS[c.type].name, c.x + c.w / 2, c.y + 16, {
          size: 14, fill: picked ? '#3A2A10' : '#D8D8C8',
        });
        /* 阳光费 */
        SP.sunIcon(ctx, c.x + 20, c.y + c.h - 12, 7);
        U.text(ctx, String(PLANTS[c.type].cost), c.x + c.w - 18, c.y + c.h - 12, {
          size: 13, fill: picked ? '#2A2A2A' : '#BBB',
        });
      }

      for (const b of this.buttons) b.draw(ctx);
    }
  }

  /* ============ 图鉴场景 ============ */
  class AlmanacScene extends Scene {
    constructor(game, tab = 'plant') {
      super(game);
      this.game = game;
      this.tab = tab;
      this.detail = null;
      const keys = Object.keys(PLANTS);
      this.plantKeys = keys;
      this.zombieKeys = Object.keys(ZOMBIES);
      /* 图鉴卡片布局（供点击检测） */
      this.cardRects = [];
      const cols = 6, cw = 118, chh = 118, gap = 14;
      const totalW = cols * cw + (cols - 1) * gap;
      const x0 = G.W / 2 - totalW / 2, y0 = 96;
      this.cardLayout = { cols, cw, chh, gap, x0, y0 };
      this.buttons = [
        new Button(24, 20, 100, 44, '← 返回', { onClick: () => game.goto(new TitleScene(game)) }),
        new Button(G.W / 2 - 180, 542, 160, 44, '植 物', {
          top: tab === 'plant' ? '#C8EC9A' : '#F8D878', bottom: tab === 'plant' ? '#78B448' : '#C89828',
          onClick: () => game.goto(new AlmanacScene(game, 'plant')),
        }),
        new Button(G.W / 2 + 20, 542, 160, 44, '僵 尸', {
          top: tab === 'zombie' ? '#F0B8A0' : '#F8D878', bottom: tab === 'zombie' ? '#B86848' : '#C89828',
          onClick: () => game.goto(new AlmanacScene(game, 'zombie')),
        }),
      ];
    }
    handlePointer(p) {
      for (const b of this.buttons) if (b.handle(p)) return true;
      if (p.type === 'pointerdown') {
        if (this.detail) {
          this.detail = null;
          return true;
        }
        /* 点击卡片打开详情 */
        const keys = this.tab === 'plant' ? this.plantKeys : this.zombieKeys;
        const { cols, cw, chh, x0, y0 } = this.cardLayout;
        for (let i = 0; i < keys.length; i++) {
          const x = x0 + (i % cols) * (cw + this.cardLayout.gap);
          const y = y0 + Math.floor(i / cols) * (chh + this.cardLayout.gap);
          if (p.x >= x && p.x <= x + cw && p.y >= y && p.y <= y + chh) {
            this.detail = keys[i];
            A.S.click();
            return true;
          }
        }
      }
      return false;
    }
    draw(ctx) {
      SP.drawBackground(ctx);
      ctx.fillStyle = 'rgba(25,20,10,0.72)';
      ctx.fillRect(0, 0, G.W, G.H);

      if (!this.detail) {
        U.text(ctx, this.tab === 'plant' ? '植物图鉴' : '僵尸图鉴', G.W / 2, 60, {
          size: 36, fill: '#FFE060', stroke: '#3A2A10', strokeW: 6,
        });
        const keys = this.tab === 'plant' ? this.plantKeys : this.zombieKeys;
        const defs = this.tab === 'plant' ? PLANTS : ZOMBIES;
        const cols = 6, cw = 118, chh = 118, gap = 14;
        const totalW = cols * cw + (cols - 1) * gap;
        const x0 = G.W / 2 - totalW / 2, y0 = 96;
        keys.forEach((k, i) => {
          const x = x0 + (i % cols) * (cw + gap);
          const y = y0 + Math.floor(i / cols) * (chh + gap);
          ctx.save();
          ctx.fillStyle = 'rgba(245,235,200,0.92)';
          U.rr(ctx, x, y, cw, chh, 10);
          ctx.fill();
          ctx.strokeStyle = '#B89040';
          ctx.lineWidth = 2;
          U.rr(ctx, x, y, cw, chh, 10);
          ctx.stroke();
          ctx.restore();
          /* 图标 */
          ctx.save();
          ctx.translate(x + cw / 2, y + chh - 22);
          ctx.scale(0.66, 0.66);
          if (this.tab === 'plant') {
            SP.plant(ctx, k, { anim: { t: this.t + i }, seed: 1, hp: 1, maxHp: 1, armed: true });
          } else {
            SZ.draw(ctx, {
              type: k, chill: 0, helmHp: ZOMBIES[k].helm || 0, shieldHp: ZOMBIES[k].shield || 0,
              anim: { t: this.t + i, eating: false, dying: false, walkRate: 2.2 },
            });
          }
          ctx.restore();
          U.text(ctx, defs[k].name, x + cw / 2, y + 18, { size: 14, fill: '#3A2A10' });
          if (this.tab === 'plant') {
            SP.sunIcon(ctx, x + 22, y + chh - 14, 7);
            U.text(ctx, String(defs[k].cost), x + 40, y + chh - 14, { size: 12, fill: '#2A2A2A', align: 'left' });
          } else {
            const hp = (defs[k].body || 0) + (defs[k].helm || 0) + (defs[k].shield || 0);
            U.text(ctx, `血量 ${hp}`, x + cw / 2, y + chh - 14, { size: 12, fill: '#8A2A2A' });
          }
        });
      } else {
        /* 详情页 */
        const k = this.detail;
        const def = this.tab === 'plant' ? PLANTS[k] : ZOMBIES[k];
        ctx.save();
        ctx.fillStyle = 'rgba(248,240,210,0.96)';
        U.rr(ctx, G.W / 2 - 330, 70, 660, 440, 16);
        ctx.fill();
        ctx.strokeStyle = '#8A6818';
        ctx.lineWidth = 3;
        U.rr(ctx, G.W / 2 - 330, 70, 660, 440, 16);
        ctx.stroke();
        ctx.restore();
        /* 大图 */
        ctx.save();
        ctx.translate(G.W / 2 - 170, 420);
        ctx.scale(2.2, 2.2);
        if (this.tab === 'plant') {
          SP.plant(ctx, k, { anim: { t: this.t }, seed: 1, hp: 1, maxHp: 1, armed: true });
        } else {
          SZ.draw(ctx, {
            type: k, chill: 0, helmHp: def.helm || 0, shieldHp: def.shield || 0,
            anim: { t: this.t, eating: false, dying: false, walkRate: 2.2 },
          });
        }
        ctx.restore();
        U.text(ctx, def.name, G.W / 2 + 60, 120, { size: 30, fill: '#3A2A10' });
        U.text(ctx, def.en, G.W / 2 + 60, 152, { size: 15, fill: '#8A7A50' });
        /* 属性 */
        const lines = [];
        if (this.tab === 'plant') {
          lines.push(`阳光费用：${def.cost}`);
          lines.push(`冷却时间：${def.recharge} 秒`);
          lines.push(`耐久：${def.hp}`);
          if (def.shoot) lines.push(`伤害：${def.shoot.dmg}${def.shoot.count ? ' ×2' : ''} / ${def.shoot.interval}s`);
          if (def.shoot && def.shoot.chill) lines.push(`附加效果：冰冻减速 ${def.shoot.chill}s`);
          if (def.sun) lines.push(`生产：每 ${def.sun.next[0]}~${def.sun.next[1]}s 产 ${def.sun.value} 阳光`);
          if (def.dmg) lines.push(`爆发伤害：${def.dmg}`);
          if (def.arm) lines.push(`武装时间：${def.arm}s`);
          if (def.chew) lines.push(`咀嚼时间：${def.chew}s`);
        } else {
          lines.push(`总血量：${(def.body || 0) + (def.helm || 0) + (def.shield || 0)}`);
          if (def.helm) lines.push(`护甲血量：${def.helm}`);
          if (def.shield) lines.push(`手持物血量：${def.shield}`);
          lines.push(`啃食伤害：100 / 秒`);
          lines.push(`速度：${def.speed ? (Array.isArray(def.speed) ? def.speed[0].toFixed(0) + '~' + def.speed[1].toFixed(0) : def.speed) : '-'}`);
        }
        lines.forEach((l, i) => {
          U.text(ctx, l, G.W / 2 + 30, 195 + i * 26, { size: 15, fill: '#4A3A20', align: 'left' });
        });
        /* 描述 */
        U.text(ctx, def.desc, G.W / 2 + 60, 195 + lines.length * 26 + 30, {
          size: 14, fill: '#6A5A3A', align: 'left',
        });
        if (def.tip) {
          U.text(ctx, `小贴士：${def.tip}`, G.W / 2 + 60, 195 + lines.length * 26 + 58, {
            size: 14, fill: '#8A6818', align: 'left',
          });
        }
        U.text(ctx, '点击任意处返回列表', G.W / 2, 548, {
          size: 14, fill: 'rgba(255,255,255,0.8)', stroke: 'rgba(0,0,0,0.5)', strokeW: 3,
        });
      }
    }
  }

  /* ============ 设置场景 ============ */
  class SettingsScene extends Scene {
    constructor(game) {
      super(game);
      this.game = game;
      this.buttons = [
        new Button(24, 20, 100, 44, '← 返回', { onClick: () => game.goto(new TitleScene(game)) }),
        new Button(G.W / 2 - 100, 380, 200, 48, A.musicOn ? '音乐：开' : '音乐：关', {
          onClick: (b) => {
            A.setMusicOn(!A.musicOn);
            b.label = A.musicOn ? '音乐：开' : '音乐：关';
            b.opt.top = A.musicOn ? '#F8D878' : '#B8B8B8';
            b.opt.bottom = A.musicOn ? '#C89828' : '#8A8A8A';
          },
        }),
        new Button(G.W / 2 - 100, 440, 200, 48, A.sfxOn ? '音效：开' : '音效：关', {
          onClick: (b) => {
            A.setSfxOn(!A.sfxOn);
            b.label = A.sfxOn ? '音效：开' : '音效：关';
            b.opt.top = A.sfxOn ? '#F8D878' : '#B8B8B8';
            b.opt.bottom = A.sfxOn ? '#C89828' : '#8A8A8A';
          },
        }),
        new Button(G.W / 2 - 100, 500, 200, 48, '清除存档', {
          top: '#E89078', bottom: '#B04828',
          onClick: () => {
            U.save('unlocked', 1);
            U.save('cleared', 0);
            U.save('endlessUnlocked', false);
            U.save('bestWave', 0);
            this.game.save = { unlocked: 1, cleared: 0, endlessUnlocked: false };
          },
        }),
      ];
      /* 音量滑条交互 */
      this.sliders = [
        { label: '音乐音量', get: () => A.musicVol, set: (v) => A.setMusicVol(v), x: G.W / 2 - 130, y: 250, w: 260 },
        { label: '音效音量', get: () => A.sfxVol, set: (v) => A.setSfxVol(v), x: G.W / 2 - 130, y: 320, w: 260 },
      ];
      this.dragSlider = null;
    }
    handlePointer(p) {
      for (const b of this.buttons) if (b.handle(p)) return true;
      if (p.type === 'pointerdown') {
        for (const s of this.sliders) {
          if (p.y >= s.y - 20 && p.y <= s.y + 20 && p.x >= s.x - 20 && p.x <= s.x + s.w + 20) {
            this.dragSlider = s;
            return true;
          }
        }
      }
      if (p.type === 'pointermove' && this.dragSlider) {
        const v = U.clamp((p.x - this.dragSlider.x) / this.dragSlider.w, 0, 1);
        this.dragSlider.set(v);
        return true;
      }
      if (p.type === 'pointerup') this.dragSlider = null;
      return false;
    }
    draw(ctx) {
      SP.drawBackground(ctx);
      ctx.fillStyle = 'rgba(20,30,15,0.6)';
      ctx.fillRect(0, 0, G.W, G.H);
      U.text(ctx, '设 置', G.W / 2, 80, {
        size: 40, fill: '#FFE060', stroke: '#3A2A10', strokeW: 7,
      });

      /* 滑条 */
      for (const s of this.sliders) {
        U.text(ctx, s.label, s.x + s.w / 2, s.y - 26, { size: 15, fill: '#F0E8D0' });
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        U.rr(ctx, s.x, s.y - 8, s.w, 16, 8);
        ctx.fill();
        ctx.fillStyle = '#F8D878';
        U.rr(ctx, s.x, s.y - 8, s.w * s.get(), 16, 8);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x + s.w * s.get(), s.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#FFE9A0';
        ctx.fill();
        ctx.strokeStyle = '#8A6818';
        ctx.lineWidth = 2;
        ctx.stroke();
        U.text(ctx, Math.round(s.get() * 100) + '%', s.x + s.w + 40, s.y, { size: 14, fill: '#F0E8D0' });
      }

      for (const b of this.buttons) b.draw(ctx);
      U.text(ctx, '提示：游戏中 P 键暂停 · F 键 2 倍速 · M 键静音', G.W / 2, G.H - 24, {
        size: 14, fill: 'rgba(255,255,255,0.85)', stroke: 'rgba(0,0,0,0.5)', strokeW: 3,
      });
    }
  }

  /* ============ 游戏场景 ============ */
  class GameScene extends Scene {
    constructor(game, levelDef, chosen) {
      super(game);
      this.board = new PVZ.Board(game, levelDef, chosen);
      this.paused = false;
      this.speed = 1;
      this.winPanelT = 0;
      this.buttons = [];
      this.rebuildButtons();
    }
    rebuildButtons() {
      const g = this.game;
      /* 顶部圆形小按钮 */
      this.roundButtons = [
        {
          x: G.W - 150, y: 10, w: 42, h: 42, label: '❚❚', labelSize: 14, round: true,
          onClick: () => { this.togglePause(); },
        },
        {
          x: G.W - 100, y: 10, w: 42, h: 42, label: () => this.board.gameSpeed > 1 ? '×2' : '×1',
          labelSize: 16, round: true,
          onClick: () => {
            this.board.gameSpeed = this.board.gameSpeed > 1 ? 1 : 2;
            A.S.click();
          },
        },
        {
          x: G.W - 50, y: 10, w: 42, h: 42, label: () => A.musicOn ? '♪' : '—',
          labelSize: 18, round: true,
          onClick: () => { A.setMusicOn(!A.musicOn); },
        },
      ];
      /* 胜利/失败面板按钮 */
      this.panelButtons = [];
      if (this.board.state === 'win') {
        const next = g.nextLevel(this.board.level);
        this.panelButtons.push({
          x: G.W / 2 - 170, y: 330, w: 150, h: 50, label: '返回主菜单',
          onClick: () => g.goto(new TitleScene(g)),
        });
        this.panelButtons.push({
          x: G.W / 2 + 20, y: 330, w: 150, h: 50, label: next ? '下一关 →' : '再玩一次',
          onClick: () => {
            if (next) g.goto(new SeedSelectScene(g, next));
            else g.goto(new SeedSelectScene(g, this.board.level));
          },
        });
      } else if (this.board.state === 'lose') {
        this.panelButtons.push({
          x: G.W / 2 - 170, y: 340, w: 150, h: 50, label: '返回主菜单',
          onClick: () => g.goto(new TitleScene(g)),
        });
        this.panelButtons.push({
          x: G.W / 2 + 20, y: 340, w: 150, h: 50, label: '重新开始',
          onClick: () => g.goto(new SeedSelectScene(g, this.board.level)),
        });
      }
      this.buttons = this.roundButtons.concat(this.panelButtons);
    }
    togglePause() {
      if (this.board.state !== 'playing') return;
      this.paused = !this.paused;
      if (this.paused) A.stopMusic();
      else A.playMusic('day');
    }
    handlePointer(p) {
      /* 面板按钮（胜利/失败） */
      if (this.board.state === 'win' || this.board.state === 'lose') {
        if (p.type === 'pointerdown') {
          for (const b of this.panelButtons) {
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
              A.S.click();
              b.onClick();
              return true;
            }
          }
        }
        return false;
      }

      /* 顶部圆形按钮 */
      for (const b of this.roundButtons) {
        const inRect = p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
        if (p.type === 'pointermove') b.hover = inRect;
        else if (p.type === 'pointerdown' && inRect) {
          A.S.click();
          b.onClick();
          return true;
        }
      }

      if (this.paused) {
        /* 暂停面板按钮 */
        if (p.type === 'pointerdown') {
          const rects = [
            { x: G.W / 2 - 80, y: 280, w: 160, h: 46, label: '继 续', fn: () => this.togglePause() },
            { x: G.W / 2 - 80, y: 340, w: 160, h: 46, label: '重 新 开 始', fn: () => this.game.goto(new SeedSelectScene(this.game, this.board.level)) },
            { x: G.W / 2 - 80, y: 400, w: 160, h: 46, label: '返 回 菜 单', fn: () => this.game.goto(new TitleScene(this.game)) },
          ];
          for (const r of rects) {
            if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
              A.S.click();
              r.fn();
              return true;
            }
          }
        }
        return false;
      }
      if (this.board.state !== 'playing') return false;

      const bd = this.board;
      /* 游戏内交互 */
      if (p.type === 'pointerdown') {
        /* 优先收集阳光 */
        if (bd.collectSunAt(p.x, p.y)) return true;
        /* 铲子模式 */
        if (bd.shovelMode) {
          const row = G.rowAt(p.y), col = G.colAt(p.x);
          if (bd.shovelAt(row, col)) {
            bd.shovelMode = false;
            return true;
          }
          bd.shovelMode = false;
          return true;
        }
        /* 卡片点击 */
        const cw = 56, chh = G.BANK_H - 22;
        for (let i = 0; i < bd.cards.length; i++) {
          const x = 88 + i * (cw + 5), y = 11;
          if (p.x >= x && p.x <= x + cw && p.y >= y && p.y <= y + chh) {
            const c = bd.cards[i];
            if (bd.sun >= PLANTS[c.type].cost && c.cd <= 0) {
              bd.selected = bd.selected === i ? -1 : i;
              bd.shovelMode = false;
              A.S.click();
            } else {
              A.S.error();
              bd.floatText('阳光不足！', x + cw / 2, y + chh + 14, '#FF6060');
            }
            return true;
          }
        }
        /* 铲子槽 */
        const sx = 88 + bd.cards.length * (cw + 5) + 8;
        if (p.x >= sx && p.x <= sx + 50 && p.y >= 11 && p.y <= 11 + chh) {
          bd.shovelMode = !bd.shovelMode;
          bd.selected = -1;
          A.S.click();
          return true;
        }
        /* 场地种植 */
        if (bd.selected >= 0) {
          const row = G.rowAt(p.y), col = G.colAt(p.x);
          if (bd.tryPlant(row, col)) return true;
        }
        return false;
      }
      if (p.type === 'pointermove') {
        bd.hoverCell = { row: G.rowAt(p.y), col: G.colAt(p.x) };
        /* 尝试沿途收集阳光（拖动收集） */
        bd.collectSunAt(p.x, p.y);
      }
      if (p.type === 'pointerup') {
        bd.hoverCell = null;
      }
      return false;
    }
    update(dt) {
      super.update(dt);
      if (this.board.state === 'win' && this.winPanelT === 0) {
        this.winPanelT = 0.001;
        this.rebuildButtons();
      }
      if (this.board.state === 'lose' && !this._loseBtns) {
        this._loseBtns = true;
        this.rebuildButtons();
        if (this.board.level.id === 'endless') {
          this.game.recordEndless(this.board.wave);
        }
      }
      if (!this.paused) {
        this.board.update(dt * this.board.gameSpeed);
      }
    }
    draw(ctx) {
      this.board.draw(ctx);

      /* 胜利面板 */
      if (this.board.state === 'win') {
        ctx.save();
        ctx.fillStyle = 'rgba(20,40,10,0.55)';
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = 'rgba(248,240,210,0.96)';
        U.rr(ctx, G.W / 2 - 240, 140, 480, 280, 18);
        ctx.fill();
        ctx.strokeStyle = '#B89040';
        ctx.lineWidth = 3;
        U.rr(ctx, G.W / 2 - 240, 140, 480, 280, 18);
        ctx.stroke();
        U.text(ctx, '关卡完成！', G.W / 2, 200, { size: 40, fill: '#3A7A10' });
        U.text(ctx, `击杀僵尸：${this.board.zombiesKilled} 只`, G.W / 2, 250, { size: 18, fill: '#4A3A20' });
        const lv = this.board.level;
        if (lv.id !== 'endless') {
          U.text(ctx, '下一关已解锁，新植物等你使用！', G.W / 2, 285, { size: 16, fill: '#8A6818' });
        } else {
          U.text(ctx, `坚持到了第 ${this.board.wave} 波！`, G.W / 2, 285, { size: 16, fill: '#8A6818' });
        }
        this.drawPanelButtons(ctx);
        ctx.restore();
      }

      /* 失败面板按钮（延迟出现） */
      if (this.board.state === 'lose' && this.board.stateT > 2.2) {
        this.drawPanelButtons(ctx);
      }

      /* 暂停面板 */
      if (this.paused) {
        ctx.save();
        ctx.fillStyle = 'rgba(10,20,8,0.6)';
        ctx.fillRect(0, 0, G.W, G.H);
        U.text(ctx, '暂 停', G.W / 2, 200, {
          size: 48, fill: '#FFE060', stroke: '#3A2A10', strokeW: 8,
        });
        const rects = [
          { x: G.W / 2 - 80, y: 280, w: 160, h: 46, label: '继 续' },
          { x: G.W / 2 - 80, y: 340, w: 160, h: 46, label: '重 新 开 始' },
          { x: G.W / 2 - 80, y: 400, w: 160, h: 46, label: '返 回 菜 单' },
        ];
        for (const r of rects) {
          ctx.fillStyle = '#F8D878';
          U.rr(ctx, r.x, r.y, r.w, r.h, 10);
          ctx.fill();
          ctx.strokeStyle = '#8A6818';
          ctx.lineWidth = 2.5;
          U.rr(ctx, r.x, r.y, r.w, r.h, 10);
          ctx.stroke();
          U.text(ctx, r.label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 18, fill: '#5A3A10' });
        }
        ctx.restore();
      }
    }
    drawPanelButtons(ctx) {
      for (const b of this.panelButtons) {
        ctx.save();
        const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
        g.addColorStop(0, '#FFE9A0');
        g.addColorStop(1, '#E8B040');
        ctx.fillStyle = g;
        U.rr(ctx, b.x, b.y, b.w, b.h, 10);
        ctx.fill();
        ctx.strokeStyle = '#8A6818';
        ctx.lineWidth = 2.5;
        U.rr(ctx, b.x, b.y, b.w, b.h, 10);
        ctx.stroke();
        U.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 17, fill: '#5A3A10' });
        ctx.restore();
      }
    }
  }

  PVZ.Button = Button;
  PVZ.TitleScene = TitleScene;
  PVZ.LevelSelectScene = LevelSelectScene;
  PVZ.SeedSelectScene = SeedSelectScene;
  PVZ.AlmanacScene = AlmanacScene;
  PVZ.SettingsScene = SettingsScene;
  PVZ.GameScene = GameScene;
})(window);
