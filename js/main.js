// ============================================================
// main.js — 游戏主控制器: 状态机 / 输入 / 主循环
// 状态: loading → title → menu → (options/help/almanac) → playing(intro+选卡→play) → award/note → menu
// 冒险模式线性推进 (原版): 选卡融入开场过场 (CutScene 暂停机制)
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, availablePlants, MUSHROOMS, AQUATIC, GROUNDCOVER, awardPlantForLevel } = require('./data');
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
    } catch (e) { }
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
        if (this.state === 'playing' && this.board) { this.board.paused = !this.board.paused; this.audio.play('pause'); }
      }
      if (e.key === ' ' && this.state === 'playing' && this.board) {
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
      const pool = availablePlants(this.levelId);
      const n = Math.min(board.seedSlots, pool.length);
      board.chosenSeeds = shuffle(pool.slice()).slice(0, n);
      board.seedCards = board.chosenSeeds.map(t => ({ type: t, cd: 0 }));
      this.audio.play('seedlift');
      return;
    }
    // 卡片切换 (原版网格: col*53+22, row*73+128)
    const pool = availablePlants(this.levelId);
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

  gameClick(p) {
    const board = this.board;
    if (board.paused) { board.paused = false; return; }
    // 选卡期间: 选卡界面交互
    if (Cutscene.active && Cutscene.seedChoosing) { this.seedChooseClick(p); return; }
    // 戴夫对话 (1-5 赠铲子): 点击推进
    if (Cutscene.active && Cutscene.davePhase) { Cutscene.daveClick(); return; }
    // 开场过场: 点击跳过 (不跳选卡关)
    if (Cutscene.active) {
      if (!Cutscene.board.level.chooseSeeds) Cutscene.t = Math.max(Cutscene.t, 5.9);
      return;
    }
    // 菜单按钮 (原版石质按钮 681,-10,117,46)
    if (p.x > 681 && p.x < 798 && p.y > 0 && p.y < 36) { this.abandonLevel(); return; }
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
        board.sun += c.value;
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
        if (c.cd <= 0 && board.sun >= PLANTS[c.type].cost) {
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
        // 铲除(花盆/睡莲/南瓜/植物)
        const removed = board.gridPumpkin[row][col] || board.grid[row][col] || board.gridPot[row][col] || board.gridLily[row][col] ||
          board.gridSpikes[row][col];
        if (removed) {
          this.removePlant(removed, board);
          this.audio.play('shovel');
          this.shovelMode = false;
          return;
        }
        return;
      }
      if (this.selectedCard >= 0) {
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
    const card = board.seedCards[this.selectedCard];
    if (!card || card.cd > 0 || board.sun < def.cost) { this.audio.play('buzzer'); return; }
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
      board.sun -= def.cost;
      card.cd = def.cd / 1000;
      this.selectedCard = -1;
      return;
    }
    // 墓碑吞噬者必须种在墓碑上
    if (type === 'GRAVEBUSTER') {
      if (!board.graves.some(g => g.row === row && g.col === col)) { this.audio.play('buzzer'); return; }
    }
    // 占位检查
    if (GROUNDCOVER.has(type)) {
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
    if (type === 'LILYPAD') board.gridLily[row][col] = p;
    else if (type === 'FLOWERPOT') board.gridPot[row][col] = p;
    else if (type === 'PUMPKIN') board.gridPumpkin[row][col] = p;
    else if (GROUNDCOVER.has(type)) board.gridSpikes[row][col] = p;
    else board.grid[row][col] = p;
    // 音效
    board.sun -= def.cost;
    card.cd = def.cd / 1000;
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
    this.endless = false;
    this.levelDef = LEVELS[lv - 1];
    const level = this.levelDef;
    // 铲子解锁 (原版 ShowShovel: 首次冒险 1-4 无铲子, 1-5 戴夫对话末尾赠送, 之后常驻; 重玩旧关直接有)
    const firstTime = this.progress.unlocked <= lv;
    if (lv === 5 && firstTime) this.shovelUnlocked = false;   // 1-5 首次: 由戴夫对话解锁
    else this.shovelUnlocked = lv >= 5 || !firstTime;
    const board = new Board(this, level);
    this.board = board;
    this.selectedCard = -1;
    this.shovelMode = false;
    Banners.clear();
    // 选卡方式 (原版): 1-7 固定卡槽(全部解锁植物), 1-8+ 手动选卡
    const pool = availablePlants(lv);
    board.seedSlots = level.chooseSeeds ? Math.min(pool.length, level.bankSlots) : pool.length;
    board.chosenSeeds = [];
    if (!level.chooseSeeds) {
      board.chosenSeeds = pool.slice();           // 1-7: 固定全部
    } else if (level.fixed) {
      board.chosenSeeds = pool.slice(0, board.seedSlots); // 传送带关卡: 预填满, 后续随机替换
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
    Cutscene.start(board);
  },

  // 重新挑战当前关
  retryLevel() {
    this.audio.play('buttonclick');
    this.startLevel(this.levelId);
  },

  onLevelWin() {
    this.justUnlocked = null;
    const lv = this.levelId;
    const level = LEVELS[lv - 1];
    if (lv >= this.progress.unlocked) {
      this.progress.unlocked = Math.min(51, lv + 1);
      try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: this.progress.unlocked, debugUnlocked: this.debugUnlocked || undefined })); } catch (e) { }
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
      case 'playing': {
        Renderer.drawBoard(ctx, this.board);
        UI.drawGameHUD(ctx, this.board);
        Banners.draw(ctx);
        if (Cutscene.active) Cutscene.draw(ctx, this.board);
        // 选卡界面 (开场过场期间, 原版滑入滑出)
        if (Cutscene.active && (Cutscene.seedChoosing || Cutscene.chooserY < 516)) {
          UI.drawSeedChooser(ctx, this.board);
        }
        if (this.board.paused) UI.drawPause(ctx, this.board);
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
      const type = board.seedCards[this.selectedCard].type;
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
