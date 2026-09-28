/* web-pvz — audio.js
 * Web Audio 程序化合成引擎：音乐序列器 + 音效
 * 全部声音均为运行时合成，不含任何外部素材（零版权风险）
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});
  const { U } = PVZ;

  const A = {
    ctx: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    noiseBuf: null,
    musicOn: U.load('musicOn', true),
    sfxOn: U.load('sfxOn', true),
    musicVol: U.load('musicVol', 0.7),
    sfxVol: U.load('sfxVol', 0.9),
    _seq: null,       /* 当前序列器状态 */
    _curSong: null,
  };

  /* ============ 初始化 ============ */
  A.init = () => {
    if (A.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    A.ctx = new Ctx();
    A.master = A.ctx.createGain();
    A.master.gain.value = 1;
    A.master.connect(A.ctx.destination);

    A.musicBus = A.ctx.createGain();
    A.musicBus.gain.value = A.musicOn ? A.musicVol : 0;
    A.musicBus.connect(A.master);

    A.sfxBus = A.ctx.createGain();
    A.sfxBus.gain.value = A.sfxOn ? A.sfxVol : 0;
    A.sfxBus.connect(A.master);

    /* 预生成噪声缓冲（2秒白噪声，供打击乐与爆炸复用） */
    const len = A.ctx.sampleRate * 2;
    A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  A.unlock = () => {
    A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setMusicOn = (on) => { A.musicOn = on; U.save('musicOn', on); if (A.musicBus) A.musicBus.gain.value = on ? A.musicVol : 0; };
  A.setSfxOn = (on) => { A.sfxOn = on; U.save('sfxOn', on); if (A.sfxBus) A.sfxBus.gain.value = on ? A.sfxVol : 0; };
  A.setMusicVol = (v) => { A.musicVol = v; U.save('musicVol', v); if (A.musicBus && A.musicOn) A.musicBus.gain.value = v; };
  A.setSfxVol = (v) => { A.sfxVol = v; U.save('sfxVol', v); if (A.sfxBus && A.sfxOn) A.sfxBus.gain.value = v; };

  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ============ 乐器 ============ */
  /* 方波主旋律（带轻微失谐，游戏感） */
  A.lead = (t, midi, dur, vel = 0.5, bus) => {
    const c = A.ctx, g = c.createGain();
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'square'; o2.type = 'square';
    o1.frequency.value = midiHz(midi);
    o2.frequency.value = midiHz(midi) * 1.003;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2600;
    o1.connect(f); o2.connect(f); f.connect(g);
    g.connect(bus || A.musicBus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.55, t + 0.015);
    g.gain.setValueAtTime(vel * 0.55, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  };

  /* 柔和三角波（菜单/夜晚八音盒风格） */
  A.soft = (t, midi, dur, vel = 0.5, bus) => {
    const c = A.ctx, g = c.createGain();
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.value = midiHz(midi);
    o2.frequency.value = midiHz(midi + 12);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(bus || A.musicBus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.02);
    g.gain.setValueAtTime(vel * 0.6, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o1.start(t); o2.start(t + 0.06);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  };

  /* 低音 */
  A.bass = (t, midi, dur, vel = 0.6, bus) => {
    const c = A.ctx, g = c.createGain();
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiHz(midi);
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700;
    o.connect(f); f.connect(g); g.connect(bus || A.musicBus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.7, t + 0.02);
    g.gain.setValueAtTime(vel * 0.7, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  };

  /* 底鼓 */
  A.kick = (t, vel = 0.8, bus) => {
    const c = A.ctx, g = c.createGain(), o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g); g.connect(bus || A.musicBus);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.start(t); o.stop(t + 0.2);
  };

  /* 军鼓（噪声） */
  A.snare = (t, vel = 0.5, bus) => {
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf;
    src.loop = true;
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(bus || A.musicBus);
    g.gain.setValueAtTime(vel * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.start(t); src.stop(t + 0.15);
  };

  /* 镲 */
  A.hat = (t, vel = 0.3, bus) => {
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf;
    src.loop = true;
    f.type = 'highpass'; f.frequency.value = 7000;
    src.connect(f); f.connect(g); g.connect(bus || A.musicBus);
    g.gain.setValueAtTime(vel * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.start(t); src.stop(t + 0.08);
  };

  /* 锣/大鼓（大波渲染） */
  A.boom = (t, vel = 0.9, bus) => {
    const c = A.ctx, g = c.createGain();
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    o.connect(g); g.connect(bus || A.musicBus);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.start(t); o.stop(t + 1.2);
    const src = c.createBufferSource(), g2 = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; src.loop = true;
    f.type = 'lowpass'; f.frequency.value = 400;
    src.connect(f); f.connect(g2); g2.connect(bus || A.musicBus);
    g2.gain.setValueAtTime(vel * 0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.start(t); src.stop(t + 1);
  };

  /* ============ 音效 ============ */
  const S = {};
  S.click = () => A.sfx((t) => { A.lead(t, 84, 0.08, 0.25, A.sfxBus); });
  S.hover = () => A.sfx((t) => { A.soft(t, 88, 0.06, 0.12, A.sfxBus); });
  S.plant = () => A.sfx((t) => {
    /* 种植：泥土扑通声 */
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    o.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
    const src = c.createBufferSource(), gg = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(gg); gg.connect(A.sfxBus);
    gg.gain.setValueAtTime(0.3, t); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.start(t); src.stop(t + 0.14);
  });
  S.shovel = () => A.sfx((t) => {
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; f.type = 'bandpass';
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.start(t); src.stop(t + 0.28);
  });
  S.sun = () => A.sfx((t) => {
    /* 收集阳光：清亮琶音 */
    [79, 84, 88, 91].forEach((m, i) => A.soft(t + i * 0.05, m, 0.35, 0.3, A.sfxBus));
  });
  S.sunspawn = () => A.sfx((t) => A.soft(t, 88, 0.2, 0.08, A.sfxBus));
  S.shoot = () => A.sfx((t) => {
    /* 发射：短促气声 */
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.start(t); src.stop(t + 0.09);
  });
  S.splats = [
    () => A.sfx((t) => { const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.06); o.connect(g); g.connect(A.sfxBus); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08); o.start(t); o.stop(t + 0.1); }),
    () => A.sfx((t) => { const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(360, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08); o.connect(g); g.connect(A.sfxBus); g.gain.setValueAtTime(0.26, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.start(t); o.stop(t + 0.12); }),
  ];
  S.splat = () => U.pick(S.splats)();
  S.freeze = () => A.sfx((t) => {
    [96, 91, 98].forEach((m, i) => A.soft(t + i * 0.04, m, 0.4, 0.16, A.sfxBus));
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; f.type = 'highpass'; f.frequency.value = 5000;
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.start(t); src.stop(t + 0.4);
  });
  S.explode = () => A.sfx((t) => {
    /* 爆炸：噪声轰 + 低频下坠 */
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; src.loop = true;
    f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src.start(t); src.stop(t + 0.85);
    const o = c.createOscillator(), g2 = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.6);
    o.connect(g2); g2.connect(A.sfxBus);
    g2.gain.setValueAtTime(0.8, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.start(t); o.stop(t + 0.75);
  });
  S.chomp = () => A.sfx((t) => {
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; f.type = 'lowpass'; f.frequency.value = 500;
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.start(t); src.stop(t + 0.18);
    const o = c.createOscillator(), g2 = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    o.connect(g2); g2.connect(A.sfxBus);
    g2.gain.setValueAtTime(0.3, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.start(t); o.stop(t + 0.16);
  });
  S.swallow = () => A.sfx((t) => {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    o.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.start(t); o.stop(t + 0.5);
  });
  S.eat = () => A.sfx((t) => {
    /* 僵尸啃食：咔嚓 */
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; f.type = 'bandpass';
    f.frequency.value = 350 + Math.random() * 250; f.Q.value = 1.5;
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.start(t); src.stop(t + 0.12);
  });
  S.groan = () => A.sfx((t) => {
    /* 僵尸低吼：锯齿波颤音 */
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth';
    const base = 70 + Math.random() * 40;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.8, t + 0.6);
    lfo.frequency.value = 6 + Math.random() * 4;
    lg.gain.value = 8;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 400;
    o.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.1);
    g.gain.setValueAtTime(0.16, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
  });
  S.mower = () => A.sfx((t) => {
    /* 割草机：引擎渐起 */
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), o2 = c.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(60, t);
    o.frequency.linearRampToValueAtTime(130, t + 0.3);
    o2.frequency.setValueAtTime(120, t);
    o2.frequency.linearRampToValueAtTime(260, t + 0.3);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.3, t);
    g.gain.setValueAtTime(0.3, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2);
    o.start(t); o2.start(t); o.stop(t + 2.05); o2.stop(t + 2.05);
  });
  S.vault = () => A.sfx((t) => {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(800, t + 0.25);
    o.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.32);
  });
  S.rip = () => A.sfx((t) => {
    const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = A.noiseBuf; f.type = 'bandpass';
    f.frequency.setValueAtTime(800, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.2);
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.start(t); src.stop(t + 0.28);
  });
  S.rise = () => A.sfx((t) => { /* 大波警报 */
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(220, t + 0.5);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    o.connect(f); f.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.25, t); g.gain.setValueAtTime(0.25, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.start(t); o.stop(t + 0.65);
  });
  S.win = () => A.sfx((t) => {
    [72, 76, 79, 84].forEach((m, i) => A.lead(t + i * 0.12, m, 0.4, 0.4, A.sfxBus));
    [60, 64, 67, 72].forEach((m, i) => A.bass(t + i * 0.12, m, 0.45, 0.5, A.sfxBus));
  });
  S.lose = () => A.sfx((t) => {
    A.lead(t, 69, 0.5, 0.35, A.sfxBus);
    A.lead(t + 0.5, 68, 0.5, 0.35, A.sfxBus);
    A.lead(t + 1.0, 67, 0.5, 0.35, A.sfxBus);
    A.lead(t + 1.5, 66, 1.2, 0.35, A.sfxBus);
    A.bass(t, 45, 0.5, 0.5, A.sfxBus);
    A.bass(t + 0.5, 44, 0.5, 0.5, A.sfxBus);
    A.bass(t + 1.0, 43, 0.5, 0.5, A.sfxBus);
    A.bass(t + 1.5, 42, 1.2, 0.5, A.sfxBus);
  });
  S.error = () => A.sfx((t) => {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(190, t);
    o.frequency.linearRampToValueAtTime(110, t + 0.13);
    o.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.start(t); o.stop(t + 0.18);
  });
  S.ambience = () => A.sfx((t) => {
    /* 偶发鸟鸣（白天氛围） */
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    const base = 1800 + Math.random() * 800;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.2, t + 0.08);
    o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.18);
    o.connect(g); g.connect(A.sfxBus);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.3);
  });
  A.S = S;

  A.sfx = (fn) => {
    if (!A.ctx || !A.sfxOn) return;
    try { fn(A.ctx.currentTime + 0.02); } catch (e) { /* 忽略 */ }
  };

  /* ============ 音乐序列器 ============ */
  /* 原创曲目（旋律为本项目原创，风格致敬） */

  /* 音符表：[拍, MIDI, 时值(拍), 力度] */
  const bar = (melody, bass, beats = 4) => ({ melody, bass, beats });

  /* —— 白天战斗曲：D 小调，132BPM，8 小节循环 —— */
  const DAY_SONG = {
    tempo: 132, totalBeats: 32, name: 'day',
    melody: [
      /* 第1-2小节 */
      [0, 74, 0.4], [0.5, 69, 0.4], [1, 65, 0.4], [1.5, 69, 0.4],
      [2, 74, 0.4], [2.5, 69, 0.4], [3, 65, 0.4], [3.5, 69, 0.4],
      [4, 75, 0.4], [4.5, 70, 0.4], [5, 67, 0.4], [5.5, 70, 0.4],
      [6, 75, 0.4], [6.5, 72, 0.4], [7, 69, 0.7],
      /* 第5-6小节 */
      [8, 67, 0.4], [8.5, 69, 0.4], [9, 71, 0.4], [9.5, 72, 0.4],
      [10, 74, 0.4], [10.5, 72, 0.4], [11, 71, 0.4], [11.5, 69, 0.4],
      [12, 71, 0.4], [12.5, 67, 0.4], [13, 64, 0.4], [13.5, 67, 0.4],
      [14, 69, 1.2], [15.5, 62, 0.4],
      /* 第9-12小节（变化重复，中音区） */
      [16, 74, 0.4], [16.5, 69, 0.4], [17, 65, 0.4], [17.5, 69, 0.4],
      [18, 77, 0.4], [18.5, 72, 0.4], [19, 69, 0.4], [19.5, 72, 0.4],
      [20, 79, 0.4], [20.5, 74, 0.4], [21, 71, 0.4], [21.5, 74, 0.4],
      [22, 77, 0.4], [22.5, 74, 0.4], [23, 72, 0.7],
      [24, 74, 0.4], [24.5, 77, 0.4], [25, 79, 0.4], [25.5, 81, 0.4],
      [26, 83, 0.4], [26.5, 81, 0.4], [27, 79, 0.4], [27.5, 77, 0.4],
      [28, 76, 0.4], [28.5, 77, 0.4], [29, 79, 0.4], [29.5, 77, 0.4],
      [30, 74, 1.4],
    ],
    bass: [
      [0, 38, 0.4], [0.5, 45, 0.4], [1, 50, 0.4], [1.5, 45, 0.4],
      [2, 38, 0.4], [2.5, 45, 0.4], [3, 50, 0.4], [3.5, 45, 0.4],
      [4, 43, 0.4], [4.5, 50, 0.4], [5, 55, 0.4], [5.5, 50, 0.4],
      [6, 43, 0.4], [6.5, 50, 0.4], [7, 55, 0.4], [7.5, 50, 0.4],
      [8, 43, 0.4], [8.5, 50, 0.4], [9, 55, 0.4], [9.5, 50, 0.4],
      [10, 38, 0.4], [10.5, 45, 0.4], [11, 50, 0.4], [11.5, 45, 0.4],
      [12, 46, 0.4], [12.5, 53, 0.4], [13, 58, 0.4], [13.5, 53, 0.4],
      [14, 38, 0.4], [14.5, 45, 0.4], [15, 50, 0.4], [15.5, 45, 0.4],
      [16, 38, 0.4], [16.5, 45, 0.4], [17, 50, 0.4], [17.5, 45, 0.4],
      [18, 38, 0.4], [18.5, 45, 0.4], [19, 50, 0.4], [19.5, 45, 0.4],
      [20, 43, 0.4], [20.5, 50, 0.4], [21, 55, 0.4], [21.5, 50, 0.4],
      [22, 43, 0.4], [22.5, 50, 0.4], [23, 55, 0.4], [23.5, 50, 0.4],
      [24, 43, 0.4], [24.5, 50, 0.4], [25, 55, 0.4], [25.5, 50, 0.4],
      [26, 38, 0.4], [26.5, 45, 0.4], [27, 50, 0.4], [27.5, 45, 0.4],
      [28, 46, 0.4], [28.5, 53, 0.4], [29, 58, 0.4], [29.5, 53, 0.4],
      [30, 38, 0.8], [31, 45, 0.8],
    ],
  };

  /* —— 夜晚曲：A 小调，96BPM，八音盒风格，8 小节 —— */
  const NIGHT_SONG = {
    tempo: 96, totalBeats: 32, name: 'night',
    melody: [
      [0, 76, 0.8], [1, 74, 0.4], [1.5, 72, 0.4], [2, 76, 0.8], [3, 72, 0.8],
      [4, 77, 0.8], [5, 76, 0.4], [5.5, 74, 0.4], [6, 71, 1.6],
      [8, 72, 0.8], [9, 74, 0.4], [9.5, 76, 0.4], [10, 79, 0.8], [11, 76, 0.8],
      [12, 74, 0.8], [13, 71, 0.4], [13.5, 68, 0.4], [14, 69, 1.6],
      [16, 76, 0.8], [17, 74, 0.4], [17.5, 72, 0.4], [18, 76, 0.8], [19, 72, 0.8],
      [20, 77, 0.8], [21, 76, 0.4], [21.5, 74, 0.4], [22, 71, 1.6],
      [24, 84, 0.8], [25, 83, 0.4], [25.5, 81, 0.4], [26, 79, 0.8], [27, 76, 0.8],
      [28, 74, 0.8], [29, 72, 0.4], [29.5, 71, 0.4], [30, 69, 1.8],
    ],
    bass: [
      [0, 33, 1.8], [2, 40, 1.8], [4, 29, 1.8], [6, 36, 1.8],
      [8, 28, 1.8], [10, 35, 1.8], [12, 29, 1.8], [14, 33, 1.8],
      [16, 33, 1.8], [18, 40, 1.8], [20, 29, 1.8], [22, 36, 1.8],
      [24, 32, 1.8], [26, 40, 1.8], [28, 29, 1.8], [30, 33, 1.8],
    ],
  };

  /* —— 菜单曲：C 大调圆舞曲，90BPM，3/4，8 小节 —— */
  const MENU_SONG = {
    tempo: 90, totalBeats: 24, name: 'menu', waltz: true,
    melody: [
      [0, 76, 0.9], [1, 79, 0.9], [2, 84, 0.9],
      [3, 83, 0.9], [4, 79, 0.9], [5, 76, 0.9],
      [6, 77, 0.9], [7, 81, 0.9], [8, 79, 0.9],
      [9, 76, 1.8],
      [12, 79, 0.9], [13, 84, 0.9], [14, 88, 0.9],
      [15, 86, 0.9], [16, 84, 0.9], [17, 81, 0.9],
      [18, 79, 0.9], [19, 81, 0.9], [20, 83, 0.9],
      [21, 84, 2.4],
    ],
    bass: [
      [0, 36, 0.4], [1, 43, 0.3], [1.5, 43, 0.3], [2, 48, 0.3],
      [3, 31, 0.4], [4, 43, 0.3], [4.5, 43, 0.3], [5, 48, 0.3],
      [6, 29, 0.4], [7, 41, 0.3], [7.5, 41, 0.3], [8, 45, 0.3],
      [9, 36, 0.4], [10, 43, 0.3], [10.5, 43, 0.3], [11, 48, 0.3],
      [12, 32, 0.4], [13, 44, 0.3], [13.5, 44, 0.3], [14, 48, 0.3],
      [15, 36, 0.4], [16, 43, 0.3], [16.5, 43, 0.3], [17, 48, 0.3],
      [18, 31, 0.4], [19, 43, 0.3], [19.5, 43, 0.3], [20, 47, 0.3],
      [21, 36, 0.8], [22.5, 43, 0.8],
    ],
  };

  A.SONGS = { day: DAY_SONG, night: NIGHT_SONG, menu: MENU_SONG };

  /* 播放音乐（同名则跳过） */
  A.playMusic = (name) => {
    A.init();
    if (!A.ctx || A._curSong === name) return;
    A.stopMusic();
    const song = A.SONGS[name];
    if (!song) return;
    A._curSong = name;
    const state = {
      song, nextNote: 0, nextBass: 0, nextPercBeat: 0,
      startTime: A.ctx.currentTime + 0.1, loop: 0,
    };
    A._seq = state;
    /* 定时器驱动预调度 */
    state.timer = setInterval(() => A._schedule(), 60);
    A._schedule();
  };

  A.stopMusic = () => {
    if (A._seq) {
      clearInterval(A._seq.timer);
      A._seq = null;
    }
    A._curSong = null;
  };

  A._schedule = () => {
    const st = A._seq;
    if (!st || !A.ctx) return;
    const spb = 60 / st.song.tempo;
    const ahead = A.ctx.currentTime + 0.35;

    while (true) {
      const melody = st.song.melody, bass = st.song.bass;
      const loopStart = st.startTime + st.loop * st.song.totalBeats * spb;
      /* 主旋律 */
      if (st.nextNote < melody.length) {
        const [beat, midi, dur, vel] = melody[st.nextNote];
        const t = loopStart + beat * spb;
        if (t > ahead) break;
        if (t >= A.ctx.currentTime - 0.05) {
          if (st.song.name === 'night' || st.song.name === 'menu') A.soft(t, midi, dur * spb * 0.95, vel || 0.5);
          else A.lead(t, midi, dur * spb * 0.9, vel || 0.5);
        }
        st.nextNote++;
        continue;
      }
      /* 低音 */
      if (st.nextBass < bass.length) {
        const [beat, midi, dur, vel] = bass[st.nextBass];
        const t = loopStart + beat * spb;
        if (t >= A.ctx.currentTime - 0.05) A.bass(t, midi, dur * spb * 0.95, vel || 0.6);
        st.nextBass++;
        continue;
      }
      /* 打击乐（按拍填充） */
      if (st.nextPercBeat < st.song.totalBeats) {
        const t = loopStart + st.nextPercBeat * spb;
        if (t > ahead) break;
        if (t >= A.ctx.currentTime - 0.05) {
          if (st.song.waltz) {
            if (st.nextPercBeat % 3 === 0) A.kick(t, 0.5);
            else A.hat(t, 0.35);
          } else {
            const b = st.nextPercBeat;
            if (b % 2 === 0) A.kick(t, 0.6);
            else A.snare(t, 0.35);
            A.hat(t + spb / 2, 0.2);
          }
        }
        st.nextPercBeat++;
        continue;
      }
      /* 循环 */
      st.loop++;
      st.nextNote = 0; st.nextBass = 0; st.nextPercBeat = 0;
    }
  };

  A.PVZ = PVZ;
  PVZ.A = A;
})(window);
