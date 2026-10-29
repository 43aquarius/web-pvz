// ============================================================
// render.js — 战场渲染 (800x600, 渲染顺序系统)
// 原版对齐 (Board.cpp / GameConstants.h):
//   BOARD_OFFSET=220 → 背景绘制于 x=-220
//   渲染顺序: renderOrder = row*10000 + layer + offset (排序绘制)
//   层: 墓碑301000 < 植物302000 < 僵尸303000 < 割草机306000
// 草皮: SOD1ROW(19,265) / SOD3ROW(15,149)
// ============================================================
'use strict';

const { CONST } = require('./data');
const { SCENE_BG, sceneBgName, RENDER_LAYER } = require('./board');
const RE = require('./reanim');
const { drawDaveDialog } = require('./cutscene');

const BG_OFFSET_X = -220; // 原版 BOARD_OFFSET=220

const Renderer = {
  drawBoard(ctx, board) {
    const cam = board.cameraX || 0;
    ctx.save();
    if (cam > 0) { ctx.beginPath(); ctx.rect(0, 0, 800, 600); ctx.clip(); ctx.translate(-cam, 0); }
    const lvl = board.level;
    const firstTime = board.game && board.game.progress ? board.game.progress.unlocked <= lvl.id : true;
    const earlyDay = board.scene === 'day' && lvl && lvl.id <= 4 && firstTime;
    if (earlyDay) {
      const un = Assets.image('background1unsodded.jpg');
      if (un) ctx.drawImage(un, BG_OFFSET_X, 0);
      const sod1 = Assets.image('sod1row_alpha.png') || Assets.image('sod1row.jpg');
      const sod3 = Assets.image('sod3row_alpha.png') || Assets.image('sod3row.jpg');
      const bg1 = Assets.image('background1.jpg');
      const p = board.sodDone ? 1 : (board.cutsceneSod !== undefined ? Math.max(0, board.cutsceneSod) : 1);
      const w1 = sod1 ? sod1.width : 771;
      const w3 = sod3 ? sod3.width : 771;
      if (lvl.id === 1) {
        if (sod1) ctx.drawImage(sod1, 0, 0, Math.max(1, w1 * p), sod1.height, 19, 265, w1 * p, sod1.height);
      } else if (lvl.id === 2) {
        if (sod1) ctx.drawImage(sod1, 19, 265);
        if (sod3) ctx.drawImage(sod3, 0, 0, Math.max(1, w3 * p), sod3.height, 15, 149, w3 * p, sod3.height);
      } else if (lvl.id === 3) {
        if (sod1) ctx.drawImage(sod1, 19, 265);
        if (sod3) ctx.drawImage(sod3, 15, 149);
      } else if (lvl.id === 4) {
        if (sod3) ctx.drawImage(sod3, 15, 149);
        if (bg1) {
          const w = 773 * p;
          ctx.drawImage(bg1, 232, 0, Math.max(1, w), bg1.height, 232 + BG_OFFSET_X, 0, w, bg1.height);
        }
      }
    } else {
      const bg = Assets.image(sceneBgName(board));
      if (bg) ctx.drawImage(bg, BG_OFFSET_X, 0);
      // 4-10 暴风雨夜: 夜色压暗
      if (board.level.stormy) {
        ctx.fillStyle = 'rgba(10,14,30,0.42)';
        ctx.fillRect(BG_OFFSET_X, 0, 1300, 600);
      }
    }
    this.drawScene(ctx, board);
    ctx.restore();
  },

  // ---- 草皮卷滚筒 (REANIM_SODROLL; animTime 直接绑定 cutsceneSod 进度严格同步) ----
  drawSodRoll(ctx, board) {
    if (!board.sodRolls) return;
    for (const r of board.sodRolls) {
      if (!r || !r.def) continue;
      if (board.cutsceneSod !== undefined) {
        r.animTime = Math.max(0, Math.min(1, board.cutsceneSod));
        r.loopCount = r.animTime >= 1 ? 1 : 0;
      }
      r.draw(ctx);
    }
  },

  drawScene(ctx, board) {
    // ---- 坚果保龄球出球线 (#8 原版 Challenge::DrawBackdrop: IsWallnutBowlingLevel && mShowBowlingLine
    //      → IMAGE_WALLNUT_BOWLINGSTRIPE @ (268,77) 画在背景层, 位于草地/植物/僵尸之下, 世界坐标随镜头平移) ----
    if (board.level && (board.level.fixed === 'bowling' || board.level.fixed === 'bowling2')) {
      const stripe = Assets.image('wallnut_bowlingstripe.png');
      if (stripe) {
        ctx.drawImage(stripe, 268, 77);
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(216,48,40,0.85)';
        ctx.fillRect(268, 90, 6, 400);
        ctx.restore();
      }
    }
    // ---- I, Zombie 红线 (原版 Challenge::DrawBackdrop: IMAGE_WALLNUT_BOWLINGSTRIPE 背景层) ----
    // 层级在草地/僵尸之下、cutscene 戴夫之下, 且随 camera pan 移动 (#4a)
    if (board.mode === 'izombie') {
      const stripe = Assets.image('wallnut_bowlingstripe.png');
      const lineX = 40 + (board.izombieLimit || 4) * 80 - 8;
      if (stripe) {
        ctx.drawImage(stripe, lineX, 73);
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(216,48,40,0.85)';
        ctx.fillRect(lineX, 90, 6, 400);
        ctx.restore();
      }
    }
    // ---- 泳池水面 (原版 PoolEffect: 水面波动 + 波光端端) ----
    if (board.waterRows.length) this.drawPoolWater(ctx, board);
    // ---- 冰道 (Zamboni/Bobsled) ----
    for (let r = 0; r < board.rows; r++) {
      if (board.iceTimers[r] > 0) {
        const ice = Assets.image('ice');
        const minX = board.iceMinX(r) || 900;
        if (ice && minX < 850) {
          ctx.save(); ctx.globalAlpha = 0.75;
          ctx.drawImage(ice, minX, board.gridY(r) + 38, 800 - minX + 40, 55);
          ctx.restore();
        }
      }
    }
    // ---- 弹坑 ----
    for (const c of board.craters) {
      const img = Assets.image(board.isRoof ? 'crater_roof_center' : 'crater');
      if (img) ctx.drawImage(img, board.gridX(c.col) + 8, board.cellY(c.row, c.col) + 40);
    }
    // ---- 墓碑 (原版 GridItem::DrawGraveStone: 5列×4行cel表 + 升起动画 + 土堆) ----
    const tombImg = Assets.image('tombstones');
    const moundImg = Assets.image('tombstone_mounds');
    for (const g of board.graves) {
      if (!tombImg) break;
      const celW = tombImg.width / 5, celH = tombImg.height / 4;
      const look = (g.col * 7 + g.row * 13 + (g.look || 0) * 29) % 10;
      const graveCol = look % 5;
      const graveRow = g.row === 0 ? 1 : 2 + look % 2;
      // 升起动画 (原版 mGridItemCounter 0→100 → 高度 0→celH, ease-in-out)
      const rise = g.rise === undefined ? 1 : g.rise;
      const ease = rise < 0.5 ? 2 * rise * rise : 1 - Math.pow(-2 * rise + 2, 2) / 2;
      const visH = Math.max(1, Math.round(celH * ease));
      const x = board.gridX(g.col) + ((g.look || 0) % 3) * 2 - 4;
      const y = board.cellY(g.row, g.col) + celH - 9;
      // 墓碑 (底部锚定, 从地下升起)
      ctx.drawImage(tombImg, graveCol * celW, graveRow * celH, celW, visH,
        x, y - visH, celW, visH);
      // 土堆 (原版 IMAGE_TOMBSTONE_MOUNDS)
      if (moundImg) {
        const moundH = Math.min(celH, Math.max(1, Math.round(celH * Math.max(0, (rise - 0.5) * 2))));
        ctx.drawImage(moundImg, graveCol * celW, graveRow * celH, celW, Math.min(celH, moundH + 14),
          x, y - Math.min(celH, moundH + 14), celW, Math.min(celH, moundH + 14));
      }
    }
    // ---- 渲染顺序列表 (植物+僵尸统一排序) ----
    // 原版 Plant::CalcRenderOrder (Plant.cpp:503-530):
    //   偏移 = PLANT_ORDER×5 − mX + 800;  PLANT_ORDER: 花盆/睡莲=0, 普通=1, 南瓜=2, 咖啡豆(飞行)=3
    //   → 同格南瓜恒在内部植物之上(+5); 左侧植物覆盖右侧(−mX); 花盆在植物之下(−5)
    //   #fix(南瓜图层): 旧实现南瓜固定 +6、植物按列 +col — 第 7/8 列植物会盖住自己的南瓜壳,
    //   邻列遮挡关系也不对; 现按原版公式以 X 坐标驱动, 花盆/睡莲同样并入列表 (order 0)
    const plantOrder = (p) => {
      let ord = 1;
      if (p.type === 'PUMPKIN') ord = 2;
      else if (p.type === 'FLOWERPOT' || p.type === 'LILYPAD') ord = 0;
      else if (p.type === 'COFFEEBEAN') ord = 3;
      return p.row * 10000 + RENDER_LAYER.PLANT + ord * 5 - p.x + 800;
    };
    const list = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < 9; c++) {
        const lily = board.gridLily[r][c];
        if (lily && !lily.dead) list.push({ o: plantOrder(lily), d: () => lily.draw(ctx, board) });
        const pot = board.gridPot[r][c];
        if (pot && !pot.dead) list.push({ o: plantOrder(pot), d: () => pot.draw(ctx, board) });
      }
    }
    for (const p of board.plants) {
      if (p.dead) continue;
      if (p.onBungeeState === 'grabbed' || p.onBungeeState === 'rising') continue;   // 被蹦极抓走: 随蹦极绘制
      if (p.squished) {
        // 压扁植物: 墓碑层之上 (原版 Squish → RENDER_LAYER_GRAVE_STONE +8)
        list.push({ o: p.row * 10000 + RENDER_LAYER.GRAVE + 8, d: () => p.draw(ctx, board) });
        continue;
      }
      // #fix(保龄球滚动层级) 原版 Plant::CalcRenderOrder 512-514: 保龄球关坚果 → RENDER_LAYER_PROJECTILE
      //   (305000, 僵尸 303000 之上) — 坚果 visibly 滚过僵尸身体; 旧实现植物层(302000)被僵尸盖住
      if (p.rolling) {
        list.push({ o: p.row * 10000 + RENDER_LAYER.PROJECTILE, d: () => p.draw(ctx, board) });
        continue;
      }
      list.push({ o: plantOrder(p), d: () => p.draw(ctx, board) });
    }
    // 罐子解谜: 罐子进渲染列表 (原版 Challenge.cpp:3494 ScaryPotterPlacePot
    //   mRenderOrder = MakeRenderOrder(RENDER_LAYER_PLANT, row, 0) → 与植物同层行交错;
    //   同格僵尸覆盖罐子 / 下排罐子覆盖上排僵尸; 过场戴夫绘制于全部之上 → 修复戴夫被罐子遮挡)
    if (board.vases && board.vases.length) {
      const UIm = (window.__mods && window.__mods['ui']) || require('./ui');
      const UI = UIm && UIm.UI;
      if (UI && UI.drawVase) {
        for (const v of board.vases) {
          if (v.broken) continue;
          list.push({ o: v.row * 10000 + RENDER_LAYER.PLANT + (v.col || 0), d: () => UI.drawVase(ctx, v, board) });
        }
      }
    }
    // 街边僵尸 (开场过场, row=-1 → 不在草坪, 直接画)
    for (const z of board.zombies) {
      if (z.row === -1 && !z.dead) {
        list.push({ o: z.renderOrder || 303000, d: () => { z.drawShadow(ctx); z.draw(ctx); } });
      }
    }
    for (const z of board.zombies) {
      if (z.dead || z.row === -1) continue;
      // #5 僵王博士分层渲染 (原版 Board::AddBossRenderItem): 4 部位独立渲染序,
      //   僵尸自然穿插在机器腿前后 (旧实现整机单一 renderOrder 盖在所有僵尸之上)
      if (z.type === 'BOSS' && z.bossRenderOrders) {
        const ro = z.bossRenderOrders();
        list.push({ o: ro.backLeg, d: () => z.drawBossPart(ctx, 'backleg') });
        list.push({ o: ro.frontLeg, d: () => z.drawBossPart(ctx, 'frontleg') });
        list.push({ o: ro.main, d: () => z.drawBossPart(ctx, 'main') });
        list.push({ o: ro.backArm, d: () => z.drawBossPart(ctx, 'backarm') });
        continue;
      }
      list.push({ o: z.renderOrder || (z.row * 10000 + RENDER_LAYER.ZOMBIE), d: () => { z.drawShadow(ctx); z.draw(ctx); } });
    }
    // ---- 蹦极僵尸目标十字标志 (原版 Board.cpp 6138-6145: RENDER_ITEM_ZOMBIE_BUNGEE_TARGET,
    //      层级 RENDER_LAYER_PROJECTILE row+1 — 画在植物之上) ----
    for (const z of board.zombies) {
      if (z.dead || z.row === -1 || z.type !== 'BUNGEE') continue;
      list.push({ o: z.row * 10000 + RENDER_LAYER.PROJECTILE + 1, d: () => z.drawBungeeTarget(ctx) });
    }
    // 梯子道具 (僵尸层)
    for (const l of board.ladders) {
      list.push({
        o: l.row * 10000 + RENDER_LAYER.ZOMBIE + 5,
        d: () => {
          const img = Assets.image('zombie_ladder_5');
          if (img) {
            ctx.save(); ctx.globalAlpha = 0.92;
            ctx.drawImage(img, board.gridX(l.col) + 40, board.cellY(l.row, l.col) + 10, 40, 90);
            ctx.restore();
          }
        }
      });
    }
    // 传送门 (原版 RENDER_LAYER_PARTICLE 行内偏移 — 僵尸层之上, 门内穿越)
    if (board.portals) {
      for (const p of board.portals) {
        if (!p.anim || p.anim.dead) continue;
        list.push({ o: p.row * 10000 + RENDER_LAYER.PARTICLE, d: () => { p.anim.update(1 / 60); p.anim.draw(ctx); } });
      }
    }
    // 割草机 (RENDER_LAYER_LAWN_MOWER)
    for (const m of board.mowers) {
      if (m.state === 'gone' || m.hidden) continue;
      list.push({ o: m.row * 10000 + RENDER_LAYER.MOWER, d: () => this.drawMower(ctx, m, board) });
    }
    // reanim特效池 (原版 Board.cpp: 只绘制 !mIsAttachment 的 reanim; 僵尸/植物 bodyReanim 由其宿主绘制)
    for (const r of board.reanims) {
      if (r.isAttachment || r.dead) continue;
      list.push({ o: r.renderOrder || RENDER_LAYER.PARTICLE, d: () => r.draw(ctx) });
    }
    list.sort((a, b) => a.o - b.o);
    for (const it of list) it.d();
    // ---- 掉落肢体粒子 ----
    for (const e of board.effects) if (e instanceof LimbParticleInstance) this.drawLimb(ctx, e);
    // ---- 子弹 ----
    for (const pr of board.projectiles) pr.draw(ctx, board);
    // ---- 草皮卷滚筒 (RENDER_LAYER_TOP) ----
    this.drawSodRoll(ctx, board);
    // ---- 特效 ----
    this.drawEffects(ctx, board);
    // ---- 阳光/金币 ----
    for (const s of board.suns) s.draw ? s.draw(ctx, board) : this.drawSun(ctx, s, board);
    for (const c of board.coins) this.drawCoin(ctx, c);
    // ---- 关卡奖励掉落物 (原版 LevelAward: 种子包/道具/纸条) ----
    if (board.levelAward) this.drawLevelAward(ctx, board.levelAward);
    // ---- 罐子关轮间戴夫 (原版: 戴夫 above-UI 层级, 绘于全部战场元素之上) ----
    if (board.vaseDave) this.drawVaseDave(ctx, board.vaseDave);
    // ---- 浓雾 (原版 Board::DrawFog: 逐格 8-cel + 呼吸波动) ----
    if (board.scene === 'fog') this.drawFog(ctx, board);
    // ---- 雨 (原版 Challenge::DrawRain — 雨天种子/暴风雨夜双层斜雨) ----
    if (board.level.rainingSeeds || board.level.stormy) this.drawRain(ctx, board);
  },

  // ---- 罐子关轮间戴夫 + 对话框 (原版 UpdateLevelEndSequence + AdvanceCrazyDaveDialog) ----
  drawVaseDave(ctx, d) {
    if (d.phase === 'repopulate') return;   // 补罐阶段不画 (原版 PuzzleNextStageClear 无戴夫)
    if (d.anim) d.anim.draw(ctx);
    if (d.phase === 'talk' && d.line >= 0) {
      const text = d.lines[Math.min(d.line, d.lines.length - 1)] || '';
      drawDaveDialog(ctx, text, d.talkT || 0);
    }
  },

  // ---- 奖励掉落物 (掉落弹跳 + 待点击提示光效; 飞行阶段在 fly 渲染) ----
  drawLevelAward(ctx, a) {
    if (a.phase === 'done') return;
    const UIm = (window.__mods && window.__mods['ui']) || require('./ui');
    const UI = UIm && UIm.UI;
    ctx.save();
    if (a.phase === 'fly') {
      // 飞向屏幕中央: 放大 + 旋转 (原版 COIN_MOTION_LEVEL_TARGET)
      ctx.translate(a.fx, a.fy);
      ctx.rotate(a.frot);
      ctx.scale(a.fscale, a.fscale);
    } else {
      const bob = a.phase === 'wait' ? Math.sin((a.t || 0) * 5) * 4 : 0;
      ctx.translate(a.x, a.y + bob);
      // 待拾取光效 (原版 SeedPacketFlash)
      if (a.phase === 'wait') {
        ctx.save();
        const t = (Date.now() % 900) / 900;
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * Math.PI * 2);
        const rays = Assets.image('awardrays1');
        if (rays) ctx.drawImage(rays, -70, -70, 140, 140);
        ctx.restore();
      }
    }
    if (a.type === 'seed' && a.plant && UI) {
      // 原版 DrawSeedPacket: 掉落奖励用 IMAGE_SEEDS 卡槽尺寸 (50×70) — 非大包 (#16)
      const thumb = UI.getThumb(a.plant);
      const tw = thumb ? thumb.width : 60, th = thumb ? thumb.height : 60;
      const s = Math.min(36 / tw, 44 / th);   // 包内植物缩略图 (原版 scale 0.5)
      // 卡槽种子包底 (50×70) — 从 seedpacket_larger 等比缩放绘制
      const packet = Assets.image('seedpacket_larger.png');
      if (packet) ctx.drawImage(packet, -25, -35, 50, 70);
      if (thumb) ctx.drawImage(thumb, -tw * s / 2, -35 + 8 + (44 - th * s) / 2, tw * s, th * s);
    } else {
      // 道具/纸条/奖杯奖励图
      const map = {
        shovel: 'shovel_hi_res', note: 'zombienote', almanac: 'selectorscreen_almanac',
        carkeys: 'carkeys', taco: 'taco', wateringcan: 'wateringcan', trophy: 'trophy_hi_res',
      };
      const im = Assets.image(map[a.type]);
      if (im) {
        const s = Math.min(80 / im.width, 80 / im.height);
        if (a.type === 'note') { ctx.scale(0.35, 0.35); ctx.drawImage(im, -im.width / 2, -im.height / 2); }
        else ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s);
      } else {
        ctx.fillStyle = '#ffe36a';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    // 待点击提示文字
    if (a.phase === 'wait') {
      const t = (Date.now() % 1200) / 1200;
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      ctx.font = 'bold 15px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(30,18,0,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText('点击拾取奖励', a.x, a.y - 58);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('点击拾取奖励', a.x, a.y - 58);
      ctx.restore();
    }
  },

  // ---- 泳池水 (原版 PoolEffect.cpp 移植) ----
  // 基础: pool.jpg(白天)/pool_night.jpg(夜) @ (34,278) 720x159
  // 动画: 30列条带 sin 波动 (原版 xPhase=x*3*2π/15) + 波光纹理对角滚动叠加
  drawPoolWater(ctx, board) {
    const isNight = board.scene === 'fog';   // 雾场景 = 夜间泳池
    const base = Assets.image(isNight ? 'pool_night.jpg' : 'pool.jpg');
    if (!base) return;
    const X = 34, Y = 278, W = 720, H = 159;
    const t = board.time;
    const N = 30;
    const sw = base.width / N;
    for (let i = 0; i < N; i++) {
      const fx = i / N;
      const xPhase = fx * Math.PI * 2 * 3;              // 原版 15列×3周期
      const bob = Math.sin(xPhase + t * 0.9) * 1.6 + Math.sin(xPhase * 2 + t * 1.3) * 1.0;
      ctx.drawImage(base, i * sw, 0, sw, base.height,
        X + fx * W, Y + bob, W / N + 0.6, H);
    }
    // 水面明暗纹理 (原版 pool_shading 三角形扭曲 → 条带滚动叠加)
    const shade = Assets.image(isNight ? 'pool_shading_night.jpg' : 'pool_shading_.jpg');
    if (shade) {
      ctx.save();
      ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
      ctx.globalAlpha = isNight ? 0.28 : 0.18;
      ctx.globalCompositeOperation = 'multiply';
      const scroll = (t * 6) % shade.width;
      for (let sx = -scroll; sx < W; sx += shade.width) {
        for (let sy = 0; sy < H; sy += shade.height) {
          ctx.drawImage(shade, sx + Math.sin(t * 0.8 + sy) * 2, sy);
        }
      }
      ctx.restore();
    }
    // 波光 caustic (原版 UpdateWaterEffect 滚动查找 → 双层对角滚动 lighter)
    const ca = Assets.image('pool_caustic_effect.jpg');
    if (ca) {
      ctx.save();
      ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = isNight ? 0.06 : 0.12;
      const o1x = (t * 9) % ca.width, o1y = (t * 5) % ca.height;
      const o2x = (-t * 6) % ca.width, o2y = (t * 7) % ca.height;
      for (let x = -ca.width; x < W + ca.width; x += ca.width) {
        for (let y = -ca.height; y < H + ca.height; y += ca.height) {
          ctx.drawImage(ca, X + x + o1x, Y + y + o1y);
          ctx.drawImage(ca, X + x + o2x, Y + y + o2y);
        }
      }
      ctx.restore();
    }
  },

  // ---- 浓雾 tint 预烘焙缓存 (8 cel × 8 明暗档 = 最多 64 张离屏小图) ----
  _fogTint(fog, celCol, bucket) {
    if (!fog.__fogTints) fog.__fogTints = {};
    const k = celCol + '_' + bucket;
    let c = fog.__fogTints[k];
    if (c) return c;
    const celW = fog.width / 8, celH = fog.height;
    const v = Math.max(0.4, (40 + bucket * 27) / 100);   // 40%..100% 亮度
    c = document.createElement('canvas');
    c.width = Math.ceil(celW); c.height = Math.ceil(celH);
    const cc = c.getContext('2d');
    cc.drawImage(fog, celCol * celW, 0, celW, celH, 0, 0, c.width, c.height);
    cc.globalCompositeOperation = 'multiply';
    const g = Math.round(v * 255);
    cc.fillStyle = `rgb(${g},${g},${g})`;
    cc.fillRect(0, 0, c.width, c.height);
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(fog, celCol * celW, 0, celW, celH, 0, 0, c.width, c.height);
    fog.__fogTints[k] = c;
    return c;
  },

  // ---- 浓雾 (原版 Board::DrawFog 逐格移植) ----
  // fog.png 1680x190 = 8 cel × 210; 每格 celLook%8 选图, 颜色随 celLook+motion 变暗
  drawFog(ctx, board) {
    const fog = Assets.image('fog.png');
    if (!fog) {
      // 兑底: 旧版矩形雾
      const fj = Assets.image('fog');
      if (fj && board.fogLevel(500) > 0) {
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(fj, 0, 0, fj.width, fj.height, 340, 70, 460, 470);
        ctx.restore();
      }
      return;
    }
    const celW = fog.width / 8, celH = fog.height;
    const PERIOD = 4500;                        // 原版 lcm(900,500) 防精度丢失
    const time = (board.time % PERIOD) * Math.PI * 2;
    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 7; y++) {
        const fade = board.gridCelFog[x][y];
        if (fade <= 0) continue;
        const look = board.gridCelLook[x][y % 6];
        const celCol = look % 8;
        const posX = x * 80 + board.fogOffset - 15;
        const posY = y * 85 + 20;
        const phaseX = 6 * Math.PI * x / 9;
        const phaseY = 6 * Math.PI * y / 7;
        const motion = 13 + 4 * Math.sin(time / 900 + phaseY) + 8 * Math.sin(time / 500 + phaseX);
        const cVariant = 255 - look * 1.5 - motion * 1.5;
        // 性能: 明暗量化 8 档 → 预烘焙 tint 缓存 (替代逐格 ctx.filter 的 GPU 大开销)
        const bucket = Math.max(0, Math.min(7, Math.round((cVariant - 40) / 27)));
        const img2 = this._fogTint(fog, celCol, bucket);
        ctx.save();
        ctx.globalAlpha = Math.min(1, fade / 255);
        ctx.drawImage(img2, posX, posY, celW, celH);
        if (x === 8) ctx.drawImage(img2, posX + 80, posY, celW, celH);
        ctx.restore();
      }
    }
  },

  // ---- 雨 (原版 Challenge::DrawRain Challenge.cpp 2788-2835 逐句移植) ----
  // rain.png 100×100 平铺; 远景层 1x (X 100tick 移 -100 / Y 20tick 落 +100)
  // + 近景层 1.5x (X 161tick / Y 33tick) — 双层视差斜雨
  drawRain(ctx, board) {
    const rain = Assets.image('rain.png');
    if (!rain) return;
    const t = Math.max(0, board.time) * 100;   // 原版 mEffectCounter (100Hz tick)
    // 远景: aTimeOffsetXEst = lerp(0,-100, t%100/100); aTimeOffsetYEst = lerp(-100,0, t%20/20)
    const txd = -100 * ((t % 100) / 100);
    const tyd = -100 + 100 * ((t % 20) / 20);
    for (let h = 9; h > 0; h--) {
      for (let v = 7; v > 0; v--) {
        ctx.drawImage(rain, txd + 100 * h, tyd + 100 * v);
      }
    }
    // 近景 1.5x: aTimeOffsetXCls = lerp(0,-100, t%161/161); aTimeOffsetYCls = lerp(-100,0, t%33/33)
    const txn = -100 * ((t % 161) / 161);
    const tyn = -100 + 100 * ((t % 33) / 33);
    const S = 1.5;
    for (let h = 0; h < 9; h++) {
      for (let v = 0; v < 7; v++) {
        ctx.drawImage(rain, (h * 100 + txn) * S, (v * 100 + tyn) * S, 100 * S, 100 * S);
      }
    }
  },

  drawMower(ctx, m, board) {
    const name = m.type === 'pool' ? 'PoolCleaner' : m.type === 'roof' ? 'RoofCleaner' : 'LawnMower';
    if (!m.reanim) {
      m.reanim = Assets.reanim(name);
      // 原版割草机 reanim: LawnMower 动画区间名 'a' (非 anim_normal);
      // RoofCleaner 无 anims 区间 → 全帧播放 (reanim.play 兼容无区间时整体播放)
      const def = m.reanim.def;
      const animName = def && def.anims && def.anims.length && def.anims.some(a => a[0] === 'anim_normal') ? 'anim_normal' : (def && def.anims && def.anims.length ? def.anims[0][0] : null);
      if (animName) m.reanim.play(animName, RE.LOOP, 0);
      else { m.reanim.frameStart = 0; m.reanim.frameCount = def ? def.n : 1; m.reanim.loopType = RE.LOOP; m.reanim.animRate = 0; }
    }
    // ---- 原版 LawnMower::Draw 布局 (LawnMower.cpp 275-367) ----
    //   画布平移 (mPosX+6, mPosY) + reanim overlay(0,18); mPosY = GetPosYBasedOnRow(mPosX+40, row)+23
    //   → 割草机 y = gridY+41 (23+18); 泳池清洁车 y = gridY+34 (触发路径 23-7+18, 待机缓存帧同为+34)
    //   屋顶清洁车: 待机 y-40 → gridY+2 (挂坡上); 触发 y-4 → gridY+37 (落下行驶)
    // #修复(小推车显示不全): 原版 mPosX=-21 时整机内容左缘 (mPosX+4) 在屏幕外 —
    //   此处右移使整机完整可见: 内容左缘 ≈ 2px (割草机内容 track x -2..68 / 清洁车 3.5..64)
    const baseY = board.getPosYBasedOnRow(m.x + 40, m.row) + 23;
    // ---- #6 地面阴影 (原版 LawnMower::Draw 285-318: IMAGE_PLANTSHADOW @ (mPosX-7, mPosY+47),
    //      夜间换 PLANTSHADOW2; 泳池车偏移 (-17,-8); 屋顶车 (-9,-36, scaleY 1.2)) ----
    // web 系换算: mPosX ≡ m.x+18 (rx = m.x+24 ≡ 原版 mPosX+6) → mPosX-7 ≡ m.x+11
    const night = board.scene === 'night' || board.scene === 'fog';
    const shadow = Assets.image(night ? 'plantshadow2' : 'plantshadow');
    if (shadow) {
      let shx = m.x + 11, shy = baseY + 47, shsy = 1;
      if (m.type === 'pool') { shx -= 17; shy -= 8; }
      else if (m.type === 'roof') { shx -= 9; shy -= 36; shsy = 1.2; }
      ctx.save();
      ctx.drawImage(shadow, shx, shy, shadow.width, shadow.height * shsy);
      ctx.restore();
    }
    let ry;
    if (m.type === 'pool') {
      ry = baseY + 11;                       // 原版: gridY+34
    } else if (m.type === 'roof') {
      ry = baseY + (m.state === 'running' ? 14 : -21);   // 待机挂坡 +2 / 行驶 +37
    } else {
      ry = baseY + 18;                       // 原版: gridY+41
    }
    const rx = m.x + (m.type === 'pool' ? 18 : m.type === 'roof' ? 18 : 24);
    m.reanim.setPosition(rx, ry);
    const sc = m.type === 'pool' ? 0.8 : 0.85;
    m.reanim.overrideScale(sc, sc);
    // 原版: 待机静止; 触发后 animRate=70 播放 (轮子与机身同步滚动)
    m.reanim.animRate = m.state === 'running' ? 70 : 0;
    m.reanim.update(1 / 60);
    // 智慧树作弊码 trickedout: 割草机变“疯狂机车” — 金属红染色 + 行驶尾气 (原版 TRICKED_OUT)
    const chT = board.game && board.game.cheats && board.game.cheats.trickedout;
    if (chT) {
      ctx.save();
      ctx.filter = 'saturate(1.9) hue-rotate(-16deg) brightness(1.08)';
      m.reanim.draw(ctx);
      ctx.restore();
      if (m.state === 'running') {
        const ph = Date.now() * 0.02;
        ctx.save();
        for (let k = 0; k < 3; k++) {
          const gp = ((ph + k * 1.7) % 5) / 5;
          ctx.globalAlpha = 0.34 * (1 - gp);
          ctx.fillStyle = k === 2 ? '#ffb347' : '#9a9a92';
          ctx.beginPath();
          ctx.arc(rx - 22 - gp * 26, ry + 12 - gp * 8, 3.5 + gp * 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    } else {
      m.reanim.draw(ctx);
    }
  },

  drawSun(ctx, s, board) {
    if (!s.anim) {
      s.anim = Assets.reanim('Sun');
      // Sun.reanim 无 anims 区间: 全帧循环 (Sun1/2/3 轨道轮流显现 = 旋转)
      s.anim.frameStart = 0;
      s.anim.frameCount = s.anim.def ? s.anim.def.n : 1;
      s.anim.animRate = 8;
      s.anim.loopType = RE.LOOP;
    }
    s.anim.update(1 / 60);
    s.anim.setPosition(s.x + Math.sin(s.phase) * 3, s.y);
    // 原版 Coin::GetSunScale: 小阳光15→0.5 / 大阳光50→2.0 / 普通→1.0
    const sunScale = s.value <= 15 ? 0.55 : (s.value >= 50 ? 1.0 : 1.0);
    const sc = sunScale * (s.collected ? Math.max(0.3, 1 - s.flyT) : (s.life < 2 ? 0.7 + Math.sin(board.time * 8) * 0.15 : 1));
    s.anim.overrideScale(sc, sc);
    s.anim.draw(ctx);
  },

  drawCoin(ctx, c) {
    // 礼物植物盒 / 巧克力 (原版 COIN_PRESENT_PLANT / COIN_CHOCOLATE): 贴图 + 呼吸浮动
    if (c.kind === 'present' || c.kind === 'chocolate') {
      const im = Assets.image(c.kind === 'present' ? 'present.png' : 'chocolate.png');
      ctx.save();
      const t = (c.life > 0 ? (18 - Math.min(18, c.life)) : 0);
      const bob = Math.sin(t * 3) * 3;
      const sc = c.collected ? Math.max(0.3, 1 - c.flyT) : 1;
      ctx.globalAlpha = (!c.collected && c.life < 3) ? (0.4 + 0.6 * Math.abs(Math.sin(c.life * 6))) : 1;
      ctx.translate(c.x, c.y + bob);
      ctx.scale(sc, sc);
      if (im) ctx.drawImage(im, -im.width / 2, -im.height / 2);
      else {
        ctx.fillStyle = c.kind === 'present' ? '#c84a4a' : '#7a4a20';
        ctx.fillRect(-16, -16, 32, 32);
      }
      ctx.restore();
      return;
    }
    if (!c.anim) {
      c.anim = Assets.reanim(c.type === 'diamond' ? 'Diamond' : 'Coin_gold');
      c.anim.play('anim_idle', 0, 10);
    }
    c.anim.update(1 / 60);
    c.anim.setPosition(c.x, c.y);
    const sc = (c.collected ? Math.max(0.3, 1 - c.flyT) : 1) * 0.9;
    c.anim.overrideScale(sc, sc);
    c.anim.draw(ctx);
  },

  drawLimb(ctx, e) {
    // 掉落肢体 (断臂/掉头/掉盔) — 原版为多部件组合贴图 (godot Zombie001 NodeDrop):
    //   掉头 = Zombie_head(脸) + Zombie_tongue(吐舌) + Zombie_jaw(张开的下颚) 叠放 (#4)
    //   掉手 = Zombie_outerarm_hand(手) + Zombie_outerarm_lower(下臂) 小臂组合 (#3)
    //   v8.3.0 误用 84x125 打僵尸手骨图 zombie_hand_arm (大 3 倍) + 单张头图 — 均已换组合
    // 特殊僵尸手臂 (ARM_IMG 表) / 头盔 / 路障 / 铁桶等仍走单图模式
    ctx.save();
    // 淡出: 静止期结束前 0.4s 渐隐 (原版粒子 FadeOut)
    const rest = e.rest || 0;
    ctx.globalAlpha = rest > 0 ? Math.max(0, 1 - Math.max(0, rest - 0.8) / 0.4) : 1;
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    if (!e.imgName && e.kind === 'head') {
      // 头组合 (godot zombie_001_norm.tscn Node2D_Head_Drop 坐标, 以组合中心为原点, scale 0.8)
      // #fix(掉头缺头发): godot Head_Drop 含 4 层 — Anim_head1 + Anim_head2(jaw) + Anim_tongue
      //   + Anim_hair; 旧实现只有 3 层, 掉落的头颅没有头发 (hair 相对 head1 偏移 (-5.22,-0.78))
      const P = [
        ['zombie_head', -21.2, -25.9, 0.089],
        ['zombie_jaw', -11.3, 12.3, 0.121],
        ['zombie_tongue', 2.7, 14.5, 0.0915],
        ['zombie_hair', -26.4, -26.7, 0.089],
      ];
      for (const [name, dx, dy, rot] of P) {
        const img = Assets.image(name);
        if (img) {
          ctx.save(); ctx.rotate(rot);
          ctx.drawImage(img, dx, dy, img.width * 0.8, img.height * 0.8);
          ctx.restore();
        }
      }
    } else if (!e.imgName && e.kind === 'arm') {
      // 小臂+手组合 (godot: hand(-9,-5.45) lower(-4.87,-21.19), 组合中心(3.5,0.18))
      const P = [
        ['zombie_outerarm_hand', -12.5, -5.6, -0.024],
        ['zombie_outerarm_lower', -8.4, -21.4, -0.053],
      ];
      for (const [name, dx, dy, rot] of P) {
        const img = Assets.image(name);
        if (img) {
          ctx.save(); ctx.rotate(rot);
          ctx.drawImage(img, dx, dy, img.width * 0.8, img.height * 0.8);
          ctx.restore();
        }
      }
    } else {
      const imgMap = {
        head: 'zombie_head',
        arm: 'zombie_outerarm_hand',
        cone: 'zombie_cone1',
        bucket: 'zombie_bucket1',
        door: 'zombie_screendoor1',
        helm: e.imgName || 'zombie_football_helmet',
        newspaper: 'zombie_paper_paper1',
        ladder: 'zombie_ladder_2',
      };
      const img = Assets.image(e.imgName || imgMap[e.kind] || 'zombie_head');
      if (img) ctx.drawImage(img, -img.width / 2, -img.height / 2);
      else { ctx.fillStyle = '#7a6a5a'; ctx.fillRect(-8, -8, 16, 16); }
    }
    ctx.restore();
  },

  drawEffects(ctx, board) {
    for (const e of board.effects) {
      if (e instanceof LimbParticleInstance) continue;
      switch (e.name) {
        case 'powie': {
          const img1 = Assets.image('explosionpowie');
          const p = e.t / 0.9;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          if (img1) ctx.drawImage(img1, 0, Math.floor(p * 5) * (img1.height / 6), img1.width, img1.height / 6,
            e.x - 90, e.y - 90, 180, 180);
          ctx.restore();
          break;
        }
        case 'pow': {
          // 原版 PARTICLE_POW: 打僵尸锤击粉云 (100px, 0.5s, 上方-ui层)
          const img1 = Assets.image('explosionpowie');
          const p = Math.min(1, e.t / 0.5);
          ctx.save();
          ctx.globalAlpha = 1 - p;
          if (img1) {
            ctx.drawImage(img1, 0, Math.floor(p * 5) * (img1.height / 6), img1.width, img1.height / 6,
              e.x - 50, e.y - 50, 100, 100);
          } else {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(e.x, e.y, 45 * (1 - p * 0.3), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'spudow': {
          const img = Assets.image('explosionspudow');
          const p = e.t / 0.9;
          if (img) {
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, 0, Math.floor(p * 5) * (img.height / 6), img.width, img.height / 6,
              e.x - 80, e.y - 80, 160, 160);
            ctx.restore();
          }
          break;
        }
        case 'jackbox_pop': case 'boom': {
          const img = Assets.image('explosioncloud');
          const p = e.t / 1.2;
          if (img) {
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 90 * (0.5 + p), e.y - 90 * (0.5 + p), 180 * (0.5 + p), 180 * (0.5 + p));
            ctx.restore();
          }
          break;
        }
        case 'jala_row': {
          const img = Assets.image('explosioncloud');
          const p = e.t / 0.8;
          const y = board.gridY(e.opts.row);
          ctx.save();
          ctx.globalAlpha = 1 - p;
          for (let x = 20; x < 800; x += 110) {
            ctx.drawImage(img, x, y - 30 + Math.sin(x + p * 6) * 10, 110, 110);
          }
          ctx.restore();
          break;
        }
        case 'splat': case 'snowsplat': case 'firesplat': case 'melonsplat': case 'basketballsplat': {
          if (!e.anim) {
            e.anim = Assets.reanim('Puff');
            e.anim.play('anim_puff', 1, 20);
          }
          e.anim.update(1 / 60);
          e.anim.setPosition(e.x, e.y);
          const sc = e.name === 'melonsplat' ? 1.6 : 1;
          e.anim.overrideScale(sc, sc);
          if (e.name === 'snowsplat') e.anim.colorOverride = [153, 217, 255, 255];
          if (e.name === 'firesplat') e.anim.colorOverride = [255, 190, 128, 255];
          // #修复(碎西瓜): 汁液飞溅云染色 — 普通西瓜红瓢汁 / 冰西瓜冰蓝 (原版 MelonImpact 粒子伴随汁液)
          if (e.name === 'melonsplat') e.anim.colorOverride = (e.opts && e.opts.winter)
            ? [168, 224, 255, 255] : [255, 130, 130, 255];
          e.anim.draw(ctx);
          break;
        }
        case 'firetrail': case 'icetrail': {
          // #修复(僵王尾迹): 原版 PARTICLE_FIREBALL/ICEBALL_TRAIL — 球后地面火苗/冰晶粒子
          //   素材条: fire 208×17 (13帧×16) / ice 152×23 (8帧×19), 0.6s 淡出, 火苗轻微上飘
          const strip = Assets.image(e.name === 'firetrail'
            ? 'zombie_boss_fireball_groundparticles.png' : 'zombie_boss_iceball_groundparticles.png');
          const p = Math.min(1, e.t / 0.6);
          const rise = e.name === 'firetrail' ? p * 8 : 0;
          ctx.save();
          ctx.globalAlpha = (1 - p) * 0.9;
          if (strip) {
            const n = e.name === 'firetrail' ? 13 : 8;
            const fw = strip.width / n;
            const fi = (e.fi || 0) % n;
            ctx.drawImage(strip, fi * fw, 0, fw, strip.height,
              e.x - fw / 2, e.y - strip.height / 2 - rise, fw, strip.height);
          } else {
            ctx.fillStyle = e.name === 'firetrail' ? '#ff7b2b' : '#9fe8ff';
            ctx.beginPath();
            ctx.arc(e.x, e.y - rise, 7 * (1 - p * 0.4), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'melonchunks': {
          // #修复(碎西瓜): 9 块碎瓜弹飞 (原版 PARTICLE_MELONSPLASH/WINTERMELON)
          //   贴片源自 melonpult_particles / wintermelon_particles 334×37 精确分段
          const sheet = Assets.image(e.opts && e.opts.winter ? 'wintermelon_particles.png' : 'melonpult_particles.png');
          if (sheet && e.parts) {
            const life = 1.1;
            const pr = Math.min(1, e.t / life);
            const alpha = pr < 0.72 ? 1 : 1 - (pr - 0.72) / 0.28;
            if (alpha > 0.02) {
              ctx.save();
              ctx.globalAlpha = alpha;
              for (const p of e.parts) {
                ctx.save();
                ctx.translate(e.x + p.x, e.y + p.y);
                ctx.rotate(p.rot);
                const w = p.sw * p.sc, h = p.sh * p.sc;
                ctx.drawImage(sheet, p.sx, p.sy, p.sw, p.sh, -w / 2, -h / 2, w, h);
                ctx.restore();
              }
              ctx.restore();
            }
          }
          break;
        }
        case 'puffsplat': {
          // 原版 PuffSplat 粒子 (PvzParticle.cpp:78) + godot bullet_003_puff 实测语义:
          // 10 颗 PuffShroom_puff2 水滴全方向爆发 (初速 50-80px/s), 重力 +100px/s²
          // 下落, 0.5s 生命, 缩放 0.53→0 渐小消散 — 修正旧实现静态云雾贴地的问题
          const img = Assets.image('puffshroom_puff2');
          if (img && e.parts) {
            const life = 0.5;
            const pr = Math.min(1, e.t / life);
            const sc = 0.53 * (1 - pr);
            if (sc > 0.02) {
              ctx.save();
              ctx.globalAlpha = 1 - pr * pr;
              for (const part of e.parts) {
                ctx.save();
                ctx.translate(e.x + part.x, e.y + part.y);
                ctx.rotate(part.rot);
                ctx.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc);
                ctx.restore();
              }
              ctx.restore();
            }
          }
          break;
        }
        case 'puffmuzzle': {
          // 原版 PARTICLE_PUFFSHROOM_MUZZLE (Plant.cpp:4670): 发射时蘑菇口的喷雾云
          if (!e.anim) {
            e.anim = Assets.reanim('Puff');
            e.anim.play('anim_puff', RE.PLAY_ONCE_HOLD, 26);
          }
          e.anim.update(1 / 60);
          const mp = Math.min(1, e.t / 0.28);
          e.anim.setPosition(e.x, e.y);
          e.anim.overrideScale(0.9 - 0.35 * mp, 0.9 - 0.35 * mp);
          ctx.save();
          ctx.globalAlpha = 0.9 - 0.9 * mp;
          e.anim.draw(ctx);
          ctx.restore();
          break;
        }
        case 'pufftrail': {
          // 原版 PARTICLE_PUFFSHROOM_TRAIL (Projectile.cpp:132): 弹体飞行尾迹小水滴
          //   godot bullet_003_puff 尾迹发射器: puff2 纹理 + 9.67半径散布 + 随机角度,
          //   scale 0.528→0 曲线, 0.5s 消散 (#2: 补齐缺失的水滴拖尾)
          const img = Assets.image('puffshroom_puff2');
          if (img) {
            const p = Math.min(1, e.t / 0.5);
            const sc = 0.528 * (1 - p);
            if (sc > 0.02) {
              ctx.save();
              ctx.globalAlpha = 1 - p;
              ctx.translate(e.x + (e.fx || 0), e.y + (e.fy || 0));
              ctx.rotate(e.frot || 0);
              ctx.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc);
              ctx.restore();
            }
          }
          break;
        }
        case 'fumecloud': {
          // 原版 PARTICLE_FUMECLOUD/GLOOMCLOUD: Puff reanim 放大 + 向前漂移 (1s 生命周期)
          if (!e.anim) {
            e.anim = Assets.reanim('Puff');
            e.anim.play('anim_puff', RE.PLAY_ONCE_HOLD, 26);
          }
          e.anim.update(1 / 60);
          const p = Math.min(1, e.t);
          const drift = (e.opts.dir || 0) * 150 * p;
          e.anim.setPosition(e.x + drift, e.y - p * 10);
          const sc = (e.opts.scale || 2.4) * (0.6 + 0.45 * p);
          e.anim.overrideScale(sc, sc);
          ctx.save();
          ctx.globalAlpha = 0.95 - p * 0.95;
          e.anim.draw(ctx);
          ctx.restore();
          break;
        }
        case 'text': {
          // 浮动文字 (耙子/提示)
          const hold = e.opts.hold || 2;
          const p2 = e.t / hold;
          ctx.save();
          ctx.globalAlpha = p2 < 0.8 ? 1 : (1 - p2) / 0.2;
          ctx.font = `bold ${e.opts.size || 18}px "Noto Sans SC", sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(20,12,0,0.8)';
          ctx.strokeText(e.opts.txt || '', e.x, e.y - p2 * 26);
          ctx.fillStyle = e.opts.c || '#ffe9a8';
          ctx.fillText(e.opts.txt || '', e.x, e.y - p2 * 26);
          ctx.restore();
          break;
        }
        case 'screen_flash': {
          ctx.save();
          ctx.globalAlpha = Math.max(0, 0.7 - e.t);
          ctx.fillStyle = '#cfe8ff';
          ctx.fillRect(0, 0, 800, 600);
          ctx.restore();
          break;
        }
        case 'dust': {
          const img = Assets.image('dust_puffs');
          if (img) {
            const p = e.t / 0.8;
            ctx.save(); ctx.globalAlpha = 0.8 - p * 0.8;
            ctx.drawImage(img, 0, 0, img.width / 3, img.height, e.x - 25 - p * 10, e.y - 20 - p * 15, 50, 40);
            ctx.restore();
          }
          break;
        }
        case 'squish': case 'squashhit': {
          const img = Assets.image('pow');
          if (img) {
            const p = e.t / 0.5;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 40, e.y - 30 - p * 20, 80, 50);
            ctx.restore();
          }
          break;
        }
        case 'daisy': {
          // 智慧树作弊码 daisies: 僵尸死处绽放小雔菊 (白瓣黄芯 + 绿茎, 微风摇曳)
          const life = 3.5;
          const aIn = Math.min(1, e.t / 0.25), aOut = Math.min(1, (life - e.t) / 0.6);
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(aIn, aOut));
          const sw = Math.sin(e.t * 2.2) * 2;
          ctx.translate(e.x + sw, e.y);
          // 绿茎
          ctx.strokeStyle = '#3e8b2e'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sw, -7, 0, -13); ctx.stroke();
          // 花瓣 (8 瓣)
          ctx.fillStyle = '#fdfdf6';
          for (let i = 0; i < 8; i++) {
            const pa = i / 8 * Math.PI * 2 + 0.3;
            ctx.beginPath();
            ctx.ellipse(Math.cos(pa) * 6, -13 + Math.sin(pa) * 6, 4.2, 2.6, pa, 0, Math.PI * 2);
            ctx.fill();
          }
          // 黄芯
          ctx.fillStyle = '#ffd94d';
          ctx.beginPath(); ctx.arc(0, -13, 3.4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          break;
        }
        case 'candy': {
          // 智慧树作弊码 pinata: 僵尸死时吐出一地彩色糖果
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, (1.3 - e.t) / 0.4));
          for (const p of (e.parts || [])) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.c;
            ctx.beginPath(); ctx.roundRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4, p.r * 0.6);
            ctx.fill();
            // 糖纸高光
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillRect(-p.r * 0.5, -p.r * 0.45, p.r * 0.5, p.r * 0.4);
            ctx.restore();
          }
          ctx.restore();
          break;
        }
        case 'fire': {
          if (!e.anim) { e.anim = Assets.reanim('fire'); e.anim.play('anim_idle', 0, 24); }
          e.anim.update(1 / 60);
          e.anim.setPosition(e.x, e.y);
          e.anim.draw(ctx);
          break;
        }
        case 'mindcontrol': {
          const img = Assets.image('mindcontrol');
          if (img) {
            const p = e.t / 1;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 40, e.y - 60 - p * 30, 80, 80);
            ctx.restore();
          }
          break;
        }
        case 'balloon_pop': {
          const img = Assets.image('puff');
          if (img) {
            ctx.save(); ctx.globalAlpha = 1 - e.t * 2;
            ctx.drawImage(img, e.x - 20, e.y - 20, 40, 40);
            ctx.restore();
          }
          break;
        }
        case 'magnetitem': {
          const img = Assets.image(e.opts.img);
          if (img) {
            const p = e.t / 0.5;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, e.x - 20, e.y - p * 60, 40, 40);
            ctx.restore();
          }
          break;
        }
        case 'bossexplosion': {
          const img = Assets.image('bossexplosion1');
          if (img) {
            const p = e.t / 1.5;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, 300, 100, 500, 400);
            ctx.restore();
          }
          break;
        }
        case 'sod_dirt': {
          const p = e.t / e.dur;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = e.opts.c;
          const px = e.x + e.opts.vx * e.t;
          const py = e.y + e.opts.vy * e.t + 220 * e.t * e.t;
          ctx.beginPath();
          ctx.arc(px, py, e.opts.r * (1 - p * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'vase_shatter': {
          // 罐子碎片 (原版 PARTICLE_VASE_SHATTER: vase_chunks.png 9x3格 32px碎片)
          const img = Assets.image('vase_chunks.png');
          if (img && e.parts) {
            const fade = e.t > 1 ? 1 - (e.t - 1) / 0.4 : 1;
            ctx.save();
            ctx.globalAlpha = Math.max(0, fade);
            for (const p of e.parts) {
              const px = e.x + (p.x || 0), py = e.y + (p.y || 0) - 30;
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(p.rot);
              ctx.drawImage(img, p.cx, p.cy, 32, 32, -16, -16, 32, 32);
              ctx.restore();
            }
            ctx.restore();
          }
          break;
        }
      }
    }
  },
};

// LimbParticle 实例检测 (避免循环引用 board 模块)
const { LimbParticle } = require('./board');
const LimbParticleInstance = LimbParticle;

if (typeof module !== 'undefined') module.exports = { Renderer, BG_OFFSET_X };
