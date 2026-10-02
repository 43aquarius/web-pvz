// ============================================================
// main.js — 游戏主控制器: 状态机 / 输入 / 主循环
// 状态: loading → title → menu → (options/help/almanac) → playing(intro+选卡→play) → award/note → menu
// 冒险模式线性推进 (原版): 选卡融入开场过场 (CutScene 暂停机制)
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, MODE_LEVELS, availablePlants, MUSHROOMS, AQUATIC, GROUNDCOVER, UPGRADES, UPGRADE_ORDER, SHOP_ITEMS, GARDEN_PLANTS, ZOMBIE_NOTES, awardPlantForLevel } = require('./data');
const { Board } = require('./board');
const { Plant } = require('./plants');
const { Zombie } = require('./zombie');
const { Projectile } = require('./projectiles');
const { Renderer } = require('./render');
const { UI, roundRect } = require('./ui');
const { Screens } = require('./screens');
const { Cutscene, Banners, Transition, setZombieDefs } = require('./cutscene');
const { Garden } = require('./garden');
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
  levelLoading: false,      // 按需加载中 (防双击)
  gardenUnlocked: false,    // 禅园解锁 (通关 5-5)

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
      if (save.garden) this.garden = save.garden;
      this.gardenUnlocked = !!save.gardenUnlocked || save.unlocked > 45;
      this.daveSeen = JSON.parse(localStorage.getItem('webpvz_dave') || '{}');
    } catch (e) { }
    this.daveSeen = this.daveSeen || {};
    this.purchasedSet = new Set(Object.keys(this.purchased));
    Garden.init(this);
    // 按需加载: 分包加载完成后失效缩略图缓存 (自愈重新生成)
    Assets.onPackLoaded(() => {
      try {
        const ui = (window.__mods && window.__mods['ui']) || require('./ui');
        if (ui && ui.UI) { ui.UI.cardThumbs && ui.UI.cardThumbs.clear(); ui.UI._zThumbs && (ui.UI._zThumbs = null); }
      } catch (e) { }
    });
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
      case 'garden': Garden.click(p); break;
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
    const UIM = (window.__mods && window.__mods['ui']) || require('./ui');
    const UI2 = UIM.UI;
    // 返回 (索引页 → 主菜单; 详情页 → 索引页)
    if (UI2.almanacBack && hit(p, UI2.almanacBack)) {
      if (a.selected) { a.selected = null; this.audio.play('tap'); }
      else { this.audio.play('buttonclick'); this.state = 'menu'; }
      return;
    }
    for (const t of (UI2.almanacTabs || [])) {
      if (hit(p, t)) {
        a.tab = t.x < 400 ? 'plants' : 'zombies';
        a.selected = null;
        Assets.ensureAlmanac && Assets.ensureAlmanac(a.tab);
        this.audio.play('tap');
        return;
      }
    }
    for (const c of (UI2.almanacCells || [])) {
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
    // ---- 特殊模式点击路由 (打僵尸/罐子/我不是僵尸/雨天种子) ----
    if (board.modeClick && board.modeClick(this, p)) return;
    // 传送带: 点击带上卡片 → 持卡 (卡跟随鼠标, 点草坪种植)
    if (board.mode === 'conveyor' && board.belt) {
      for (const it of board.belt.items) {
        // 只能点击卡槽区右侧的卡 (避开左侧已持卡区, 原版: 卡滚到左端才能拿)
        if (it.x > 70 && p.x > it.x && p.x < it.x + 50 && p.y > 7 && p.y < 77) {
          board.belt.items = board.belt.items.filter(o => o !== it);
          board.seedCards = [{ type: it.type, cd: 0 }];
          this.selectedCard = 0;
          this.shovelMode = false;
          this.audio.play('seedlift');
          return;
        }
      }
      // 已持卡时点击带区其他地方无效 (吞掉, 防误触)
      if (p.y < 84 && this.selectedCard >= 0) return;
    }
    // 选卡期间: 选卡界面交互
    if (Cutscene.active && Cutscene.seedChoosing) { this.seedChooseClick(p); return; }
    // 戴夫对话 (1-5 赠铲子): 点击推进
    if (Cutscene.active && Cutscene.davePhase) { Cutscene.daveClick(); return; }
    // 开场过场: 点击跳过 (不跳选卡关)
    if (Cutscene.active) {
      if (!Cutscene.board.level.chooseSeeds) Cutscene.t = Math.max(Cutscene.t, 5.9);
      return;
    }
    // 铲子 (原版: (extra+456, 0) 70x72; 传送带关卡无铲子)
    if (this.shovelUnlocked && board.mode !== 'conveyor') {
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
    // 阳光收集
    for (const s of board.suns) {
      if (!s.collected && Math.abs(p.x - s.x) < 35 && Math.abs(p.y - s.y) < 35) {
        board.collectSun(s);
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
    // 选卡
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
        // 铲除 (原版优先级: 南瓜壳 → 植物 → 花盆 → 睡莲 → 地刺)
        const removed = board.gridPumpkin[row][col] || board.grid[row][col] || board.gridPot[row][col] || board.gridLily[row][col] ||
          board.gridSpikes[row][col];
        if (removed) {
          this.removePlant(removed, board);
          this.audio.play('shovel');
          this.shovelMode = false;   // 原版: 铲一次回位
          return;
        }
        return;
      }
      if (this.selectedCard >= 0) {
        // 雨天种子: 持有卡
        if (board.mode === 'raining') {
          const held = board.heldCards[this.selectedCard];
          if (held) {
            this.tryPlant(held.type, row, col, board);
            if (board.plants[board.plants.length - 1] && board.plants[board.plants.length - 1].row === row && board.plants[board.plants.length - 1].col === col) {
              board.heldCards.splice(this.selectedCard, 1);
              this.selectedCard = -1;
            }
          }
          return;
        }
        this.tryPlant(cards[this.selectedCard].type, row, col, board);
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
    const conveyor = board.mode === 'conveyor';
    const card = board.seedCards[this.selectedCard];
    if (!conveyor && !card) { this.audio.play('buzzer'); return; }
    if (!conveyor && (card.cd > 0 || board.sun < def.cost)) { this.audio.play('buzzer'); return; }
    const bowling = board.level.fixed === 'bowling';
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
      if (conveyor) board.seedCards = [];
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
    if (conveyor) board.seedCards = [];   // 传送带卡一次性
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
    this._startCommon(this.levelDef);
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

  // 按需加载关卡所需分包 (网络部署: 首次进入 ~几MB)
  async _preloadLevel(level) {
    if (!Assets.hasLazy || Assets.state.embedMode) return;
    this.levelLoading = true;
    try {
      await Assets.ensureLevel(level, this.purchasedSet);
    } finally {
      this.levelLoading = false;
    }
  },

  async _startCommon(level) {
    if (this.levelLoading) return;   // 防双击
    await this._preloadLevel(level);
    const lv = this.levelId;
    // 铲子解锁 (特殊玩法关卡无铲子; 传送带关卡也无 — 原版: 传送带占满顶部)
    const specialNoShovel = ['bowling', 'whack', 'vasebreaker', 'izombie', 'conveyor', 'boss'].includes(level.fixed);
    const firstTime = this.progress.unlocked <= lv;
    if (specialNoShovel) this.shovelUnlocked = false;
    else if (lv === 5 && firstTime && !level.mode) this.shovelUnlocked = false;   // 1-5 首次: 由戴夫对话解锁
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
    if (!it || this.purchased[key]) return false;
    if (this.coins < it.cost) { this.audio.play('buzzer'); return false; }
    // 种子槽须按顺序购买
    if (key === 'slot9' && !this.purchased['slot8']) return false;
    if (key === 'slot10' && !this.purchased['slot9']) return false;
    this.coins -= it.cost;
    this.purchased[key] = true;
    this.purchasedSet = new Set(Object.keys(this.purchased));
    this.saveShop();
    this.audio.play('points');
    return true;
  },
  bankSlotsFor(lv) {
    // 原版: 基础槽位数 + 商店扩容
    const base = Math.min(6 + Math.max(0, Math.floor((lv - 8) / 12)), 7);
    if (this.purchased['slot10']) return 10;
    if (this.purchased['slot9']) return 9;
    if (this.purchased['slot8']) return Math.max(8, base);
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
      // 通关 5-5 → 解锁禅园 (原版 1301 对话: 随时从主菜单来到花园)
      if (lv === 45) this.gardenUnlocked = true;
      try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: this.progress.unlocked, debugUnlocked: this.debugUnlocked || undefined, gardenUnlocked: this.gardenUnlocked || undefined })); } catch (e) { }
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
    if (this.state === 'garden') { Garden.update(dt); return; }
    if (this.state === 'playing' && this.board) {
      if (!this.board.paused) {
        const sdt = dt * this.board.speed;
        this.board.update(sdt);
        Cutscene.update(sdt);
        // 卡片冷却
        for (const c of this.board.seedCards) c.cd = Math.max(0, c.cd - sdt);
        // 雨天种子: 持有卡倒计时
        if (this.board.mode === 'raining') {
          for (const h of this.board.heldCards) h.life -= sdt;
          this.board.heldCards = this.board.heldCards.filter(h => h.life > 0);
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
      case 'garden': Garden.draw(ctx); break;
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
        // 铲子悬停高亮 (原版: 铲子模式下悬停格高亮将被铲除的植物 #19)
        this.drawShovelHover(ctx);
        // 种植预览
        this.drawPreview(ctx);
        break;
      }
    }
    Transition.draw(ctx);
    // 关卡分包加载提示 (按需加载中: 半透明遮罩 + 进度点)
    if (this.levelLoading) {
      ctx.fillStyle = 'rgba(10,8,4,0.55)';
      ctx.fillRect(0, 0, 800, 600);
      const t = (Date.now() % 1200) / 1200;
      ctx.save();
      ctx.font = 'bold 26px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('正在加载本关素材…', 400, 296);
      for (let i = 0; i < 5; i++) {
        const a = ((t - i * 0.2) % 1 + 1) % 1;
        ctx.globalAlpha = 1 - a;
        ctx.beginPath();
        ctx.arc(400 - 44 + i * 22, 326, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#c8f542';
        ctx.fill();
      }
      ctx.restore();
    }
  },

  // 铲子悬停高亮: 铲子模式下悬停格高亮将被铲除的植物 (原版行为)
  drawShovelHover(ctx) {
    if (!this.shovelMode || !this.shovelUnlocked || !this.mouse || this.menuDialog) return;
    const board = this.board;
    const cell = this.pixelToCell(this.mouse.x, this.mouse.y);
    if (!cell) return;
    const [col, row] = cell;
    const target = board.gridPumpkin[row][col] || board.grid[row][col] || board.gridPot[row][col] || board.gridLily[row][col] || board.gridSpikes[row][col];
    if (!target) return;
    ctx.save();
    // 高亮框 (原版: 白色闪烁矩形框住目标植物)
    const t = (Date.now() % 500) / 500;
    ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t * Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(board.gridX(col) + 3, board.cellY(row, col) + 3, 74, (board.scene === 'pool' ? 85 : 100) - 6);
    // 目标植物提亮
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(board.gridX(col), board.cellY(row, col), 80, board.scene === 'pool' ? 85 : 100);
    ctx.restore();
  },

  drawPreview(ctx) {
    const board = this.board;
    const m = this.mouse;
    if (!m) return;
    // 传送带: 持卡跟随鼠标 (原版行为), 落点显示植物预览
    if (board.mode === 'conveyor' && this.selectedCard >= 0 && board.seedCards[0]) {
      const UIm = (window.__mods && window.__mods['ui']) || require('./ui');
      const type = board.seedCards[0].type;
      if (m.y < 100 || (m.x < 84 && m.y < 84)) {
        // 在带区: 卡挂在鼠标上
        if (UIm && UIm.UI) {
          ctx.save();
          ctx.globalAlpha = 0.95;
          UIm.UI.drawSeedCard(ctx, type, m.x - 25, m.y - 35, { selected: true });
          ctx.restore();
        }
        return;
      }
      const cell = this.pixelToCell(m.x, m.y);
      if (cell) {
        const [col, row] = cell;
        const ok = this.canPlacePreview(type, row, col, board);
        ctx.save();
        ctx.globalAlpha = 0.55;
        const thumb = UIm && UIm.UI ? UIm.UI.getThumb(type) : null;
        if (thumb) ctx.drawImage(thumb, board.gridX(col) - 5, board.cellY(row, col) - 30, 90, 100);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = ok ? '#7cff5a' : '#ff5a5a';
        ctx.fillRect(board.gridX(col), board.cellY(row, col), 80, board.scene === 'pool' ? 85 : 100);
        ctx.restore();
      }
      // 卡同时挂在鼠标上 (半透明)
      if (UIm && UIm.UI) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        UIm.UI.drawSeedCard(ctx, type, m.x - 25, m.y - 60, { selected: true });
        ctx.restore();
      }
      return;
    }
    // 种植预览
    if (this.selectedCard >= 0) {
      let type = null;
      if (board.mode === 'raining') {
        const held = board.heldCards[this.selectedCard];
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
    // 打僵尸模式: 锤子光标
    if (board.mode === 'whack' && m) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.translate(m.x, m.y);
      ctx.rotate(-0.5);
      ctx.fillStyle = '#8a6642';
      ctx.fillRect(-4, -6, 8, 34);
      ctx.fillStyle = '#a8926a';
      ctx.fillRect(-16, -22, 32, 20);
      ctx.restore();
    }
    if (this.shovelMode && this.shovelUnlocked) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      const shovel = Assets.image('shovel_hi_res') || Assets.image('shovel');
      if (shovel && m) ctx.drawImage(shovel, m.x - 20, m.y - 30, 40, 56);
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
