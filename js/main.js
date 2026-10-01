// ============================================================
// main.js — 游戏主控制器: 状态机 / 输入 / 主循环
// 状态: loading → title → menu → (options/help/almanac) → playing(intro+选卡→play) → award/note → menu
// 冒险模式线性推进 (原版): 选卡融入开场过场 (CutScene 暂停机制)
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, MODE_LEVELS, availablePlants, MUSHROOMS, AQUATIC, GROUNDCOVER, UPGRADES, UPGRADE_ORDER, SHOP_ITEMS, awardPlantForLevel } = require('./data');
const { Board } = require('./board');
const { Plant } = require('./plants');
const { Zombie } = require('./zombie');
const { Projectile } = require('./projectiles');
const { Renderer } = require('./render');
const { UI, roundRect } = require('./ui');
const { Screens } = require('./screens');
const { Cutscene, Banners, Transition, setZombieDefs } = require('./cutscene');
const RE = require('./reanim');

setZombieDefs(ZOMBIES);

const Game = {
  state: 'loading',
  levelId: 1,
  board: null,
  progress: { unlocked: 1 },
  almanac: { tab: 'plants', page: 0, selected: null },
  selectedCard: -1,
  shovelMode: false,
  shovelUnlocked: false,   // 铲子解锁 (原版: 1-5 戴夫赠送)
  debugUnlocked: false,    // 调试模式: 选项屏一键解锁后置位
  justUnlocked: null,
  endless: false,
  selectedZombieCard: -1,   // 我不是僵尸: 选中的僵尸卡
  menuDialog: null,         // 游戏内菜单对话框 (#14: 菜单按钮 → 菜单页而非直接回主菜单)
  coins: 0,                 // 金币 (戴夫商店货币, 原版 $)
  purchased: {},            // 商店已购物 { key: true }
  shopTab: 'items',         // 商店页签

  async boot() {
    if (this._booted) return; this._booted = true;
    const cv = document.getElementById('game');
    this.canvas = cv;
    this.ctx = cv.getContext('2d');
    UI.init(this);
    this.audio = require('./audio');
    // 极简加载提示 (无全屏加载动画): 网络慢(>3s)才显示底部小字, 加载完成即隐藏
    const hint = document.getElementById('loadhint');
    let hintShown = false;
    const hintTimer = setTimeout(() => {
      if (hint && !this._assetsReady) { hint.style.display = 'block'; hintShown = true; }
    }, 3000);
    await Assets.load((p, msg) => {
      if (hint && hintShown) hint.textContent = `正在进入游戏 ${(p * 100).toFixed(0)}%`;
    });
    clearTimeout(hintTimer);
    if (hint) { hint.style.display = 'none'; hint.textContent = ''; }
    this._assetsReady = true;
    // 读取进度
    try {
      const save = JSON.parse(localStorage.getItem('webpvz_save') || '{}');
      if (save.unlocked) this.progress.unlocked = save.unlocked;
      if (save.debugUnlocked) this.debugUnlocked = true;
      if (save.coins) this.coins = save.coins;
      if (save.purchased) this.purchased = save.purchased;
      this.daveSeen = JSON.parse(localStorage.getItem('webpvz_dave') || '{}');
    } catch (e) { }
    this.daveSeen = this.daveSeen || {};
    this.purchasedSet = new Set(Object.keys(this.purchased));
    // 输入
    this.bindInput();
    // 开始
    this.state = 'title';
    Screens.game = this;
    this.audio.init();
    // 主循环
    let last = Date.now();
    const loop = () => {
      const now = Date.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt < 0 || dt > 0.25) dt = 1 / 60;
      try { this.update(dt); } catch (e) { window.__loopErr = window.__loopErr || []; window.__loopErr.push(String(e && e.stack || e).slice(0, 800)); }
      try { this.render(); } catch (e) { window.__loopErr = window.__loopErr || []; window.__loopErr.push('RENDER: ' + String(e && e.stack || e).slice(0, 800)); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  // ---------- 输入 ----------
  bindInput() {
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width * 800,
        y: (e.clientY - r.top) / r.height * 600,
      };
    };
    this.canvas.addEventListener('mousemove', e => { this.mouse = pos(e); Screens.mouse = this.mouse; });
    this.canvas.addEventListener('touchmove', e => {
      if (e.touches[0]) { this.mouse = pos(e.touches[0]); Screens.mouse = this.mouse; e.preventDefault(); }
    }, { passive: false });
    this.canvas.addEventListener('mousedown', e => { this.onClick(pos(e)); this.audio.resume(); });
    this.canvas.addEventListener('touchstart', e => {
      if (e.touches[0]) { this.onClick(pos(e)); this.audio.resume(); e.preventDefault(); }
    }, { passive: false });
    // 移动端: 长按/双击不弹菜单/缩放
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('gesturestart', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (this.state === 'playing' && this.board) {
          if (this.menuDialog) this.closeMenuDialog();
          else this.openMenuDialog();
        }
      }
      if (e.key === ' ' && this.state === 'playing' && this.board && !this.menuDialog) {
        this.board.speed = this.board.speed === 1 ? 2 : this.board.speed === 2 ? 4 : 1;
      }
    });
  },

  onClick(p) {
    switch (this.state) {
      case 'title': Screens.title.click(p, this); break;
      case 'menu': Screens.menu.click(p, this); break;
      case 'options': Screens.options.click(p, this); break;
      case 'help': Screens.help.click(p, this); break;
      case 'award': Screens.award.click(p, this); break;
      case 'note': Screens.note.click(p, this); break;
      case 'lose': Screens.lose.click(p, this); break;
      case 'levelselect': Screens.levelSelect.click(p, this); break;
      case 'modeselect': Screens.modeSelect.click(p, this); break;
      case 'shop': Screens.shop.click(p, this); break;
      case 'modewin': Screens.modeWin.click(p, this); break;
      case 'playing': this.gameClick(p); break;
      case 'almanac': this.almanacClick(p); break;
    }
  },

  // ---------- 选卡 (开场过场内, 原版 SeedChooserScreen) ----------
  seedChooseClick(p) {
    const board = this.board;
    const CutsceneM = require('./cutscene');
    const yOff = CutsceneM.Cutscene.active ? CutsceneM.Cutscene.chooserY : 0;
    const q = { x: p.x, y: p.y - yOff };   // 选卡界面坐标系
    // 开始按钮 (原版 (154,545,156,42))
    if (q.x >= 154 && q.x <= 310 && q.y >= 545 && q.y <= 587) {
      if (board.chosenSeeds.length > 0) {
        this.audio.play('buttonclick');
        CutsceneM.Cutscene.finishSeedChoosing();
      } else this.audio.play('buzzer');
      return;
    }
    // 随机 (原版 (332,546,100,30))
    if (q.x >= 332 && q.x <= 432 && q.y >= 546 && q.y <= 576) {
      const pool = availablePlants(this.levelId, this.purchasedSet);
      const n = Math.min(board.seedSlots, pool.length);
      board.chosenSeeds = shuffle(pool.slice()).slice(0, n);
      board.seedCards = board.chosenSeeds.map(t => ({ type: t, cd: 0 }));
      this.audio.play('seedlift');
      return;
    }
    // 卡片切换 (原版网格: col*53+22, row*73+128)
    const pool = availablePlants(this.levelId, this.purchasedSet);
    let changed = false;
    pool.forEach((type, i) => {
      const gx = (i % 8) * 53 + 22;
      const gy = Math.floor(i / 8) * 73 + 128;
      if (q.x >= gx && q.x <= gx + 50 && q.y >= gy && q.y <= gy + 70) {
        const idx = board.chosenSeeds.indexOf(type);
        if (idx >= 0) board.chosenSeeds.splice(idx, 1);
        else if (board.chosenSeeds.length < board.seedSlots) board.chosenSeeds.push(type);
        changed = true;
        this.audio.play('seedlift');
      }
    });
    // 实时同步种子银行 (原版: 选中的卡飞入卡槽)
    if (changed) board.seedCards = board.chosenSeeds.map(t => ({ type: t, cd: 0 }));
  },

  almanacClick(p) {
    const a = this.almanac;
    if (UI.backButton && hit(p, UI.backButton)) {
      this.state = 'menu'; this.audio.play('buttonclick'); return;
    }
    for (const t of (UI.almanacTabs || [])) {
      if (hit(p, t)) {
        a.tab = t.x < 400 ? 'plants' : 'zombies';
        a.selected = null;
        this.audio.play('tap');
        return;
      }
    }
    for (const c of (UI.almanacCells || [])) {
      if (hit(p, c)) {
        a.selected = a.selected === c.key ? null : c.key;
        this.audio.play('tap');
        return;
      }
    }
  },

  markDaveSeen(lv) {
    this.daveSeen[lv] = true;
    try { localStorage.setItem('webpvz_dave', JSON.stringify(this.daveSeen)); } catch (e) { }
  },

  gameClick(p) {
    const board = this.board;
    // ---- 游戏内菜单对话框 (打开时仅响应对话框) ----
    if (this.menuDialog) { this.menuDialogClick(p); return; }
    if (board.paused) { board.paused = false; return; }
    // ---- 菜单按钮 (原版: 打开选项菜单 = 暂停; 选卡期间同样可用 #15) ----
    if (p.x > 681 && p.x < 798 && p.y > 0 && p.y < 36) { this.openMenuDialog(); return; }
    // ---- 特殊模式点击路由 (打僵尸/罐子/我不是僵尸/雨天种子/宝石/坚不可摧) ----
    if (board.modeClick && board.modeClick(this, p)) return;
    // 选卡期间: 选卡界面交互
    if (Cutscene.active && Cutscene.seedChoosing) { this.seedChooseClick(p); return; }
    // 戴夫对话 (1-5 赠铲子): 点击推进
    if (Cutscene.active && Cutscene.davePhase) { Cutscene.daveClick(); return; }
    // 开场过场: 点击跳过 (不跳选卡关)
    if (Cutscene.active) {
      if (!Cutscene.board.level.chooseSeeds) Cutscene.t = Math.max(Cutscene.t, 5.9);
      return;
    }
    // 铲子 (原版: (extra+456, 0) 70x72; 1-4 关无铲子, 1-5 戴夫赠送后解锁)
    if (this.shovelUnlocked) {
      const cards0 = board.seedCards;
      const extra0 = cards0.length <= 6 ? 0 : cards0.length === 7 ? 60 : cards0.length === 8 ? 76 : cards0.length === 9 ? 112 : 153;
      const sx = extra0 + 456;
      if (p.x > sx && p.x < sx + 70 && p.y > 0 && p.y < 72) {
        this.shovelMode = !this.shovelMode;
        this.selectedCard = -1;
        this.audio.play('shovel');
        return;
      }
    }
    // 阳光/种子包收集 (challenge token 与普通阳光统一)
    for (const s of board.suns) {
      if (s.collected || s.dead || s.collecting) continue;
      const hitW = s.kind === 'seedpacket' ? 30 : 35;
      if (Math.abs(p.x - s.x) < hitW + 5 && Math.abs(p.y - s.y) < hitW + 5) {
        if (s.kind) {
          // challenge token: 阳光→加钱 种子包→拾取为手持卡
          s.collecting = true;
          if (s.kind === 'sun') {
            s.onCollect = () => { board.sun += (s.value || 25); };
            this.audio.play('points');
          } else if (s.kind === 'seedpacket') {
            s.onCollect = () => {
              if (board.challenge) {
                if (board.challenge.rainCards) board.challenge.heldCards.push({ type: s.type, life: 14 });
                else board.challenge.heldType = s.type;
              }
            };
            this.audio.play('seedlift');
          }
        } else {
          board.collectSun(s);
        }
        return;
      }
    }
    // 金币
    for (const c of board.coins) {
      if (!c.collected && Math.abs(p.x - c.x) < 30 && Math.abs(p.y - c.y) < 30) {
        c.collected = true;
        this.coins += c.value;
        this.coinsEarned = (this.coinsEarned || 0) + c.value;
        this.saveShop();
        this.audio.play('points');
        return;
      }
    }
    // ---- 特殊模式点击 (challenge.js: 罐子/锤子/老虎机/我是僵尸/宝石/坚不可摧) ----
    if (board.modeClick(this, p)) return;
    // ---- 传送带: 点击带上卡片 → 拾取 (原版 ClickOnSeed) ----
    if (board.mode === 'conveyor' && board.challenge && board.challenge.beltItems) {
      const ch = board.challenge;
      const yOff = Cutscene.active ? Cutscene.seedBankY : 0;
      for (let i = 0; i < ch.beltItems.length; i++) {
        const it = ch.beltItems[i];
        const bx = 91 + it.offsetX;
        if (p.x > bx && p.x < bx + 50 && p.y > 7 + yOff && p.y < 77 + yOff) {
          if (ch.heldType) {
            // 已持卡: 放回 (原版不可覆盖, 只能先种)
            this.audio.play('buzzer');
          } else {
            ch.heldType = it.type;
            this.selectedCard = 900 + i;
            ch.removeSeed(i);
            this.audio.play('seedlift');
          }
          return;
        }
      }
      // 点击已拾取的卡(顶栏左侧显示) → 取消选择放回? 原版: 只能种植, 右键取消; web简化: 再点卡区无效
      return;
    }
    // ---- 雨天种子: 持有卡选择 ----
    if (board.mode === 'raining' && board.challenge) {
      const held = board.challenge.heldCards || [];
      for (let i = 0; i < held.length; i++) {
        const x = 130 + i * 60;
        if (p.x > x && p.x < x + 50 && p.y > 6 && p.y < 76) {
          this.selectedCard = this.selectedCard === i ? -1 : i;
          this.audio.play('seedlift');
          return;
        }
      }
    }
    // ---- 常规选卡 ----
    const cards = board.seedCards;
    for (let i = 0; i < cards.length; i++) {
      const x = this.packetX(i, cards.length);
      if (p.x > x && p.x < x + 50 && p.y > 7 && p.y < 77) {
        const c = cards[i];
        const free = board.mode === 'conveyor';   // 传送带关卡无阳光花费
        if (c.cd <= 0 && (free || board.sun >= PLANTS[c.type].cost)) {
          this.selectedCard = this.selectedCard === i ? -1 : i;
          this.shovelMode = false;
          this.audio.play('seedlift');
        } else this.audio.play('buzzer');
        return;
      }
    }
    // 种植/铲除
    const cell = this.pixelToCell(p.x, p.y);
    if (cell) {
      const [col, row] = cell;
      if (this.shovelMode) {
        // 铲除(花盆/睡莲/南瓜/植物) — 原版: 南瓜优先→植物→花盆/睡莲
        const removed = board.gridPumpkin[row][col] || board.grid[row][col] || board.gridPot[row][col] || board.gridLily[row][col] ||
          board.gridSpikes[row][col];
        if (removed) {
          this.removePlant(removed, board);
          // #19 挖掘动画: 土块飞溅 + 铲子音效
          this.audio.play('shovel');
          this.audio.play('dirt_rise');
          board.addEffect('dust', board.gridX(col) + 40, board.cellY(row, col) + 40);
          // 植物弹出效果
          removed._shovelPop = 0.001;
          board.effects.push({
            kind: 'shovel_pop', x: removed.x + 40, y: removed.y + 40, t: 0, life: 0.4,
            update(dt) { this.t += dt; if (this.t > this.life) this.dead = true; },
          });
          this.shovelMode = false;
          this._shovelAnim = 0.35;   // 铲子挥动动画
          return;
        }
        return;
      }
      if (this.selectedCard >= 0) {
        // 雨天种子: 持有卡
        if (board.mode === 'raining') {
          const held = (board.challenge.heldCards || [])[this.selectedCard];
          if (held) {
            this.tryPlant(held.type, row, col, board);
            if (board.plants[board.plants.length - 1] && board.plants[board.plants.length - 1].row === row && board.plants[board.plants.length - 1].col === col) {
              board.challenge.heldCards.splice(this.selectedCard, 1);
              this.selectedCard = -1;
            }
          }
          return;
        }
        // 传送带: 手持的卡
        if (board.mode === 'conveyor' && board.challenge && board.challenge.heldType) {
          this.tryPlant(board.challenge.heldType, row, col, board);
          return;
        }
        if (cards[this.selectedCard]) {
          this.tryPlant(cards[this.selectedCard].type, row, col, board);
        }
        return;
      }
      // 玉米加农炮发射
      const cannon = board.plants.find(pl => pl.type === 'COBCANNON' && pl.row === row && (pl.col === col || pl.col + 1 === col) && pl.cobCD <= 0);
      if (cannon) {
        this.fireCob(cannon, col, row, board);
        return;
      }
    }
  },

  // 放弃当前关回菜单
  abandonLevel() {
    this.audio.play('buttonclick');
    this.audio.playBGM(null);
    Cutscene.active = false;
    Banners.clear();
    Transition.to(() => {
      this.state = 'menu';
      this.audio.playBGM('start_menu');
    }, 0.35);
  },

  removePlant(p, board) {
    p.dead = true;
    this.ungridPlant(p, board);
  },

  ungridPlant(p, board) {
    const clear = (g) => { for (let r = 0; r < board.rows; r++) for (let c = 0; c < 9; c++) if (g[r][c] === p) g[r][c] = null; };
    clear(board.grid); clear(board.gridLily); clear(board.gridPot); clear(board.gridPumpkin); clear(board.gridSpikes);
  },

  tryPlant(type, row, col, board) {
    const def = PLANTS[type];
    // 手持免费卡: 传送带 / 罐子掉落的种子包 / 天降种子
    const handHeld = !!(board.challenge && board.challenge.heldType === type) ||
      (board.mode === 'conveyor') || (board.mode === 'vasebreaker');
    const conveyor = board.mode === 'conveyor' || board.mode === 'vasebreaker';
    const card = conveyor ? null : board.seedCards[this.selectedCard];
    if (!conveyor && !card && !handHeld) { this.audio.play('buzzer'); return; }
    if (!conveyor && !handHeld && card && (card.cd > 0 || board.sun < def.cost)) { this.audio.play('buzzer'); return; }
    const bowling = board.level.fixed === 'bowling';
    // 坚果保龄球: 只能种第0-2列 (原版 CanPlantAt: theGridX > 2 ? NOT_PASSED_LINE : OK)
    if (bowling && col > 2) { this.audio.play('buzzer'); return; }
    // 只能种在草地行或水行 (1-1~1-3 单/三行关的泥地不可种植)
    if (!board.grassRows.includes(row) && !board.isWater(row, col)) { this.audio.play('buzzer'); return; }
    // 种植规则
    const isWater = board.isWater(row, col);
    // 水生植物必须种水, 非水生需要睡莲
    if (AQUATIC.has(type) && type !== 'LILYPAD' && type !== 'CATTAIL') {
      if (!isWater) { this.audio.play('buzzer'); return; }
      if (type !== 'LILYPAD' && !board.gridLily[row][col]) { this.audio.play('buzzer'); return; }
      if (type === 'TANGLEKELP' && !board.gridLily[row][col]) { this.audio.play('buzzer'); return; }
    } else if (AQUATIC.has(type)) { // LILYPAD/CATTAIL
      if (!isWater) { if (type === 'LILYPAD') { this.audio.play('buzzer'); return; } }
      if (type === 'CATTAIL' && (!isWater || !board.gridLily[row][col])) { this.audio.play('buzzer'); return; }
    } else {
      if (isWater && !board.gridLily[row][col]) { this.audio.play('buzzer'); return; }
      if (board.isRoof && type !== 'FLOWERPOT' && !board.gridPot[row][col] && !isWater) { this.audio.play('buzzer'); return; }
    }
    // 咖啡豆必须种在睡着的蘑菇上
    if (type === 'COFFEEBEAN') {
      const target = board.grid[row][col];
      if (!target || !target.sleeping) { this.audio.play('buzzer'); return; }
      target.setSleep(false);
      this.audio.play('coffee');
      if (!conveyor) board.sun -= def.cost;
      if (card) card.cd = def.cd / 1000;
      if (conveyor && board.challenge) { board.challenge.heldType = null; }
      this.selectedCard = -1;
      return;
    }
    // 墓碑吞噬者必须种在墓碑上
    if (type === 'GRAVEBUSTER') {
      if (!board.graves.some(g => g.row === row && g.col === col)) { this.audio.play('buzzer'); return; }
    }
    // 占位检查 (保龄球: 坚果直接滚动不占格)
    if (bowling) {
      // 无占位限制
    } else if (board.graves && board.graves.some(g => g.row === row && g.col === col) && type !== 'GRAVEBUSTER') {
      // #21 墓碑上不可种植 (墓碑吞噬者除外)
      this.audio.play('buzzer'); return;
    } else if (GROUNDCOVER.has(type)) {
      if (board.gridSpikes[row][col] || board.grid[row][col]) { this.audio.play('buzzer'); return; }
    } else if (type === 'PUMPKIN') {
      if (board.gridPumpkin[row][col]) { this.audio.play('buzzer'); return; }
    } else if (type === 'LILYPAD') {
      if (board.gridLily[row][col] || (!isWater)) { this.audio.play('buzzer'); return; }
    } else if (type === 'FLOWERPOT') {
      if (board.gridPot[row][col]) { this.audio.play('buzzer'); return; }
    } else {
      if (board.grid[row][col]) { this.audio.play('buzzer'); return; }
    }
    // 种植
    const p = new Plant(type, row, col, board);
    board.plants.push(p);
    if (bowling) {
      p.rolling = true;   // 坚果保龄球: 滚动 (plants.js WALLNUT case)
    } else if (type === 'LILYPAD') board.gridLily[row][col] = p;
    else if (type === 'FLOWERPOT') board.gridPot[row][col] = p;
    else if (type === 'PUMPKIN') board.gridPumpkin[row][col] = p;
    else if (GROUNDCOVER.has(type)) board.gridSpikes[row][col] = p;
    else board.grid[row][col] = p;
    // 音效 + 消耗
    if (!conveyor) board.sun -= def.cost;
    if (card) card.cd = def.cd / 1000;
    if (conveyor && board.challenge) { board.challenge.heldType = null; }   // 传送带卡一次性
    if (bowling) this.audio.play('throw');
    this.selectedCard = -1;
    this.audio.play(board.isWater(row, col) ? 'plant_water' : (Math.random() < 0.5 ? 'plant' : 'plant2'));
  },

  fireCob(cannon, col, row, board) {
    const pr = new Projectile('cob', cannon.x + 80, cannon.y + 10, row, cannon, { tx: board.gridX(col) + 40 });
    pr.dur = 0.9; pr.sx = cannon.x + 80; pr.sy = cannon.y + 10;
    board.projectiles.push(pr);
    cannon.cobCD = PLANTS.COBCANNON.cobCD;
    cannon.anim.play('anim_shooting', RE.PLAY_ONCE_HOLD, 12);
    this.audio.play('coblauncher');
  },

  pixelToCell(x, y) {
    const board = this.board;
    if (!board) return null;
    if (x < CONST.LAWN_XMIN || x > CONST.LAWN_XMIN + 9 * 80) return null;
    const col = Math.floor((x - CONST.LAWN_XMIN) / 80);
    // 行: 逐行判断(考虑屋顶坡度)
    for (let r = board.rows - 1; r >= 0; r--) {
      const ry = board.cellY(r, col);
      const rh = (board.scene === 'pool' || board.scene === 'fog') ? 85 : 100;
      if (y >= ry && y < ry + rh) return [col, r];
    }
    return null;
  },

  // 原版卡包位置 (Board::GetSeedPacketPositionX)
  packetX(i, n) {
    if (n <= 7) return i * 59 + 85;
    if (n === 8) return i * 54 + 81;
    if (n === 9) return i * 52 + 80;
    return i * 51 + 79;
  },

  // ---------- 流程 (原版冒险: 线性推进) ----------
  // 主菜单点击冒险 → 下一未通关卡 (全解锁调试模式 → 关卡选择屏)
  startAdventure() {
    if (this.debugUnlocked && this.progress.unlocked > 50) {
      this.state = 'levelselect';
      Screens.levelSelect.enter();
      return;
    }
    const lv = Math.min(this.progress.unlocked, 50);
    this.startLevel(lv);
  },

  startLevel(lv) {
    this.levelId = lv;
    this.modeKey = null;
    this.endless = false;
    this.levelDef = LEVELS[lv - 1];
    const level = this.levelDef;
    this._startCommon(level);
  },

  // 额外模式入口 (玩玩小游戏 / 解谜 / 生存)
  startMode(key) {
    const level = MODE_LEVELS[key];
    if (!level) return;
    this.levelId = level.id;
    this.modeKey = key;
    this.endless = !!level.endless;
    this.levelDef = level;
    this._startCommon(level);
  },

  _startCommon(level) {
    const lv = this.levelId;
    // 铲子解锁 (特殊玩法关卡无铲子)
    const specialNoShovel = ['bowling', 'whack', 'vasebreaker', 'izombie'].includes(level.fixed);
    const firstTime = this.progress.unlocked <= lv;
    if (specialNoShovel) this.shovelUnlocked = false;
    else if (lv === 5 && firstTime) this.shovelUnlocked = false;   // 1-5 首次: 由戴夫对话解锁
    else this.shovelUnlocked = lv >= 5 || !firstTime;
    const board = new Board(this, level);
    this.board = board;
    this.selectedCard = -1;
    this.selectedZombieCard = -1;
    this.shovelMode = false;
    this.menuDialog = null;
    Banners.clear();
    // 选卡方式 (原版): 1-7 固定卡槽(全部解锁植物), 1-8+ 手动选卡; 传送带/特殊玩法无选卡
    const noChoose = !!level.fixed || level.rainingSeeds;
    const pool = lv <= 50 ? availablePlants(lv, this.purchasedSet) : availablePlants(50, this.purchasedSet);
    board.seedSlots = (level.chooseSeeds && !noChoose) ? Math.min(pool.length, this.bankSlotsFor(lv) || level.bankSlots || 9) : pool.length;
    board.chosenSeeds = [];
    if (!level.chooseSeeds && !noChoose) {
      board.chosenSeeds = pool.slice();           // 1-7: 固定全部
    } else if (level.chooseSeeds && !noChoose) {
      board.chosenSeeds = pool.slice(0, board.seedSlots);
    }
    // 生存模式: 用全部可用植物选卡
    if (level.endless && level.chooseSeeds) {
      board.seedSlots = Math.min(pool.length, this.bankSlotsFor(lv) || level.bankSlots || 9);
    }
    // 花盆预植 (屋顶)
    if (level.potColumns > 0) {
      for (let c = 0; c < level.potColumns; c++) {
        for (let r = 0; r < board.rows; r++) {
          if (board.isWater(r)) continue;
          const pot = new Plant('FLOWERPOT', r, c, board);
          board.plants.push(pot);
          board.gridPot[r][c] = pot;
        }
      }
    }
    // 选卡融入开场过场 (原版): CutScene 在 t=4.25s 暂停等玩家选卡
    this.beginPlay();
  },

  beginPlay() {
    const board = this.board;
    const level = board.level;
    board.seedCards = board.chosenSeeds.map(t => ({ type: t, cd: 0 }));
    // 初始冷却 (原版: 开局短暂冷却)
    for (const c of board.seedCards) c.cd = 2;
    board.state = 'intro';
    this.state = 'playing';
    this.audio.playBGM(level.bgm);
    // 特殊玩法: 简短过场 (无选卡/无戴夫/无 RSP)
    const quiet = ['whack', 'vasebreaker', 'izombie'].includes(level.fixed);
    if (quiet) { level.noReadySet = true; }
    Cutscene.start(board);
    if (quiet) { Cutscene.t = 4.5; }   // 跳过镜头平移直接就位
  },

  saveShop() {
    try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: this.progress.unlocked, debugUnlocked: this.debugUnlocked || undefined, coins: this.coins, purchased: this.purchased })); } catch (e) { }
  },

  // ---------- 戴夫商店 (#11: 通关 3-4 解锁) ----------
  shopUnlocked() { return this.progress.unlocked > 24 || this.debugUnlocked; },
  buyItem(key) {
    const it = SHOP_ITEMS.find(s => s.key === key);
    if (!it) return false;
    const cost = this.itemCost(it);
    if (cost == null) return false;
    if (this.coins < cost) { this.audio.play('buzzer'); return false; }
    // 耐久品判定
    const consumable = it.type === 'rake' || it.type === 'zen' || it.type === 'marigold';
    if (!consumable && (this.purchased[key] || 0) > 0) return false;   // 一次性售罄
    // 耙子可重复购买 (3次使用)
    if (this.purchased[key] && it.type !== 'rake' && !consumable) return false;
    this.coins -= cost;
    if (key === 'packetUpgrade') this.purchased[key] = (this.purchased[key] || 0) + 1;
    else this.purchased[key] = (this.purchased[key] || 0) + 1;
    this.purchasedSet = new Set(Object.keys(this.purchased));
    this.saveShop();
    this.audio.play('points');
    return true;
  },
  itemCost(it) {
    if (Array.isArray(it.cost)) {
      const n = this.purchased['packetUpgrade'] || 0;
      return n < it.cost.length ? it.cost[n] : null;   // 售罄
    }
    return it.cost;
  },
  addCoins(n) {
    this.coins = Math.max(0, Math.min(99999, this.coins + n));
    this.saveShop();
  },

  bankSlotsFor(lv) {
    // 原版: mPurchases[PACKET_UPGRADE] + 6 (槽位升级逐次购买)
    const base = Math.min(6 + Math.max(0, Math.floor((lv - 8) / 12)), 7);
    const up = this.purchased['packetUpgrade'] || 0;
    if (up > 0) return Math.max(base, 6 + up);
    return base;
  },

  // 重新挑战当前关
  retryLevel() {
    this.audio.play('buttonclick');
    if (this.modeKey) this.startMode(this.modeKey);
    else this.startLevel(this.levelId);
  },

  onLevelWin() {
    this.justUnlocked = null;
    const isMode = !!this.modeKey;
    const lv = this.levelId;
    const level = this.levelDef;
    if (!isMode && lv >= this.progress.unlocked) {
      this.progress.unlocked = Math.min(51, lv + 1);
      try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: this.progress.unlocked, debugUnlocked: this.debugUnlocked || undefined })); } catch (e) { }
    }
    if (isMode) {
      // 模式胜利 → 回模式选择屏
      this.audio.playBGM(null);
      this.audio.play('winmusic');
      this.winStats = { waves: this.board.wave, score: this.board.whackScore || 0, mode: this.modeKey };
      Transition.to(() => { this.state = 'modewin'; Screens.t = 0; }, 0.8);
      return;
    }
    // 奖励判定 (原版): X-5/X-10 → 纸条; 其余有新植物 → 植物奖励; 5-10 → 通关
    this.justUnlocked = awardPlantForLevel(lv);
    const isNoteLevel = level.sub === 5 || level.sub === 10;
    this.audio.playBGM(null);
    this.audio.play('winmusic');
    Transition.to(() => {
      if (lv >= 50) { this.state = 'award'; }               // 通关: 奖杯
      else if (this.justUnlocked) { this.state = 'award'; }  // 新植物
      else if (isNoteLevel) { this.state = 'note'; }         // 纸条关
      else { this.state = 'note'; }                          // 其他: 简短纸条/奖励过场
    }, 0.8);
  },

  // 奖励/纸条屏点击后 → 下一关
  afterAward() {
    this.audio.play('buttonclick');
    const next = this.levelId + 1;
    if (next > 50) {
      // 通关 → 回菜单
      this.state = 'menu';
      this.audio.playBGM('start_menu');
      return;
    }
    this.startLevel(next);
  },

  // ---------- 游戏内菜单对话框 (原版 DoNewOptions: 回到游戏/重新开始/主菜单) ----------
  openMenuDialog() {
    this.audio.play('pause');
    this.menuDialog = { hover: null };
    if (this.board) this.board.paused = true;
  },
  closeMenuDialog() {
    this.menuDialog = null;
    if (this.board) this.board.paused = false;
  },
  menuDialogButtons() {
    return [
      { k: 'resume', label: '回到游戏', x: 250, y: 200, w: 300, h: 52 },
      { k: 'restart', label: '重新开始本关', x: 250, y: 268, w: 300, h: 52 },
      { k: 'options', label: '选项设置', x: 250, y: 336, w: 300, h: 52 },
      { k: 'mainmenu', label: '返回主菜单', x: 250, y: 420, w: 300, h: 52 },
    ];
  },
  menuDialogClick(p) {
    for (const b of this.menuDialogButtons()) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        this.audio.play('buttonclick');
        if (b.k === 'resume') { this.closeMenuDialog(); }
        else if (b.k === 'restart') { this.menuDialog = null; this.retryLevel(); }
        else if (b.k === 'options') { this.closeMenuDialog(); this._optionsReturn = 'playing'; this.state = 'options'; }
        else if (b.k === 'mainmenu') { this.menuDialog = null; this.abandonLevel(); }
        return;
      }
    }
    // 点击外部不关闭 (避免误触)
  },

  onLevelLose(row) {
    this.audio.playBGM(null);
    this.audio.play('losemusic');
    Transition.to(() => {
      this.state = 'lose';
      Screens.t = 0;
    }, 0.8);
  },

  // ---------- 更新 ----------
  update(dt) {
    Screens.update(dt);
    Screens.updateHover(this.mouse);
    Banners.update(dt);
    Transition.update(dt);
    if (this.state === 'playing' && this.board) {
      if (!this.board.paused) {
        const sdt = dt * this.board.speed;
        this.board.update(sdt);
        Cutscene.update(sdt);
        // 卡片冷却
        for (const c of this.board.seedCards) c.cd = Math.max(0, c.cd - sdt);
        // 雨天种子: 持有卡倒计时
        if (this.board.mode === 'raining') {
          if (this.board.challenge && this.board.challenge.heldCards) {
            for (const h of this.board.challenge.heldCards) h.life -= sdt;
            this.board.challenge.heldCards = this.board.challenge.heldCards.filter(h => h.life > 0);
          }
        }
      }
    }
  },

  // ---------- 渲染 ----------
  render() {
    const ctx = this.ctx;
    // 防御: 每帧重置变换/合成状态 (防止异常导致的泄漏累积)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, 800, 600);
    switch (this.state) {
      case 'loading': break;
      case 'title': Screens.title.draw(ctx); break;
      case 'menu': Screens.menu.draw(ctx); break;
      case 'options': Screens.options.draw(ctx); break;
      case 'help': Screens.help.draw(ctx); break;
      case 'award': Screens.award.draw(ctx, this); break;
      case 'note': Screens.note.draw(ctx); break;
      case 'lose': Screens.lose.draw(ctx); break;
      case 'almanac': UI.drawAlmanac(ctx); break;
      case 'levelselect': Screens.levelSelect.draw(ctx); break;
      case 'modeselect': Screens.modeSelect.draw(ctx); break;
      case 'shop': Screens.shop.draw(ctx); break;
      case 'modewin': Screens.modeWin.draw(ctx, this); break;
      case 'playing': {
        Renderer.drawBoard(ctx, this.board);
        UI.drawGameHUD(ctx, this.board);
        Banners.draw(ctx);
        if (Cutscene.active) Cutscene.draw(ctx, this.board);
        // 选卡界面 (开场过场期间, 原版滑入滑出)
        if (Cutscene.active && (Cutscene.seedChoosing || Cutscene.chooserY < 516)) {
          UI.drawSeedChooser(ctx, this.board);
        }
        // 特殊模式叠加层 (罐子/我不是僵尸卡/雨天种子)
        UI.drawModeOverlay(ctx, this.board);
        if (this.board.paused && !this.menuDialog) UI.drawPause(ctx, this.board);
        // 游戏内菜单对话框
        if (this.menuDialog) UI.drawMenuDialog(ctx, this);
        // 种植预览
        this.drawPreview(ctx);
        break;
      }
    }
    Transition.draw(ctx);
  },

  drawPreview(ctx) {
    const board = this.board;
    const m = this.mouse;
    if (!m) return;
    // 种植预览
    if (this.selectedCard >= 0) {
      let type = null;
      if (board.mode === 'raining') {
        const held = (board.challenge.heldCards || [])[this.selectedCard];
        type = held ? held.type : null;
      } else if (board.seedCards[this.selectedCard]) {
        type = board.seedCards[this.selectedCard].type;
      }
      if (type) {
      const cell = this.pixelToCell(m.x, m.y);
      if (cell) {
        const [col, row] = cell;
        const ok = this.canPlacePreview(type, row, col, board);
        ctx.save();
        ctx.globalAlpha = 0.55;
        const thumb = UI.getThumb(type);
        if (thumb) ctx.drawImage(thumb, board.gridX(col) - 5, board.cellY(row, col) - 30, 90, 100);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = ok ? '#7cff5a' : '#ff5a5a';
        ctx.fillRect(board.gridX(col), board.cellY(row, col), 80, board.scene === 'pool' ? 85 : 100);
        ctx.restore();
      }
      }
    }
    // 打僵尸模式: 锤子光标 (原版 Hammer.reanim anim_whack_zombie @(-25,16))
    if (board.mode === 'whack' && m) {
      if (!this._whackCursor && RE.hasDef('Hammer')) {
        this._whackCursor = Assets.reanim('Hammer');
        this._whackCursor.play('anim_whack_zombie', RE.PLAY_ONCE_HOLD, 24);
        this._whackCursor.animTime = 1.0;   // 待机停末帧
      }
      if (this._whackCursor) {
        this._whackCursor.setPosition(m.x - 25, m.y + 16);
        this._whackCursor.renderOrder = 10 ** 7;
        this._whackCursor.draw(ctx);
      }
    }
    // 铲子光标 + 挥动动画 (#19)
    if (this.shovelMode && this.shovelUnlocked) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      const shovel = Assets.image('shovel_hi_res') || Assets.image('shovel');
      if (shovel && m) {
        // 挖掘挥动: 0.35s 内旋转下压
        if (this._shovelAnim > 0) {
          this._shovelAnim -= 1 / 60;
          const p = 1 - this._shovelAnim / 0.35;
          const ang = Math.sin(p * Math.PI) * 1.2;
          ctx.translate(m.x, m.y - 10);
          ctx.rotate(ang);
          ctx.drawImage(shovel, -20, -34 - Math.sin(p * Math.PI) * 18, 40, 56);
        } else {
          ctx.drawImage(shovel, m.x - 20, m.y - 30, 40, 56);
        }
      }
      ctx.restore();
    }
  },

  canPlacePreview(type, row, col, board) {
    // 泥地行不可种 (1-1~1-3)
    if (!board.grassRows.includes(row) && !board.isWater(row, col)) return false;
    const isWater = board.isWater(row, col);
    if (AQUATIC.has(type)) {
      if (type === 'LILYPAD') return isWater && !board.gridLily[row][col];
      if (type === 'CATTAIL') return isWater && !!board.gridLily[row][col] && !board.grid[row][col];
      return isWater && !!board.gridLily[row][col] && !board.grid[row][col];
    }
    if (isWater) return !!board.gridLily[row][col] && !board.grid[row][col];
    if (board.isRoof) return (type === 'FLOWERPOT' ? !board.gridPot[row][col] : (!!board.gridPot[row][col] && !board.grid[row][col]));
    if (type === 'GRAVEBUSTER') return board.graves.some(g => g.row === row && g.col === col);
    if (GROUNDCOVER.has(type)) return !board.gridSpikes[row][col];
    if (type === 'PUMPKIN') return !board.gridPumpkin[row][col];
    return !board.grid[row][col];
  },
};

function hit(p, b) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

window.Game = Game;

if (typeof module !== 'undefined') module.exports = { Game };
