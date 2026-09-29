// ============================================================
// main.js — 游戏主控制器: 状态机 / 输入 / 主循环
// 状态: loading → menu → levelselect → seedselect → playing → win/lose / almanac
// ============================================================
'use strict';

const { CONST, PLANTS, ZOMBIES, LEVELS, availablePlants, MUSHROOMS, AQUATIC, GROUNDCOVER } = require('./data');
const { Board } = require('./board');
const { Plant } = require('./plants');
const { Zombie } = require('./zombies');
const { Projectile } = require('./projectiles');
const { Renderer } = require('./render');
const { UI, roundRect } = require('./ui');
const RE = require('./reanim');

const Game = {
  state: 'loading',
  levelId: 1,
  board: null,
  progress: { unlocked: 1 },
  almanac: { tab: 'plants', page: 0, selected: null },
  selectedCard: -1,
  shovelMode: false,
  justUnlocked: null,
  endless: false,

  async boot() {
    if (this._booted) return; this._booted = true;
    const cv = document.getElementById('game');
    this.canvas = cv;
    this.ctx = cv.getContext('2d');
    UI.init(this);
    this.audio = require('./audio');
    // 进度遮罩
    const overlay = document.getElementById('overlay');
    const loadText = document.getElementById('loadtext');
    // 加载资产
    await Assets.load((p, msg) => {
      if (loadText) loadText.textContent = `正在加载原版素材 ${(p * 100).toFixed(0)}% · ${msg || ''}`;
      if (overlay) {
        const bar = document.getElementById('loadbar');
        if (bar) bar.style.width = (p * 100) + '%';
      }
    });
    // 读取进度
    try {
      const save = JSON.parse(localStorage.getItem('webpvz_save') || '{}');
      if (save.unlocked) this.progress.unlocked = save.unlocked;
    } catch (e) { }
    // 输入
    this.bindInput();
    // 开始
    if (overlay) overlay.style.display = 'none';
    this.state = 'menu';
    this.audio.init();
    this.audio.playBGM('start_menu');
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
    this.canvas.addEventListener('mousemove', e => { this.mouse = pos(e); });
    this.canvas.addEventListener('touchmove', e => {
      if (e.touches[0]) { this.mouse = pos(e.touches[0]); e.preventDefault(); }
    }, { passive: false });
    this.canvas.addEventListener('mousedown', e => { this.onClick(pos(e)); this.audio.resume(); });
    this.canvas.addEventListener('touchstart', e => {
      if (e.touches[0]) { this.onClick(pos(e)); this.audio.resume(); e.preventDefault(); }
    }, { passive: false });
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
      case 'menu': this.menuClick(p); break;
      case 'levelselect': this.levelSelectClick(p); break;
      case 'seedselect': this.seedSelectClick(p); break;
      case 'playing': this.gameClick(p); break;
      case 'win': case 'lose': this.state = 'levelselect'; this.audio.playBGM('start_menu'); break;
      case 'almanac': this.almanacClick(p); break;
    }
  },

  menuClick(p) {
    for (const b of UI.menuButtons || []) {
      if (p.x > b.x - b.w / 2 && p.x < b.x + b.w / 2 && p.y > b.y - b.h / 2 && p.y < b.y + b.h / 2) {
        this.audio.play('buttonclick');
        if (b.txt === '开始冒险') { this.endless = false; this.state = 'levelselect'; }
        if (b.txt === '植物图鉴') { this.state = 'almanac'; this.almanac.selected = null; }
        if (b.txt === '无尽模式') { this.endless = true; this.startLevel(0); }
        return;
      }
    }
  },

  levelSelectClick(p) {
    if (UI.backButton && hit(p, UI.backButton)) {
      this.state = 'menu'; this.audio.play('buttonclick'); return;
    }
    for (const b of UI.levelButtons || []) {
      if (hit(p, b) && b.lv <= this.progress.unlocked) {
        this.audio.play('buttonclick');
        this.startLevel(b.lv);
        return;
      }
    }
  },

  seedSelectClick(p) {
    const board = this.board;
    // 开始按钮
    if (p.x > 660 && p.x < 770 && p.y > 470 && p.y < 520) {
      if (board.chosenSeeds.length > 0) {
        this.audio.play('buttonclick');
        this.beginPlay();
      } else this.audio.play('buzzer');
      return;
    }
    // 随机
    if (p.x > 660 && p.x < 770 && p.y > 530 && p.y < 566) {
      const pool = availablePlants(this.levelId);
      const n = Math.min(board.seedSlots, pool.length);
      board.chosenSeeds = shuffle(pool.slice()).slice(0, n);
      this.audio.play('seedlift');
      return;
    }
    // 卡片切换
    const pool = availablePlants(this.levelId);
    const cols = 10;
    pool.forEach((type, i) => {
      const gx = 60 + (i % cols) * 70, gy = 110 + Math.floor(i / cols) * 100;
      if (p.x >= gx && p.x <= gx + 58 && p.y >= gy && p.y <= gy + 84) {
        const idx = board.chosenSeeds.indexOf(type);
        if (idx >= 0) board.chosenSeeds.splice(idx, 1);
        else if (board.chosenSeeds.length < board.seedSlots) board.chosenSeeds.push(type);
        this.audio.play('tap');
      }
    });
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
    // 菜单按钮
    if (p.x > 745 && p.y > 6 && p.y < 32) { this.state = 'levelselect'; this.audio.stopBGM(); this.audio.play('buttonclick'); return; }
    if (p.x > 745 && p.y > 36 && p.y < 62) {
      board.speed = board.speed === 1 ? 2 : board.speed === 2 ? 4 : 1;
      this.audio.play('tap');
      return;
    }
    // 铲子
    const cards = board.seedCards;
    const sx = 80 + cards.length * 55 + 6;
    if (p.x > sx && p.x < sx + 56 && p.y > 6 && p.y < 86) {
      this.shovelMode = !this.shovelMode;
      this.selectedCard = -1;
      this.audio.play('shovel');
      return;
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
    for (let i = 0; i < cards.length; i++) {
      const x = 80 + i * 55;
      if (p.x > x && p.x < x + 52 && p.y > 6 && p.y < 86) {
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

  // ---------- 流程 ----------
  startLevel(lv) {
    this.levelId = lv;
    if (lv === 0) {
      // 无尽模式
      this.endless = true;
      this.levelDef = {
        id: 50, scene: 'day', sub: 10, waves: 999, rows: 5, startSun: 150,
        unlock: null, graves: 0, bgm: 'mini_game', skySun: true, bigWave: true, fixed: null, endless: true,
      };
    } else {
      this.endless = false;
      this.levelDef = LEVELS[lv - 1];
    }
    // 选卡
    this.state = 'seedselect';
    const board = new Board(this, this.levelDef);
    board.waveTimer = 999; // 暂不开始
    board.state = 'select';
    board.seedSlots = Math.min(10, 4 + Math.floor((this.levelId || 1) / 8));
    if (this.endless) board.seedSlots = 10;
    board.chosenSeeds = [];
    this.board = board;
    this.audio.playBGM('choose_card');
  },

  beginPlay() {
    const board = this.board;
    board.seedCards = board.chosenSeeds.map(t => ({ type: t, cd: 0 }));
    // 初始冷却
    for (const c of board.seedCards) c.cd = 3;
    board.state = 'intro';
    board.waveTimer = 15;
    this.state = 'playing';
    this.audio.playBGM(board.level.bgm);
    this.audio.play('readysetplant');
  },

  onLevelWin() {
    this.justUnlocked = null;
    if (!this.endless) {
      const lv = this.levelId;
      const unlock = LEVELS[lv - 1].unlock;
      if (unlock && lv >= this.progress.unlocked) {
        this.progress.unlocked = Math.min(50, lv + 1);
        this.justUnlocked = unlock;
        try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: this.progress.unlocked })); } catch (e) { }
      } else if (lv >= this.progress.unlocked) {
        this.progress.unlocked = Math.min(50, lv + 1);
        try { localStorage.setItem('webpvz_save', JSON.stringify({ unlocked: this.progress.unlocked })); } catch (e) { }
      }
    }
    this.state = 'win';
  },

  onLevelLose(row) {
    this.state = 'lose';
  },

  // ---------- 更新 ----------
  update(dt) {
    if (this.state === 'playing' && this.board && !this.board.paused) {
      this.board.update(dt * this.board.speed);
      // 卡片冷却
      for (const c of this.board.seedCards) c.cd = Math.max(0, c.cd - dt * this.board.speed);
    }
  },

  // ---------- 渲染 ----------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 800, 600);
    switch (this.state) {
      case 'loading': break;
      case 'menu': UI.drawMenu(ctx); break;
      case 'levelselect': UI.drawLevelSelect(ctx); break;
      case 'seedselect': UI.drawSeedSelect(ctx, this.board); break;
      case 'playing':
        Renderer.drawBoard(ctx, this.board);
        UI.drawGameHUD(ctx, this.board);
        // 种植预览
        this.drawPreview(ctx);
        break;
      case 'win': Renderer.drawBoard(ctx, this.board); UI.drawWin(ctx, this.board); break;
      case 'lose': Renderer.drawBoard(ctx, this.board); UI.drawLose(ctx, this.board); break;
      case 'almanac': UI.drawAlmanac(ctx); break;
    }
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
    if (this.shovelMode) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      const shovel = Assets.image('shovel_hi_res') || Assets.image('shovel');
      if (shovel && m) ctx.drawImage(shovel, m.x - 20, m.y - 30, 40, 56);
      ctx.restore();
    }
  },

  canPlacePreview(type, row, col, board) {
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
