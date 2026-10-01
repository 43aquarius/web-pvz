// ============================================================
// data.js — 全量游戏数值定义 (源自 PvZ-Portable 原版数值)
// 48植物 + 26僵尸 + 50关卡 + 全部子弹
// ============================================================
'use strict';

// 常量
const CONST = {
  BOARD_W: 800, BOARD_H: 600,
  LAWN_XMIN: 40, LAWN_YMIN: 80,
  CELL_W: 80, CELL_H_LAWN: 100, CELL_H_POOL: 85,
  ROWS_LAWN: 5, ROWS_POOL: 6,
  START_SUN: 50,
  SUN_VALUE: 25,
  SKY_SUN_INTERVAL: [9, 11],       // 天降阳光间隔秒(白天)
  SUN_LIFETIME: 8,                 // 阳光停留时间
  ZOMBIE_EAT_DPS: 100,
  CHILL_FACTOR: 0.4,               // 冰减速系数
  ZOMBIE_NORMAL_VEL: [23, 37],     // px/s
  FREEZE_TIME: 10,
  PLANT_HP: 300,
  GRAVE_HP: 1000,
  COIN_VALUE: 25,
};

// ---------- 植物定义 ----------
// reanim: 素材名; cost: 阳光; cd: 冷却ms; hp: 血量; packet: 种子包索引
// cls: shooter/producer/defense/instant/..
const PLANTS = {
  PEASHOOTER:      { cn: '豌豆射手',   cost: 100, cd: 7500,  hp: 300,  reanim: 'PeaShooterSingle', anim: 'anim_idle', layers: [['anim_idle'],['anim_head_idle']], shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'pea', desc: '向前方发射豌豆' },
  SUNFLOWER:       { cn: '向日葵',     cost: 50,  cd: 7500,  hp: 300,  reanim: 'SunFlower', anim: 'anim_idle', sunRate: 24, sunVal: 25, firstSun: [3, 12], cls: 'producer', desc: '每隔24秒生产25阳光' },
  CHERRYBOMB:      { cn: '樱桃炸弹',   cost: 150, cd: 50000, hp: 300,  reanim: 'CherryBomb', anim: 'anim_idle', cls: 'instant', fuse: 1.0, dmg: 1800, radius: 115, desc: '炸毁3x3范围僵尸' },
  WALLNUT:         { cn: '坚果墙',     cost: 50,  cd: 30000, hp: 4000, reanim: 'Wallnut', anim: 'anim_idle', cls: 'defense', desc: '抵挡僵尸的高血量壁垒' },
  EXPLODEONUT:     { cn: '爆炸坚果',   cost: 0,   cd: 30000, hp: 4000, reanim: 'Wallnut', anim: 'anim_idle', cls: 'defense', bowling: 'explode', desc: '保龄球中会爆炸' },
  GIANTWALLNUT:    { cn: '巨型坚果',   cost: 0,   cd: 30000, hp: 8000, reanim: 'Wallnut', anim: 'anim_idle', cls: 'defense', bowling: 'giant', scale: 1.6, desc: '巨无霸保龄球' },
  POTATOMINE:      { cn: '土豆雷',     cost: 25,  cd: 30000, hp: 300,  reanim: 'PotatoMine', anim: 'anim_armed', cls: 'instant', arm: 15, dmg: 1800, radius: 55, desc: '需要时间破土, 触发即爆' },
  SNOWPEA:         { cn: '寒冰射手',   cost: 175, cd: 7500,  hp: 300,  reanim: 'SnowPea', anim: 'anim_idle', layers: [['anim_idle'],['anim_head_idle']], shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'snowpea', desc: '冰豌豆减速僵尸' },
  CHOMPER:         { cn: '大嘴花',     cost: 150, cd: 7500,  hp: 300,  reanim: 'Chomper', anim: 'anim_idle', cls: 'shooter', chew: 42, biteDmg: 1800, desc: '吞噬僵尸后需42秒咀嚼' },
  REPEATER:        { cn: '双发射手',   cost: 200, cd: 7500,  hp: 300,  reanim: 'PeaShooter', anim: 'anim_idle', layers: [['anim_idle'],['anim_head_idle']], shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'pea', shots: 2, desc: '一次发射两颗豌豆' },
  PUFFSHROOM:      { cn: '小喷菇',     cost: 0,   cd: 7500,  hp: 300,  reanim: 'PuffShroom', anim: 'anim_idle', shootRate: 1.5, dmg: 20, range: 3, cls: 'shooter', proj: 'puff', desc: '免费短程蘑菇, 白天睡觉' },
  SUNSHROOM:       { cn: '阳光菇',     cost: 25,  cd: 7500,  hp: 300,  reanim: 'SunShroom', anim: 'anim_idle', sunRate: 24, sunVal: 25, growTime: 120, firstSun: [3, 10], cls: 'producer', desc: '产出阳光, 长大后产量翻倍' },  // 原版: 小15/大25
  FUMESHROOM:      { cn: '大喷菇',     cost: 75,  cd: 7500,  hp: 300,  reanim: 'FumeShroom', anim: 'anim_idle', shootRate: 1.5, dmg: 20, range: 4, cls: 'shooter', proj: 'fume', desc: '穿透雾气攻击4格内僵尸' },
  GRAVEBUSTER:     { cn: '墓碑吞噬者', cost: 75,  cd: 7500,  hp: 300,  reanim: 'Gravebuster', anim: 'anim_idle', cls: 'instant', graveEat: 4, desc: '种植在墓碑上将其清除' },
  HYPNOSHROOM:     { cn: '魅惑菇',     cost: 75,  cd: 30000, hp: 300,  reanim: 'HypnoShroom', anim: 'anim_idle', cls: 'defense', hypno: true, desc: '被吃的僵尸会倒戈' },
  SCAREDYSHROOM:   { cn: '胆小菇',     cost: 25,  cd: 7500,  hp: 300,  reanim: 'ScaredyShroom', anim: 'anim_idle', layers: [['anim_idle'],['anim_face']], shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'puff', scared: true, desc: '僵尸靠近时会躲起来' },
  ICESHROOM:       { cn: '寒冰菇',     cost: 75,  cd: 50000, hp: 300,  reanim: 'IceShroom', anim: 'anim_idle', cls: 'instant', freezeAll: 10, wakeFuse: 1, dmg: 20, desc: '冻结全场僵尸10秒' },
  DOOMSHROOM:      { cn: '毁灭菇',     cost: 125, cd: 50000, hp: 300,  reanim: 'DoomShroom', anim: 'anim_idle', cls: 'instant', fuse: 1, dmg: 9000, radius: 250, crater: true, desc: '毁灭大范围僵尸并留下弹坑' },
  LILYPAD:         { cn: '睡莲',       cost: 25,  cd: 7500,  hp: 300,  reanim: 'LilyPad', anim: 'anim_idle', cls: 'support', aquatic: true, desc: '水面平台' },
  SQUASH:          { cn: '窝瓜',       cost: 50,  cd: 30000, hp: 300,  reanim: 'Squash', anim: 'anim_idle', cls: 'instant', squashDmg: 1800, desc: '跳起压碎最近的僵尸' },
  THREEPEATER:     { cn: '三线射手',   cost: 325, cd: 7500,  hp: 300,  reanim: 'ThreePeater', anim: 'anim_idle', layers: [['anim_idle'],['anim_head_idle1'],['anim_head_idle2'],['anim_head_idle3']], shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'pea', rows: 3, desc: '同时攻击三行' },
  TANGLEKELP:      { cn: '缠绕水草',   cost: 25,  cd: 30000, hp: 300,  reanim: 'Tanglekelp', anim: 'anim_idle', cls: 'instant', aquatic: true, kelpDmg: 1800, desc: '拖入水底消灭僵尸' },
  JALAPENO:        { cn: '火爆辣椒',   cost: 125, cd: 50000, hp: 300,  reanim: 'Jalapeno', anim: 'anim_idle', cls: 'instant', fuse: 1, dmg: 1800, rowFire: true, desc: '焚烧整行僵尸' },
  SPIKEWEED:       { cn: '地刺',       cost: 100, cd: 7500,  hp: 300,  reanim: 'Caltrop', anim: 'anim_idle', cls: 'ground', spikeDmg: 20, popTires: true, desc: '扎伤走过僵尸, 可戳爆轮胎' },
  TORCHWOOD:       { cn: '火炬树桩',   cost: 175, cd: 7500,  hp: 300,  reanim: 'Torchwood', anim: 'anim_idle', cls: 'support', fireBoost: true, desc: '点燃经过的豌豆' },
  TALLNUT:         { cn: '高坚果',     cost: 125, cd: 30000, hp: 8000, reanim: 'Tallnut', anim: 'anim_idle', cls: 'defense', blocksVault: true, desc: '阻挡撑杆跳与海豚' },
  SEASHROOM:       { cn: '海蘑菇',     cost: 0,   cd: 30000, hp: 300,  reanim: 'SeaShroom', anim: 'anim_idle', shootRate: 1.5, dmg: 20, range: 3, cls: 'shooter', proj: 'puff', aquatic: true, desc: '水上的免费短程蘑菇' },
  PLANTERN:        { cn: '路灯花',     cost: 25,  cd: 30000, hp: 300,  reanim: 'Plantern', anim: 'anim_idle', cls: 'support', lightFog: true, desc: '照亮浓雾' },
  CACTUS:          { cn: '仙人掌',     cost: 125, cd: 7500,  hp: 300,  reanim: 'Cactus', anim: 'anim_idle', shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'cactus', antiAir: 2, desc: '尖刺可击落气球僵尸' },
  BLOVER:          { cn: '三叶草',     cost: 100, cd: 7500,  hp: 300,  reanim: 'Blover', anim: 'anim_idle', cls: 'instant', blowFog: true, fuse: 0.7, desc: '吹散浓雾与气球僵尸' },
  SPLITPEA:        { cn: '裂荚射手',   cost: 125, cd: 7500,  hp: 300,  reanim: 'SplitPea', anim: 'anim_idle', layers: [['anim_idle'],['anim_head_idle'],['anim_splitpea_idle']], shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'pea', backward: true, desc: '前后双向发射' },
  STARFRUIT:       { cn: '杨桃',       cost: 125, cd: 7500,  hp: 300,  reanim: 'Starfruit', anim: 'anim_idle', shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'star', dirs: 5, desc: '向五个方向发射星星' },
  PUMPKIN:         { cn: '南瓜头',     cost: 125, cd: 30000, hp: 4000, reanim: 'Pumpkin', anim: 'anim_idle', cls: 'shell', desc: '套在植物外层的护甲' },
  MAGNETSHROOM:    { cn: '磁力菇',     cost: 100, cd: 7500,  hp: 300,  reanim: 'Magnetshroom', anim: 'anim_idle', cls: 'support', magnet: 24, magnetRange: 5, desc: '吸走僵尸的铁器' },
  CABBAGEPULT:     { cn: '卷心菜投手', cost: 100, cd: 7500,  hp: 300,  reanim: 'Cabbagepult', anim: 'anim_idle', shootRate: 3, dmg: 40, range: 9, cls: 'shooter', proj: 'cabbage', lob: true, desc: '抛物线投掷卷心菜' },
  FLOWERPOT:       { cn: '花盆',       cost: 25,  cd: 7500,  hp: 300,  reanim: 'Pot', anim: 'anim_idle', cls: 'support', pot: true, desc: '屋顶种植的基座' },
  KERNELPULT:      { cn: '玉米投手',   cost: 100, cd: 7500,  hp: 300,  reanim: 'Cornpult', anim: 'anim_full_idle', shootRate: 3, dmg: 20, range: 9, cls: 'shooter', proj: 'corn', lob: true, butterChance: 0.25, desc: '投掷玉米粒, 偶尔投黄油定身' },
  COFFEEBEAN:      { cn: '咖啡豆',     cost: 75,  cd: 7500,  hp: 300,  reanim: 'Coffeebean', anim: 'anim_idle', cls: 'instant', wake: true, desc: '唤醒睡觉的蘑菇' },
  GARLIC:          { cn: '大蒜',       cost: 50,  cd: 7500,  hp: 1200, reanim: 'Garlic', anim: 'anim_idle', cls: 'defense', divert: true, desc: '驱使僵尸换行' },
  UMBRELLALEAF:    { cn: '叶子保护伞', cost: 100, cd: 7500,  hp: 300,  reanim: 'Umbrellaleaf', anim: 'anim_idle', cls: 'support', deflect: true, desc: '弹开投掷物与蹦极僵尸' },
  MARIGOLD:        { cn: '金盏花',     cost: 50,  cd: 30000, hp: 300,  reanim: 'Marigold', anim: 'anim_idle', sunRate: 24, coin: true, firstSun: [3, 12], cls: 'producer', desc: '生产金币' },
  MELONPULT:       { cn: '西瓜投手',   cost: 300, cd: 7500,  hp: 300,  reanim: 'Melonpult', anim: 'anim_idle', shootRate: 3, dmg: 80, splash: 40, range: 9, cls: 'shooter', proj: 'melon', lob: true, desc: '投掷西瓜造成溅射伤害' },
  GATLINGPEA:      { cn: '机枪射手',   cost: 250, cd: 50000, hp: 300,  reanim: 'GatlingPea', anim: 'anim_idle', layers: [['anim_idle'],['anim_head_idle']], shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'pea', shots: 4, desc: '连发四颗豌豆' },
  TWINSUNFLOWER:   { cn: '双子向日葵', cost: 150, cd: 50000, hp: 300,  reanim: 'TwinSunflower', anim: 'anim_idle', sunRate: 24, sunVal: 50, firstSun: [3, 12], cls: 'producer', desc: '双倍阳光产出' },
  GLOOMSHROOM:     { cn: '忧郁菇',     cost: 150, cd: 50000, hp: 300,  reanim: 'GloomShroom', anim: 'anim_idle', shootRate: 1, dmg: 20, range: 4, cls: 'shooter', proj: 'gloom', desc: '环绕360度喷吐雾气' },
  CATTAIL:         { cn: '香蒲',       cost: 225, cd: 50000, hp: 300,  reanim: 'Cattail', anim: 'anim_idle', shootRate: 1.5, dmg: 20, range: 9, cls: 'shooter', proj: 'cattail', homing: true, antiAir: 2, desc: '追踪尖刺, 可打气球' },
  WINTERMELON:     { cn: '冰西瓜',     cost: 200, cd: 50000, hp: 300,  reanim: 'WinterMelon', anim: 'anim_idle', shootRate: 3, dmg: 80, splash: 40, range: 9, cls: 'shooter', proj: 'wintermelon', lob: true, chill: true, desc: '投掷冰西瓜减速僵尸' },
  GOLDMAGNET:      { cn: '吸金磁',     cost: 50,  cd: 50000, hp: 300,  reanim: 'GoldMagnet', anim: 'anim_idle', cls: 'support', goldMagnet: 6, desc: '自动收集金币' },
  SPIKEROCK:       { cn: '地刺王',     cost: 125, cd: 50000, hp: 4500, reanim: 'SpikeRock', anim: 'anim_idle', cls: 'ground', spikeDmg: 20, popTires: true, desc: '强化版地刺' },
  COBCANNON:       { cn: '玉米加农炮', cost: 500, cd: 50000, hp: 300,  reanim: 'CobCannon', anim: 'anim_idle', cls: 'shooter', cobDmg: 2250, cobRadius: 115, cobCD: 23, needsLilyPair: true, desc: '手动发射毁灭玉米导弹' },
  IMITATER:        { cn: '模仿者',     cost: 0,   cd: 7500,  hp: 300,  reanim: 'Imitater', anim: 'anim_idle', cls: 'support', imitater: true, desc: '模仿其他植物' },
};

// 夜晚睡觉的蘑菇
const MUSHROOMS = new Set(['PUFFSHROOM', 'SUNSHROOM', 'FUMESHROOM', 'HYPNOSHROOM', 'SCAREDYSHROOM', 'ICESHROOM', 'DOOMSHROOM', 'SEASHROOM', 'MAGNETSHROOM', 'GLOOMSHROOM']);
// 水生植物(必须种在睡莲上或水中)
const AQUATIC = new Set(['LILYPAD', 'TANGLEKELP', 'SEASHROOM', 'CATTAIL']);
// 地面植物(低矮, 不挡子弹)
const GROUNDCOVER = new Set(['SPIKEWEED', 'SPIKEROCK']);
// 升级植物(原版商店购买) — 5-x后期关卡解锁
const UPGRADES = new Set(['GATLINGPEA', 'TWINSUNFLOWER', 'GLOOMSHROOM', 'CATTAIL', 'WINTERMELON', 'GOLDMAGNET', 'SPIKEROCK', 'COBCANNON', 'IMITATER']);

// ---------- 戴夫商店 (原版 StoreScreen: 通关 3-4 后解锁, 僵尸掉金币购买) ----------
// minLevel: 出现在货架上的最早进度; slot 依次购买
// 商店物品 (原版 StoreScreen.cpp GetItemCost + gStoreItemSpots 四页货架)
// price单位=金币 ($1=10金币? 原版显示×10; 本版直接用金币数, 与掉落面值一致: 银1/金5/钻100)
const SHOP_ITEMS = [
  // ---- 第一页: 槽位升级 + 基础道具 + 前排升级植物 ----
  { key: 'packetUpgrade', label: '种子槽升级', type: 'slots', cost: [750, 5000, 20000, 80000], page: 0, spot: 0, desc: '卡槽 7→8→9→10' },
  { key: 'poolcleaner',   label: '泳池清洁车', type: 'mower', cost: 1000,  page: 0, spot: 1, desc: '泳池关卡池行清洁车' },
  { key: 'rake',          label: '戴夫的耙子', type: 'rake',  cost: 200,   page: 0, spot: 2, desc: '自动消灭第一只僵尸×3关' },
  { key: 'roofcleaner',   label: '屋顶清洁车', type: 'mower', cost: 3000,  page: 0, spot: 3, desc: '屋顶关卡的清洁车' },
  { key: 'GATLINGPEA',    label: '机枪射手',   type: 'plant', cost: 5000,  page: 0, spot: 4, desc: '一次发射四颗豌豆' },
  { key: 'TWINSUNFLOWER', label: '双子向日葵', type: 'plant', cost: 5000,  page: 0, spot: 5, desc: '双倍阳光产量' },
  { key: 'GLOOMSHROOM',   label: '忧郁菇',     type: 'plant', cost: 7500,  page: 0, spot: 6, minLevel: 35, desc: '全方位喷射雾气' },
  { key: 'CATTAIL',       label: '香蒲',       type: 'plant', cost: 10000, page: 0, spot: 7, minLevel: 35, desc: '跟踪刺穿气球' },
  // ---- 第二页: 后排升级植物 ----
  { key: 'SPIKEROCK',     label: '地刺王',     type: 'plant', cost: 7500,  page: 1, spot: 0, minLevel: 41, desc: '能碾过冰车' },
  { key: 'GOLDMAGNET',    label: '金吸磁',     type: 'plant', cost: 3000,  page: 1, spot: 1, minLevel: 41, desc: '自动吸金币' },
  { key: 'WINTERMELON',   label: '冰西瓜',     type: 'plant', cost: 10000, page: 1, spot: 2, minLevel: 0,  desc: '范围减速' },
  { key: 'COBCANNON',     label: '玉米加农炮', type: 'plant', cost: 20000, page: 1, spot: 3, desc: '点击发射玉米炮弹' },
  { key: 'IMITATER',      label: '模仿者',     type: 'plant', cost: 30000, page: 1, spot: 4, desc: '复制任意植物' },
  { key: 'FIRSTAID',      label: '坚果急救术', type: 'firstaid', cost: 2000, page: 1, spot: 5, desc: '坚果受损显示修复进度' },
  // ---- 第三页: 禅境花园 (简化: 直购图标) ----
  { key: 'MARIGOLD_1',    label: '盆栽万寿菊', type: 'marigold', cost: 2500, page: 2, spot: 0, desc: '产金币的盆栽' },
  { key: 'MARIGOLD_2',    label: '盆栽万寿菊', type: 'marigold', cost: 2500, page: 2, spot: 1, desc: '产金币的盆栽' },
  { key: 'MARIGOLD_3',    label: '盆栽万寿菊', type: 'marigold', cost: 2500, page: 2, spot: 2, desc: '产金币的盆栽' },
  { key: 'FERTILIZER',    label: '肥料 ×5',    type: 'zen', cost: 750,  page: 2, spot: 4, desc: '禅境花园速效肥' },
  { key: 'BUG_SPRAY',     label: '杀虫剂 ×5',  type: 'zen', cost: 1000, page: 2, spot: 5, desc: '花园除虫' },
  // ---- 第四页 ----
  { key: 'MUSHROOM_GARDEN', label: '蘑菇园',   type: 'zen', cost: 30000, page: 3, spot: 0, desc: '夜间蘑菇花园' },
  { key: 'WHEEL_BARROW',  label: '手推车',     type: 'zen', cost: 200,   page: 3, spot: 2, desc: '搬运花园植物' },
  { key: 'STINKY',        label: '臭臭蜗牛',   type: 'zen', cost: 3000,  page: 3, spot: 3, desc: '自动收集金币' },
  { key: 'TREE_OF_WISDOM', label: '智慧树',    type: 'tree', cost: 10000, page: 3, spot: 4, desc: '种下智慧的种子' },
];
// 商店升级植物顺序 (availablePlants 追加顺序)
const UPGRADE_ORDER = ['GATLINGPEA', 'TWINSUNFLOWER', 'GLOOMSHROOM', 'CATTAIL', 'WINTERMELON', 'GOLDMAGNET', 'SPIKEROCK', 'COBCANNON', 'IMITATER'];

// ---------- 僵尸定义 ----------
// vel: px/s (原版 mVelX×47, 实际地面行走速度; 原版逻辑 100Hz)
// helm/shield: 护甲血量; body: 本体血量; walkGround: 用 _ground 轨道驱动(动画脚步同步)
const ZOMBIES = {
  NORMAL:       { cn: '普通僵尸',     reanim: 'Zombie', body: 270, vel: [10.8, 17.4], value: 1, unlock: 1, weight: 4000, firstWave: 1, desc: '最普通的僵尸' },
  FLAG:         { cn: '旗帜僵尸',     reanim: 'Zombie', body: 270, vel: [21, 21], value: 1, unlock: 1, weight: 0, firstWave: 1, flag: true, desc: '标志着一大波僵尸来袭' },
  CONE:         { cn: '路障僵尸',     reanim: 'Zombie', body: 270, helm: 370, helmType: 'cone', vel: [10.8, 17.4], value: 2, unlock: 3, weight: 4000, firstWave: 1, desc: '路障提供中等防护' },
  POLEVAULTER:  { cn: '撑杆僵尸',     reanim: 'Zombie_polevaulter', body: 500, vel: [31, 32], runVel: 31.5, walkVel: [10.8, 17.4], value: 2, unlock: 6, weight: 2000, firstWave: 5, vault: true, desc: '撑杆跳过第一个植物' },
  BUCKET:       { cn: '铁桶僵尸',     reanim: 'Zombie', body: 270, helm: 1100, helmType: 'bucket', vel: [10.8, 17.4], value: 4, unlock: 8, weight: 3000, firstWave: 1, desc: '铁桶提供强力防护' },
  NEWSPAPER:    { cn: '读报僵尸',     reanim: 'Zombie_paper', body: 500, shield: 150, shieldType: 'newspaper', vel: [10.8, 17.4], rageVel: 42, value: 2, unlock: 11, weight: 1000, firstWave: 1, desc: '报纸被毁后会暴走' },
  DOOR:         { cn: '铁门僵尸',     reanim: 'Zombie', body: 270, shield: 1100, shieldType: 'screendoor', vel: [10.8, 17.4], value: 4, unlock: 13, weight: 3500, firstWave: 5, desc: '铁门可挡正面子弹' },
  FOOTBALL:     { cn: '橄榄球僵尸',   reanim: 'Zombie_football', body: 500, helm: 1400, helmType: 'football', vel: [31, 32], value: 7, unlock: 16, weight: 2000, firstWave: 5, desc: '高速冲锋的重甲僵尸' },
  DANCER:       { cn: '舞王僵尸',     reanim: 'Zombie_dancer', body: 500, vel: [21, 21], scale: 0.8, value: 5, unlock: 18, weight: 1000, firstWave: 5, summon: 4, desc: '召唤伴舞僵尸' },
  BACKUP:       { cn: '伴舞僵尸',     reanim: 'Zombie_backup', body: 500, vel: [21, 21], scale: 0.8, value: 1, unlock: 99, weight: 0, desc: '舞王的伴舞' },
  DUCKY:        { cn: '鸭子救生圈僵尸', reanim: 'Zombie', body: 270, vel: [10.8, 17.4], value: 1, unlock: 21, weight: 0, firstWave: 5, water: true, desc: '带着救生圈游泳' },
  SNORKEL:      { cn: '潜水僵尸',     reanim: 'Zombie_snorkle', body: 500, vel: [31, 32], poolVel: 30, value: 3, unlock: 23, weight: 2000, firstWave: 10, water: true, dive: true, desc: '潜入水中躲避攻击' },
  ZAMBONI:      { cn: '冰车僵尸',     reanim: 'Zombie_zamboni', body: 1350, vel: [23, 37], value: 7, unlock: 26, weight: 2000, firstWave: 10, crush: true, iceTrail: true, desc: '压碎植物并留下冰道' },
  BOBSLED:      { cn: '雪橇小队僵尸', reanim: 'Zombie_bobsled', body: 270, helm: 300, helmType: 'bobsled', vel: [60, 60], walkVel: [10.8, 17.4], value: 3, unlock: 26, weight: 2000, firstWave: 10, team: 4, desc: '四人雪橇队, 冰面上疾驰' },
  DOLPHIN:      { cn: '海豚骑士僵尸', reanim: 'Zombie_dolphinrider', body: 500, vel: [31, 32], walkVel: [41.8, 42.8], value: 3, unlock: 28, weight: 1500, firstWave: 10, water: true, vault: true, desc: '骑着海豚跃过植物' },
  JACK:         { cn: '玩偶匣僵尸',   reanim: 'Zombie_jackbox', body: 500, vel: [31, 32], value: 3, unlock: 31, weight: 1000, firstWave: 10, explode: true, desc: '走到半路自爆' },
  BALLOON:      { cn: '气球僵尸',     reanim: 'Zombie_balloon', body: 500, fly: 20, altitude: 25, vel: [23, 37], value: 2, unlock: 33, weight: 2000, firstWave: 10, desc: '飞过地面防线' },
  DIGGER:       { cn: '矿工僵尸',     reanim: 'Zombie_digger', body: 500, helm: 100, helmType: 'digger', vel: [10.8, 17.4], digVel: 12, value: 4, unlock: 36, weight: 1000, firstWave: 10, dig: true, desc: '挖地道绕到后方' },
  POGO:         { cn: '跳跳僵尸',     reanim: 'Zombie_pogo', body: 500, vel: [45, 45], value: 4, unlock: 38, weight: 1000, firstWave: 10, pogo: true, desc: '不断跳跃越过植物' },
  YETI:         { cn: '雪人僵尸',     reanim: 'Zombie_yeti', body: 1350, vel: [18.8, 18.8], runVel: 37.6, value: 4, unlock: 40, weight: 1, firstWave: 1, flee: true, yeti: true, desc: '罕见, 掉落钻石' },
  BUNGEE:       { cn: '蹦极僵尸',     reanim: 'Zombie_bungi', body: 450, vel: [0, 0], value: 3, unlock: 41, weight: 1000, firstWave: 10, bungee: true, desc: '从天而降偷走植物' },
  LADDER:       { cn: '梯子僵尸',     reanim: 'Zombie_ladder', body: 500, shield: 500, shieldType: 'ladder', vel: [37, 38], walkVel: [10.8, 17.4], value: 4, unlock: 43, weight: 1000, firstWave: 10, ladder: true, desc: '搭梯翻越高坚果' },
  CATAPULT:     { cn: '投石车僵尸',   reanim: 'Zombie_catapult', body: 850, vel: [23, 37], value: 5, unlock: 46, weight: 1500, firstWave: 10, catapult: 20, desc: '远距离投掷篮球' },
  GARGANTUAR:   { cn: '巨人僵尸',     reanim: 'Zombie_gargantuar', body: 3000, vel: [10.8, 17.4], value: 10, unlock: 48, weight: 1500, firstWave: 15, smash: true, throwImp: true, desc: '碾压一切, 血量极高' },
  REDEYE:       { cn: '红眼巨人僵尸', reanim: 'Zombie_gargantuar', body: 6000, vel: [10.8, 17.4], value: 10, unlock: 99, weight: 6000, smash: true, throwImp: true, redEye: true, desc: '强化版巨人' },
  IMP:          { cn: '小鬼僵尸',     reanim: 'Zombie_imp', body: 270, vel: [10.8, 17.4], value: 10, unlock: 99, weight: 0, desc: '被巨人抛出的炮灰' },
  BOSS:         { cn: '僵王博士',     reanim: 'Zombie_boss', body: 40000, vel: [0, 0], value: 10, unlock: 99, weight: 0, boss: true, desc: '终极Boss: 僵王博士' },
};

// 原版 gZombieAllowedLevels: 特殊僵尸仅在指定关卡出现 (PvZ-Portable 反编译数据)
const ZOMBIE_ALLOWED = {
  POLEVAULTER: [6, 7, 9, 10, 14, 15, 24, 29, 42],
  NEWSPAPER: [11, 12, 15, 22, 24],
  DOOR: [13, 14, 17, 19, 20],
  FOOTBALL: [16, 17, 20, 22, 25, 32, 44],
  DANCER: [18, 19, 20],
  BACKUP: [18, 19, 20],
  SNORKEL: [23, 24, 25, 27, 30],
  ZAMBONI: [26, 27, 29, 30],
  BOBSLED: [26, 27, 29, 30],
  DOLPHIN: [28, 29, 30, 34],
  JACK: [31, 32, 37, 40, 49, 50],
  BALLOON: [33, 34, 39, 40],
  DIGGER: [36, 37, 40],
  POGO: [38, 39, 40, 44],
  YETI: [40],
  BUNGEE: [41, 42, 47, 49, 50],
  LADDER: [43, 44, 45, 47, 49, 50],
  CATAPULT: [46, 47, 49, 50],
  GARGANTUAR: [48, 49, 50],
  IMP: [48, 49, 50],
};
// 僵尸能否在某关出现
function zombieAllowedOnLevel(type, level) {
  const list = ZOMBIE_ALLOWED[type];
  if (!list) { const d = ZOMBIES[type]; return d && d.unlock <= level; }
  return list.includes(level);
}

// ---------- 子弹定义 ----------
const PROJECTILES = {
  pea:          { dmg: 20, speed: 333, img: 'projectilepea', splat: 'pea' },
  snowpea:      { dmg: 20, speed: 333, img: 'projectilesnowpea', splat: 'snowpea', chill: true },
  firepea:      { dmg: 40, speed: 333, splat: 'firepea', fire: true, reanim: 'FirePea' },
  puff:         { dmg: 20, speed: 250, fume: true, reanim: 'Puff' },
  fume:         { dmg: 20, speed: 500, fume: true, reanim: 'fume' },
  gloom:        { dmg: 20, speed: 0, gloom: true, reanim: 'fume' },
  star:         { dmg: 20, speed: 333, img: 'projectile_star', splat: 'star' },
  cactus:       { dmg: 20, speed: 333, img: 'projectilecactus', splat: 'cactus', antiAir: 2 },
  cattail:      { dmg: 20, speed: 333, img: 'cattail_spike', splat: 'cactus', homing: true, antiAir: 2 },
  cabbage:      { dmg: 40, speed: 0, lob: true, arcH: 180, img: 'cabbagepult_cabbage' },
  corn:         { dmg: 20, speed: 0, lob: true, arcH: 180, img: 'cornpult_kernal' },
  butter:       { dmg: 20, speed: 0, lob: true, arcH: 180, img: 'cornpult_butter', stun: 4 },
  melon:        { dmg: 80, speed: 0, lob: true, arcH: 200, splash: 40, img: 'melonpult_melon' },
  wintermelon:  { dmg: 80, speed: 0, lob: true, arcH: 200, splash: 40, chill: true, img: 'wintermelon_melon' },
  basketball:   { dmg: 30, speed: 300, lob: true, img: 'zombie_catapult_basketball', arcH: 120, zproj: true },
  cob:          { dmg: 2250, speed: 0, cob: true, img: 'cobcannon_cob', arcH: 250, splash: 0 },
  bossfire:     { dmg: 2000, speed: 220, img: 'zombie_boss_fireball', zproj: true },
  bossice:      { dmg: 2000, speed: 220, img: 'zombie_boss_iceball', zproj: true },
};

// ---------- 关卡 (冒险模式 1-1 ~ 5-10, 原版精确数据) ----------
// 世界结构: 1-10白天 / 11-20黑夜 / 21-30泳池 / 31-40浓雾 / 41-50屋顶
// 原版 gZombieWaves 波数表 (PvZ-Portable 反编译)
const WAVE_COUNTS = [
  4,  6,  8,  10, 8,  10, 20, 10, 20, 20,
  10, 20, 10, 20, 10, 10, 20, 10, 20, 20,
  10, 20, 20, 30, 20, 20, 30, 20, 30, 30,
  10, 20, 10, 20, 20, 10, 20, 10, 20, 20,
  10, 20, 20, 30, 20, 20, 30, 20, 30, 30,
];

// 原版植物解锁顺序 = SeedType 枚举顺序
const SEED_ORDER = [
  'PEASHOOTER', 'SUNFLOWER', 'CHERRYBOMB', 'WALLNUT', 'POTATOMINE',
  'SNOWPEA', 'CHOMPER', 'REPEATER', 'PUFFSHROOM', 'SUNSHROOM',
  'FUMESHROOM', 'GRAVEBUSTER', 'HYPNOSHROOM', 'SCAREDYSHROOM', 'ICESHROOM',
  'DOOMSHROOM', 'LILYPAD', 'SQUASH', 'THREEPEATER', 'TANGLEKELP',
  'JALAPENO', 'SPIKEWEED', 'TORCHWOOD', 'TALLNUT', 'SEASHROOM',
  'PLANTERN', 'CACTUS', 'BLOVER', 'SPLITPEA', 'STARFRUIT',
  'PUMPKIN', 'MAGNETSHROOM', 'CABBAGEPULT', 'FLOWERPOT', 'KERNELPULT',
  'COFFEEBEAN', 'GARLIC', 'UMBRELLALEAF', 'MARIGOLD', 'MELONPULT',
];

// 原版 GetAwardSeedForLevel: 玩到第 N 关时已解锁的植物数
// (每区 8 个新植物; sub>=5 减1, sub>=10 减2 — X-5/X-10 是纸条关不发植物)
function seedsAvailableCount(level) {
  const area = Math.floor((level - 1) / 10) + 1;
  const sub = ((level - 1) % 10) + 1;
  let n = (area - 1) * 8 + sub;
  if (sub >= 10) n -= 2;
  else if (sub >= 5) n -= 1;
  return Math.min(n, 40);
}
// 玩到第 level 关时可用植物列表 (含已购买的商店升级植物)
function availablePlants(level, purchased) {
  const n = seedsAvailableCount(level);
  const base = SEED_ORDER.slice(0, n);
  if (purchased && purchased.size) {
    for (const t of UPGRADE_ORDER) if (purchased.has(t)) base.push(t);
  }
  return base;
}
// 通关第 level 关后奖励的植物 (null=纸条/无植物)
function awardPlantForLevel(level) {
  const before = seedsAvailableCount(level);
  const after = seedsAvailableCount(level + 1);
  if (after > before) return SEED_ORDER[after - 1];
  return null;
}

// 原版墓碑数量表 (夜晚关卡, 按列分布: 列号→数量)
function gravesForLevel(lv) {
  if (lv >= 11 && lv <= 13) return [[6, 1], [7, 1], [8, 2]];
  if (lv === 14 || lv === 16) return [[5, 1], [6, 1], [7, 2], [8, 3]];
  if (lv >= 17 && lv <= 19) return [[4, 1], [5, 2], [6, 2], [7, 3], [8, 3]];
  if (lv >= 20) return [[3, 1], [4, 2], [5, 2], [6, 2], [7, 3], [8, 3]];
  return [];
}

function makeLevels() {
  const L = [];
  for (let lv = 1; lv <= 50; lv++) {
    const scene = lv <= 10 ? 'day' : lv <= 20 ? 'night' : lv <= 30 ? 'pool' : lv <= 40 ? 'fog' : 'roof';
    const sub = ((lv - 1) % 10) + 1;
    const level = {
      id: lv, scene, sub,
      world: Math.ceil(lv / 10),
      label: `${Math.ceil(lv / 10)}-${sub}`,
      waves: WAVE_COUNTS[lv - 1],
      // 行配置: 1-1单行(中间), 1-2/1-3三行, 1-4起五行; 泳池六行
      grassRows: scene === 'pool' || scene === 'fog' ? [0, 1, 4, 5] : (lv === 1 ? [2] : (lv === 2 || lv === 3) ? [1, 2, 3] : [0, 1, 2, 3, 4]),
      rows: scene === 'pool' || scene === 'fog' ? 6 : 5,
      startSun: lv === 1 ? 150 : 50,
      unlock: awardPlantForLevel(lv),
      fixed: null,
      graves: scene === 'night' ? gravesForLevel(lv) : [],
      bgm: scene === 'day' ? 'front_day' : scene === 'night' ? 'front_night' : scene === 'pool' ? 'pool' : scene === 'fog' ? 'fog' : 'roof',
      skySun: !(scene === 'night' || scene === 'fog'),
      potColumns: lv === 41 ? 5 : lv === 42 ? 4 : lv >= 43 ? 3 : 0,
      sodRoll: lv === 1 || lv === 2 || lv === 4,       // 草皮扩展关: 开场铺草皮动画
      chooseSeeds: lv > 7,                              // 1-8 起需要选卡
      bankSlots: Math.min(6 + Math.max(0, Math.floor((lv - 8) / 12)), 10), // 6槽起步, 后期最多10
      flagWaves: WAVE_COUNTS[lv - 1] >= 10 ? 10 : 0,   // <10波无旗 (1-1)
      introZombies: lv <= 20,                           // 开场镜头右侧展示僵尸
    };
    // 特殊关 (原版 HasConveyorBeltSeedBank: 1-5/1-10/2-10/3-5/3-10/4-10/5-5/5-10 传送带;
    //          2-5 打僵尸 / 4-5 罐子解谜 为无卡带特殊玩法)
    if (lv === 5)  level.fixed = 'bowling';    // 1-5 坚果保龄球 (传送带: 仅坚果)
    if (lv === 10 || lv === 20 || lv === 30) level.fixed = 'conveyor'; // X-10 小Boss关 (传送带)
    if (lv === 15) level.fixed = 'whack';      // 2-5 打僵尸 (锤子小游戏)
    if (lv === 25) level.fixed = 'conveyor';   // 3-5 小僵尸关 (传送带)
    if (lv === 35) level.fixed = 'vasebreaker';// 4-5 罐子解谜
    if (lv === 40) level.fixed = 'conveyor';   // 4-10 暴风雨夜 (传送带)
    if (lv === 45) level.fixed = 'conveyor';   // 5-5 蹦极突袭 (传送带)
    if (lv === 50) level.fixed = 'boss';       // 5-10 僵王博士 (传送带)
    L.push(level);
  }
  return L;
}
const LEVELS = makeLevels();

// ---------- 额外模式 (玩玩小游戏 / 解谜 / 生存) ----------
// 完整原版关卡表: 20小游戏 + 10罐子 + 10我是僵尸 + 11生存
// 参照 PvZ-Portable ChallengeScreen.cpp gChallengeDefs + Challenge.cpp 各模式 Init
const MODE_LEVELS = {
  // ================= 玩玩小游戏 (第一页) =================
  war_and_peas:   { id: 101, label: '豌豆大战',     mode: 'minigame', scene: 'day',   waves: 20, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true,  chooseSeeds: true,  bgm: 'front_day',   zombiePool: ['PEASHOOTER_HEAD', 'WALLNUT_HEAD'], desc: '僵尸也学会了长豌豆' },
  bowling:        { id: 102, label: '坚果保龄球',   mode: 'minigame', fixed: 'bowling', scene: 'day',   waves: 20, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_day',   zombiePool: ['NORMAL', 'CONE', 'BUCKET', 'POLEVAULTER', 'NEWSPAPER'], desc: '滚动的坚果, 全垒打!' },
  slotmachine:    { id: 103, label: '老虎机',       mode: 'minigame', fixed: 'slotmachine', scene: 'day', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true, chooseSeeds: false, bgm: 'front_day',   noZombies: true, desc: '拉动老虎机赢得阳光' },
  raining:        { id: 104, label: '天降种子',     mode: 'minigame', fixed: 'raining', scene: 'day',   waves: 40, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true, chooseSeeds: false, bgm: 'front_day',   rainingSeeds: true, zombiePool: ['NORMAL','CONE','BUCKET','SCREEN_DOOR','FOOTBALL','NEWSPAPER','JACKBOX','BUNGI'], desc: '天上掉下随机种子包' },
  beghouled:      { id: 105, label: '宝石僵尸',     mode: 'minigame', fixed: 'beghouled', scene: 'night', waves: 40, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', zombiePool: ['NORMAL','CONE','BUCKET','SCREEN_DOOR','FOOTBALL','NEWSPAPER'], desc: '交换植物三连消除' },
  invisighoul:    { id: 106, label: '隐形僵尸',     mode: 'minigame', fixed: 'conveyor', scene: 'fog',   waves: 20, grassRows: [0,1,4,5], rows: 6, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'fog',         conveyorMul: 2.0, invisibleZ: true, zombiePool: ['NORMAL','CONE','BUCKET','SNORKLE','ZAMBONI','JACKBOX'], desc: '看不见的僵尸来袭' },
  seeingstars:    { id: 107, label: '看星星',       mode: 'minigame', scene: 'day',   waves: 40, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true,  chooseSeeds: true,  bgm: 'front_day',   artChallenge: 'star', desc: '在星形格子里种满杨桃' },
  zombiquarium:   { id: 108, label: '僵尸水族馆',   mode: 'minigame', fixed: 'zombiquarium', scene: 'day', waves: 1, rows: 5, grassRows: [0,1,2,3,4], startSun: 100, skySun: false, chooseSeeds: false, bgm: 'mini_game', noZombies: true, desc: '喂养你的宠物僵尸鱼' },
  beghouled_twist:{ id: 109, label: '宝石僵尸旋转', mode: 'minigame', fixed: 'beghouled_twist', scene: 'night', waves: 40, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', zombiePool: ['NORMAL','CONE','BUCKET','SCREEN_DOOR','FOOTBALL','NEWSPAPER'], desc: '旋转2×2凑三连' },
  little_trouble: { id: 110, label: '小麻烦',       mode: 'minigame', fixed: 'conveyor', scene: 'pool',  waves: 30, grassRows: [0,1,4,5], rows: 6, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'pool',        zombiePool: ['SNORKLE','DOLPHIN'], desc: '泳池小面积大麻烦' },
  portal_combat:  { id: 111, label: '传送门大战',   mode: 'minigame', fixed: 'conveyor', scene: 'night', waves: 20, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', conveyorMul: 1.5, portals: true, zombiePool: ['NORMAL','BUCKET','FOOTBALL','BALLOON'], desc: '僵尸穿门而来' },
  column:         { id: 112, label: '列队来袭',     mode: 'minigame', fixed: 'conveyor', scene: 'roof',  waves: 30, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'roof',        conveyorMul: 3.0, potColumns: 4, zombiePool: ['NORMAL','CONE','BUCKET','FOOTBALL'], desc: '屋顶大军压境' },
  bobsled:        { id: 113, label: '雪橇车大赛',   mode: 'minigame', scene: 'pool',  waves: 30, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true, chooseSeeds: true, bgm: 'pool',        iceLevel: true, zombiePool: ['BOBSLED','ZAMBONI'], desc: '冰天雪地雪橇队' },
  speed:          { id: 114, label: '极速僵尸',     mode: 'minigame', scene: 'day',   waves: 20, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true, chooseSeeds: true,  bgm: 'front_day',   speedZ: true, zombiePool: ['NORMAL','CONE','BUCKET','POLEVAULTER'], desc: '僵尸吃了兴奋剂' },
  whack:          { id: 115, label: '打僵尸',       mode: 'minigame', fixed: 'whack', scene: 'night', waves: 12, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', graves: 'whack', zombiePool: ['NORMAL','CONE','BUCKET'], desc: '冒头的僵尸, 敲! 敲! 敲!' },
  last_stand:     { id: 116, label: '坚不可摧',     mode: 'minigame', fixed: 'laststand', scene: 'pool', waves: 50, grassRows: [0,1,4,5], rows: 6, startSun: 5000, skySun: false, chooseSeeds: true, bgm: 'pool',        lastStand: true, desc: '守住五波进攻, 不再补充阳光' },
  war_and_peas_2: { id: 117, label: '豌豆大战2',    mode: 'minigame', scene: 'day',   waves: 30, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true,  chooseSeeds: true,  bgm: 'front_day',   zombiePool: ['PEASHOOTER_HEAD','WALLNUT_HEAD','JALAPENO_HEAD','GATLING_HEAD','SQUASH_HEAD','TALLNUT_HEAD'], desc: '更强的大头僵尸' },
  bowling2:       { id: 118, label: '坚果保龄球·极限', mode: 'minigame', fixed: 'bowling', scene: 'day', waves: 30, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_day',   bowling2: true, zombiePool: ['NORMAL','CONE','BUCKET','POLEVAULTER','NEWSPAPER','DANCER','SCREEN_DOOR'], desc: '更强僵尸, 更疯狂保龄球' },
  pogo_party:     { id: 119, label: '跳跳派对',     mode: 'minigame', scene: 'roof',  waves: 30, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true, chooseSeeds: true, bgm: 'roof',        potColumns: 4, pogoParty: true, zombiePool: ['POGO'], desc: '满屋的跳跳僵尸' },
  final_boss:     { id: 120, label: '僵王博士',     mode: 'minigame', fixed: 'boss', scene: 'roof',  waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'roof',        potColumns: 0, boss: true, desc: '与僵王博士决一死战' },

  // ================= 解谜模式 (第二页) =================
  vase_1:  { id: 201, label: '罐子1',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 1, desc: '砸开罐子, 小心僵尸' },
  vase_2:  { id: 202, label: '罐子2',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 2, desc: '左右开弓' },
  vase_3:  { id: 203, label: '罐子3',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 3, desc: '魅惑菇登场' },
  vase_4:  { id: 204, label: '罐子4',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 4, desc: '小丑僵尸派对' },
  vase_5:  { id: 205, label: '罐子5',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 5, desc: '磁力菇与橄榄球' },
  vase_6:  { id: 206, label: '罐子6',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 6, desc: '撑杆跳与高坚果' },
  vase_7:  { id: 207, label: '罐子7',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 7, desc: '地刺海' },
  vase_8:  { id: 208, label: '罐子8',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 8, desc: '跳跳来了' },
  vase_9:  { id: 209, label: '罐子9',  mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 9, desc: '最终试炼·巨人' },
  vase_endless: { id: 210, label: '罐子·无尽', mode: 'puzzle', fixed: 'vasebreaker', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 0, skySun: false, chooseSeeds: false, bgm: 'front_night', vaseLevel: 10, endless: true, desc: '无尽的罐子挑战' },
  izombie_1:  { id: 211, label: '我是僵尸1', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 1, desc: '僵尸的逆袭' },
  izombie_2:  { id: 212, label: '我是僵尸2', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 2, desc: '地刺阵' },
  izombie_3:  { id: 213, label: '我是僵尸3', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 3, desc: '土豆雷区' },
  izombie_4:  { id: 214, label: '我是僵尸4', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 4, desc: '坚果防线' },
  izombie_5:  { id: 215, label: '我是僵尸5', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 5, desc: '仙人掌阵' },
  izombie_6:  { id: 216, label: '我是僵尸6', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 6, desc: '大蒜迷宫' },
  izombie_7:  { id: 217, label: '我是僵尸7', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 7, desc: '雷区冲刺' },
  izombie_8:  { id: 218, label: '我是僵尸8', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 8, desc: '混合双打' },
  izombie_9:  { id: 219, label: '我是僵尸9', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 9, desc: '终极阵容' },
  izombie_endless: { id: 220, label: '我是僵尸·无尽', mode: 'puzzle', fixed: 'izombie', scene: 'night', waves: 1, grassRows: [0,1,2,3,4], rows: 5, startSun: 150, skySun: false, chooseSeeds: false, bgm: 'front_night', izLevel: 10, endless: true, desc: '无尽的吃脑挑战' },

  // ================= 生存模式 (第三页) =================
  survival_day_n:    { id: 301, label: '生存·白天',     mode: 'survival', scene: 'day',   waves: 10, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true,  chooseSeeds: true, bgm: 'front_day',   survival: 'normal', survivalStage: 1, desc: '白天五旗挑战' },
  survival_night_n:  { id: 302, label: '生存·黑夜',     mode: 'survival', scene: 'night', waves: 10, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: false, chooseSeeds: true, bgm: 'front_night', survival: 'normal', survivalStage: 2, graves: [[5,1],[6,3],[7,2],[8,4],[6,0]], desc: '黑夜五旗挑战' },
  survival_pool_n:   { id: 303, label: '生存·泳池',     mode: 'survival', scene: 'pool',  waves: 10, grassRows: [0,1,4,5], rows: 6, startSun: 50, skySun: true, chooseSeeds: true, bgm: 'pool',      survival: 'normal', survivalStage: 3, desc: '泳池五旗挑战' },
  survival_fog_n:    { id: 304, label: '生存·浓雾',     mode: 'survival', scene: 'fog',   waves: 10, grassRows: [0,1,4,5], rows: 6, startSun: 50, skySun: false, chooseSeeds: true, bgm: 'fog',        survival: 'normal', survivalStage: 4, desc: '浓雾五旗挑战' },
  survival_roof_n:   { id: 305, label: '生存·屋顶',     mode: 'survival', scene: 'roof',  waves: 10, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true,  chooseSeeds: true, bgm: 'roof',      survival: 'normal', survivalStage: 5, potColumns: 4, desc: '屋顶五旗挑战' },
  survival_day_h:    { id: 306, label: '困难·白天',     mode: 'survival', scene: 'day',   waves: 20, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true,  chooseSeeds: true, bgm: 'front_day',   survival: 'hard', survivalStage: 1, desc: '白天十旗困难' },
  survival_night_h:  { id: 307, label: '困难·黑夜',     mode: 'survival', scene: 'night', waves: 20, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: false, chooseSeeds: true, bgm: 'front_night', survival: 'hard', survivalStage: 2, graves: [[5,1],[6,3],[7,2],[8,4],[6,0]], desc: '黑夜十旗困难' },
  survival_pool_h:   { id: 308, label: '困难·泳池',     mode: 'survival', scene: 'pool',  waves: 20, grassRows: [0,1,4,5], rows: 6, startSun: 50, skySun: true, chooseSeeds: true, bgm: 'pool',      survival: 'hard', survivalStage: 3, desc: '泳池十旗困难' },
  survival_fog_h:    { id: 309, label: '困难·浓雾',     mode: 'survival', scene: 'fog',   waves: 20, grassRows: [0,1,4,5], rows: 6, startSun: 50, skySun: false, chooseSeeds: true, bgm: 'fog',        survival: 'hard', survivalStage: 4, desc: '浓雾十旗困难' },
  survival_roof_h:   { id: 310, label: '困难·屋顶',     mode: 'survival', scene: 'roof',  waves: 20, grassRows: [0,1,2,3,4], rows: 5, startSun: 50, skySun: true,  chooseSeeds: true, bgm: 'roof',      survival: 'hard', survivalStage: 5, potColumns: 4, desc: '屋顶十旗困难' },
  survival_pool_e:   { id: 311, label: '泳池·无尽',     mode: 'survival', scene: 'pool',  waves: 20, grassRows: [0,1,4,5], rows: 6, startSun: 50, skySun: true, chooseSeeds: true, bgm: 'pool',      survival: 'endless', survivalStage: 3, endless: true, desc: '无尽的泳池生存' },
};

// 原版波次生成常量
const WAVE = {
  FIRST_WAVE_DELAY: 18,        // 秒 — 原版1800tick
  WAVE_DELAY: 25,              // 秒 — 原版2500tick
  WAVE_DELAY_RANGE: 6,         // 秒 — 原版600tick 随机
  BEFORE_FLAG: 45,             // 秒 — 大波前延迟 4500tick
  HUGE_WAVE_WARN: 7.5,         // 秒 — 大波警告 750tick
  ACCEL_THRESHOLD: 0.55,       // 波血量降到55%以下且已过4s → 加速
  ACCEL_DELAY: 2,              // 加速后2秒刷下一波
};

if (typeof module !== 'undefined') module.exports = { CONST, PLANTS, ZOMBIES, ZOMBIE_ALLOWED, zombieAllowedOnLevel, PROJECTILES, LEVELS, MODE_LEVELS, WAVE_COUNTS, SEED_ORDER, WAVE, MUSHROOMS, AQUATIC, GROUNDCOVER, UPGRADES, UPGRADE_ORDER, SHOP_ITEMS, availablePlants, seedsAvailableCount, awardPlantForLevel, gravesForLevel };
