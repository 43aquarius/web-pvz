// ============================================================
// audio.js — 原版BGM/SFX播放 (HTMLAudioElement, file://兼容)
// ============================================================
'use strict';

const Audio2 = (function () {
  let bgmEl = null;
  let currentBGM = null;
  let musicOn = true, sfxOn = true;
  const lastPlay = new Map();
  const urlCache = new Map();

  const BGM_MAP = {
    start_menu: 'BGM/start_menu_bgm.mp3',
    choose_card: 'BGM/choose_card.mp3',
    front_day: 'BGM/front_day.mp3',
    front_night: 'BGM/front_night.mp3',
    pool: 'BGM/pool.mp3',
    fog: 'BGM/fog.mp3',
    roof: 'BGM/roof.mp3',
    mini_game: 'BGM/mini_game.mp3',
    garden: 'BGM/garden.mp3',
    // #1/#9 原版 Music.cpp 对应曲 (从 mainmusic.mo3 解码提取):
    //   Loonboon(保龄球/打僵尸/小僵尸/蹦极) / Conveyer(X-10 传送带) /
    //   Cerebrawl(罐子/我是僵尸) / Brainiac Maniac(5-10 僵王战)
    loonboon: 'BGM/loonboon.mp3',
    conveyor: 'BGM/conveyor.mp3',
    cerebrawl: 'BGM/cerebrawl.mp3',
    brainiac_maniac: 'BGM/brainiac_maniac.mp3',
  };

  const SFX_MAP = {
    throw: 'SFX/plant/throw1.ogg', throw2: 'SFX/plant/throw2.ogg', plantgrow: 'SFX/plant/plantgrow.ogg',
    puff: 'SFX/plant/puff.ogg', fume: 'SFX/plant/fume.ogg',
    splat: 'SFX/bullet/splat1.ogg', splat2: 'SFX/bullet/splat2.ogg', splat3: 'SFX/bullet/splat3.ogg',
    snowpea_splat: 'SFX/bullet/plastichit.ogg', firepea: 'SFX/bullet/firepea.ogg',
    shieldhit: 'SFX/bullet/shieldhit1.ogg',
    melonimpact: 'SFX/bullet/melonimpact.ogg',
    butter: 'SFX/bullet/butter.ogg', butterhit: 'SFX/bullet/butter.ogg',
    kernelpult: 'SFX/bullet/kernelpult.ogg',
    basketball: 'sounds/basketball.ogg', basketballhit: 'SFX/item/bonk.ogg',
    chomp: 'SFX/zombie/chomp.ogg', chomp1: 'SFX/zombie/chomp.ogg', chomp2: 'SFX/zombie/chomp2.ogg',
    bigchomp: 'SFX/plant/bigchomp.ogg', biggulp: 'sounds/gulp.ogg',
    points: 'SFX/button/points.ogg', coin: 'SFX/item/coin.ogg',
    plant: 'SFX/plant_create/plant.ogg', plant2: 'SFX/plant_create/plant2.ogg',
    plant_water: 'SFX/plant_create/plant_water.ogg',
    shovel: 'SFX/card_and_shovel/shovel.ogg', buzzer: 'SFX/card_and_shovel/buzzer.ogg',
    seedlift: 'SFX/card_and_shovel/seedlift.ogg',
    lawnmower: 'SFX/item/lawnmower.ogg', pool_cleaner: 'SFX/item/pool_cleaner.ogg',
    boom: 'SFX/zombie/explosion.ogg',
    cherrybomb: 'SFX/plant/cherrybomb.ogg', doomshroom: 'SFX/plant/doomshroom.ogg',
    jalapeno: 'SFX/plant/jalapeno.ogg', iceshroom: 'SFX/plant/frozen.ogg',
    blover: 'SFX/plant/blover.ogg', magnetshroom: 'SFX/plant/magnetshroom.ogg',
    mindcontrol: 'SFX/plant/mindcontrolled.ogg',
    floop: 'sounds/floop.ogg',   // 原版 FOLEY_FLOOP — 僵尸吃到魅惑菇
    potato_mine: 'SFX/plant/potato_mine.ogg', spudow: 'SFX/plant/potato_mine.ogg',
    squash_hmm: 'SFX/plant/squash_hmm.ogg',
    frozen: 'SFX/plant/frozen.ogg', thaw: 'SFX/plant/frozen.ogg',
    gravebusterchomp: 'SFX/plant/gravebusterchomp.ogg',
    dirt_rise: 'SFX/zombie/dirt_rise.ogg', gravedigger: 'SFX/zombie/gravestone_rumble.ogg',
    digger: 'SFX/zombie/digger_zombie.ogg', gravebutton: 'SFX/button/gravebutton.ogg', gravebuttonchime: 'SFX/zombie/gravestone_rumble.ogg',
    zombie_falls_1: 'sounds/zombie_falling_1.ogg', zombie_falls_2: 'sounds/zombie_falling_2.ogg',
    zombie_groan: 'SFX/zombie/groan/groan.ogg', zombie_groan2: 'SFX/zombie/groan/groan2.ogg',
    zombie_burnt: 'sounds/zombie_falling_2.ogg',   // 原版僵尸烧焦音效文件缺失, 用坠落音近似
    scream: 'SFX/progress/scream.ogg',
    winmusic: 'SFX/progress/winmusic.ogg', losemusic: 'SFX/progress/losemusic.ogg',
    hugewave: 'SFX/progress/hugewave.ogg', finalwave: 'SFX/progress/finalwave.ogg',
    readysetplant: 'SFX/progress/readysetplant.ogg', awooga: 'SFX/progress/awooga.ogg',
    siren: 'SFX/progress/siren.ogg',
    tap: 'SFX/button/tap.ogg', bleep: 'SFX/button/bleep.ogg',
    buttonclick: 'SFX/button/buttonclick.ogg', pause: 'SFX/button/pause.ogg',
    umbrella: 'SFX/plant/blover.ogg', umbrellaleaf: 'SFX/plant/throw2.ogg',
    polevault: 'SFX/zombie/polevault.ogg', dolphin: 'SFX/zombie/dolphin_appears.ogg',
    pogo_stick: 'SFX/zombie/boing.ogg', boing: 'SFX/zombie/boing.ogg',
    balloon_pop: 'SFX/zombie/balloon_pop.ogg',
    jackbox_pop: 'SFX/zombie/jack_in_the_box_pop.ogg',
    newspaper_rarrgh: 'SFX/zombie/newspaper_rarrgh.ogg',
    bobsled_crash: 'SFX/zombie/bobsled_crash.ogg',
    laddersound: 'SFX/zombie/ladder_zombie.ogg',
    gargantuar: 'SFX/zombie/gargantuar_thump.ogg',
    zombie_gargantuar2: 'SFX/zombie/gargantuar_thump.ogg',
    imp: 'SFX/zombie/imp.ogg',
    squish: 'SFX/zombie/squish.ogg',
    zombiesplash: 'sounds/zombiesplash.ogg',
    swing: 'SFX/item/swing.ogg', bonk: 'SFX/item/bonk.ogg',
    bowling: 'SFX/plant/bowling.ogg', bowlingpin: 'SFX/bullet/bowlingimpact.ogg', bowlingpin2: 'SFX/bullet/bowlingimpact2.ogg',
    coffee: 'sounds/coffee.ogg',
    coblauncher: 'sounds/coblaunch.ogg', coblaunch: 'sounds/coblaunch.ogg',
    bossintro: 'sounds/evillaugh.ogg', bossdie: 'sounds/bossexplosion.ogg',
    bossfireball: 'sounds/ignite.ogg', bossiceball: 'sounds/lightfill.ogg', bossstomp: 'sounds/thunder.ogg',
    // #1 僵王原版音效: 液压臂/吐球/丢露营车
    hydraulic: 'sounds/hydraulic.ogg', hydraulic_short: 'sounds/hydraulic_short.ogg',
    bossboulder: 'sounds/bossboulderattack.ogg', RVthrow: 'sounds/RVthrow.ogg',
    bungee_scream: 'SFX/zombie/bungee_scream.ogg',
    groan_spawn: 'SFX/zombie/groan/groan3.ogg',
    vase_breaking: 'sounds/vase_breaking.ogg',
    // 疯狂戴夫语音 (SFX/carzy/ 目录)
    dave_short: 'SFX/carzy/crazydaveshort1.ogg', dave_short2: 'SFX/carzy/crazydaveshort2.ogg', dave_short3: 'SFX/carzy/crazydaveshort3.ogg',
    dave_medium: 'SFX/carzy/crazydavelong1.ogg', dave_medium2: 'SFX/carzy/crazydavelong2.ogg', dave_medium3: 'SFX/carzy/crazydavelong3.ogg',
    dave_crazy: 'SFX/carzy/crazydavecrazy.ogg',
    dave_scream: 'SFX/carzy/crazydavescream.ogg',
  };

  function url(file) {
    if (urlCache.has(file)) return urlCache.get(file);
    let u = null;
    if (window.__EMBED__ && window.__EMBED__.audio[file] !== undefined) {
      const b64 = window.__EMBED__.audio[file];
      const mime = file.endsWith('.mp3') ? 'audio/mpeg' : (file.endsWith('.au') ? 'audio/basic' : 'audio/ogg');
      try {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        u = URL.createObjectURL(new Blob([u8], { type: mime }));
      } catch (e) { u = null; }
    } else {
      u = 'assets/audio/' + file;
    }
    urlCache.set(file, u);
    return u;
  }

  function init() { /* audio context 不再需要 */ }
  function resume() { /* no-op for element audio */ }

  function playBGM(name) {
    if (!name) { stopBGM(); return; }
    if (!musicOn) return;
    if (currentBGM === name && bgmEl) return;
    stopBGM();
    const file = BGM_MAP[name];
    if (!file) return;
    currentBGM = name;
    try {
      bgmEl = new Audio(url(file));
      bgmEl.loop = true;
      bgmEl.volume = 0.5 * masterVol;
      bgmEl.play().catch(() => { });
    } catch (e) { }
  }

  function stopBGM() {
    if (bgmEl) { try { bgmEl.pause(); } catch (e) { } bgmEl = null; }
    currentBGM = null;
  }

  function play(name, opts = {}) {
    if (!sfxOn) return;
    const file = SFX_MAP[name];
    if (!file) return;
    const now = performance.now();
    const last = lastPlay.get(name) || 0;
    if (now - last < 70) return;
    lastPlay.set(name, now);
    try {
      const a = new Audio(url(file));
      a.volume = (opts.vol !== undefined ? opts.vol : 0.85);
      a.play().catch(() => { });
    } catch (e) { }
  }

  function setMusic(on) { musicOn = on; if (!on) stopBGM(); }
  function setSFX(on) { sfxOn = on; }
  let masterVol = 0.8;
  function setMaster(v) { masterVol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('webpvz_vol', String(masterVol)); } catch (e) { } if (bgmEl) bgmEl.volume = 0.5 * masterVol; }

  return { init, play, playBGM, stopBGM, setMusic, setSFX, setMaster, resume, get master() { return masterVol; }, get sfxOn() { return sfxOn; } };
})();

if (typeof module !== 'undefined') module.exports = Audio2;
