// ============================================================
// assets.js — 按需加载资产系统 (lazy packs)
//   网络部署: assets/lazy.json (索引) + assets/packs/<name>.wpz (分包)
//     boot: lazy.json + 'boot' 包 (标题/菜单立即可用)
//     ensureLevel/ensureAlmanac/... 按需加载关卡所需分包
//     image()/reanim() 缺失时自动后台补载 (自愈)
//   dev.html  : window.__REANIM_DATA__ (内联) + assets/images/ 逐文件
//   dist      : window.__EMBED__ (base64 全内嵌, 离线单文件)
// 包格式 WPZ2: [4B magic][4B LE idxLen][idx {images:{k:[off,size,mime]}, reanim:{name:[off,size]}}][raw]
// ============================================================
'use strict';

const RE = require('./reanim');
const { ZOMBIES, zombieAllowedOnLevel, availablePlants } = require('./data');

const Assets = (function () {
  const state = {
    reanimJson: {},
    images: new Map(),
    data: {},          // 数据文件 (almanac_data / dave_dialogs)
    loaded: false,
    lazyIdx: null,          // {img2pack, reanim2pack, zombieDeps, plantReanim}
    packLoaded: new Set(),
    pending: new Map(),     // pack -> Promise
    packListeners: [],      // 包加载完成回调 (缩略图缓存失效等)
    embedMode: false,
    bootProgress: null,
  };

  function b64ToBlob(b64, mime) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  // ---- pack.bin 单请求加载 (网络部署首选: 1479张图合并为1次下载) ----
  async function loadPack(progress) {
    const v = window.__BUILD__ || '7';
    const res = await fetch('assets/pack.bin?v=' + v);
    if (!res.ok) throw new Error('pack HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 8) throw new Error('pack too small');
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x325A5057) throw new Error('pack magic mismatch (WPZ2)');
    const idxLen = dv.getUint32(4, true);
    const idx = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, idxLen)));
    const dataStart = 8 + idxLen;
    // 图片解码 (并发 8)
    const imgKeys = Object.keys(idx.images || {});
    let di = 0;
    const worker = async () => {
      while (di < imgKeys.length) {
        const k = imgKeys[di++];
        try {
          const ent = idx.images[k];
          const blob = new Blob([buf.slice(dataStart + ent[0], dataStart + ent[0] + ent[1])], { type: ent[2] });
          const im = new Image();
          await new Promise((res2, rej2) => { im.onload = res2; im.onerror = rej2; im.src = URL.createObjectURL(blob); });
          state.images.set(k, im);
        } catch (e) { console.warn('图片解码失败', k); }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    // reanim 定义
    for (const [name, ent] of Object.entries(idx.reanim || {})) {
      try {
        const txt = new TextDecoder().decode(new Uint8Array(buf, dataStart + ent[0], ent[1]));
        state.reanimJson[name] = JSON.parse(txt);
        RE.buildDef(name, state.reanimJson[name]);
      } catch (e) { console.warn('reanim解析失败', name); }
    }
  }

  function ensurePacks(packs) {
    if (state.embedMode || window.__NO_PACK__ && window.__REANIM_DATA__) {
      // dev/dist: 全量已载
      return Promise.resolve();
    }
    if (!state.lazyIdx) {
      console.warn('lazy.json 未加载, 跳过分包:', packs);
      return Promise.resolve();
    }
    const todo = [];
    for (const p of packs) {
      if (!p || state.packLoaded.has(p) || state.pending.has(p)) continue;
      const pr = fetchPack(p)
        .then(() => {
          state.packLoaded.add(p);
          state.pending.delete(p);
          notifyPackLoaded(p);
        })
        .catch(e => {
          console.warn('分包加载失败:', p, e.message);
          state.pending.delete(p);
        });
      state.pending.set(p, pr);
      todo.push(pr);
    }
    return Promise.all(todo);
  }

  function notifyPackLoaded(pack) {
    for (const cb of state.packListeners) {
      try { cb(pack); } catch (e) { }
    }
  }
  function onPackLoaded(cb) { state.packListeners.push(cb); }

  // ---------- 按需计算: 关卡所需分包 ----------
  function zombiePacksFor(type) {
    const idx = state.lazyIdx;
    if (!idx) return [];
    const out = [];
    const r = idx.zombieReanim && idx.zombieReanim[type];
    if (!r) return ['zombie_core'];
    if (r === 'Zombie') out.push('zombie_core');
    else out.push('zombie_' + type.toLowerCase());
    const deps = idx.zombieDeps && idx.zombieDeps[type];
    if (deps) for (const d of deps) if (!out.includes(d)) out.push(d);
    return out;
  }

  function packsForLevel(level, purchasedSet) {
    const packs = new Set(['ui', 'fx']);
    const scene = level.scene || 'day';
    packs.add('bg_' + scene);
    const lv = level.id && level.id <= 50 ? level.id : (level.mode ? 50 : 50);
    // 僵尸: 该关允许的全部类型
    for (const t of Object.keys(ZOMBIES)) {
      if (t === 'BOSS') continue;
      if (zombieAllowedOnLevel(t, lv)) for (const p of zombiePacksFor(t)) packs.add(p);
    }
    if (level.fixed === 'boss') { for (const p of zombiePacksFor('BOSS')) packs.add(p); }
    if (level.fixed === 'bungee') { for (const p of zombiePacksFor('BUNGEE')) packs.add(p); }
    // 蹦极闪电战 (5-5): BUNGEE + LADDER
    if (level.id === 45) { for (const p of zombiePacksFor('BUNGEE')) packs.add(p); for (const p of zombiePacksFor('LADDER')) packs.add(p); }
    // 植物: 本关可用卡池 (解锁顺序累积)
    const pool = availablePlants(lv, purchasedSet || new Set());
    for (const t of pool) packs.add('plant_' + t);
    // 特殊玩法植物
    if (level.fixed === 'bowling') { packs.add('plant_WALLNUT'); packs.add('plant_EXPLODEONUT'); packs.add('plant_GIANTWALLNUT'); }
    if (level.fixed === 'izombie') {
      for (const t of ['SUNFLOWER', 'PEASHOOTER', 'SNOWPEA', 'REPEATER', 'WALLNUT']) packs.add('plant_' + t);
      for (const t of ['NORMAL', 'CONE', 'POLEVAULTER', 'BUCKET']) for (const p of zombiePacksFor(t)) packs.add(p);
    }
    if (level.fixed === 'vasebreaker') {
      for (const t of ['PEASHOOTER', 'SUNFLOWER', 'WALLNUT', 'SNOWPEA', 'CHOMPER', 'REPEATER', 'POTATOMINE', 'SQUASH', 'THREEPEATER', 'JALAPENO', 'MELONPULT']) packs.add('plant_' + t);
      for (const t of ['NORMAL', 'CONE', 'BUCKET']) for (const p of zombiePacksFor(t)) packs.add(p);
    }
    if (level.id === 45) packs.add('plant_CHOMPER'), packs.add('plant_PUMPKIN'), packs.add('plant_CHERRYBOMB'), packs.add('plant_FLOWERPOT');
    if (level.id === 40) packs.add('bg_fog');      // 暴风雨夜: 雨素材
    if (level.id === 50) packs.add('zombie_imp');  // Boss 战小鬼
    return [...packs];
  }

  async function ensureLevel(level, purchasedSet) {
    if (state.embedMode) return;
    await ensurePacks(packsForLevel(level, purchasedSet));
  }

  async function ensureAlmanac(tab) {
    if (state.embedMode) return;
    const packs = [];
    if (tab === 'plants') {
      for (const t of Object.keys(require('./data').PLANTS)) packs.push('plant_' + t);
    } else {
      packs.push('zombie_core');
      for (const t of Object.keys(ZOMBIES)) if (t !== 'BOSS') for (const p of zombiePacksFor(t)) packs.push(p);
    }
    await ensurePacks(packs);
  }

  async function ensureShop() {
    if (state.embedMode) return;
    const packs = ['ui'];
    for (const t of ['GATLINGPEA', 'TWINSUNFLOWER', 'GLOOMSHROOM', 'CATTAIL', 'WINTERMELON', 'GOLDMAGNET', 'SPIKEROCK', 'COBCANNON', 'IMITATER']) packs.push('plant_' + t);
    await ensurePacks(packs);
  }

  async function ensureGarden() {
    if (state.embedMode) return;
    const packs = ['garden', 'fx', 'ui'];
    for (const t of Object.keys(require('./data').PLANTS)) packs.push('plant_' + t);
    await ensurePacks(packs);
  }

  // ---------- 启动加载 ----------
  async function load(progress) {
    state.bootProgress = progress;
    const E = window.__EMBED__;
    const R = window.__REANIM_DATA__;
    if (E) state.embedMode = true;

    if (R) {
      // dev.html: reanim JSON 已内联
      for (const [name, json] of Object.entries(R)) state.reanimJson[name] = json;
    } else if (E) {
      // dist: base64 json
      for (const [name, b64] of Object.entries(E.reanim)) {
        const txt = await new Response(b64ToBlob(b64, 'application/json')).text();
        state.reanimJson[name] = JSON.parse(txt);
      }
    } else {
      // 网络部署: lazy.json 索引 (小) + boot 包 (标题/菜单)
      let idxOk = false;
      try {
        const r = await fetch('assets/lazy.json?v=' + (window.__BUILD__ || '1'));
        if (r.ok) { state.lazyIdx = await r.json(); idxOk = true; }
      } catch (e) { console.warn('lazy.json 加载失败', e); }
      if (idxOk) {
        try { await ensurePacks(['boot']); } catch (e) { console.warn('boot 包加载失败', e); }
      }
    }

    // ---------- 图片 ----------
    if (E) {
      // dist: base64 内嵌
      const keys = Object.keys(E.images);
      const getURL = (k) => {
        const mime = k.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        return URL.createObjectURL(b64ToBlob(E.images[k], mime));
      };
      await loadImagesPerFile(keys, getURL, progress);
    } else if (window.__NO_PACK__) {
      // dev.html: 本地服务器逐文件
      const keys = window.__IMAGE_LIST__ || [];
      await loadImagesPerFile(keys, (k) => 'assets/images/' + k, progress);
    } else if (state.lazyIdx) {
      // 网络部署: boot 包已在 ensurePacks(['boot']) 中解码
      if (progress) progress(1, '就绪');
    } else {
      // 兜底: 全量逐文件 (lazy 索引不可用时)
      const keys = window.__IMAGE_LIST__ || [];
      await loadImagesPerFile(keys, (k) => 'assets/images/' + k, progress);
    }

    // ---------- 构建 reanim 定义 ----------
    let n = 0;
    const total = Object.keys(state.reanimJson).length || 1;
    for (const [name, json] of Object.entries(state.reanimJson)) {
      RE.buildDef(name, json);
      n++;
      if (progress && n % 20 === 0) progress(0.95 + 0.05 * n / total, '动画定义');
    }
    RE.setImages(state.images);
    state.loaded = true;
  }

  // 逐文件图片加载 (回退 / dev 模式)
  async function loadImagesPerFile(keys, getURL, progress) {
    let di = 0;
    const total = keys.length;
    const worker = async () => {
      while (di < total) {
        const k = keys[di++];
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = getURL(k); });
          state.images.set(k, img);
        } catch (e) { console.warn('图片加载失败', k); }
        if (progress && (di % 100 === 0 || di === total)) progress(di / total, `图片 ${di}/${total}`);
      }
    };
    await Promise.all(Array.from({ length: 16 }, worker));
  }

  // ---------- 查询 (自愈) ----------
  function selfHeal(pack) {
    if (!state.lazyIdx || state.embedMode) return;
    if (pack && !state.packLoaded.has(pack) && !state.pending.has(pack)) {
      ensurePacks([pack]);
    }
    // ---------- 图片 ----------
    if (E) {
      // dist: base64 内嵌
      const keys = Object.keys(E.images);
      const getURL = (k) => {
        const mime = k.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        return URL.createObjectURL(b64ToBlob(E.images[k], mime));
      };
      await loadImagesPerFile(keys, getURL, progress);
    } else if (window.__NO_PACK__) {
      // dev.html: 本地服务器逐文件 (改图即时生效)
      const keys = window.__IMAGE_LIST__ || [];
      await loadImagesPerFile(keys, (k) => 'assets/images/' + k, progress);
    } else {
      // 网络部署: pack.bin 单请求优先, 失败回退逐文件
      let packed = false;
      try { packed = await loadPack(progress); } catch (e) { console.warn('pack.bin 加载失败, 回退逐文件', e); }
      if (!packed) {
        const keys = window.__IMAGE_LIST__ || [];
        await loadImagesPerFile(keys, (k) => 'assets/images/' + k, progress);
      }
    }
    // ---------- 数据文件 (图鉴文本 / 戴夫对话) ----------
    const dataKeys = ['almanac_data', 'dave_dialogs'];
    for (const dk of dataKeys) {
      try {
        if (E && E.data && E.data[dk]) {
          state.data[dk] = JSON.parse(await new Response(b64ToBlob(E.data[dk], 'application/json')).text());
        } else {
          const r = await fetch('assets/' + dk + '.json');
          if (r.ok) state.data[dk] = await r.json();
        }
      } catch (e) { console.warn('数据文件加载失败', dk); state.data[dk] = state.data[dk] || {}; }
    }
    // ---------- 构建 reanim 定义 ----------
    let n = 0;
    for (const [name, json] of Object.entries(state.reanimJson)) {
      RE.buildDef(name, json);
      n++;
      if (progress && n % 20 === 0) progress(0.95 + 0.05 * n / Object.keys(state.reanimJson).length, '动画定义');
    }
    RE.setImages(state.images);
    state.loaded = true;
  }

  // 扩展名容错查找: 'pea' → 'pea.png'/'pea.jpg'; '.jpg' 优先回退同名 .png (原版jpg透明度被拍平)
  function image(key) {
    if (!key) return null;
    const k = String(key).toLowerCase();
    let im = state.images.get(k);
    if (im) return im;
    if (k.endsWith('.jpg')) {
      im = state.images.get(k.slice(0, -4) + '.png');
      if (im) return im;
    } else if (!k.includes('.')) {
      im = state.images.get(k + '.png');
      if (im) return im;
      im = state.images.get(k + '.jpg');
      if (im) return im;
    } else if (k.endsWith('.png')) {
      im = state.images.get(k.slice(0, -4) + '.jpg');
    }
    return im || null;
  }
  function reanim(name) { return new RE.Reanimation(name); }
  function data(name) { return state.data[name] || {}; }

  return { load, image, reanim, data, state };
})();

if (typeof module !== 'undefined') module.exports = Assets;
