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
    // ---- 花盆/睡莲 (底层) ----
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < 9; c++) {
        const lily = board.gridLily[r][c];
        if (lily && !lily.dead) lily.draw(ctx, board);
        const pot = board.gridPot[r][c];
        if (pot && !pot.dead) pot.draw(ctx, board);
      }
    }
    // ---- 渲染顺序列表 (植物+僵尸统一排序) ----
    const list = [];
    for (const p of board.plants) {
      if (p.dead) continue;
      if (board.gridPumpkin[p.row] && board.gridPumpkin[p.row][p.col] === p) {
        // 南瓜壳: 植物层之上 (原版 PLANT_LAYER_ON_TOP → +4)
        list.push({ o: p.row * 10000 + RENDER_LAYER.PLANT + 6, d: () => p.draw(ctx, board) });
      } else {
        list.push({ o: p.row * 10000 + RENDER_LAYER.PLANT + (p.col || 0), d: () => p.draw(ctx, board) });
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
      list.push({ o: z.renderOrder || (z.row * 10000 + RENDER_LAYER.ZOMBIE), d: () => { z.drawShadow(ctx); z.draw(ctx); } });
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
    // ---- 浓雾 (原版 Board::DrawFog: 逐格 8-cel + 呼吸波动) ----
    if (board.scene === 'fog') this.drawFog(ctx, board);
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
      const packet = Assets.image('seedpacket_larger.png');
      if (packet) ctx.drawImage(packet, -40, -50, 80, 100);
      const thumb = UI.getThumb(a.plant);
      if (thumb) ctx.drawImage(thumb, -25, -40, 50, 70);
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
    const my = board.gridY(m.row) + (m.type === 'pool' ? 33 : 19);
    m.reanim.setPosition(m.x + (m.type === 'pool' ? 25 : 12), my);
    const sc = m.type === 'pool' ? 0.8 : 0.85;
    m.reanim.overrideScale(sc, sc);
    // 原版: 待机静止; 触发后 animRate=70 播放 (轮子与机身同步滚动)
    m.reanim.animRate = m.state === 'running' ? 70 : 0;
    m.reanim.update(1 / 60);
    m.reanim.draw(ctx);
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
    // 掉落肢体 (断臂/掉头/掉盔) — 原版独立贴图 (Zombie_head / Zombie_hand_arm / 原具分级图)
    const imgMap = {
      head: 'zombie_head',
      arm: 'zombie_hand_arm',
      cone: 'zombie_cone1',
      bucket: 'zombie_bucket1',
      door: 'zombie_screendoor1',
      helm: e.imgName || 'zombie_football_helmet',
      newspaper: 'zombie_paper_paper1',
      ladder: 'zombie_ladder_2',
    };
    const img = Assets.image(e.imgName || imgMap[e.kind] || 'zombie_head');
    ctx.save();
    ctx.globalAlpha = Math.min(1, 1.6 - e.t);
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    if (img) ctx.drawImage(img, -img.width / 2, -img.height / 2);
    else { ctx.fillStyle = '#7a6a5a'; ctx.fillRect(-8, -8, 16, 16); }
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
          e.anim.draw(ctx);
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
