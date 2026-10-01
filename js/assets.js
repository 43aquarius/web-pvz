// ============================================================
// assets.js — 资产加载器
// 三种模式:
//   dev.html : window.__REANIM_DATA__ (inline JSON) + assets/ 逐文件图片 (本地迭代)
//   dist     : window.__EMBED__ (base64 全内嵌, 单文件发布)
//   网络部署  : assets/reanim.json + assets/pack.bin 各一次请求 (弱网友好)
//              pack 加载失败自动回退逐文件模式
// pack.bin 格式: [4B magic 'WPZ1'(LE)][4B LE idxLen][idx JSON][raw图片字节流]
//   idx = { images: { key: [offset, size, mime] } }  (offset 相对数据区起点)
// ============================================================
'use strict';

const RE = require('./reanim');

const Assets = (function () {
  const state = {
    reanimJson: {},
    images: new Map(),
    loaded: false,
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
    // magic 'WPZ1' 小端
    if (dv.getUint32(0, true) !== 0x315A5057) throw new Error('pack magic mismatch');
    const idxLen = dv.getUint32(4, true);
    const idx = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, idxLen)));
    const dataStart = 8 + idxLen;
    const keys = Object.keys(idx.images);
    const total = keys.length;
    if (!total) throw new Error('pack empty');
    let di = 0;
    const worker = async () => {
      while (di < total) {
        const k = keys[di++];
        try {
          const ent = idx.images[k];
          const blob = new Blob([buf.slice(dataStart + ent[0], dataStart + ent[0] + ent[1])], { type: ent[2] });
          const im = new Image();
          await new Promise((res2, rej2) => { im.onload = res2; im.onerror = rej2; im.src = URL.createObjectURL(blob); });
          state.images.set(k, im);
        } catch (e) { console.warn('图片解码失败', k); }
        if (progress && (di % 200 === 0 || di === total)) progress(0.15 + di / total * 0.85, `素材 ${di}/${total}`);
      }
    };
    await Promise.all(Array.from({ length: 16 }, worker));
    return true;
  }

  // ---- 逐文件图片加载 (回退 / dev 模式) ----
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

  async function load(progress) {
    const E = window.__EMBED__;
    const R = window.__REANIM_DATA__;
    // ---------- reanim ----------
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
      // 网络部署: 单文件 assets/reanim.json 优先 (1次请求), 失败回退逐文件
      let gotReanim = false;
      if (!window.__NO_PACK__) {
        try {
          const r = await fetch('assets/reanim.json?v=' + (window.__BUILD__ || Date.now()));
          if (r.ok) {
            const all = await r.json();
            for (const [name, json] of Object.entries(all)) state.reanimJson[name] = json;
            if (progress) progress(0.1, '动画数据');
            gotReanim = true;
          }
        } catch (e) { console.warn('reanim.json 加载失败, 回退逐文件', e); }
      }
      if (!gotReanim) {
        const list = window.__REANIM_LIST__ || [];
        let ri = 0;
        const rtotal = list.length || 1;
        const rworker = async () => {
          while (ri < list.length) {
            const name = list[ri++];
            try {
              const j = await (await fetch(`assets/reanim/${name}.json`)).json();
              state.reanimJson[name] = j;
            } catch (e) { console.warn('reanim加载失败', name); }
            if (progress && (ri % 20 === 0 || ri === list.length)) progress(ri / rtotal * 0.3, `动画 ${ri}/${rtotal}`);
          }
        };
        await Promise.all(Array.from({ length: 8 }, rworker));
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
    // ---------- 构建 reanim 定义 ----------
    let n = 0;
    for (const [name, json] of Object.entries(state.reanimJson)) {
      RE.buildDef(name, json);
      n++;
      if (progress && n % 20 === 0) progress(0.95 + 0.05 * n / Object.keys(state.reanimJson).length, '动画定义');
    }
    RE.setImages(state.images);
    // challenge.js 需要图片/reanim访问
    try {
      const CHM = require('./challenge');
      if (CHM && CHM.setAssets) CHM.setAssets({
        image: (k) => image(k),
        reanim: (n) => RE.hasDef(n) ? new RE.Reanimation(n) : null,
      });
    } catch (e) { console.warn('challenge assets 注入失败', e); }
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

  return { load, image, reanim, state };
})();

if (typeof module !== 'undefined') module.exports = Assets;
