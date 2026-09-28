/* web-pvz — data.js
 * 游戏数值表
 * 数值参考：PvZ-Portable（C++ 复刻）源码与 PVZ-Godot-Dream 关卡参数
 *   - 普通僵尸 270 血（Zombie.cpp L238）、路障锥 370（L263）、铁桶 1100（L271）
 *   - 僵尸速度 0.23~0.37 随机（PickRandomSpeed）、冰冻减速系数 0.4（CHILLED_SPEED_FACTOR）
 *   - 向日葵首阳光 3~12.5s 随机、后续 23.5~25s、25 阳光/颗（component_create_sun.gd）
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});

  /* ============ 画布与网格几何 ============ */
  const G = {
    W: 960, H: 600,
    COLS: 9, ROWS: 5,
    GRID_X: 140, GRID_Y: 98,
    CELL_W: 84, CELL_H: 97,
    /* 房子触发线（僵尸到达即失败） */
    HOUSE_X: 60,
    /* 割草机位置 */
    MOWER_X: 112,
    /* 僵尸出生 x（屏幕右侧外） */
    SPAWN_X: 1010,
    /* 种子栏 */
    BANK_H: 88,
  };
  G.GRID_W = G.COLS * G.CELL_W;
  G.GRID_H = G.ROWS * G.CELL_H;
  G.cellCenterX = (col) => G.GRID_X + col * G.CELL_W + G.CELL_W / 2;
  G.cellCenterY = (row) => G.GRID_Y + row * G.CELL_H + G.CELL_H / 2;
  G.colAt = (x) => Math.floor((x - G.GRID_X) / G.CELL_W);
  G.rowAt = (y) => Math.floor((y - G.GRID_Y) / G.CELL_H);

  /* ============ 植物定义 ============ */
  /* hp: 生命; cost: 阳光; recharge: 冷却秒 */
  const PLANTS = {
    sunflower: {
      name: '向日葵', en: 'Sunflower', cost: 50, recharge: 7.5, hp: 300,
      sun: { value: 25, first: [3, 12.5], next: [23.5, 25] },
      desc: '向日葵是收集额外阳光的最佳途径。种得越多，来得越快！',
      tip: '尽可能早地种植向日葵，稳守阳光经济。',
    },
    peashooter: {
      name: '豌豆射手', en: 'Peashooter', cost: 100, recharge: 7.5, hp: 300,
      shoot: { dmg: 20, interval: 1.4 },
      desc: '豌豆射手是你的第一道防线，向僵尸发射豌豆。',
      tip: '一排配上一个，前期防守的基础。',
    },
    wallnut: {
      name: '坚果墙', en: 'Wall-nut', cost: 50, recharge: 30, hp: 4000,
      desc: '坚果墙拥有坚硬的外壳，可以为你抵挡僵尸争取时间。',
      tip: '放在前排，保护后方输出植物。',
    },
    potatomine: {
      name: '土豆雷', en: 'Potato Mine', cost: 25, recharge: 30, hp: 300,
      arm: 15, dmg: 1800,
      desc: '土豆雷造价低廉，破土而出后一举炸飞踩到它的僵尸。',
      tip: '武装需要 15 秒，提前埋好是关键。',
    },
    cherrybomb: {
      name: '樱桃炸弹', en: 'Cherry Bomb', cost: 150, recharge: 50, hp: 300,
      fuse: 1.2, dmg: 1800, radius: 1.5,
      desc: '樱桃炸弹能炸飞一整片区域内的僵尸。',
      tip: '留给密集僵尸群，收益最大。',
    },
    snowpea: {
      name: '雪花豌豆', en: 'Snow Pea', cost: 175, recharge: 7.5, hp: 300,
      shoot: { dmg: 20, interval: 1.4, chill: 8 },
      desc: '雪花豌豆发射冰冻豌豆，可以减缓僵尸的移动速度。',
      tip: '配合豌豆射手，一冻一打，效率翻倍。',
    },
    repeater: {
      name: '双发射手', en: 'Repeater', cost: 200, recharge: 7.5, hp: 300,
      shoot: { dmg: 20, interval: 1.4, count: 2 },
      desc: '双发射手可以一次发射两颗豌豆。',
      tip: '火力是豌豆射手的两倍，中后期主力。',
    },
    squash: {
      name: '倭瓜', en: 'Squash', cost: 50, recharge: 30, hp: 300,
      dmg: 1800,
      desc: '倭瓜会跳起来压扁靠近的僵尸。',
      tip: '应急救场神器，专救即将破防的一行。',
    },
    jalapeno: {
      name: '火爆辣椒', en: 'Jalapeno', cost: 125, recharge: 50, hp: 300,
      fuse: 1.0, dmg: 1800,
      desc: '火爆辣椒可以烧光一整行的僵尸。',
      tip: '一行告急时的终极答案。',
    },
    torchwood: {
      name: '火炬树桩', en: 'Torchwood', cost: 175, recharge: 7.5, hp: 300,
      desc: '火炬树桩会把经过的豌豆点燃，造成双倍伤害。',
      tip: '放在豌豆射手前面，让火力翻倍。',
    },
    chomper: {
      name: '大嘴花', en: 'Chomper', cost: 150, recharge: 7.5, hp: 300,
      chew: 42,
      desc: '大嘴花可以一口吞掉僵尸，但咀嚼时十分脆弱。',
      tip: '坚果墙后面的大嘴花是最强前排组合。',
    },
    tallnut: {
      name: '高坚果', en: 'Tall-nut', cost: 125, recharge: 30, hp: 8000,
      desc: '高坚果是强化版的坚果墙，还能挡住撑杆跳僵尸。',
      tip: '后期替代坚果墙，性价比极高的肉盾。',
    },
  };

  /* ============ 僵尸定义 ============ */
  /* speed: 像素/秒（由源码 0.23~0.37 px/frame@60fps 换算） */
  const ZOMBIES = {
    normal: {
      name: '普通僵尸', en: 'Zombie', body: 270, speed: [13.8, 22.2], value: 1,
      desc: '最普通的僵尸，缓慢而坚定地向前挪动。',
    },
    flag: {
      name: '旗帜僵尸', en: 'Flag Zombie', body: 270, speed: [20, 28], value: 1,
      desc: '旗帜僵尸标志着一大波僵尸的到来。',
    },
    cone: {
      name: '路障僵尸', en: 'Conehead Zombie', body: 270, helm: 370, speed: [13.8, 22.2], value: 2,
      desc: '戴上了路障的僵尸，防御力提升了一倍。',
    },
    pole: {
      name: '撑杆跳僵尸', en: 'Pole Vaulting Zombie', body: 500, speed: [38, 42], value: 2,
      desc: '撑杆跳僵尸能跃过第一个遇到的植物。',
    },
    bucket: {
      name: '铁桶僵尸', en: 'Buckethead Zombie', body: 270, helm: 1100, speed: [13.8, 22.2], value: 4,
      desc: '头顶铁桶的僵尸，防御力极高。',
    },
    news: {
      name: '报纸僵尸', en: 'Newspaper Zombie', body: 270, shield: 150, speed: [13.8, 22.2], value: 2,
      rageSpeed: [52, 56],
      desc: '报纸被毁后会陷入狂暴，速度大幅提升。',
    },
    football: {
      name: '橄榄球僵尸', en: 'Football Zombie', body: 270, helm: 1400, speed: [36, 42], value: 5,
      desc: '橄榄球僵尸又快又硬，是夜场的劲敌。',
    },
  };

  /* 僵尸啃食 DPS（原版 100/s） */
  const ZOMBIE_DPS = 100;
  /* 冰冻减速系数（CHILLED_SPEED_FACTOR = 0.4） */
  const CHILL_FACTOR = 0.4;

  /* ============ 关卡定义 ============ */
  /* waveNum: 总波数; spawns: [类型, 权重]; flagEvery: 大波间隔 */
  const LEVELS = [
    {
      id: 1, name: '第 1 关', theme: 'day', waves: 10, startSun: 150, slots: 6,
      spawns: [['normal', 100]],
      plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine', 'cherrybomb'],
      intro: '僵尸来了！用豌豆射手守住前院。',
    },
    {
      id: 2, name: '第 2 关', theme: 'day', waves: 15, startSun: 100, slots: 6,
      spawns: [['normal', 70], ['cone', 30]],
      plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine', 'cherrybomb', 'snowpea', 'repeater'],
      intro: '路障僵尸出现了，火力需要升级。',
    },
    {
      id: 3, name: '第 3 关', theme: 'day', waves: 20, startSun: 100, slots: 8,
      spawns: [['normal', 50], ['cone', 30], ['pole', 20]],
      plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine', 'cherrybomb', 'snowpea', 'repeater', 'squash', 'jalapeno'],
      intro: '撑杆跳僵尸会跃过第一个植物，注意布阵。',
    },
    {
      id: 4, name: '第 4 关', theme: 'day', waves: 25, startSun: 75, slots: 8,
      spawns: [['normal', 40], ['cone', 28], ['pole', 15], ['bucket', 17]],
      plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine', 'cherrybomb', 'snowpea', 'repeater', 'squash', 'jalapeno', 'torchwood', 'chomper'],
      intro: '铁桶僵尸防御惊人，樱桃炸弹别攒着不用。',
    },
    {
      id: 5, name: '第 5 关', theme: 'day', waves: 30, startSun: 75, slots: 10,
      spawns: [['normal', 28], ['cone', 24], ['pole', 14], ['bucket', 16], ['news', 10], ['football', 8]],
      plants: ['sunflower', 'peashooter', 'wallnut', 'potatomine', 'cherrybomb', 'snowpea', 'repeater', 'squash', 'jalapeno', 'torchwood', 'chomper', 'tallnut'],
      intro: '最终决战！守住这波，前院就安全了。',
    },
    {
      id: 'endless', name: '无尽模式', theme: 'day', waves: Infinity, startSun: 150, slots: 10,
      spawns: [['normal', 30], ['cone', 25], ['pole', 12], ['bucket', 15], ['news', 10], ['football', 8]],
      plants: Object.keys(PLANTS),
      intro: ' endless：看你能撑过多少波僵尸。',
    },
  ];

  /* ============ 波次生成 ============ */
  const waveBudget = (wave, flagEvery) => {
    let b = 1 + wave * 0.55;
    if (flagEvery && wave % flagEvery === 0) b *= 2.6;
    return b;
  };
  const isFlagWave = (wave, flagEvery) => flagEvery && wave % flagEvery === 0;

  PVZ.G = G;
  PVZ.PLANTS = PLANTS;
  PVZ.ZOMBIES = ZOMBIES;
  PVZ.ZOMBIE_DPS = ZOMBIE_DPS;
  PVZ.CHILL_FACTOR = CHILL_FACTOR;
  PVZ.LEVELS = LEVELS;
  PVZ.waveBudget = waveBudget;
  PVZ.isFlagWave = isFlagWave;
})(window);
