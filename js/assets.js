// ============================================================
// assets.js — 资产加载器
// 开发模式: window.__REANIM_DATA__ (inline JSON) + assets/ 相对路径图片
// 生产模式: window.__EMBED__ (base64 全内嵌)
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

  async function load(progress) {
    const E = window.__EMBED__;
    const R = window.__REANIM_DATA__;
    if (R) {
      // 开发模式: reanim JSON已内联
      for (const [name, json] of Object.entries(R)) state.reanimJson[name] = json;
    } else if (E) {
      // 生产: base64 json
      for (const [name, b64] of Object.entries(E.reanim)) {
        const txt = await new Response(b64ToBlob(b64, 'application/json')).text();
        state.reanimJson[name] = JSON.parse(txt);
      }
    } else {
      // 开发模式: 逐个 fetch reanim JSON
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
    // 图片清单
    let keys;
    if (E) keys = Object.keys(E.images);
    else keys = window.__IMAGE_LIST__ || [];
    let di = 0;
    const total = keys.length;
    const getURL = (k) => {
      if (E) {
        const mime = k.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        return URL.createObjectURL(b64ToBlob(E.images[k], mime));
      }
      return 'assets/images/' + k;
    };
    async function worker() {
      while (di < total) {
        const k = keys[di++];
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = getURL(k); });
          state.images.set(k, img);
        } catch (e) { console.warn('图片加载失败', k); }
        if (progress && (di % 100 === 0 || di === total)) progress(di / total, `图片 ${di}/${total}`);
      }
    }
    await Promise.all(Array.from({ length: 16 }, worker));
    // 构建reanim定义
    let n = 0;
    for (const [name, json] of Object.entries(state.reanimJson)) {
      RE.buildDef(name, json);
      n++;
      if (progress && n % 20 === 0) progress(n / Object.keys(state.reanimJson).length / 4, `动画 ${n}`);
    }
    RE.setImages(state.images);
    state.loaded = true;
  }

  function image(key) { return state.images.get(key); }
  function reanim(name) { return new RE.Reanimation(name); }

  return { load, image, reanim, state };
})();

if (typeof module !== 'undefined') module.exports = Assets;
