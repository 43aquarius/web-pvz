// ============================================================
// zombie.js — Zombie.cpp 完整移植 (PvZ-Portable 反编译原版)
// 移植内容:
//  - ZombieInitialize 全 26+ 种僵尸 (血量/矩形/速度/相位/渲染组)
//  - SetupReanimLayers/SetupDoorArms (渲染分组: 修复多臂/图层)
//  - UpdateReanim (overlay 矩阵: 位置/缩放/翻转/割草机跟随)
//  - UpdateZombieWalking (_ground 轨道速度驱动 + 减速因子0.4)
//  - CheckIfPreyCaught/EatPlant (4tick一啃, 100DPS)
//  - TakeDamage 四层伤害 (flying→shield→helm→body) + DropArm/Head/Helm/Shield
//  - PlayDeathAnim/UpdateDeath (每僵尸独立倒地时间表)
//  - 全部专项 Update (撑杆/海豚/潜水/蹦极/跳跳/读报/矿工/玩偶/巨人/小鬼/雪橇/冰车/梯子/投石/雪人/舞王/气球/僵尸头)
//  - 泳池/高地/坠落/爬梯 高度状态机
// 100Hz tick 语义 (SECONDS_PER_UPDATE=0.01)
// ============================================================
'use strict';

const { CONST, ZOMBIES } = require('./data');
const RE = require('./reanim');
const { MAT } = RE;

// ---------- 相位 (ZombiePhase) ----------
const PH = {
  NORMAL: 0, DYING: 1, BURNED: 2, MOWERED: 3,
  BUNGEE_DIVING: 4, BUNGEE_DIVING_SCREAMING: 5, BUNGEE_AT_BOTTOM: 6, BUNGEE_GRABBING: 7, BUNGEE_RISING: 8, BUNGEE_HIT_OUCHY: 9, BUNGEE_CUTSCENE: 10,
  POLEVAULTER_PRE_VAULT: 11, POLEVAULTER_IN_VAULT: 12, POLEVAULTER_POST_VAULT: 13,
  RISING_FROM_GRAVE: 14,
  JACK_RUNNING: 15, JACK_POPPING: 16,
  BOBSLED_SLIDING: 17, BOBSLED_BOARDING: 18, BOBSLED_CRASHING: 19,
  POGO_BOUNCING: 20, POGO_HIGH_BOUNCE_1: 21, POGO_HIGH_BOUNCE_2: 22, POGO_HIGH_BOUNCE_3: 23, POGO_HIGH_BOUNCE_4: 24, POGO_HIGH_BOUNCE_5: 25, POGO_HIGH_BOUNCE_6: 26, POGO_FORWARD_BOUNCE_2: 27, POGO_FORWARD_BOUNCE_7: 28,
  NEWSPAPER_READING: 29, NEWSPAPER_MADDENING: 30, NEWSPAPER_MAD: 31,
  DIGGER_TUNNELING: 32, DIGGER_RISING: 33, DIGGER_TUNNELING_PAUSE_WITHOUT_AXE: 34, DIGGER_RISE_WITHOUT_AXE: 35, DIGGER_STUNNED: 36, DIGGER_WALKING: 37, DIGGER_WALKING_WITHOUT_AXE: 38, DIGGER_CUTSCENE: 39,
  DANCER_DANCING_IN: 40, DANCER_SNAPPING_FINGERS: 41, DANCER_SNAPPING_FINGERS_WITH_LIGHT: 42, DANCER_SNAPPING_FINGERS_HOLD: 43, DANCER_DANCING_LEFT: 44, DANCER_WALK_TO_RAISE: 45, DANCER_RAISE_LEFT_1: 46, DANCER_RAISE_RIGHT_1: 47, DANCER_RAISE_LEFT_2: 48, DANCER_RAISE_RIGHT_2: 49, DANCER_RISING: 50,
  DOLPHIN_WALKING: 51, DOLPHIN_INTO_POOL: 52, DOLPHIN_RIDING: 53, DOLPHIN_IN_JUMP: 54, DOLPHIN_WALKING_IN_POOL: 55, DOLPHIN_WALKING_WITHOUT_DOLPHIN: 56,
  SNORKEL_WALKING: 57, SNORKEL_INTO_POOL: 58, SNORKEL_WALKING_IN_POOL: 59, SNORKEL_UP_TO_EAT: 60, SNORKEL_EATING_IN_POOL: 61, SNORKEL_DOWN_FROM_EAT: 62,
  CATAPULT_LAUNCHING: 63, CATAPULT_RELOADING: 64,
  GARGANTUAR_THROWING: 65, GARGANTUAR_SMASHING: 66,
  IMP_GETTING_THROWN: 67, IMP_LANDING: 68,
  BALLOON_FLYING: 69, BALLOON_POPPING: 70, BALLOON_WALKING: 71,
  LADDER_CARRYING: 72, LADDER_PLACING: 73,
  BOSS_ENTER: 74, BOSS_IDLE: 75, BOSS_SPAWNING: 76, BOSS_STOMPING: 77, BOSS_BUNGEES_ENTER: 78, BOSS_BUNGEES_DROP: 79, BOSS_BUNGEES_LEAVE: 80, BOSS_DROP_RV: 81, BOSS_HEAD_ENTER: 82, BOSS_HEAD_IDLE_BEFORE_SPIT: 83, BOSS_HEAD_IDLE_AFTER_SPIT: 84, BOSS_HEAD_SPIT: 85, BOSS_HEAD_LEAVE: 86,
  YETI_RUNNING: 87,
  SQUASH_PRE_LAUNCH: 88, SQUASH_RISING: 89, SQUASH_FALLING: 90, SQUASH_DONE_FALLING: 91,
};

// ---------- 高度状态 (ZombieHeight) ----------
const H = {
  NORMAL: 0, IN_TO_POOL: 1, OUT_OF_POOL: 2, DRAGGED_UNDER: 3,
  UP_TO_HIGH_GROUND: 4, DOWN_OFF_HIGH_GROUND: 5, UP_LADDER: 6,
  FALLING: 7, IN_TO_CHIMNEY: 8, GETTING_BUNGEE_DROPPED: 9,
};

// ---------- 伤害标志位 (DamageFlags) ----------
const DMG = {
  BYPASSES_SHIELD: 1 << 0, HITS_SHIELD_AND_BODY: 1 << 1, FREEZE: 1 << 2,
  DOESNT_CAUSE_FLASH: 1 << 3, DOESNT_LEAVE_BODY: 1 << 4, SPIKE: 1 << 5,
};
// 组合预设
const DMG_SYS = DMG.DOESNT_CAUSE_FLASH | DMG.DOESNT_LEAVE_BODY; // 9U: 系统伤害

// ---------- 渲染分组 ----------
const RG = { HIDDEN: -1, NORMAL: 0, SHIELD: 1, ARMS: 2, OVER_SHIELD: 3, BOSS_BACK_LEG: 4, BOSS_FRONT_LEG: 5, BOSS_BACK_ARM: 6 };

// ---------- 常量 ----------
const CHILLED_SPEED_FACTOR = 0.4;
const TICKS_BETWEEN_EATS = 4;
const DAMAGE_PER_EAT = TICKS_BETWEEN_EATS;
const THOWN_ZOMBIE_GRAVITY = 0.05;
const POGO_BOUNCE_TIME = 80;
const DOLPHIN_JUMP_TIME = 120;
const JACK_ZOMBIE_RADIUS = 115;
const JACK_PLANT_RADIUS = 90;
const BOBSLED_CRASH_TIME = 150;
const ZOMBIE_BACKUP_DANCER_RISE_HEIGHT = -200;
const CLIP_HEIGHT_LIMIT = -100.0;
const CLIP_HEIGHT_OFF = -200.0;
const HIGH_GROUND_HEIGHT = 30;
const BUNGEE_ZOMBIE_HEIGHT = 3000;
const ZOMBIE_LIMP_SPEED_FACTOR = 2;
const WAVE_CUTSCENE = -2, WAVE_UI = -3, WAVE_WINNER = -4;

// ---------- 僵尸类型定义表 (gZombieDefs) ----------
const ZDEF = {
  NORMAL: { reanim: 'Zombie', value: 1, level: 1, firstWave: 1, weight: 4000 },
  FLAG: { reanim: 'Zombie', value: 1, level: 1, firstWave: 1, weight: 0 },
  CONE: { reanim: 'Zombie', value: 2, level: 3, firstWave: 1, weight: 4000 },
  POLEVAULTER: { reanim: 'Zombie_polevaulter', value: 2, level: 6, firstWave: 5, weight: 2000 },
  BUCKET: { reanim: 'Zombie', value: 4, level: 8, firstWave: 1, weight: 3000 },
  NEWSPAPER: { reanim: 'Zombie_paper', value: 2, level: 11, firstWave: 1, weight: 1000 },
  DOOR: { reanim: 'Zombie', value: 4, level: 13, firstWave: 5, weight: 3500 },
  FOOTBALL: { reanim: 'Zombie_football', value: 7, level: 16, firstWave: 5, weight: 2000 },
  DANCER: { reanim: 'Zombie_dancer', value: 5, level: 18, firstWave: 5, weight: 1000 },
  BACKUP: { reanim: 'Zombie_backup', value: 1, level: 18, firstWave: 1, weight: 0 },
  DUCKY: { reanim: 'Zombie', value: 1, level: 21, firstWave: 5, weight: 0 },
  SNORKEL: { reanim: 'Zombie_snorkle', value: 3, level: 23, firstWave: 10, weight: 2000 },
  ZAMBONI: { reanim: 'Zombie_zamboni', value: 7, level: 26, firstWave: 10, weight: 2000 },
  BOBSLED: { reanim: 'Zombie_bobsled', value: 3, level: 26, firstWave: 10, weight: 2000 },
  DOLPHIN: { reanim: 'Zombie_dolphinrider', value: 3, level: 28, firstWave: 10, weight: 1500 },
  JACK: { reanim: 'Zombie_jackbox', value: 3, level: 31, firstWave: 10, weight: 1000 },
  BALLOON: { reanim: 'Zombie_balloon', value: 2, level: 33, firstWave: 10, weight: 2000 },
  DIGGER: { reanim: 'Zombie_digger', value: 4, level: 36, firstWave: 10, weight: 1000 },
  POGO: { reanim: 'Zombie_pogo', value: 4, level: 38, firstWave: 10, weight: 1000 },
  YETI: { reanim: 'Zombie_yeti', value: 4, level: 40, firstWave: 1, weight: 1 },
  BUNGEE: { reanim: 'Zombie_bungi', value: 3, level: 41, firstWave: 10, weight: 1000 },
  LADDER: { reanim: 'Zombie_ladder', value: 4, level: 43, firstWave: 10, weight: 1000 },
  CATAPULT: { reanim: 'Zombie_catapult', value: 5, level: 46, firstWave: 10, weight: 1500 },
  GARGANTUAR: { reanim: 'Zombie_gargantuar', value: 10, level: 48, firstWave: 15, weight: 1500 },
  REDEYE: { reanim: 'Zombie_gargantuar', value: 10, level: 48, firstWave: 15, weight: 6000 },
  IMP: { reanim: 'Zombie_imp', value: 10, level: 48, firstWave: 1, weight: 0 },
  BOSS: { reanim: 'Zombie_boss', value: 10, level: 50, firstWave: 1, weight: 0 },
};

function rect(x, y, w, h) { return { x, y, w, h }; }
function rectOverlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? w * h / Math.max(w, h) : 0; // 取重叠宽度语义 (与原版GetRectOverlap近似)
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function curve(aMin, aMax, v, from, to, ease) {
  let t = (v - aMin) / (aMax - aMin || 1);
  t = clamp(t, 0, 1);
  if (ease === 'ease_in') t = t * t;
  else if (ease === 'ease_out') t = 1 - (1 - t) * (1 - t);
  else if (ease === 'bounce') t = 1 - Math.abs(1 - 2 * t) * (1 - t * 0.3);
  return from + (to - from) * t;
}

// ============================================================
class Zombie {
  constructor(type, row, board, fromWave = 0, parent = null) {
    this.type = type;
    this.def = ZDEF[type] || ZDEF.NORMAL;
    this.board = board;
    this.game = board.game;
    this.fromWave = fromWave;
    this.parent = parent;
    this.initialize(row, parent);
  }

  get isOnBoard() { return this.fromWave !== WAVE_CUTSCENE && this.fromWave !== WAVE_UI; }

  // ---------------- 初始化 (ZombieInitialize) ----------------
  initialize(row, parent) {
    const b = this.board;
    this.row = row;
    this.posX = 780 + Math.random() * 40;
    this.posY = 0;
    this.velX = 0;
    this.velZ = 0;
    this.width = 120; this.height = 120;
    this.x = 0; this.y = 0;
    this.variant = this.decideVariant();
    this.isEating = false;
    this.justGotShotCounter = 0;
    this.shieldJustGotShotCounter = 0;
    this.shieldRecoilCounter = 0;
    this.chilledCounter = 0;
    this.iceTrapCounter = 0;
    this.butteredCounter = 0;
    this.mindControlled = false;
    this.blowingAway = false;
    this.hasHead = true;
    this.hasArm = true;
    this.hasObject = false;
    this.inPool = false;
    this.onHighGround = false;
    this.yuckyFace = false;
    this.yuckyFaceCounter = 0;
    this.helmType = null;   // 'cone'|'bucket'|'football'|'digger'|'wallnut'|'tallnut'|'bobsled'
    this.bodyHealth = 270;
    this.helmHealth = 0;
    this.helmMaxHealth = 0;
    this.shieldType = null; // 'door'|'newspaper'|'ladder'
    this.shieldHealth = 0;
    this.shieldMaxHealth = 0;
    this.flyingHealth = 0;
    this.flyingMaxHealth = 0;
    this.groanCounter = 300 + Math.floor(Math.random() * 101);
    this.zombieAge = 0;
    this.targetCol = -1;
    this.phase = PH.NORMAL;
    this.height = 0; void this.height; // 占位防覆盖
    this.zombieHeight = H.NORMAL;
    this.phaseCounter = 0;
    this.hitUmbrella = false;
    this.droppedLoot = false;
    this.playingSong = false;
    this.zombieFade = -1;
    this.flatTires = false;
    this.scaleZombie = 1;
    this.useLadderCol = -1;
    this.altitude = 0;
    this.mowedReanim = null;
    this.dead = false;
    this.relatedZombie = null;
    this.followerZombies = [null, null, null, null];
    this.summonCounter = 0;
    this.bossMode = 0;
    this.targetRow = -1;
    this.bodyReanim = null;
    this.specialHeadReanim = null;
    this.flagReanim = null;
    this.zombieRect = rect(36, 0, 42, 115);
    this.zombieAttackRect = rect(50, 0, 20, 115);
    this.targetPlant = null;
    this.lastPortalX = -1;
    this.renderOrder = 0;
    // 1-5保龄球: 砸扁判定矩形
    this.pickRandomSpeed();

    if (this.isOnBoard && b.isFlagWave && b.isFlagWave(this.fromWave)) {
      this.posX += 40;
    }

    let renderLayer = 303000; // RENDER_LAYER_ZOMBIE
    let renderOffset = 4;

    if (this.def.reanim) this.loadReanim(this.def.reanim);

    switch (this.type) {
      case 'NORMAL': case 'DUCKY':
        this.loadPlainZombieReanim();
        break;
      case 'CONE':
        this.loadPlainZombieReanim();
        this.reanimShowPrefix('anim_cone', RG.NORMAL);
        this.reanimShowPrefix('anim_hair', RG.HIDDEN);
        this.helmType = 'cone'; this.helmHealth = 370;
        break;
      case 'BUCKET':
        this.loadPlainZombieReanim();
        this.reanimShowPrefix('anim_bucket', RG.NORMAL);
        this.reanimShowPrefix('anim_hair', RG.HIDDEN);
        this.helmType = 'bucket'; this.helmHealth = 1100;
        break;
      case 'DOOR':
        this.shieldType = 'door'; this.shieldHealth = 1100;
        this.loadPlainZombieReanim();
        this.attachShield();
        break;
      case 'YETI':
        this.bodyHealth = 1350;
        this.phaseCounter = 1500 + Math.floor(Math.random() * 501);
        this.hasObject = true;
        this.zombieAttackRect = rect(20, 0, 50, 115);
        break;
      case 'LADDER':
        this.bodyHealth = 500;
        this.shieldHealth = 500;
        this.shieldType = 'ladder';
        this.zombieAttackRect = rect(10, 0, 50, 115);
        if (this.isOnBoard) { this.phase = PH.LADDER_CARRYING; this.startWalkAnim(0); }
        this.attachShield();
        break;
      case 'BUNGEE': {
        this.bodyHealth = 450;
        this.altitude = BUNGEE_ZOMBIE_HEIGHT + Math.floor(Math.random() * 151);
        this.velX = 0;
        if (this.isOnBoard) {
          this.pickBungeeTarget(-1);
          if (this.dead) return;
          this.phase = PH.BUNGEE_DIVING;
        } else {
          this.phase = PH.BUNGEE_CUTSCENE;
          this.phaseCounter = Math.floor(Math.random() * 201);
        }
        this.playZombieReanim('anim_drop', RE.LOOP, 0, 24);
        const r = this.bodyReanim;
        r.assignRenderGroupToPrefix('Zombie_bungi_rightarm_lower2', RG.ARMS);
        r.assignRenderGroupToPrefix('Zombie_bungi_rightarm_hand2', RG.ARMS);
        r.assignRenderGroupToPrefix('Zombie_bungi_leftarm_lower2', RG.ARMS);
        r.assignRenderGroupToPrefix('Zombie_bungi_leftarm_hand2', RG.ARMS);
        r.setTruncateDisappearingFrames(null, false);
        renderLayer = 301000; renderOffset = 7;
        this.zombieRect = rect(-20, 22, 110, 94);
        this.zombieAttackRect = rect(0, 0, 0, 0);
        this.variant = false;
        break;
      }
      case 'FOOTBALL':
        this.zombieRect = rect(50, 0, 57, 115);
        this.reanimShowPrefix('anim_hair', RG.HIDDEN);
        this.helmType = 'football'; this.helmHealth = 1400;
        this.variant = false;
        break;
      case 'DIGGER': {
        this.helmType = 'digger'; this.helmHealth = 100;
        this.variant = false;
        this.hasObject = true;
        this.zombieRect = rect(50, 0, 28, 115);
        this.bodyReanim.setTruncateDisappearingFrames(null, false);
        if (!this.isOnBoard) {
          this.phase = PH.DIGGER_CUTSCENE;
        } else {
          this.phase = PH.DIGGER_TUNNELING;
          renderOffset = 7;
          this.playZombieReanim('anim_dig', RE.LOOP_FULL_LAST, 0, 12);
          this.pickRandomSpeed();
        }
        break;
      }
      case 'POLEVAULTER':
        this.bodyHealth = 500;
        this.phase = PH.POLEVAULTER_PRE_VAULT;
        this.hasObject = true;
        this.variant = false;
        this.posX = 870 + Math.random() * 10;
        if (this.isOnBoard) { this.playZombieReanim('anim_run', RE.LOOP, 0, 0); this.pickRandomSpeed(); }
        this.zombieAttackRect = rect(-29, 0, 70, 115);
        break;
      case 'DOLPHIN':
        this.bodyHealth = 500;
        this.phase = PH.DOLPHIN_WALKING;
        this.variant = false;
        if (this.isOnBoard) { this.playZombieReanim('anim_walkdolphin', RE.LOOP, 0, 0); this.pickRandomSpeed(); }
        this.setupWaterTrack('zombie_dolphinrider_whitewater');
        this.setupWaterTrack('zombie_dolphinrider_dolphininwater');
        break;
      case 'GARGANTUAR': case 'REDEYE': {
        this.width = 180; this.height = 180;
        this.bodyHealth = 3000;
        this.posX = 845 + Math.random() * 10;
        this.zombieRect = rect(-17, -38, 125, 154);
        this.zombieAttackRect = rect(-30, -38, 89, 154);
        this.variant = false;
        renderOffset = 8;
        this.hasObject = true;
        const poleHit = Math.random() * 100;
        let poleVariant = (!this.isOnBoard || b.level === 48) ? 0 : poleHit < 10 ? 2 : poleHit < 35 ? 1 : 0;
        if (poleVariant === 2) this.bodyReanim.setImageOverride('Zombie_gargantuar_telephonepole', 'images/zombie_gargantuar_zombie.png');
        else if (poleVariant === 1) this.bodyReanim.setImageOverride('Zombie_gargantuar_telephonepole', 'images/zombie_gargantuar_duckxing.png');
        if (this.type === 'REDEYE') {
          this.bodyReanim.setImageOverride('anim_head1', 'images/zombie_gargantuar_head_redeye.png');
          this.bodyHealth = 6000;
        }
        break;
      }
      case 'ZAMBONI':
        this.bodyHealth = 1350;
        this.posX = 800 + Math.random() * 10;
        renderOffset = 8;
        this.playZombieReanim('anim_drive', RE.LOOP, 0, 12);
        this.zombieRect = rect(0, -13, 153, 140);
        this.zombieAttackRect = rect(10, -13, 133, 140);
        this.variant = false;
        break;
      case 'CATAPULT':
        this.bodyHealth = 850;
        this.posX = 825 + Math.random() * 10;
        this.summonCounter = 20;
        if (this.isOnBoard) this.playZombieReanim('anim_walk', RE.LOOP, 0, 5.5);
        else this.playZombieReanim('anim_idle', RE.LOOP, 0, 8);
        this.zombieRect = rect(0, -13, 153, 140);
        this.zombieAttackRect = rect(10, -13, 133, 140);
        this.variant = false;
        break;
      case 'SNORKEL':
        this.zombieRect = rect(12, 0, 62, 115);
        this.zombieAttackRect = rect(-5, 0, 55, 115);
        this.setupWaterTrack('Zombie_snorkle_whitewater');
        this.setupWaterTrack('Zombie_snorkle_whitewater2');
        this.variant = false;
        this.phase = PH.SNORKEL_WALKING;
        break;
      case 'JACK': {
        this.bodyHealth = 500;
        let dist = 450 + Math.random() * 300;
        if (Math.random() * 20 < 1) dist /= 3;
        this.phaseCounter = Math.floor(dist / Math.max(0.01, this.velX)) * ZOMBIE_LIMP_SPEED_FACTOR;
        this.zombieAttackRect = rect(20, 0, 50, 115);
        if (this.isOnBoard) this.phase = PH.JACK_RUNNING;
        break;
      }
      case 'BOBSLED': {
        renderOffset = 3;
        if (parent) {
          let pos = 0;
          while (pos < 3 && parent.followerZombies[pos]) pos++;
          parent.followerZombies[pos] = this;
          this.relatedZombie = parent;
          this.posX = parent.posX + (pos + 1) * 50;
          if (pos === 0) { renderOffset = 1; this.altitude = 9; }
          else if (pos === 1) { renderOffset = 2; this.altitude = -7; }
          else { renderOffset = 0; this.altitude = 9; }
        } else {
          this.posX = 880;
          this.zombieRect = rect(-50, 0, 275, 115);
          this.helmType = 'bobsled'; this.helmHealth = 300;
          this.altitude = -10;
        }
        this.velX = 0.6;
        this.phase = PH.BOBSLED_SLIDING;
        this.phaseCounter = 500;
        this.variant = false;
        if (this.fromWave === WAVE_CUTSCENE) {
          this.playZombieReanim('anim_jump', RE.PLAY_ONCE_HOLD, 0, 20);
          this.bodyReanim.animTime = 1;
          this.altitude = 18;
        } else if (this.isOnBoard) {
          this.playZombieReanim('anim_push', RE.LOOP, 0, 30);
        }
        break;
      }
      case 'FLAG': {
        this.hasObject = true;
        this.loadPlainZombieReanim();
        const body = this.bodyReanim;
        const flag = this.board.addReanimEffect('Zombie_FlagPole', 0, 0, 15);
        flag.playReanim('Zombie_flag', RE.LOOP, 0, 15);
        this.flagReanim = flag;
        body.attachToTrack('Zombie_flaghand', flag, 0, 0);
        body.frameBasePose = 0;
        this.posX = 800;
        break;
      }
      case 'POGO':
        this.variant = false;
        this.phase = PH.POGO_BOUNCING;
        this.phaseCounter = Math.floor(Math.random() * POGO_BOUNCE_TIME) + 1;
        this.hasObject = true;
        this.bodyHealth = 500;
        this.zombieAttackRect = rect(10, 0, 30, 115);
        this.playZombieReanim('anim_pogo', RE.PLAY_ONCE_HOLD, 0, 40);
        this.bodyReanim.animTime = 1;
        break;
      case 'NEWSPAPER':
        this.zombieAttackRect = rect(20, 0, 50, 115);
        this.phase = PH.NEWSPAPER_READING;
        this.shieldType = 'newspaper'; this.shieldHealth = 150;
        this.variant = false;
        this.attachShield();
        break;
      case 'BALLOON': {
        this.bodyReanim.setTruncateDisappearingFrames(null, false);
        if (this.isOnBoard) {
          this.altitude = 25;
          this.phase = PH.BALLOON_FLYING;
          this.playZombieReanim('anim_idle', RE.LOOP, 0, this.bodyReanim.animRate);
        }
        const prop = this.board.addReanimEffect('Zombie_balloon', 0, 0, 0);
        prop.setFramesForLayer('Propeller');
        prop.loopType = RE.LOOP_FULL_LAST;
        prop.attachToAnotherReanimation(this.bodyReanim, 'hat');
        this.flyingHealth = 20;
        this.zombieRect = rect(36, 30, 42, 115);
        this.zombieAttackRect = rect(20, 30, 50, 115);
        this.variant = false;
        break;
      }
      case 'DANCER':
        this.scaleZombie = 0.8;
        if (!this.isOnBoard) {
          this.playZombieReanim('anim_armraise', RE.LOOP, 0, 12);
        } else {
          this.phase = PH.DANCER_DANCING_IN;
          this.velX = 0.5;
          this.phaseCounter = 300 + Math.floor(Math.random() * 13);
          this.playZombieReanim('anim_moonwalk', RE.LOOP, 0, 24);
        }
        this.bodyHealth = 500;
        this.variant = false;
        break;
      case 'BACKUP':
        this.scaleZombie = 0.8;
        if (!this.isOnBoard) this.playZombieReanim('anim_armraise', RE.LOOP, 0, 12);
        this.phase = PH.DANCER_DANCING_LEFT;
        this.variant = false;
        break;
      case 'IMP':
        if (!this.isOnBoard) this.playZombieReanim('anim_walk', RE.LOOP, 0, 12);
        break;
      case 'BOSS':
        this.posX = 0; this.posY = 0;
        this.zombieRect = rect(700, 80, 90, 430);
        this.zombieAttackRect = rect(0, 0, 0, 0);
        renderLayer = 400000;
        this.bodyHealth = 40000;
        if (this.isOnBoard) {
          this.playZombieReanim('anim_enter', RE.PLAY_ONCE_HOLD, 0, 12);
          this.summonCounter = 500;
          this.phase = PH.BOSS_ENTER;
        } else {
          this.playZombieReanim('anim_head_idle', RE.LOOP, 0, 12);
        }
        break;
    }

    // 小僵尸模式 (Little Trouble)
    if (this.game.littleTrouble && this.isOnBoard) {
      this.scaleZombie = 0.5;
      this.bodyHealth /= 4;
      this.helmHealth /= 4;
      this.shieldHealth /= 4;
      this.flyingHealth /= 4;
    }

    this.updateAnimSpeed();
    if (this.variant) this.reanimShowPrefix('anim_tongue', RG.NORMAL);

    this.bodyMaxHealth = this.bodyHealth;
    this.helmMaxHealth = this.helmHealth;
    this.shieldMaxHealth = this.shieldHealth;
    this.flyingMaxHealth = this.flyingHealth;
    this.dead = false;
    this.x = Math.floor(this.posX);
    this.y = Math.floor(this.posY);
    this.renderOrder = row * 10000 + renderLayer + renderOffset;
    if (this.type !== 'BOSS') {   // 原版: Boss 固定 (0,0), 不按行定位
      this.posY = this.getPosYBasedOnRow(row);
      this.y = Math.floor(this.posY);
    }
    this.updateReanim();
  }

  decideVariant() {
    // 原版: 约25%僵尸有舌头
    return Math.random() < 0.25;
  }

  // ---------------- Reanim 管理 ----------------
  loadReanim(name) {
    const r = this.board.addReanimEffect(name, 0, 0, 0);
    this.bodyReanim = r;
    r.loopType = RE.LOOP;
    r.isAttachment = true;
    if (!this.isOnBoard) {
      if (Math.random() * 4 > 0 && r.animExists('anim_idle2')) {
        r.playReanim('anim_idle2', RE.LOOP, 0, 12 + Math.random() * 12);
      } else if (r.animExists('anim_idle')) {
        r.playReanim('anim_idle', RE.LOOP, 0, 12 + Math.random() * 6);
      }
      r.animTime = Math.random() * 0.99;
    } else {
      this.startWalkAnim(0);
    }
    return r;
  }

  loadPlainZombieReanim() {
    this.zombieAttackRect = rect(20, 0, 50, 115);
    const r = this.bodyReanim;
    if (!r) return;
    this.setupReanimLayers(r, this.type);
    if (this.board.isPoolRow(this.row) && this.fromWave !== WAVE_CUTSCENE) {
      this.reanimShowPrefix('Zombie_duckytube', RG.NORMAL);
      this.setupWaterTrack('Zombie_whitewater');
      this.setupWaterTrack('Zombie_whitewater2');
    }
  }

  static setupDoorArms(r, show) {
    const armGroup = show ? RG.HIDDEN : RG.NORMAL;
    const doorGroup = show ? RG.NORMAL : RG.HIDDEN;
    r.assignRenderGroupToPrefix('Zombie_outerarm_hand', armGroup);
    r.assignRenderGroupToPrefix('Zombie_outerarm_lower', armGroup);
    r.assignRenderGroupToPrefix('Zombie_outerarm_upper', armGroup);
    r.assignRenderGroupToPrefix('anim_innerarm', armGroup);
    r.assignRenderGroupToPrefix('Zombie_outerarm_screendoor', doorGroup);
    r.assignRenderGroupToPrefix('Zombie_innerarm_screendoor', doorGroup);
    r.assignRenderGroupToPrefix('Zombie_innerarm_screendoor_hand', doorGroup);
  }

  setupReanimLayers(r, type) {
    r.assignRenderGroupToPrefix('anim_cone', RG.HIDDEN);
    r.assignRenderGroupToPrefix('anim_bucket', RG.HIDDEN);
    r.assignRenderGroupToPrefix('anim_screendoor', RG.HIDDEN);
    r.assignRenderGroupToPrefix('Zombie_flaghand', RG.HIDDEN);
    r.assignRenderGroupToPrefix('Zombie_duckytube', RG.HIDDEN);
    r.assignRenderGroupToPrefix('anim_tongue', RG.HIDDEN);
    r.assignRenderGroupToPrefix('Zombie_mustache', RG.HIDDEN);
    Zombie.setupDoorArms(r, false);
    if (type === 'CONE') {
      r.assignRenderGroupToPrefix('anim_cone', RG.NORMAL);
      r.assignRenderGroupToPrefix('anim_hair', RG.HIDDEN);
    } else if (type === 'BUCKET') {
      r.assignRenderGroupToPrefix('anim_bucket', RG.NORMAL);
      r.assignRenderGroupToPrefix('anim_hair', RG.HIDDEN);
    } else if (type === 'DOOR') {
      Zombie.setupDoorArms(r, true);
    } else if (type === 'NEWSPAPER') {
      r.assignRenderGroupToPrefix('Zombie_paper_paper', RG.HIDDEN);
    } else if (type === 'FLAG') {
      r.assignRenderGroupToPrefix('anim_innerarm', RG.HIDDEN);
      r.assignRenderGroupToTrack('Zombie_flaghand', RG.NORMAL);
      r.assignRenderGroupToTrack('Zombie_innerarm_screendoor', RG.NORMAL);
    } else if (type === 'DUCKY') {
      r.assignRenderGroupToPrefix('Zombie_duckytube', RG.NORMAL);
    }
  }

  showDoorArms(show) {
    const r = this.bodyReanim;
    if (!r) return;
    Zombie.setupDoorArms(r, show);
    if (!this.hasArm) {
      this.reanimShowPrefix('Zombie_outerarm_lower', RG.HIDDEN);
      this.reanimShowPrefix('Zombie_outerarm_hand', RG.HIDDEN);
    }
  }

  reanimShowPrefix(prefix, group) {
    if (this.bodyReanim) this.bodyReanim.assignRenderGroupToPrefix(prefix, group);
  }
  reanimShowTrack(name, group) {
    if (this.bodyReanim) this.bodyReanim.assignRenderGroupToTrack(name, group);
  }

  setupWaterTrack(trackName) {
    // 原版: 分配水花轨道到 ARMS 组后绘制为水波 (带ignoreClipRect)
    if (!this.bodyReanim) return;
    this.bodyReanim.assignRenderGroupToTrack(trackName, RG.SHIELD);
  }

  playZombieReanim(anim, loopType, blendTime, rate) {
    const r = this.bodyReanim;
    if (!r) return;
    if (blendTime > 0) r.startBlend(blendTime);
    if (rate !== 0) {
      r.animRate = rate;
      this.originalAnimRate = rate;   // 原版: PlayZombieReanim 记录 mOriginalAnimRate
    }
    r.loopType = loopType;
    r.loopCount = 0;
    r.setFramesForLayer(anim);
  }

  // ---------------- 速度 ----------------
  pickRandomSpeed() {
    if (this.phase === PH.SNORKEL_WALKING_IN_POOL) {
      this.velX = 0.3;
    } else if (this.phase === PH.DIGGER_WALKING) {
      this.velX = 0.12;
    } else if (this.type === 'IMP') {
      this.velX = 0.9;
    } else if (this.phase === PH.YETI_RUNNING) {
      this.velX = 0.8;
    } else if (this.type === 'YETI') {
      this.velX = 0.4;
    } else if (this.type === 'DANCER' || this.type === 'BACKUP' || this.type === 'POGO' || this.type === 'FLAG') {
      this.velX = 0.45;
    } else if (this.phase === PH.DIGGER_TUNNELING || this.phase === PH.POLEVAULTER_PRE_VAULT || this.type === 'FOOTBALL' || this.type === 'SNORKEL' || this.type === 'JACK') {
      this.velX = 0.66 + Math.random() * 0.02;
    } else if (this.phase === PH.LADDER_CARRYING || this.type === 'SQUASH_HEAD') {
      this.velX = 0.79 + Math.random() * 0.02;
    } else if (this.phase === PH.NEWSPAPER_MAD || this.phase === PH.DOLPHIN_WALKING || this.phase === PH.DOLPHIN_WALKING_WITHOUT_DOLPHIN) {
      this.velX = 0.89 + Math.random() * 0.02;
    } else {
      this.velX = 0.23 + Math.random() * 0.14;
    }
    this.updateAnimSpeed();
  }

  setAnimRate(rate) { this.originalAnimRate = rate; this.applyAnimRate(rate); }
  applyAnimRate(rate) {
    if (this.bodyReanim) this.bodyReanim.animRate = this.isMovingAtChilledSpeed ? rate * 0.5 : rate;
  }
  get isMovingAtChilledSpeed() {
    return this.chilledCounter > 0 && this.iceTrapCounter === 0;
  }
  updateAnimSpeed() {
    if (!this.isOnBoard) return;
    const r = this.bodyReanim;
    if (!r) return;
    if (this.isImmobilized || (this.yuckyFace && this.yuckyFaceCounter < 170)) {
      this.applyAnimRate(0); return;
    }
    if (this.phase === PH.SNORKEL_UP_TO_EAT || this.phase === PH.SNORKEL_DOWN_FROM_EAT || this.isDeadOrDying) {
      this.applyAnimRate(this.originalAnimRate || 0); return;
    }
    if (this.isEating) {
      if (this.type === 'POLEVAULTER' || this.type === 'BALLOON' || this.type === 'IMP' || this.type === 'DIGGER' || this.type === 'JACK' || this.type === 'SNORKEL' || this.type === 'YETI') {
        this.applyAnimRate(20);
      } else {
        this.applyAnimRate(36);
      }
    } else {
      if (this.zombieNotWalking || this.isBobsledTeamWithSled || this.type === 'CATAPULT' || this.phase === PH.DOLPHIN_RIDING || this.phase === PH.SNORKEL_WALKING_IN_POOL) {
        this.applyAnimRate(this.originalAnimRate || 0);
      } else if (r.trackExists('_ground')) {
        const d = r.def;
        const ti = r.trackIndex('_ground');
        const F = d.tracks[ti].F;
        const i0 = r.frameStart, i1 = r.frameStart + r.frameCount - 1;
        const distance = F[i1 * 8] - F[i0 * 8];
        if (distance >= 1e-6) {
          const oneOverSpeed = r.frameCount / distance;
          const animRate = this.velX * oneOverSpeed * 47 / this.scaleZombie;
          this.applyAnimRate(animRate);
        }
      }
    }
  }

  // StartWalkAnim (原版: 按相位/泳池/舞蹈模式选行走动画)
  startWalkAnim(blendTime) {
    const r = this.bodyReanim;
    if (!r) return;
    this.pickRandomSpeed();
    if (this.phase === PH.LADDER_CARRYING) {
      this.playZombieReanim('anim_ladderwalk', RE.LOOP, blendTime, 0);
    } else if (this.phase === PH.NEWSPAPER_MAD) {
      this.playZombieReanim('anim_walk_nopaper', RE.LOOP, blendTime, 0);
    } else if (this.inPool && this.zombieHeight !== H.IN_TO_POOL && this.zombieHeight !== H.OUT_OF_POOL && r.animExists('anim_swim')) {
      this.playZombieReanim('anim_swim', RE.LOOP, blendTime, 0);
    } else {
      let walkVariant = Math.random() * 2 | 0;
      if (this.type === 'PEA_HEAD' || this.type === 'FLAG') walkVariant = 0;
      if (walkVariant === 0 && r.animExists('anim_walk2')) {
        this.playZombieReanim('anim_walk2', RE.LOOP, blendTime, 0);
      } else if (r.animExists('anim_walk')) {
        this.playZombieReanim('anim_walk', RE.LOOP, blendTime, 0);
      }
    }
  }

  get zombieNotWalking() {
    switch (this.phase) {
      case PH.BUNGEE_DIVING: case PH.BUNGEE_DIVING_SCREAMING: case PH.BUNGEE_AT_BOTTOM:
      case PH.BUNGEE_GRABBING: case PH.BUNGEE_RISING: case PH.BUNGEE_HIT_OUCHY: case PH.BUNGEE_CUTSCENE:
      case PH.DIGGER_RISING: case PH.DIGGER_RISE_WITHOUT_AXE: case PH.DIGGER_STUNNED:
      case PH.DIGGER_TUNNELING_PAUSE_WITHOUT_AXE:
      case PH.DANCER_RISING: case PH.DANCER_SNAPPING_FINGERS: case PH.DANCER_SNAPPING_FINGERS_WITH_LIGHT:
      case PH.DANCER_SNAPPING_FINGERS_HOLD: case PH.DANCER_RAISE_LEFT_1: case PH.DANCER_RAISE_LEFT_2:
      case PH.GARGANTUAR_SMASHING: case PH.GARGANTUAR_THROWING:
      case PH.POGO_BOUNCING: case PH.POGO_HIGH_BOUNCE_1: case PH.POGO_HIGH_BOUNCE_2: case PH.POGO_HIGH_BOUNCE_3:
      case PH.POGO_HIGH_BOUNCE_4: case PH.POGO_HIGH_BOUNCE_5: case PH.POGO_HIGH_BOUNCE_6:
      case PH.IMP_GETTING_THROWN: case PH.IMP_LANDING:
      case PH.LADDER_PLACING:
      case PH.BOBSLED_CRASHING:
      case PH.BOSS_ENTER: case PH.BOSS_IDLE: case PH.BOSS_SPAWNING: case PH.BOSS_STOMPING:
      case PH.BOSS_BUNGEES_ENTER: case PH.BOSS_BUNGEES_DROP: case PH.BOSS_BUNGEES_LEAVE:
      case PH.BOSS_DROP_RV: case PH.BOSS_HEAD_ENTER: case PH.BOSS_HEAD_IDLE_BEFORE_SPIT:
      case PH.BOSS_HEAD_IDLE_AFTER_SPIT: case PH.BOSS_HEAD_SPIT: case PH.BOSS_HEAD_LEAVE:
        return true;
      default:
        return false;
    }
  }

  get isWalkingBackwards() {
    if (this.mindControlled && !this.isEating) return true;
    if (this.phase === PH.DIGGER_WALKING || this.phase === PH.DIGGER_WALKING_WITHOUT_AXE) return true;
    return false;
  }

  get isBouncingPogo() {
    if (this.type !== 'POGO') return false;
    if (this.phase === PH.POGO_FORWARD_BOUNCE_2 || this.phase === PH.POGO_FORWARD_BOUNCE_7) return false;
    return this.phase >= PH.POGO_BOUNCING && this.phase <= PH.POGO_HIGH_BOUNCE_6;
  }

  get isBobsledTeamWithSled() {
    if (this.type !== 'BOBSLED') return false;
    if (this.relatedZombie) {
      const leader = this.relatedZombie;
      return leader.type === 'BOBSLED' && leader.phase !== PH.BOBSLED_CRASHING && !leader.dead;
    }
    return this.phase !== PH.BOBSLED_CRASHING && this.phase !== PH.ZOMBIE_NORMAL && this.phase !== PH.NORMAL;
  }

  get isFlying() {
    return this.phase === PH.BALLOON_FLYING || this.phase === PH.DIGGER_TUNNELING || this.phase === PH.IMP_GETTING_THROWN || this.phase === PH.BUNGEE_DIVING || this.phase === PH.BUNGEE_DIVING_SCREAMING || this.phase === PH.BUNGEE_RISING;
  }

  get isImmobilized() { return this.iceTrapCounter > 0 || this.butteredCounter > 0; }
  get isDeadOrDying() { return this.phase === PH.DYING || this.phase === PH.BURNED || this.phase === PH.MOWERED; }

  get hittable() {
    if (this.dead || this.isDeadOrDying) return false;
    if (this.type === 'BUNGEE' && this.phase !== PH.BUNGEE_AT_BOTTOM && this.phase !== PH.BUNGEE_GRABBING) return false;
    if (this.zombieHeight === H.GETTING_BUNGEE_DROPPED) return false;
    if (this.type === 'DIGGER' && this.phase === PH.DIGGER_TUNNELING) return false;
    return true;
  }

  // ---------------- 位置 ----------------
  getPosYBasedOnRow(row) {
    if (!this.isOnBoard) return 0;
    let posY = this.board.getPosYBasedOnRow(this.posX + 40, row) - 30;
    if (this.type === 'BALLOON') posY -= 30;
    else if (this.type === 'POGO') posY -= 16;
    return posY;
  }
  setRow(row) { this.row = row; }

  hitX() { return this.x + 40; } // 攻击矩形中心X (兼容API)

  // ---------------- 主更新 (1 tick = 10ms) ----------------
  update() {
    if (this.dead) return;
    this.zombieAge++;
    let doUpdate = false;
    if (this.board.state === 'playing' || !this.isOnBoard || this.fromWave === WAVE_WINNER) doUpdate = true;
    if (this.board.game.cutsceneRunning && this.type === 'BOSS') doUpdate = true;
    else if (this.board.game.cutsceneRunning) doUpdate = false;
    if (!doUpdate) return;

    if (this.phase === PH.BURNED) {
      this.updateBurn();
    } else if (this.phase === PH.MOWERED) {
      this.updateMowered();
    } else if (this.phase === PH.DYING) {
      this.updateDeath();
      this.updateZombieWalking();
    } else {
      if (this.phaseCounter > 0 && !this.isImmobilized) this.phaseCounter--;
      if (this.board.state === 'lose') {
        // 僵尸胜利进屋
        this.updateZombieChimney();
        this.updateZombieWalking();
      } else if (this.isOnBoard) {
        this.updatePlaying();
      }
      if (this.type === 'BUNGEE') this.updateZombieBungee();
      if (this.type === 'POGO') this.updateZombiePogo();
      // Animate (mFrame 驱动 — 由reanim取代, 仅保留年龄计数)
    }

    if (this.justGotShotCounter > 0) this.justGotShotCounter--;
    if (this.shieldJustGotShotCounter > 0) this.shieldJustGotShotCounter--;
    if (this.shieldRecoilCounter > 0) this.shieldRecoilCounter--;
    if (this.zombieFade > 0) {
      this.zombieFade--;
      if (this.zombieFade === 0) { this.dieNoLoot(); return; }
    }

    this.x = Math.floor(this.posX);
    this.y = Math.floor(this.posY);
    this.updateReanim();
  }

  updatePlaying() {
    // 呻吟
    this.groanCounter--;
    if (this.groanCounter === 0 && Math.random() * Math.max(1, this.board.zombies.length) < 1 && this.hasHead && this.type !== 'BOSS') {
      this.board.game.audio.play('groan');
      this.groanCounter = 500 + Math.floor(Math.random() * 500);
    }
    if (this.iceTrapCounter > 0) {
      this.iceTrapCounter--;
      if (this.iceTrapCounter === 0) this.removeIceTrap();
    }
    if (this.chilledCounter > 0) {
      this.chilledCounter--;
      if (this.chilledCounter === 0) this.updateAnimSpeed();
    }
    if (this.butteredCounter > 0) {
      this.butteredCounter--;
      if (this.butteredCounter === 0) this.removeButter();
    }

    if (this.phase === PH.RISING_FROM_GRAVE) {
      this.updateZombieRiseFromGrave();
      return;
    }

    if (!this.isImmobilized) {
      this.updateActions();
      this.updateZombiePosition();
      this.checkIfPreyCaught();
      this.checkForPool();
      this.checkForHighGround();
      this.checkForBoardEdge();
    }

    if (this.type === 'BOSS') this.updateBoss();

    // 无头流血衰减
    if (!this.isDeadOrDying && this.fromWave !== WAVE_WINNER) {
      let isDying = !this.hasHead;
      if (this.type === 'ZAMBONI' || this.type === 'CATAPULT') {
        if (this.bodyHealth < 200) isDying = true;
      }
      if (isDying) {
        let dmg = 1;
        if (this.type === 'YETI') dmg = 10;
        if (this.bodyMaxHealth >= 500) dmg = 3;
        if (Math.random() * 5 < 1) this.takeDamage(dmg, DMG_SYS);
      }
    }
  }

  updateActions() {
    if (this.zombieHeight === H.UP_LADDER) this.updateClimbingLadder();
    if (this.zombieHeight === H.OUT_OF_POOL || this.zombieHeight === H.IN_TO_POOL || this.inPool) this.updateZombiePool();
    if (this.zombieHeight === H.UP_TO_HIGH_GROUND || this.zombieHeight === H.DOWN_OFF_HIGH_GROUND) this.updateZombieHighGround();
    if (this.zombieHeight === H.FALLING) this.updateZombieFalling();
    if (this.zombieHeight === H.IN_TO_CHIMNEY) this.updateZombieChimney();

    if (this.type === 'POLEVAULTER') this.updateZombiePolevaulter();
    if (this.type === 'CATAPULT') this.updateZombieCatapult();
    if (this.type === 'DOLPHIN') this.updateZombieDolphinRider();
    if (this.type === 'SNORKEL') this.updateZombieSnorkel();
    if (this.type === 'BALLOON') this.updateZombieFlyer();
    if (this.type === 'NEWSPAPER') this.updateZombieNewspaper();
    if (this.type === 'DIGGER') this.updateZombieDigger();
    if (this.type === 'JACK') this.updateZombieJackInTheBox();
    if (this.type === 'GARGANTUAR' || this.type === 'REDEYE') this.updateZombieGargantuar();
    if (this.type === 'BOBSLED') this.updateZombieBobsled();
    if (this.type === 'ZAMBONI') this.updateZamboni();
    if (this.type === 'LADDER') this.updateLadder();
    if (this.type === 'YETI') this.updateYeti();
    if (this.type === 'DANCER') this.updateZombieDancer();
    if (this.type === 'BACKUP') this.updateZombieBackupDancer();
    if (this.type === 'IMP') this.updateZombieImp();
  }

  updateZombiePosition() {
    if (this.type === 'BUNGEE' || this.type === 'BOSS' || this.phase === PH.RISING_FROM_GRAVE) return;
    this.updateZombieWalking();
    // 巨人/冰车/投石 践踏
    if ((this.type === 'ZAMBONI' || this.type === 'CATAPULT') && !this.flatTires) {
      this.checkSquish('drive_over');
    }
    if (this.blowingAway) {
      this.posX += 10;
      if (this.x > 850) { this.dieWithLoot(); return; }
    }
    if (this.zombieHeight === H.NORMAL) {
      const desiredY = this.getPosYBasedOnRow(this.row);
      if (this.posY < desiredY) this.posY += Math.min(desiredY - this.posY, 1);
      else if (this.posY > desiredY) this.posY -= Math.min(this.posY - desiredY, 1);
    }
  }

  updateZombieWalking() {
    if (this.zombieNotWalking) return;
    const r = this.bodyReanim;
    if (r) {
      let speed;
      if (this.isBouncingPogo || this.phase === PH.BALLOON_FLYING || this.phase === PH.DOLPHIN_RIDING || this.phase === PH.SNORKEL_WALKING_IN_POOL || this.type === 'CATAPULT') {
        speed = this.velX;
        if (this.isMovingAtChilledSpeed) speed *= CHILLED_SPEED_FACTOR;
      } else if (this.type === 'ZAMBONI' || this.phase === PH.DIGGER_TUNNELING || this.phase === PH.DOLPHIN_IN_JUMP || this.isBobsledTeamWithSled || this.phase === PH.POLEVAULTER_IN_VAULT || this.phase === PH.SNORKEL_INTO_POOL) {
        speed = this.velX;
      } else if (r.trackExists('_ground')) {
        speed = r.getTrackVelocity('_ground') * this.scaleZombie;
      } else {
        speed = this.velX;
        if (this.isMovingAtChilledSpeed) speed *= CHILLED_SPEED_FACTOR;
      }
      if (this.isWalkingBackwards || this.phase === PH.DANCER_DANCING_IN) this.posX += speed;
      else this.posX -= speed;
    } else {
      let doWalk = false;
      if (this.phase === PH.POLEVAULTER_IN_VAULT || this.phase === PH.DIGGER_TUNNELING || this.type === 'DANCER' || this.type === 'BACKUP' || this.type === 'BOBSLED' || this.type === 'POGO' || this.type === 'DOLPHIN' || this.type === 'BALLOON') doWalk = true;
      else if (this.type === 'SNORKEL' && this.inPool) doWalk = true;
      if (doWalk) {
        let speed = this.velX;
        if (this.isMovingAtChilledSpeed) speed *= CHILLED_SPEED_FACTOR;
        if (this.isWalkingBackwards) this.posX += speed;
        else this.posX -= speed;
      }
    }
  }

  // ---------------- 捕食 ----------------
  checkIfPreyCaught() {
    if (this.type === 'BUNGEE' || this.type === 'GARGANTUAR' || this.type === 'REDEYE' || this.type === 'ZAMBONI' || this.type === 'CATAPULT' || this.type === 'BOSS' ||
      this.isBouncingPogo || this.isBobsledTeamWithSled ||
      this.phase === PH.POLEVAULTER_IN_VAULT || this.phase === PH.POLEVAULTER_PRE_VAULT ||
      this.phase === PH.NEWSPAPER_MADDENING ||
      this.phase === PH.DIGGER_RISING || this.phase === PH.DIGGER_TUNNELING_PAUSE_WITHOUT_AXE ||
      this.phase === PH.DIGGER_RISE_WITHOUT_AXE || this.phase === PH.DIGGER_STUNNED ||
      this.phase === PH.RISING_FROM_GRAVE || this.phase === PH.IMP_GETTING_THROWN || this.phase === PH.IMP_LANDING ||
      this.phase === PH.DANCER_RISING || this.phase === PH.DANCER_SNAPPING_FINGERS || this.phase === PH.DANCER_SNAPPING_FINGERS_WITH_LIGHT || this.phase === PH.DANCER_SNAPPING_FINGERS_HOLD ||
      this.phase === PH.DOLPHIN_WALKING || this.phase === PH.DOLPHIN_WALKING_WITHOUT_DOLPHIN || this.phase === PH.DOLPHIN_INTO_POOL || this.phase === PH.DOLPHIN_RIDING || this.phase === PH.DOLPHIN_IN_JUMP ||
      this.phase === PH.SNORKEL_INTO_POOL || this.phase === PH.SNORKEL_WALKING ||
      this.phase === PH.LADDER_PLACING ||
      this.zombieHeight === H.GETTING_BUNGEE_DROPPED || this.zombieHeight === H.UP_LADDER ||
      this.zombieHeight === H.IN_TO_POOL || this.zombieHeight === H.OUT_OF_POOL ||
      this.zombieHeight === H.FALLING || !this.hasHead || this.isFlying) return;

    let ticksBetweenEats = TICKS_BETWEEN_EATS;
    if (this.chilledCounter > 0) ticksBetweenEats *= 2;
    if (this.zombieAge % ticksBetweenEats !== 0) return;

    const zt = this.findZombieTarget();
    if (zt) { this.eatZombie(zt); return; }
    if (!this.mindControlled) {
      const pt = this.findPlantTarget('chew');
      if (pt) { this.eatPlant(pt); return; }
    }
    if (this.isEating) this.stopEating();
  }

  findPlantTarget(attackType) {
    const ar = this.getZombieAttackRect();
    let best = null;
    for (const p of this.board.plants) {
      if (p.dead) continue;
      if (p.row === this.row) {
        const pr = p.getPlantRect();
        if (rectOverlap(ar, pr) >= 20 && this.canTargetPlant(p, attackType)) return p;
      }
    }
    return best;
  }

  canTargetPlant(p, attackType) {
    if (p.notOnGround || p.type === 'TANGLEKELP') return false;
    if (!this.inPool && this.board.isPoolSquare(p.col, p.row)) return false;
    if (this.phase === PH.DIGGER_TUNNELING) {
      return p.type === 'POTATOMINE' && p.state === 'notready';
    }
    if (p.isSpiky) {
      return this.type === 'GARGANTUAR' || this.type === 'REDEYE' || this.type === 'ZAMBONI' ||
        this.board.isPoolSquare(p.col, p.row) || this.board.getFlowerPotAt(p.col, p.row);
    }
    if (attackType === 'drive_over') {
      if (p.type === 'CHERRYBOMB' || p.type === 'JALAPENO' || p.type === 'BLOVER' || p.type === 'SQUASH') return false;
      if (p.type === 'DOOMSHROOM' || p.type === 'ICESHROOM') return p.isAsleep;
    }
    if (this.phase === PH.LADDER_CARRYING || this.phase === PH.LADDER_PLACING) {
      let placeLadder = false;
      if (p.type === 'WALLNUT' || p.type === 'TALLNUT' || p.type === 'PUMPKIN') placeLadder = true;
      if (this.board.getLadderAt(p.col, p.row)) placeLadder = false;
      if ((attackType === 'chew' && placeLadder) || (attackType === 'ladder' && !placeLadder)) return false;
    }
    if (attackType === 'chew') {
      const top = this.board.getTopPlantAt(p.col, p.row, 'eating');
      if (top !== p && top && this.canTargetPlant(top, attackType)) return false;
    }
    if (attackType === 'vault') {
      const top = this.board.getTopPlantAt(p.col, p.row, 'normal');
      if (top !== p && top && this.canTargetPlant(top, attackType)) return false;
    }
    return true;
  }

  findZombieTarget() {
    if (this.phase === PH.DIGGER_TUNNELING) return null;
    const ar = this.getZombieAttackRect();
    for (const z of this.board.zombies) {
      if (z.dead) continue;
      if (this.mindControlled !== z.mindControlled && !z.isFlying &&
        z.phase !== PH.DIGGER_TUNNELING && z.phase !== PH.BUNGEE_DIVING && z.phase !== PH.BUNGEE_DIVING_SCREAMING && z.phase !== PH.BUNGEE_RISING &&
        z.zombieHeight !== H.GETTING_BUNGEE_DROPPED && !z.isDeadOrDying && z.row === this.row) {
        const zr = z.getZombieRect();
        const ov = rectOverlap(ar, zr);
        if (ov >= 20 || (ov >= 0 && z.isEating)) return z;
      }
    }
    return null;
  }

  eatPlant(p) {
    if (this.phase === PH.DANCER_DANCING_IN) { this.phaseCounter = 1; return; }
    if (this.yuckyFace) return;
    // 梯子越过
    if (this.board.getLadderAt(p.col, p.row) && this.type !== 'DIGGER') {
      this.stopEating();
      if (this.zombieHeight === H.NORMAL && this.useLadderCol !== p.col) {
        this.zombieHeight = H.UP_LADDER;
        this.useLadderCol = p.col;
      }
      return;
    }
    this.startEating();
    // 免啃植物
    if (p.type === 'JALAPENO' || p.type === 'CHERRYBOMB' || p.type === 'DOOMSHROOM' || p.type === 'ICESHROOM' || p.type === 'HYPNOSHROOM' ||
      p.state === 'flowerpot_inv' || p.state === 'lilypad_inv' || p.state === 'squash_look' || p.state === 'squash_pre') {
      if (!p.isAsleep) return;
    }
    if (p.type === 'POTATOMINE' && p.state !== 'notready') return;
    // 即时触发类
    if (p.type === 'BLOVER') { p.doSpecial(); return; }
    if (p.type === 'ICESHROOM' && !p.isAsleep) { p.doSpecial(); return; }
    if (this.chilledCounter > 0 && this.zombieAge % 2 === 1) return;

    // 我不是僵尸: 向日葵每降40血掉1阳光 (原版 Zombie::EatPlant IZombie 分支)
    if (this.board.mode === 'izombie' && p.type === 'SUNFLOWER') {
      const stageBefore = Math.floor(Math.max(0, p.plantHealth) / 40);
      const stageAfter = Math.floor(Math.max(0, p.plantHealth - DAMAGE_PER_EAT) / 40);
      if (stageAfter < stageBefore || p.plantHealth - DAMAGE_PER_EAT <= 0) {
        this.board.addIZombieSun(p.x, p.y);
      }
    }

    p.plantHealth -= DAMAGE_PER_EAT;
    p.recentlyEatenCountdown = 50;
    if (p.plantHealth <= 0) {
      this.board.game.audio.play('gulp');
      this.board.plantsEaten = (this.board.plantsEaten || 0) + 1;
      p.die();
    }
  }

  eatZombie(z) {
    z.takeDamage(DAMAGE_PER_EAT, DMG_SYS);
    this.startEating();
  }

  startEating() {
    if (this.isEating) return;
    this.isEating = true;
    this.playZombieReanim('anim_eat', RE.LOOP, 0, 0);
    this.updateAnimSpeed();
  }
  stopEating() {
    if (!this.isEating) return;
    this.isEating = false;
    if (this.phase === PH.DIGGER_TUNNELING) return;
    if (this.bodyReanim && this.type !== 'SNORKEL') this.startWalkAnim(20);
    if (this.shieldType === 'door') this.showDoorArms(true);
  }

  // ---------------- 泳池/高地/坠落 ----------------
  checkForPool() {
    if (!this.board.zombieTypeCanGoInPool(this.type) || this.isFlying) return;
    if (this.type === 'DOLPHIN' || this.type === 'SNORKEL') return;
    if (this.zombieHeight === H.IN_TO_POOL || this.zombieHeight === H.OUT_OF_POOL) return;
    const isPoolSquare =
      this.board.isPoolSquare(this.board.pixelToGridX(this.x + 75, this.y), this.row) &&
      this.board.isPoolSquare(this.board.pixelToGridX(this.x + 45, this.y), this.row) &&
      this.x < 680;
    if (!this.inPool && isPoolSquare) {
      this.zombieHeight = H.IN_TO_POOL;
      this.inPool = true;
      this.poolSplash(true);
    } else if (this.inPool && !isPoolSquare) {
      this.zombieHeight = H.OUT_OF_POOL;
      this.startWalkAnim(0);
      this.poolSplash(false);
    }
  }

  poolSplash(intoPoolSound) {
    this.board.addReanimEffect('Splash', this.x + 23, this.y + 78, 0).overrideScale(0.8, 0.8);
    this.board.game.audio.play(intoPoolSound ? 'zombiesplash' : 'water');
  }

  updateZombiePool() {
    if (this.zombieHeight === H.IN_TO_POOL) {
      this.altitude -= 4;
      if (this.altitude <= -20) {
        this.altitude = -20;
        this.zombieHeight = H.NORMAL;
        this.startWalkAnim(0);
      }
    } else if (this.zombieHeight === H.OUT_OF_POOL) {
      this.altitude += 2;
      if (this.altitude >= 0) {
        this.altitude = 0;
        this.zombieHeight = H.NORMAL;
        this.inPool = false;
        this.startWalkAnim(0);
      }
    }
  }

  get isOnHighGround() {
    return this.isOnBoard && this.board.isHighGround(this.board.pixelToGridXKeepOnBoard(this.x + 75, this.y), this.row);
  }

  checkForHighGround() {
    if (this.zombieHeight !== H.NORMAL || this.type === 'BUNGEE') return;
    const isHG = this.isOnHighGround;
    if (!this.onHighGround && isHG) {
      this.zombieHeight = H.UP_TO_HIGH_GROUND;
      this.onHighGround = true;
    } else if (this.onHighGround && !isHG) {
      this.zombieHeight = H.DOWN_OFF_HIGH_GROUND;
    }
  }

  updateZombieHighGround() {
    if (this.zombieHeight === H.UP_TO_HIGH_GROUND) {
      this.altitude += 3;
      if (this.altitude >= HIGH_GROUND_HEIGHT) {
        this.altitude = HIGH_GROUND_HEIGHT;
        this.zombieHeight = H.NORMAL;
      }
    } else if (this.zombieHeight === H.DOWN_OFF_HIGH_GROUND) {
      this.altitude -= 3;
      if (this.altitude <= 0) {
        this.altitude = 0;
        this.zombieHeight = H.NORMAL;
        this.onHighGround = false;
      }
    }
  }

  updateZombieFalling() {
    this.velZ -= THOWN_ZOMBIE_GRAVITY;
    this.altitude += this.velZ;
    if (this.altitude <= 0) {
      this.altitude = 0;
      this.velZ = 0;
      this.zombieHeight = H.NORMAL;
      if (this.hasHead) this.startWalkAnim(0);
      else this.playZombieReanim('anim_death', RE.PLAY_ONCE_HOLD, 20, 24);
    }
  }

  updateClimbingLadder() {
    let distOffGround = this.altitude;
    if (this.onHighGround) distOffGround -= HIGH_GROUND_HEIGHT;
    const ladderOriginX = this.board.pixelToGridXKeepOnBoard(this.x + 5 + distOffGround * 0.5, this.y);
    if (!this.board.getLadderAt(ladderOriginX, this.row)) {
      this.zombieHeight = H.FALLING;
      return;
    }
    this.altitude += 0.8;
    if (this.velX < 0.5) this.posX -= 0.5;
    let targetHeight = 90;
    if (this.onHighGround) targetHeight += HIGH_GROUND_HEIGHT;
    if (this.altitude >= targetHeight) this.zombieHeight = H.FALLING;
  }

  updateZombieChimney() {
    // 僵尸进屋动画 (失败过场)
    this.altitude -= 1;
    if (this.altitude <= -240) this.dieNoLoot();
  }

  checkForBoardEdge() {
    if (this.isWalkingBackwards && this.posX > 850) { this.dieNoLoot(); return; }
    let edgeX = -100;
    if (this.type === 'GARGANTUAR' || this.type === 'REDEYE' || this.type === 'POLEVAULTER') edgeX = -150;
    else if (this.type === 'CATAPULT' || this.type === 'FOOTBALL' || this.type === 'ZAMBONI') edgeX = -175;
    else if (this.type === 'BACKUP' || this.type === 'DANCER' || this.type === 'SNORKEL') edgeX = -130;
    if (this.x <= edgeX && this.hasHead) {
      this.board.zombiesWon(this);
    }
    if (this.x <= edgeX + 70 && !this.hasHead) {
      this.takeDamage(1800, DMG_SYS);
    }
  }

  // ---------------- 专项更新 ----------------
  // 原版 Zombie::RiseFromGrave — 从墓碑/水面爬出 (phaseCounter 150tick, altitude -200→0)
  riseFromGrave(col, row, inPool = false) {
    this.posX = this.board.gridToPixelX(col) - 25;
    this.posY = this.getPosYBasedOnRow(row);
    this.row = row;
    this.x = Math.floor(this.posX);
    this.y = Math.floor(this.posY);
    this.renderOrder = row * 10000 + 303000;   // RENDER_LAYER_ZOMBIE (原版 MakeRenderOrder)
    this.phase = PH.RISING_FROM_GRAVE;
    this.phaseCounter = 150;
    this.velX = 0;
    this.altitude = inPool ? -150 : -200;
    this.inPool = !!inPool;
    if (inPool) {
      this.phaseCounter = 50;
      this.zombieHeight = H.NORMAL;
      this.startWalkAnim(0);
      try { this.reanimShowPrefix('Zombie_duckytube', RG.NORMAL); } catch (e) { }
      this.setupWaterTrack('Zombie_whitewater');
      this.setupWaterTrack('Zombie_whitewater2');
      this.splash();
    } else {
      // 泥土粒子 + 音效 (原版 PARTICLE_DIRT_RISE / FOLEY_DIRT_RISE)
      this.board.addEffect('dust', this.posX + 50, this.posY + 100);
      this.board.game.audio.play('dirt_rise');
      try { this.playZombieReanim('anim_idle', RE.LOOP, 8); } catch (e) { }
    }
    this.updateReanim();
  }

  splash() {
    if (!this.board) return;
    this.board.addReanimEffect('Splash', this.x + 23, this.y + 78, 0).overrideScale(0.8, 0.8);
    this.board.game.audio.play('zombiesplash');
  }

  updateZombieRiseFromGrave() {
    // 原版 UpdateZombieRiseFromGrave: phaseCounter 150→0; 后50tick 内 altitude -200→0 (线性)
    if (this.inPool) {
      this.altitude = lerp(-40, -150, Math.min(1, Math.max(0, this.phaseCounter / 50))) * this.scaleZombie;
    } else {
      this.altitude = lerp(0, -200, Math.min(1, Math.max(0, this.phaseCounter / 50)));
    }
    if (this.phaseCounter <= 0) {
      this.altitude = this.isOnHighGround ? HIGH_GROUND_HEIGHT : 0;
      this.phase = PH.NORMAL;
      this.startWalkAnim(0);
    }
  }

  updateZombiePolevaulter() {
    if (this.phase === PH.POLEVAULTER_PRE_VAULT && this.hasHead && this.zombieHeight === H.NORMAL) {
      const p = this.findPlantTarget('vault');
      if (p) {
        if (this.board.getLadderAt(p.col, p.row)) {
          const plantX = this.board.gridToPixelX(p.col) + 40;
          if (plantX > this.posX && this.zombieHeight === H.NORMAL && this.useLadderCol !== p.col) {
            this.zombieHeight = H.UP_LADDER;
            this.useLadderCol = p.col;
          }
          return;
        }
        this.phase = PH.POLEVAULTER_IN_VAULT;
        this.playZombieReanim('anim_jump', RE.PLAY_ONCE_HOLD, 20, 24);
        const r = this.bodyReanim;
        const animDuration = r.frameCount / r.animRate * 100;
        const jumpDistance = this.x - p.x - 80;
        this.velX = jumpDistance / Math.max(1, animDuration);
        this.hasObject = false;
      }
    } else if (this.phase === PH.POLEVAULTER_IN_VAULT) {
      const r = this.bodyReanim;
      let jumpEnds = false;
      if (r.animTime > 0.6 && r.animTime <= 0.7) {
        const p = this.findPlantTarget('vault');
        if (p && p.type === 'TALLNUT') {
          this.board.game.audio.play('bonk');
          jumpEnds = true;
          this.zombieHeight = H.FALLING;
          this.posX = p.x;
          this.posY -= 30;
        }
      }
      if (r.loopCount > 0) { jumpEnds = true; this.posX -= 150; }
      if (jumpEnds) {
        this.x = Math.floor(this.posX);
        this.phase = PH.POLEVAULTER_POST_VAULT;
        this.zombieAttackRect = rect(50, 0, 20, 115);
        this.startWalkAnim(0);
      }
    }
  }

  updateZombieDolphinRider() {
    if (this.isTangleKelpTarget()) return;
    const backwards = this.isWalkingBackwards;
    if (this.phase === PH.DOLPHIN_WALKING && !backwards) {
      if (this.x > 700 && this.x <= 720) {
        this.phase = PH.DOLPHIN_INTO_POOL;
        this.playZombieReanim('anim_jumpinpool', RE.PLAY_ONCE_HOLD, 20, 16);
      }
    } else if (this.phase === PH.DOLPHIN_INTO_POOL) {
      const r = this.bodyReanim;
      if (r.shouldTrigger(0.56)) {
        const s = this.board.addReanimEffect('Splash', this.x - 83, this.y + 73, 0);
        s.overrideScale(1.2, 0.8);
        this.board.game.audio.play('zombieenteringwater');
      }
      if (r.loopCount > 0) {
        this.posX -= 70;
        this.phase = PH.DOLPHIN_RIDING;
        this.inPool = true;
        this.zombieAttackRect = rect(-29, 0, 70, 115);
        this.playZombieReanim('anim_ride', RE.LOOP_FULL_LAST, 0, 12);
      }
    } else if (this.phase === PH.DOLPHIN_RIDING) {
      if (this.x <= 10) {
        this.altitude = -40;
        this.zombieHeight = H.OUT_OF_POOL;
        this.phase = PH.DOLPHIN_WALKING;
        this.poolSplash(false);
        this.playZombieReanim('anim_walkdolphin', RE.LOOP, 0, 0);
        this.pickRandomSpeed();
        return;
      }
      if (this.hasHead && !this.isTangleKelpTarget()) {
        const p = this.findPlantTarget('vault');
        if (p) {
          this.velX = 0.5;
          this.phase = PH.DOLPHIN_IN_JUMP;
          this.phaseCounter = DOLPHIN_JUMP_TIME;
          this.playZombieReanim('anim_dolphinjump', RE.PLAY_ONCE_HOLD, 0, 10);
        }
      }
    } else if (this.phase === PH.DOLPHIN_IN_JUMP) {
      const r = this.bodyReanim;
      this.altitude = lerp(0, 10, this.phaseCounter / DOLPHIN_JUMP_TIME);
      let jumpEnds = false;
      if (r.shouldTrigger(0.3)) {
        const p = this.findPlantTarget('vault');
        if (p && p.type === 'TALLNUT') {
          this.board.game.audio.play('bonk');
          jumpEnds = true;
          this.zombieHeight = H.FALLING;
          this.posX = p.x + 25;
          this.altitude = 30;
        }
      } else if (r.shouldTrigger(0.49)) {
        const s = this.board.addReanimEffect('Splash', this.x - 63, this.y + 73, 0);
        s.overrideScale(1.2, 0.8);
        this.board.game.audio.play('zombieenteringwater');
        this.velX = 0;
      } else if (r.loopCount > 0) {
        jumpEnds = true;
        this.posX -= 94;
        this.altitude = 0;
      }
      if (jumpEnds) {
        this.zombieAttackRect = rect(30, 0, 30, 115);
        this.zombieRect = rect(20, 0, 42, 115);
        this.phase = PH.DOLPHIN_WALKING_IN_POOL;
        this.startWalkAnim(0);
      }
    } else if (this.phase === PH.DOLPHIN_WALKING_IN_POOL) {
      if ((this.x <= 10 && !backwards) || (this.x > 680 && backwards)) {
        this.altitude = -40;
        this.zombieHeight = H.OUT_OF_POOL;
        this.phase = PH.DOLPHIN_WALKING_WITHOUT_DOLPHIN;
        this.poolSplash(false);
        this.playZombieReanim('anim_walk', RE.LOOP, 0, 0);
        this.pickRandomSpeed();
      }
    }
  }

  updateZombieSnorkel() {
    const backwards = this.isWalkingBackwards;
    if (this.phase === PH.SNORKEL_WALKING && !backwards) {
      if (this.x > 700 && this.x <= 720) {
        this.velX = 0.2;
        this.phase = PH.SNORKEL_INTO_POOL;
        this.playZombieReanim('anim_jumpinpool', RE.PLAY_ONCE_HOLD, 20, 16);
      }
    } else if (this.phase === PH.SNORKEL_INTO_POOL) {
      const r = this.bodyReanim;
      this.altitude = lerp(0, 10, r.animTime);
      if (r.shouldTrigger(0.83)) {
        const s = this.board.addReanimEffect('Splash', this.x - 47, this.y + 73, 0);
        s.overrideScale(1.2, 0.8);
        this.board.game.audio.play('zombieenteringwater');
      }
      if (r.loopCount > 0) {
        this.phase = PH.SNORKEL_WALKING_IN_POOL;
        this.inPool = true;
        this.playZombieReanim('anim_swim', RE.LOOP_FULL_LAST, 0, 12);
      }
    } else if (this.phase === PH.SNORKEL_WALKING_IN_POOL) {
      if (!this.hasHead) { this.takeDamage(1800, DMG_SYS); }
      else if (this.x <= 25 && !backwards) {
        this.altitude = -90; this.posX -= 15;
        this.phase = PH.SNORKEL_WALKING; this.zombieHeight = H.OUT_OF_POOL;
        this.poolSplash(false); this.startWalkAnim(0);
      } else if (this.x > 640 && backwards) {
        this.altitude = -90; this.posX += 15;
        this.phase = PH.SNORKEL_WALKING; this.zombieHeight = H.OUT_OF_POOL;
        this.poolSplash(false); this.startWalkAnim(0);
      } else if (this.isEating) {
        this.phase = PH.SNORKEL_UP_TO_EAT;
        this.playZombieReanim('anim_uptoeat', RE.PLAY_ONCE_HOLD, 0, 24);
      }
    } else if (this.phase === PH.SNORKEL_UP_TO_EAT) {
      const r = this.bodyReanim;
      if (!this.isEating) {
        this.phase = PH.SNORKEL_DOWN_FROM_EAT;
        this.playZombieReanim('anim_uptoeat', RE.PLAY_ONCE_HOLD, 0, -24);
      } else if (r.loopCount > 0) {
        this.phase = PH.SNORKEL_EATING_IN_POOL;
        this.playZombieReanim('anim_eat', RE.LOOP, 0, 0);
      }
    } else if (this.phase === PH.SNORKEL_EATING_IN_POOL) {
      if (!this.isEating) {
        this.phase = PH.SNORKEL_DOWN_FROM_EAT;
        this.playZombieReanim('anim_uptoeat', RE.PLAY_ONCE_HOLD, 0, -24);
      }
    } else if (this.phase === PH.SNORKEL_DOWN_FROM_EAT) {
      const r = this.bodyReanim;
      if (r.loopCount > 0) {
        this.phase = PH.SNORKEL_WALKING_IN_POOL;
        this.playZombieReanim('anim_swim', RE.LOOP_FULL_LAST, 0, 0);
        this.pickRandomSpeed();
      }
    }
  }

  isTangleKelpTarget() {
    for (const p of this.board.plants) {
      if (!p.dead && p.type === 'TANGLEKELP' && p.targetZombie === this) return true;
    }
    return false;
  }

  updateZombieJackInTheBox() {
    if (this.phase === PH.JACK_RUNNING) {
      if (this.phaseCounter <= 0 && this.hasHead) {
        this.phaseCounter = 110;
        this.phase = PH.JACK_POPPING;
        this.board.game.audio.play('boing');
        this.playZombieReanim('anim_pop', RE.PLAY_ONCE_HOLD, 20, 28);
      }
    } else if (this.phase === PH.JACK_POPPING) {
      if (this.phaseCounter === 80) this.board.game.audio.play('jacksurprise');
      if (this.phaseCounter <= 0) {
        this.board.game.audio.play('explosion');
        const px = this.x + this.width / 2, py = this.y + this.height / 2;
        if (this.mindControlled) {
          this.board.killAllZombiesInRadius(this.row, px, py, JACK_ZOMBIE_RADIUS, true);
        } else {
          this.board.killAllZombiesInRadius(this.row, px, py, JACK_ZOMBIE_RADIUS, true);
          this.board.killAllPlantsInRadius(px, py, JACK_PLANT_RADIUS);
        }
        this.board.addEffect('boom', px, py, { big: true });
        this.board.shakeBoard(4, -6);
        this.dieNoLoot();
      }
    }
  }

  updateZombieGargantuar() {
    if (this.phase === PH.GARGANTUAR_SMASHING) {
      const r = this.bodyReanim;
      if (r.shouldTrigger(0.64)) {
        if (this.mindControlled) {
          const z = this.findZombieTarget();
          if (z) z.takeDamage(this.type === 'REDEYE' ? 1000 : 500, 0);
        } else {
          const p = this.findPlantTarget('chew');
          if (p) {
            if (p.type === 'SPIKEROCK') {
              this.takeDamage(20, DMG.SPIKE);
              p.spikeRockTakeDamage();
              if (p.plantHealth <= 0) this.squishAllInSquare(p.col, p.row, 'chew');
            } else {
              this.squishAllInSquare(p.col, p.row, 'chew');
            }
          }
        }
        this.board.game.audio.play('thump');
        this.board.shakeBoard(0, 3);
      }
      if (r.loopCount > 0) {
        this.phase = PH.NORMAL;
        this.startWalkAnim(20);
      }
      return;
    }

    const throwingDistance = this.posX - 360;
    if (this.phase === PH.GARGANTUAR_THROWING) {
      const r = this.bodyReanim;
      if (r.shouldTrigger(0.74)) {
        this.hasObject = false;
        this.reanimShowPrefix('Zombie_imp', RG.HIDDEN);
        this.reanimShowTrack('Zombie_gargantuar_whiterope', RG.HIDDEN);
        this.board.game.audio.play('swing');
        const imp = this.board.addZombie('IMP', this.fromWave);
        if (!imp) return;
        let td = throwingDistance;
        const minThrow = this.board.isRoof ? -140 : 40;
        if (this.board.isRoof) td -= 180;
        if (td < minThrow) td = minThrow;
        else if (td > 140) td -= Math.random() * 100;
        imp.posX = this.posX - 133;
        imp.posY = imp.getPosYBasedOnRow(this.row);
        imp.setRow(this.row);
        imp.variant = false;
        imp.altitude = 88;
        imp.renderOrder = this.renderOrder + 1;
        imp.phase = PH.IMP_GETTING_THROWN;
        imp.velX = 3;
        imp.velZ = 0.5 * (td / imp.velX) * THOWN_ZOMBIE_GRAVITY;
        imp.chilledCounter = this.chilledCounter;
        imp.playZombieReanim('anim_thrown', RE.PLAY_ONCE_HOLD, 0, 18);
        imp.updateReanim();
        this.board.game.audio.play('imp');
      }
      if (r.loopCount > 0) {
        this.phase = PH.NORMAL;
        this.startWalkAnim(20);
      }
      return;
    }

    if (this.isImmobilized || !this.hasHead) return;

    if (this.hasObject && this.bodyHealth < this.bodyMaxHealth / 2 && throwingDistance > 40) {
      this.phase = PH.GARGANTUAR_THROWING;
      this.playZombieReanim('anim_throw', RE.PLAY_ONCE_HOLD, 20, 24);
      return;
    }

    let doSmash = false;
    if (this.mindControlled) doSmash = !!this.findZombieTarget();
    else if (this.findPlantTarget('chew')) doSmash = true;
    if (doSmash) {
      this.phase = PH.GARGANTUAR_SMASHING;
      this.board.game.audio.play('lowgroan');
      this.playZombieReanim('anim_smash', RE.PLAY_ONCE_HOLD, 20, 16);
    }
  }

  updateZombieImp() {
    if (this.phase === PH.IMP_GETTING_THROWN) {
      this.velZ -= THOWN_ZOMBIE_GRAVITY;
      this.altitude += this.velZ;
      this.posX -= this.velX;
      const diffY = this.getPosYBasedOnRow(this.row) - this.posY;
      this.posY += diffY;
      this.altitude += diffY;
      if (this.altitude <= 0) {
        this.altitude = 0;
        this.phase = PH.IMP_LANDING;
        this.playZombieReanim('anim_land', RE.PLAY_ONCE_HOLD, 0, 24);
      }
    } else if (this.phase === PH.IMP_LANDING) {
      if (this.bodyReanim.loopCount > 0) {
        this.phase = PH.NORMAL;
        this.startWalkAnim(0);
      }
    }
  }

  updateZombieFlyer() {
    if (this.phase === PH.BALLOON_POPPING) {
      if (this.bodyReanim.loopCount > 0) {
        this.phase = PH.BALLOON_WALKING;
        this.startWalkAnim(0);
      }
    }
  }

  landFlyer(flags = 0) {
    if (!(flags & DMG.DOESNT_LEAVE_BODY) && this.phase === PH.BALLOON_FLYING) {
      this.board.game.audio.play('balloonpop');
      this.phase = PH.BALLOON_POPPING;
      this.playZombieReanim('anim_pop', RE.PLAY_ONCE_HOLD, 20, 24);
    }
    if (this.board.isPoolRow(this.row)) {
      this.dieWithLoot();
    } else {
      this.zombieHeight = H.FALLING;
    }
  }

  popBalloon() { this.landFlyer(0); }

  updateZombieNewspaper() {
    if (this.phase === PH.NEWSPAPER_MADDENING) {
      if (this.bodyReanim.loopCount > 0) {
        this.phase = PH.NEWSPAPER_MAD;
        if (this.board.zombies.filter(z => !z.dead).length <= 10 && this.hasHead) {
          this.board.game.audio.play('newspaperrarrgh');
        }
        this.startWalkAnim(20);
        this.bodyReanim.setImageOverride('anim_head1', 'images/zombie_paper_madhead.png');
      }
    }
  }

  updateZombieDigger() {
    if (this.phase === PH.DIGGER_TUNNELING) {
      if (this.posX < 10) {
        this.altitude = -120;
        this.phase = PH.DIGGER_RISING;
        this.phaseCounter = 130;
        this.playZombieReanim('anim_drill', RE.LOOP, 0, 20);
        this.board.game.audio.play('dirtrise');
        this.board.game.audio.play('wakeup');
        this.board.addReanimEffect('Digger_rising_dirt', this.posX + 13, this.posY + 97, 24);
      }
    } else if (this.phase === PH.DIGGER_RISING) {
      if (this.phaseCounter > 40) {
        this.altitude = curve(130, 40, this.phaseCounter, -120, 20, 'ease_out');
      } else {
        this.altitude = curve(30, 0, this.phaseCounter, 20, 0, 'ease_in');
      }
      if (this.phaseCounter === 30) {
        this.playZombieReanim('anim_landing', RE.PLAY_ONCE_HOLD, 0, 12);
      }
      if (this.phaseCounter === 0) {
        this.altitude = 0;
        this.phase = PH.DIGGER_STUNNED;
        this.playZombieReanim('anim_dizzy', RE.LOOP, 10, 12);
      }
    } else if (this.phase === PH.DIGGER_TUNNELING_PAUSE_WITHOUT_AXE) {
      if (this.phaseCounter === 0) {
        this.altitude = -120;
        this.phase = PH.DIGGER_RISE_WITHOUT_AXE;
        this.phaseCounter = 130;
        this.playZombieReanim('anim_landing', RE.PLAY_ONCE_HOLD, 0, 0);
        this.board.game.audio.play('dirtrise');
        this.board.addReanimEffect('Digger_rising_dirt', this.posX + 13, this.posY + 97, 24);
      }
    } else if (this.phase === PH.DIGGER_RISE_WITHOUT_AXE) {
      if (this.phaseCounter > 40) {
        this.altitude = curve(130, 40, this.phaseCounter, -120, 20, 'ease_out');
      } else {
        this.altitude = curve(30, 0, this.phaseCounter, 20, 0, 'ease_in');
      }
      if (this.phaseCounter === 0) {
        this.altitude = 0;
        this.phase = PH.DIGGER_WALKING_WITHOUT_AXE;
        this.startWalkAnim(20);
      }
    } else if (this.phase === PH.DIGGER_STUNNED) {
      if (this.bodyReanim.loopCount > 1) {
        this.phase = PH.DIGGER_WALKING;
        this.startWalkAnim(20);
      }
    }
  }

  diggerLoseAxe() {
    if (this.phase === PH.DIGGER_TUNNELING) {
      this.phase = PH.DIGGER_TUNNELING_PAUSE_WITHOUT_AXE;
      this.phaseCounter = 200;
      this.setAnimRate(0);
      this.updateAnimSpeed();
    }
    this.hasObject = false;
    this.reanimShowTrack('Zombie_digger_pickaxe', RG.HIDDEN);
    this.reanimShowTrack('Zombie_digger_dirt', RG.HIDDEN);
  }

  updateZombieBobsled() {
    if (this.phase === PH.BOBSLED_CRASHING) {
      if (this.phaseCounter === 0) {
        this.phase = PH.NORMAL;
        if (this.getBobsledPosition() === 0) {
          for (let i = 0; i < 3; i++) {
            const fz = this.followerZombies[i];
            if (fz) { fz.relatedZombie = null; this.followerZombies[i] = null; fz.pickRandomSpeed(); }
          }
          this.pickRandomSpeed();
        }
      }
      return;
    }
    if (this.phase === PH.BOBSLED_SLIDING) {
      if (this.phaseCounter === 0) {
        this.phase = PH.BOBSLED_BOARDING;
        this.playZombieReanim('anim_jump', RE.PLAY_ONCE_HOLD, 0, 20);
      }
    } else {
      if (this.phase !== PH.BOBSLED_BOARDING) return;
      const r = this.bodyReanim;
      const counter = r.animTime * 50;
      const pos = this.getBobsledPosition();
      if (pos === 1 || pos === 3) this.altitude = lerp(8, 18, clamp(counter / 50, 0, 1));
      else this.altitude = lerp(-9, 18, clamp(counter / 50, 0, 1));
    }
    // 冰道
    this.board.setIceTrail(this.row, Math.max(500, this.board.iceTimer(this.row) || 0));
    if (this.posX + 10 < (this.board.iceMinX(this.row) ?? 900) && this.getBobsledPosition() === 0) {
      this.takeDamage(6, DMG.DOESNT_CAUSE_FLASH);
    }
  }

  getBobsledPosition() {
    if (!this.relatedZombie) return -1;
    const leader = this.relatedZombie;
    for (let i = 0; i < 4; i++) if (leader.followerZombies[i] === this) return i;
    return -1;
  }

  bobsledCrash() {
    this.altitude = 0;
    this.zombieRect = rect(36, 0, 42, 115);
    this.phase = PH.BOBSLED_CRASHING;
    this.phaseCounter = BOBSLED_CRASH_TIME;
    this.startWalkAnim(0);
    for (let i = 0; i < 3; i++) {
      const fz = this.followerZombies[i];
      if (!fz) continue;
      fz.phase = PH.BOBSLED_CRASHING;
      fz.phaseCounter = BOBSLED_CRASH_TIME;
      fz.posY = this.getPosYBasedOnRow(this.row);
      fz.altitude = 0;
      fz.startWalkAnim(0);
      if (fz.bodyReanim) {
        fz.velX = this.velX;
        fz.bodyReanim.animTime = Math.random();
        fz.bodyReanim.animRate = this.bodyReanim.animRate;
      }
    }
  }

  bobsledBurn() {
    if (!this.isBobsledTeamWithSled) return;
    this.bobsledCrash();
  }

  updateZamboni() {
    if (this.posX > 400 && !this.flatTires) {
      this.velX = curve(700, 300, this.posX, 0.25, 0.05);
    } else if (this.flatTires && this.velX > 0.0005) {
      this.velX -= 0.0005;
    }
    let iceX = this.posX + 118;
    iceX = Math.max(iceX, this.board.isRoof ? 500 : 25);
    this.board.setIceMinX(this.row, Math.min(this.board.iceMinX(this.row) ?? 900, iceX));
    if (iceX < 800) this.board.setIceTrail(this.row, 3000);
  }

  // ============================================================
  // 僵王博士状态机 (原版 Zombie::UpdateBoss 10220-10473)
  // ENTER → IDLE → 召唤/踩踏/飞贼/丢RV/吐球; 血量阶段切换触发特殊攻击
  // ============================================================
  updateBoss() {
    const r = this.bodyReanim;
    if (!r) return;
    // 冰冻: 所有计数暂停 (原版 10235-10266)
    if (this.iceTrapCounter > 0) return;
    if (this.phase === PH.BOSS_ENTER) {
      if (r.loopCount > 0) {
        this.phase = PH.BOSS_IDLE;
        this.playZombieReanim('anim_idle', RE.LOOP, 0, 12);
        // 原版计数: summon=500, head=5000, stomp=5500-6500, bungee=6500+
        this.summonCounter = 500;
        this.bossHeadCounter = 5000;
        this.bossStompCounter = 5500 + Math.floor(Math.random() * 1000);
        this.bossBungeeCounter = 6500;
        this.bossRVCounter = 9000 + Math.floor(Math.random() * 2000);
        this.bossStage = 0;
      }
      return;
    }
    if (this.phase !== PH.BOSS_IDLE) {
      // 各攻击相位: 动画播完 → 执行效果 → 回 IDLE
      if (r.loopCount > 0) {
        this.bossResolveAttack();
      }
      return;
    }
    // IDLE: 死亡判定 (原版 血量=1 → BossStartDeath)
    if (this.bodyHealth <= 1) { this.bossStartDeath(); return; }
    // 伤害阶段 (原版 GetBodyDamageIndex: Boss <50%→2, <80%→1)
    const stage = this.bodyHealth < this.bodyMaxHealth * 0.5 ? 2 : this.bodyHealth < this.bodyMaxHealth * 0.8 ? 1 : 0;
    if (stage > (this.bossStage || 0)) {
      this.bossStage = stage;
      if (stage === 1) { this.bossBungeeAttack(); return; }   // 原版: 段1立刻放飞贼
      if (stage === 2) { this.bossRVAttack(); return; }       // 原版: 段2立刻丢RV
    }
    // 计时器 (原版 100Hz tick 计数)
    this.summonCounter--;
    if (this.summonCounter <= 0) { this.bossSpawnAttack(); return; }
    this.bossStompCounter--;
    if (this.bossStompCounter <= 0) { this.bossStompAttack(); return; }
    this.bossBungeeCounter--;
    if (this.bossBungeeCounter <= 0) { this.bossBungeeAttack(); return; }
    this.bossRVCounter--;
    if (this.bossRVCounter <= 0) { this.bossRVAttack(); return; }
    this.bossHeadCounter--;
    if (this.bossHeadCounter <= 0) { this.bossHeadAttack(); return; }
  }

  // 攻击动画播完 → 结算效果 (原版各 Boss*Contact)
  bossResolveAttack() {
    const b = this.board;
    switch (this.phase) {
      case PH.BOSS_SPAWNING: {
        // 原版 BossSpawnContact: 按年龄表召唤
        this.bossSummonZombies();
        break;
      }
      case PH.BOSS_STOMPING: {
        // 原版 BossStompContact: 目标行×2 第5列及以右植物压扁
        const row = this.bossTargetRow;
        for (let rr = row; rr <= row + 1 && rr < b.rows; rr++) {
          for (let c = 5; c < 9; c++) {
            const p = b.grid[rr][c] || b.gridPot[rr][c] || b.gridLily[rr][c];
            if (p && !p.dead) p.squish();
          }
        }
        b.game.audio.play('bossstomp');
        break;
      }
      case PH.BOSS_BUNGEES_DROP: {
        // 原版 BossBungeeAttack: 连续3列飞贼
        const col0 = Math.floor(Math.random() * 3);
        for (let i = 0; i < 3; i++) {
          const rr = b.grassRows[Math.floor(Math.random() * b.grassRows.length)];
          const z = b.spawnZombieForWave('BUNGEE', rr, b.wave - 1);
          if (z) { z.bungeeTargetCol = col0 + i; }
        }
        break;
      }
      case PH.BOSS_DROP_RV: {
        // 原版 BossRVLanding: 2行×3列植物压毁
        const row = this.bossTargetRow;
        const col = this.bossTargetCol;
        for (let rr = row; rr <= row + 1 && rr < b.rows; rr++) {
          for (let cc = col; cc <= col + 2 && cc < 9; cc++) {
            const p = b.grid[rr][cc] || b.gridPot[rr][cc] || b.gridLily[rr][cc];
            if (p && !p.dead) p.squish();
          }
        }
        b.game.audio.play('RVthrow');
        break;
      }
      case PH.BOSS_HEAD_SPIT: {
        // 原版 BossHeadSpit: 50%火球/50%冰球
        const isFire = Math.random() < 0.5;
        const row = this.bossTargetRow;
        const pr = b.addProjectile(isFire ? 'bossfire' : 'bossice', 455, b.gridY(row) + 45, row, this, { zProj: true });
        b.game.audio.play(isFire ? 'bossfireball' : 'bossiceball');
        break;
      }
    }
    this.phase = PH.BOSS_IDLE;
    this.playZombieReanim('anim_idle', RE.LOOP, 0, 12);
  }

  // 原版 BossSpawnAttack: 召唤节奏随段位 (段0 450-550 / 段1 350-450 / 段2 150-250 tick)
  bossSpawnAttack() {
    const r = this.bodyReanim;
    const anim = 'anim_spawn_' + (1 + Math.floor(Math.random() * 5));
    this.playZombieReanim(anim, RE.PLAY_ONCE_HOLD, 0, 24);
    this.phase = PH.BOSS_SPAWNING;
    const s = this.bossStage || 0;
    this.summonCounter = s === 0 ? 450 + Math.floor(Math.random() * 100) : s === 1 ? 350 + Math.floor(Math.random() * 100) : 150 + Math.floor(Math.random() * 100);
  }

  // 原版 BossSpawnContact: 按 mZombieAge 召唤僵尸类型
  bossSummonZombies() {
    const b = this.board;
    const age = this.zombieAge || 0;
    let type;
    if (age < 3500) type = 'NORMAL';
    else if (age < 8000) type = 'CONE';
    else if (age < 12500) type = 'BUCKET';
    else {
      // 原版 gBossZombieList 随机 (第0行不出巨人)
      const pool = ['CONE', 'BUCKET', 'FOOTBALL', 'POLEVAULTER', 'JACK', 'LADDER', 'ZAMBONI', 'CATAPULT', 'POGO', 'NEWSPAPER', 'DOOR', 'GARGANTUAR'];
      type = pool[Math.floor(Math.random() * pool.length)];
    }
    const rows = b.grassRows.filter(rr => !(type === 'GARGANTUAR' && rr === 0));
    const row = rows[Math.floor(Math.random() * rows.length)];
    const z = b.spawnZombieForWave(type, row, b.wave - 1);
    if (z) { z.posX = 600; z.x = 600; }
  }

  bossStompAttack() {
    // 原版 BossStompAttack: 随机行 (可压2行)
    const r = this.bodyReanim;
    const anim = 'anim_stomp_' + (1 + Math.floor(Math.random() * 4));
    this.playZombieReanim(anim, RE.PLAY_ONCE_HOLD, 0, 24);
    this.phase = PH.BOSS_STOMPING;
    this.bossTargetRow = Math.floor(Math.random() * Math.max(1, this.board.rows - 1));
    this.bossStompCounter = 5500 + Math.floor(Math.random() * 1000);
  }

  bossBungeeAttack() {
    const r = this.bodyReanim;
    this.playZombieReanim('anim_bungee_1_enter', RE.PLAY_ONCE_HOLD, 0, 24);
    this.phase = PH.BOSS_BUNGEES_DROP;
    this.bossBungeeCounter = 6500 + Math.floor(Math.random() * 2000);
  }

  bossRVAttack() {
    const r = this.bodyReanim;
    this.playZombieReanim('anim_RV_1', RE.PLAY_ONCE_HOLD, 0, 24);
    this.phase = PH.BOSS_DROP_RV;
    this.bossTargetRow = Math.floor(Math.random() * Math.max(1, this.board.rows - 1));
    this.bossTargetCol = Math.floor(Math.random() * 3);
    this.bossRVCounter = 12000 + Math.floor(Math.random() * 3000);
    this.bossStompCounter = Math.min(this.bossStompCounter, 4000);
  }

  bossHeadAttack() {
    const r = this.bodyReanim;
    this.playZombieReanim('anim_head_attack_' + (1 + Math.floor(Math.random() * 5)), RE.PLAY_ONCE_HOLD, 0, 24);
    this.phase = PH.BOSS_HEAD_SPIT;
    this.bossTargetRow = this.board.grassRows[Math.floor(Math.random() * this.board.grassRows.length)];
    this.bossHeadCounter = 5000 + Math.floor(Math.random() * 2000);
  }

  // 原版 BossStartDeath: 头缩回 + 爆炸
  // 原版 ZamboniDeath/CatapultDeath: 载具僵尸死亡 (翻倒+消失)
  zamboniDeath(flags) {
    if (this.isDeadOrDying) return;
    this.playZombieReanim('anim_death', RE.PLAY_ONCE_HOLD, 0, 18);
    this.phase = PH.DYING;
    this.velX = 0;
    this.dropLoot();
  }
  catapultDeath(flags) {
    if (this.isDeadOrDying) return;
    this.playZombieReanim('anim_death', RE.PLAY_ONCE_HOLD, 0, 18);
    this.phase = PH.DYING;
    this.velX = 0;
    this.dropLoot();
  }

  bossStartDeath() {
    if (this.phase === PH.BOSS_HEAD_SPIT) return;
    this.playZombieReanim('anim_death', RE.PLAY_ONCE_HOLD, 0, 12);
    this.phase = PH.DYING;
    this.velX = 0;   // 原地死亡 (BossDie: 不走动)
    this.board.game.audio.play('bossdie');
    this.board.addEffect('bossexplosion', 400, 300);
  }

  updateLadder() {
    if (this.mindControlled || !this.hasHead || this.isDeadOrDying) return;
    if (this.phase === PH.LADDER_CARRYING && this.zombieHeight === H.NORMAL) {
      if (this.findPlantTarget('ladder')) {
        this.stopEating();
        this.phase = PH.LADDER_PLACING;
        this.playZombieReanim('anim_placeladder', RE.PLAY_ONCE_HOLD, 10, 24);
      }
    } else if (this.phase === PH.LADDER_PLACING) {
      if (this.bodyReanim.loopCount > 0) {
        const p = this.findPlantTarget('ladder');
        if (p) {
          this.board.addLadder(p.col, p.row);
          this.board.game.audio.play('ladderzombie');
          this.zombieHeight = H.UP_LADDER;
          this.useLadderCol = p.col;
          this.detachShield();
        } else {
          this.phase = PH.LADDER_CARRYING;
          this.startWalkAnim(0);
        }
      }
    }
  }

  updateYeti() {
    if (this.mindControlled || !this.hasHead || this.isDeadOrDying) return;
    if (this.phase === PH.NORMAL && this.phaseCounter === 0) {
      this.phase = PH.YETI_RUNNING;
      this.hasObject = false;
      this.pickRandomSpeed();
    }
  }

  updateZombieDancer() {
    if (this.isEating) return;
    if (this.summonCounter > 0) {
      this.summonCounter--;
      if (this.summonCounter === 0) {
        if (this.getDancerFrame() === 12 && this.hasHead && this.posX < 700) {
          this.phase = PH.DANCER_SNAPPING_FINGERS_WITH_LIGHT;
          this.playZombieReanim('anim_point', RE.PLAY_ONCE_HOLD, 20, 24);
        } else {
          this.summonCounter = 1;
        }
      }
    }
    if (this.phase === PH.DANCER_DANCING_IN) {
      if (this.hasHead && this.phaseCounter === 0) {
        this.phase = PH.DANCER_SNAPPING_FINGERS;
        this.playZombieReanim('anim_point', RE.PLAY_ONCE_HOLD, 20, 24);
        this.pickRandomSpeed();
      }
    } else if (this.phase === PH.DANCER_SNAPPING_FINGERS || this.phase === PH.DANCER_SNAPPING_FINGERS_WITH_LIGHT) {
      if (this.bodyReanim.loopCount > 0) {
        if (this.phase === PH.DANCER_SNAPPING_FINGERS && this.board.zombies.filter(z => !z.dead).length <= 15) {
          this.board.game.audio.play('dancer');
        }
        this.summonBackupDancers();
        this.phase = PH.DANCER_SNAPPING_FINGERS_HOLD;
        this.phaseCounter = 200;
      }
    } else {
      if (this.phase === PH.DANCER_SNAPPING_FINGERS_HOLD) {
        if (this.phaseCounter !== 0) return;
        this.phase = PH.DANCER_DANCING_LEFT;
        this.playZombieReanim('anim_walk', RE.LOOP, 20, 0);
      }
      const dp = this.getDancerPhase();
      if (dp !== this.phase) {
        if (dp === PH.DANCER_DANCING_LEFT) {
          this.phase = dp;
          this.playZombieReanim('anim_walk', RE.LOOP, 10, 0);
        } else if (dp === PH.DANCER_WALK_TO_RAISE) {
          this.phase = dp;
          this.playZombieReanim('anim_armraise', RE.LOOP, 10, 18);
          this.bodyReanim.animTime = 0.6;
        } else if (dp === PH.DANCER_RAISE_LEFT_1 || dp === PH.DANCER_RAISE_LEFT_2) {
          this.phase = dp;
          this.playZombieReanim('anim_armraise', RE.LOOP, 10, 18);
        }
      }
      if (this.hasHead && this.summonCounter === 0 && this.needsMoreBackupDancers()) {
        this.summonCounter = 100;
      }
    }
  }

  getDancerFrame() {
    return Math.floor(this.bodyReanim.animTime * 24) % 24;
  }
  getDancerPhase() {
    const f = this.getDancerFrame();
    if (f >= 0 && f < 6) return PH.DANCER_DANCING_LEFT;
    if (f >= 6 && f < 12) return PH.DANCER_WALK_TO_RAISE;
    if (f >= 12 && f < 18) return PH.DANCER_RAISE_LEFT_1;
    return PH.DANCER_RAISE_LEFT_2;
  }
  needsMoreBackupDancers() {
    let alive = 0;
    for (const fz of this.followerZombies) {
      if (fz && !fz.dead && !fz.isDeadOrDying) alive++;
    }
    return alive < 4;
  }

  summonBackupDancers() {
    if (!this.hasHead) return;
    const offsets = [[-80, -1], [80, 1], [-80, 1], [80, -1]];
    let placed = 0;
    for (let i = 0; i < 4 && placed < 4; i++) {
      if (this.followerZombies[i] && !this.followerZombies[i].dead) continue;
      const [dx, drow] = offsets[i];
      const row = this.row + drow;
      if (row < 0 || row >= this.board.rows) continue;
      const z = this.board.addZombie('BACKUP', this.fromWave);
      if (!z) continue;
      z.posX = this.posX + dx;
      z.posY = z.getPosYBasedOnRow(row);
      z.setRow(row);
      z.x = Math.floor(z.posX); z.y = Math.floor(z.posY);
      z.altitude = ZOMBIE_BACKUP_DANCER_RISE_HEIGHT;
      z.phase = PH.DANCER_RISING;
      z.phaseCounter = 150;
      z.relatedZombie = this;
      z.setAnimRate(0);
      z.mindControlled = this.mindControlled;
      this.followerZombies[i] = z;
      placed++;
    }
    this.board.game.audio.play('gravestonerumble');
  }

  updateZombieBackupDancer() {
    if (this.phase === PH.DANCER_RISING) {
      this.altitude += 3;
      if (this.altitude >= 0) {
        this.altitude = 0;
        this.phase = PH.DANCER_DANCING_LEFT;
        this.playZombieReanim('anim_armraise', RE.LOOP, 0, 18);
        const leader = this.relatedZombie;
        if (leader && !leader.dead) {
          this.playZombieReanim('anim_walk', RE.LOOP, 0, 0);
        }
      }
      return;
    }
    if (this.mindControlled || !this.hasHead || this.isDeadOrDying) return;
    const leader = this.relatedZombie;
    if (!leader || leader.dead || leader.isDeadOrDying || leader.mindControlled !== this.mindControlled) {
      this.convertToNormalZombie();
      return;
    }
    // 跟随舞王动作
    const lp = leader.phase;
    if (lp === PH.DANCER_DANCING_LEFT || lp === PH.DANCER_WALK_TO_RAISE || lp === PH.DANCER_RAISE_LEFT_1 || lp === PH.DANCER_RAISE_LEFT_2) {
      if (this.phase !== lp) {
        this.phase = lp;
        if (lp === PH.DANCER_DANCING_LEFT) this.playZombieReanim('anim_walk', RE.LOOP, 10, 0);
        else this.playZombieReanim('anim_armraise', RE.LOOP, 10, 18);
      }
    } else if (this.phase === PH.DANCER_DANCING_LEFT || this.phase === PH.DANCER_WALK_TO_RAISE || this.phase === PH.DANCER_RAISE_LEFT_1 || this.phase === PH.DANCER_RAISE_LEFT_2) {
      // 舞王不在跳舞状态 → 静止
      this.phase = PH.NORMAL;
      this.playZombieReanim('anim_idle', RE.LOOP, 10, 12);
    }
  }

  convertToNormalZombie() {
    this.posY = this.getPosYBasedOnRow(this.row);
    this.x = Math.floor(this.posX); this.y = Math.floor(this.posY);
    this.type = 'NORMAL';
    this.phase = PH.NORMAL;
    this.zombieAttackRect = rect(50, 0, 20, 115);
    this.phaseCounter = 0;
    this.relatedZombie = null;
    this.pickRandomSpeed();
  }

  updateZombieCatapult() {
    if (this.phase === PH.CATAPULT_LAUNCHING) {
      const r = this.bodyReanim;
      if (r.shouldTrigger(0.62)) {
        this.zombieCatapultFire(this.catapultTarget);
        this.catapultTarget = null;
      }
      if (r.loopCount > 0) {
        this.phase = PH.NORMAL;
        if (this.summonCounter > 0) this.startWalkAnim(0);
      }
      return;
    }
    if (this.summonCounter <= 0) return;
    if (this.phase !== PH.NORMAL) return;
    const p = this.findCatapultTarget();
    if (p) {
      this.phase = PH.CATAPULT_LAUNCHING;
      this.catapultTarget = p;
      this.playZombieReanim('anim_throw', RE.PLAY_ONCE_HOLD, 20, 16);
    }
  }

  findCatapultTarget() {
    const rowPlant = new Array(this.board.rows).fill(0);
    const hasPlant = new Array(this.board.rows).fill(false);
    for (const p of this.board.plants) {
      if (!p.dead && p.col <= 5) { rowPlant[p.row]++; hasPlant[p.row] = true; }
    }
    let bestRow = -1, bestCount = 0;
    for (let r = 0; r < this.board.rows; r++) {
      if (hasPlant[r] && rowPlant[r] > bestCount) { bestCount = rowPlant[r]; bestRow = r; }
    }
    if (bestRow === -1) return null;
    // 返回最右植物
    let best = null;
    for (const p of this.board.plants) {
      if (!p.dead && p.row === bestRow && p.col <= 5) {
        if (!best || p.x > best.x) best = p;
      }
    }
    return best;
  }

  zombieCatapultFire(p) {
    if (!p) return;
    const ox = this.posX + 113, oy = this.posY - 44;
    this.summonCounter--;
    this.board.addProjectile('basketball', ox, oy, this.row, { tx: p.x + 20, ty: p.y + 35 });
    this.board.game.audio.play('basketball');
    this.updateReanim();
  }

  updateZombiePogo() {
    if (this.isDeadOrDying || this.isImmobilized || !this.isBouncingPogo || this.zombieHeight === H.IN_TO_CHIMNEY) return;
    let height = 40;
    if (this.phase >= PH.POGO_HIGH_BOUNCE_1 && this.phase <= PH.POGO_HIGH_BOUNCE_6) {
      height = 50 + 20 * (this.phase - PH.POGO_HIGH_BOUNCE_1);
    } else if (this.phase === PH.POGO_FORWARD_BOUNCE_2) height = 90;
    else if (this.phase === PH.POGO_FORWARD_BOUNCE_7) height = 170;
    this.altitude = curve(POGO_BOUNCE_TIME, 0, this.phaseCounter, 9, height + 9, 'bounce');
    if (this.phaseCounter === 7) {
      const r = this.bodyReanim;
      r.animTime = 0;
      r.loopType = RE.PLAY_ONCE_HOLD;
    }
    if (this.phaseCounter === 5) this.board.game.audio.play('pogozombie');
    if (this.zombieHeight === H.UP_TO_HIGH_GROUND) {
      this.altitude += HIGH_GROUND_HEIGHT;
      this.zombieHeight = H.NORMAL;
    } else if (this.zombieHeight === H.DOWN_OFF_HIGH_GROUND) {
      this.onHighGround = false;
      this.zombieHeight = H.NORMAL;
    } else if (this.onHighGround) {
      this.altitude += HIGH_GROUND_HEIGHT;
    }
    if (this.phase === PH.POGO_FORWARD_BOUNCE_2 && this.phaseCounter === 70) {
      const p = this.findPlantTarget('vault');
      if (p && p.type === 'TALLNUT') {
        this.board.game.audio.play('bonk');
        this.pogoBreak(0);
        return;
      }
    }
    if (this.phaseCounter !== 0) return;
    const p = this.isOnBoard ? this.findPlantTarget('vault') : null;
    if (!p) {
      this.phase = PH.POGO_BOUNCING;
      this.pickRandomSpeed();
      this.phaseCounter = POGO_BOUNCE_TIME;
      return;
    }
    if (this.phase === PH.POGO_HIGH_BOUNCE_1) {
      this.phase = PH.POGO_FORWARD_BOUNCE_2;
      this.velX = (this.x - p.x + 60) / POGO_BOUNCE_TIME;
      this.phaseCounter = POGO_BOUNCE_TIME;
    } else {
      this.phase = PH.POGO_HIGH_BOUNCE_1;
      this.velX = 0;
      this.phaseCounter = POGO_BOUNCE_TIME;
    }
  }

  pogoBreak(flags) {
    if (this.isDeadOrDying) return;
    this.hasObject = false;
    this.reanimShowTrack('Zombie_pogo', RG.HIDDEN);
    this.phase = PH.NORMAL;
    this.zombieAttackRect = rect(20, 0, 50, 115);
    this.playZombieReanim('anim_idle', RE.LOOP, 20, 24);
    this.board.game.audio.play('pogobreak');
    this.zombieHeight = H.FALLING;
    void flags;
  }

  // 蹦极
  pickBungeeTarget(col) {
    const picks = [];
    for (let x = 0; x < 9; x++) {
      if (col === -1 || col === x) {
        for (let y = 0; y < this.board.rows; y++) {
          if (this.board.getGraveAt && this.board.getGraveAt(x, y)) continue;
          const plant = this.board.getTopPlantAt(x, y, 'bungee');
          if (plant) {
            if (plant.type === 'GRAVEBUSTER' || plant.type === 'COBCANNON') continue;
          }
          if (!this.board.bungeeIsTargetingCell(x, y)) {
            picks.push({ x, y, w: plant ? 10000 : 1 });
          }
        }
      }
    }
    if (!picks.length) { this.dieNoLoot(); return; }
    // 加权随机
    let total = 0;
    for (const p of picks) total += p.w;
    let r = Math.random() * total;
    let pick = picks[0];
    for (const p of picks) { r -= p.w; if (r <= 0) { pick = p; break; } }
    this.targetCol = pick.x;
    this.setRow(pick.y);
    this.posX = this.board.gridToPixelX(this.targetCol);
    this.posY = this.getPosYBasedOnRow(this.row);
  }

  updateZombieBungee() {
    switch (this.phase) {
      case PH.BUNGEE_CUTSCENE: {
        this.phaseCounter--;
        if (this.phaseCounter <= 0) {
          this.phaseCounter = 100 + Math.floor(Math.random() * 100);
        }
        break;
      }
      case PH.BUNGEE_DIVING: {
        this.altitude -= 24;
        if (this.altitude <= 0) {
          this.altitude = 0;
          this.phase = PH.BUNGEE_AT_BOTTOM;
          this.phaseCounter = 50;
          this.board.game.audio.play('thump');
        }
        break;
      }
      case PH.BUNGEE_AT_BOTTOM: {
        if (this.phaseCounter === 25) {
          const p = this.board.getTopPlantAt(this.targetCol, this.row, 'bungee');
          if (p) {
            this.targetPlant = p;
            p.onBungeeState = 'grabbed';
            this.phase = PH.BUNGEE_GRABBING;
          }
        }
        if (this.phaseCounter <= 0) {
          this.phase = PH.BUNGEE_RISING;
          this.playZombieReanim('anim_raise', RE.PLAY_ONCE_HOLD, 0, 36);
        }
        break;
      }
      case PH.BUNGEE_GRABBING: {
        if (this.bodyReanim.loopCount > 0) {
          const p = this.targetPlant;
          if (p && !p.dead) {
            this.bungeeStealTarget();
          }
          this.phase = PH.BUNGEE_RISING;
          this.playZombieReanim('anim_raise', RE.PLAY_ONCE_HOLD, 0, 36);
        }
        break;
      }
      case PH.BUNGEE_RISING: {
        this.altitude += 12;
        if (this.altitude >= BUNGEE_ZOMBIE_HEIGHT) {
          if (this.stolenPlant) {
            this.stolenPlant.dead = true;
            this.stolenPlant = null;
          }
          this.dieNoLoot();
        }
        break;
      }
    }
  }

  bungeeStealTarget() {
    const p = this.targetPlant;
    if (!p || p.dead) return;
    if (p.type === 'SPIKEROCK' || p.type === 'SPIKEWEED' || p.type === 'LILYPAD' || p.type === 'FLOWERPOT' || p.type === 'PUMPKIN' ||
      p.type === 'CHERRYBOMB' || p.type === 'JALAPENO' || p.type === 'BLOVER' || p.type === 'ICESHROOM' || p.type === 'DOOMSHROOM') {
      // 原版: 这些被蹦极抓走直接销毁
      this.board.game.audio.play('bang');
    }
    p.onBungeeState = 'rising';
    p.bungeeZombie = this;
    this.stolenPlant = p;
    this.board.game.audio.play('bungeesteal');
  }

  // ---------------- 践踏 ----------------
  squishAllInSquare(col, row, attackType) {
    for (const p of this.board.plants) {
      if (!p.dead && p.col === col && p.row === row) {
        p.squish();
      }
    }
    for (const z of this.board.zombies) {
      if (!z.dead && z.row === row && z !== this && !z.isFlying &&
        (attackType === 'smash' ? true : !z.mindControlled === !this.mindControlled) &&
        Math.abs(z.posX - this.posX) < 60) {
        z.squish(attackType);
      }
    }
  }

  checkSquish(attackType) {
    // 冰车/投石碾压植物
    const ar = this.getZombieAttackRect();
    for (const p of this.board.plants) {
      if (p.dead) continue;
      if (p.row === this.row) {
        const pr = p.getPlantRect();
        if (rectOverlap(ar, pr) > 0) {
          if (this.canTargetPlant(p, attackType === 'drive_over' ? 'drive_over' : 'chew')) {
            p.squish();
          }
        }
      }
    }
    if (this.mindControlled) {
      for (const z of this.board.zombies) {
        if (!z.dead && z.row === this.row && z !== this && !z.mindControlled && !z.isFlying) {
          const zr = z.getZombieRect();
          if (rectOverlap(ar, zr) > 0) z.squish(attackType);
        }
      }
    }
  }

  squish(attackType) {
    if (this.isDeadOrDying) return;
    if (this.type === 'ZAMBONI' || this.type === 'CATAPULT' || this.type === 'GARGANTUAR' || this.type === 'REDEYE' || this.type === 'BOSS') return;
    this.posY = this.getPosYBasedOnRow(this.row);
    this.playZombieReanim('anim_squashed', RE.PLAY_ONCE_HOLD, 0, 30);
    this.board.game.audio.play('splat');
    this.phase = PH.DYING;
    this.velX = 0;
  }

  // ---------------- 伤害 ----------------
  // 兼容两种签名: takeDamage(dmg, flags) | takeDamage(dmg, board, {noFlash, chill, exploded, squashed, fire})
  takeDamage(dmg, flagsOrBoard = 0, opts = null) {
    let flags = 0;
    let fire = false;
    if (typeof flagsOrBoard === 'number') {
      flags = flagsOrBoard;
    } else {
      // 旧API (board + opts)
      if (opts && (opts.noFlash || opts.exploded)) flags |= DMG.DOESNT_CAUSE_FLASH;
      if (opts && opts.chill) flags |= DMG.FREEZE;
      if (opts && opts.squashed) flags |= DMG.DOESNT_LEAVE_BODY;
      if (opts && opts.fire) fire = true;
    }
    if (this.phase === PH.JACK_POPPING || this.isDeadOrDying) return;
    let remaining = dmg;
    if (this.isFlying) remaining = this.takeFlyingDamage(remaining, flags);
    if (remaining > 0 && this.shieldType && !(flags & DMG.BYPASSES_SHIELD)) {
      remaining = this.takeShieldDamage(remaining, flags);
      if (flags & DMG.HITS_SHIELD_AND_BODY) remaining = dmg;
    }
    if (remaining > 0 && this.helmType) {
      remaining = this.takeHelmDamage(remaining, flags);
    }
    if (remaining > 0) {
      const wasAlive = this.bodyHealth > 0;
      this.takeBodyDamage(remaining, flags);
      // 火系致命伤害 → 烧焦僵尸 (原版 ApplyBurn: PHASE_ZOMBIE_BURNED + 焦黑reanim)
      if (fire && wasAlive && this.bodyHealth <= 0 && !this.isDeadOrDying) {
        this.becomeCharred();
      }
    }
  }

  // 旧API兼容: mowed(board)
  mowed(board) { this.mowDown(); }

  takeFlyingDamage(dmg, flags) {
    if (!(flags & DMG.DOESNT_CAUSE_FLASH)) this.justGotShotCounter = 25;
    const actual = Math.min(this.flyingHealth, dmg);
    const remaining = dmg - actual;
    this.flyingHealth -= actual;
    if (this.flyingHealth <= 0) this.landFlyer(flags);
    return remaining;
  }

  takeShieldDamage(dmg, flags) {
    if (!(flags & DMG.DOESNT_CAUSE_FLASH)) {
      this.shieldJustGotShotCounter = 25;
      if (this.justGotShotCounter < 0) this.justGotShotCounter = 0;
    }
    // 原版: 防具受冰系攻击 → 整体减速 (TakeHelmDamage DAMAGE_FREEZE → ApplyChill)
    if (flags & DMG.FREEZE) this.applyChill(false);
    if (!(flags & DMG.DOESNT_CAUSE_FLASH) && !(flags & DMG.HITS_SHIELD_AND_BODY)) {
      this.shieldRecoilCounter = 12;
      if (this.shieldType === 'door' || this.shieldType === 'ladder') {
        this.board.game.audio.play('shieldhit');
      }
    }
    const before = this.getShieldDamageIndex();
    const actual = Math.min(this.shieldHealth, dmg);
    const remaining = dmg - actual;
    this.shieldHealth -= actual;
    if (this.shieldHealth <= 0) {
      this.dropShield(flags);
      return remaining;
    }
    const after = this.getShieldDamageIndex();
    if (after !== before) {
      if (this.shieldType === 'door') {
        if (after === 1) this.bodyReanim.setImageOverride('anim_screendoor', 'images/zombie_screendoor2.png');
        else if (after === 2) this.bodyReanim.setImageOverride('anim_screendoor', 'images/zombie_screendoor3.png');
      } else if (this.shieldType === 'newspaper') {
        if (after === 1) this.bodyReanim.setImageOverride('Zombie_paper_paper', 'images/zombie_paper_paper2.png');
        else if (after === 2) this.bodyReanim.setImageOverride('Zombie_paper_paper', 'images/zombie_paper_paper3.png');
      } else if (this.shieldType === 'ladder') {
        if (after === 1) this.bodyReanim.setImageOverride('Zombie_ladder_1', 'images/zombie_ladder_1_damage1.png');
        else if (after === 2) this.bodyReanim.setImageOverride('Zombie_ladder_1', 'images/zombie_ladder_1_damage2.png');
      }
    }
    return remaining;
  }

  takeHelmDamage(dmg, flags) {
    if (!(flags & DMG.DOESNT_CAUSE_FLASH)) this.justGotShotCounter = 25;
    // 原版: 头盔受冰系攻击 → 整体减速 (路障/铁桶僵尸吃寒冰腕豆有效)
    if (flags & DMG.FREEZE) this.applyChill(false);
    const before = this.getHelmDamageIndex();
    const actual = Math.min(this.helmHealth, dmg);
    const remaining = dmg - actual;
    this.helmHealth -= actual;
    if (this.helmHealth <= 0) {
      this.dropHelm(flags);
      return remaining;
    }
    const after = this.getHelmDamageIndex();
    if (after !== before && after > 0) {
      // 头盔损伤贴图
      if (this.helmType === 'cone') {
        if (after === 1) this.bodyReanim.setImageOverride('anim_cone', 'images/zombie_cone2.png');
        else if (after === 2) this.bodyReanim.setImageOverride('anim_cone', 'images/zombie_cone3.png');
      } else if (this.helmType === 'bucket') {
        if (after === 1) this.bodyReanim.setImageOverride('anim_bucket', 'images/zombie_bucket2.png');
        else if (after === 2) this.bodyReanim.setImageOverride('anim_bucket', 'images/zombie_bucket3.png');
      } else if (this.helmType === 'football') {
        if (after === 1) this.bodyReanim.setImageOverride('zombie_football_helmet', 'images/zombie_football_helmet2.png');
        else if (after === 2) this.bodyReanim.setImageOverride('zombie_football_helmet', 'images/zombie_football_helmet3.png');
      }
    }
    return remaining;
  }

  takeBodyDamage(dmg, flags) {
    if (!(flags & DMG.DOESNT_CAUSE_FLASH)) this.justGotShotCounter = 25;
    if (flags & DMG.FREEZE) this.applyChill(false);
    const before = this.getBodyDamageIndex();
    this.bodyHealth -= dmg;
    const after = this.getBodyDamageIndex();
    if (this.type === 'ZAMBONI') {
      if (flags & DMG.SPIKE) {
        this.bodyReanim.setImageOverride('Zombie_zamboni_1', 'images/zombie_zamboni_1_damage2.png');
        this.bodyReanim.setImageOverride('Zombie_zamboni_2', 'images/zombie_zamboni_2_damage2.png');
        this.zamboniDeath(flags);
      } else if (this.bodyHealth <= 0) {
        this.zamboniDeath(flags);
      } else if (before !== after) {
        if (after === 1) {
          this.bodyReanim.setImageOverride('Zombie_zamboni_1', 'images/zombie_zamboni_1_damage1.png');
          this.bodyReanim.setImageOverride('Zombie_zamboni_2', 'images/zombie_zamboni_2_damage1.png');
        } else if (after === 2) {
          this.bodyReanim.setImageOverride('Zombie_zamboni_1', 'images/zombie_zamboni_1_damage2.png');
          this.bodyReanim.setImageOverride('Zombie_zamboni_2', 'images/zombie_zamboni_2_damage2.png');
        }
      }
    } else if (this.type === 'CATAPULT') {
      if ((flags & DMG.SPIKE) || this.bodyHealth <= 0) {
        this.bodyReanim.setImageOverride('Zombie_catapult_siding', 'images/zombie_catapult_siding_damage.png');
        this.catapultDeath(flags);
      } else if (before !== after) {
        if (after === 1) this.bodyReanim.setImageOverride('Zombie_catapult_siding', 'images/zombie_catapult_siding_damage.png');
      }
    } else if (this.type === 'GARGANTUAR' || this.type === 'REDEYE') {
      if (before !== after) {
        if (after === 1) {
          this.bodyReanim.setImageOverride('Zombie_gargantua_body1', 'images/zombie_gargantuar_body1_2.png');
          this.bodyReanim.setImageOverride('Zombie_gargantuar_outerarm_lower', 'images/zombie_gargantuar_outerarm_lower2.png');
        } else if (after === 2) {
          this.bodyReanim.setImageOverride('Zombie_gargantua_body1', 'images/zombie_gargantuar_body1_3.png');
          this.bodyReanim.setImageOverride('Zombie_gargantuar_outerleg_foot', 'images/zombie_gargantuar_foot2.png');
          this.bodyReanim.setImageOverride('Zombie_gargantuar_outerarm_lower', 'images/zombie_gargantuar_outerarm_lower2.png');
          this.bodyReanim.setImageOverride('anim_head1', this.type === 'REDEYE' ? 'images/zombie_gargantuar_head2_redeye.png' : 'images/zombie_gargantuar_head2.png');
        }
      }
    } else if (this.type === 'BOSS') {
      this.bodyHealth = Math.max(this.bodyHealth, 1);
      if (this.bodyHealth <= 0) this.bodyHealth = 1;
    } else {
      this.updateDamageStates(flags);
    }

    if (this.bodyHealth <= 0) {
      this.bodyHealth = 0;
      this.playDeathAnim(flags);
      this.dropLoot();
    }
  }

  getHelmDamageIndex() {
    if (this.helmHealth < this.helmMaxHealth / 3) return 2;
    if (this.helmHealth < this.helmMaxHealth * 2 / 3) return 1;
    return 0;
  }
  getShieldDamageIndex() {
    if (this.shieldHealth < this.shieldMaxHealth / 3) return 2;
    if (this.shieldHealth < this.shieldMaxHealth * 2 / 3) return 1;
    return 0;
  }
  getBodyDamageIndex() {
    if (this.bodyHealth < this.bodyMaxHealth / 3) return 2;
    if (this.bodyHealth < this.bodyMaxHealth * 2 / 3) return 1;
    return 0;
  }

  updateDamageStates(flags) {
    if (!this.canLoseBodyParts) return;
    if (this.hasArm && this.bodyHealth < 2 * this.bodyMaxHealth / 3 && this.bodyHealth > 0) {
      this.dropArm(flags);
    }
    if (this.hasHead && this.bodyHealth < this.bodyMaxHealth / 3) {
      this.dropHead(flags);
      this.dropLoot();
      if (this.phase === PH.SNORKEL_WALKING_IN_POOL) this.dieNoLoot();
    }
  }

  get canLoseBodyParts() {
    if (this.type === 'GARGANTUAR' || this.type === 'REDEYE' || this.type === 'ZAMBONI' || this.type === 'CATAPULT' || this.type === 'BOSS') return false;
    if (this.type === 'BOBSLED') return false;
    return true;
  }

  dropArm(flags) {
    if (!this.canLoseBodyParts) return;
    if (this.shieldType === 'door' || this.shieldType === 'newspaper') return;
    if (this.phase === PH.SNORKEL_INTO_POOL || this.phase === PH.DOLPHIN_WALKING || this.phase === PH.DOLPHIN_INTO_POOL || this.phase === PH.DOLPHIN_RIDING || this.phase === PH.DOLPHIN_IN_JUMP || this.phase === PH.NEWSPAPER_READING) return;
    if (!this.hasArm) return;
    this.hasArm = false;
    this.setupReanimForLostArm(flags);
    this.board.game.audio.play('limbspop');
  }

  setupReanimForLostArm(flags) {
    // 原版: 断臂后隐藏外臂上/下/手
    this.reanimShowPrefix('Zombie_outerarm_upper', RG.HIDDEN);
    this.reanimShowPrefix('Zombie_outerarm_lower', RG.HIDDEN);
    this.reanimShowPrefix('Zombie_outerarm_hand', RG.HIDDEN);
    if (!(flags & DMG.DOESNT_LEAVE_BODY)) {
      this.board.addLimbParticle('arm', this.x + 50, this.y + 40);
    }
  }

  dropHead(flags) {
    if (!this.hasHead) return;
    this.hasHead = false;
    // 原版: 头部隐藏 + 掉头粒子
    const headTracks = this.bodyReanim ? this.bodyReanim.def.tracks.filter(t => /head/i.test(t.name)) : [];
    for (const t of headTracks) {
      if (t.name === 'anim_head1' || t.name === 'anim_head2' || t.name === 'Zombie_head') {
        this.reanimShowTrack(t.name, RG.HIDDEN);
      }
    }
    if (this.bodyReanim && this.bodyReanim.trackExists('Zombie_head')) {
      this.reanimShowTrack('Zombie_head', RG.HIDDEN);
    } else {
      this.reanimShowPrefix('anim_head1', RG.HIDDEN);
      this.reanimShowPrefix('anim_head2', RG.HIDDEN);
      this.reanimShowPrefix('Zombie_tie', RG.HIDDEN);
    }
    if (!(flags & DMG.DOESNT_LEAVE_BODY)) {
      this.board.addLimbParticle('head', this.x + 50, this.y);
    }
    this.board.game.audio.play('limbspop');
  }

  dropHelm(flags) {
    if (!this.helmType) return;
    const drawPos = this.getDrawPos();
    let px = this.posX + drawPos.imageOffsetX + drawPos.headX + 14;
    let py = this.posY + drawPos.imageOffsetY + drawPos.headY + drawPos.bodyY + 18;
    if (this.helmType === 'cone') {
      [px, py] = this.getTrackPosition('anim_cone') || [px, py];
      this.reanimShowPrefix('anim_cone', RG.HIDDEN);
      this.reanimShowPrefix('anim_hair', RG.NORMAL);
    } else if (this.helmType === 'bucket') {
      [px, py] = this.getTrackPosition('anim_bucket') || [px, py];
      this.reanimShowPrefix('anim_bucket', RG.HIDDEN);
      this.reanimShowPrefix('anim_hair', RG.NORMAL);
    } else if (this.helmType === 'football') {
      [px, py] = this.getTrackPosition('zombie_football_helmet') || [px, py];
      this.reanimShowPrefix('zombie_football_helmet', RG.HIDDEN);
      this.reanimShowPrefix('anim_hair', RG.NORMAL);
    } else if (this.helmType === 'digger') {
      this.reanimShowTrack('Zombie_digger_hardhat', RG.HIDDEN);
    } else if (this.helmType === 'bobsled') {
      this.reanimShowPrefix('anim_bucket', RG.HIDDEN);
    }
    this.helmType = null;
    this.helmHealth = 0;
    if (!(flags & DMG.DOESNT_LEAVE_BODY)) {
      this.board.addLimbParticle('helm', px, py);
    }
    this.updateDamageStates(flags);
  }

  dropShield(flags) {
    if (!this.shieldType) return;
    if (this.shieldType === 'door') {
      this.showDoorArms(false);
      if (!(flags & DMG.DOESNT_LEAVE_BODY)) this.board.addLimbParticle('door', this.x + 20, this.y + 40);
    } else if (this.shieldType === 'newspaper') {
      this.reanimShowPrefix('Zombie_paper_paper', RG.HIDDEN);
      // 报纸僵尸暴怒
      if (this.phase !== PH.NEWSPAPER_MAD && this.phase !== PH.NEWSPAPER_MADDENING) {
        this.phase = PH.NEWSPAPER_MADDENING;
        this.playZombieReanim('anim_maddening', RE.PLAY_ONCE_HOLD, 0, 24);
      }
      if (!(flags & DMG.DOESNT_LEAVE_BODY)) this.board.addLimbParticle('newspaper', this.x + 30, this.y + 50);
    } else if (this.shieldType === 'ladder') {
      this.detachShield();
    }
    this.shieldType = null;
    this.shieldHealth = 0;
    this.board.game.audio.play('shieldhit');
  }

  attachShield() {
    if (!this.bodyReanim) return;
    if (this.shieldType === 'door') {
      Zombie.setupDoorArms(this.bodyReanim, true);
    } else if (this.shieldType === 'newspaper') {
      this.reanimShowPrefix('Zombie_paper_paper', RG.NORMAL);
    } else if (this.shieldType === 'ladder') {
      this.reanimShowPrefix('Zombie_ladder_1', RG.NORMAL);
    }
  }

  detachShield() {
    if (this.shieldType === 'ladder') {
      this.reanimShowPrefix('Zombie_ladder_1', RG.HIDDEN);
      this.reanimShowPrefix('Zombie_outerarm', RG.NORMAL);   // 原版: 恢复双臂
      this.shieldType = null;
      this.shieldHealth = 0;
      // 原版 DetachShield: 相位回 NORMAL + 重选速度 (0.79→0.23-0.37 普通速) — 修复"放梯后速度不减"
      this.phase = PH.NORMAL;
      if (this.isEating) {
        this.playZombieReanim('anim_eat', RE.LOOP, 20, 0);
      } else {
        this.startWalkAnim(0);
      }
    }
  }

  getTrackPosition(name) {
    if (!this.bodyReanim || !this.bodyReanim.trackExists(name)) return null;
    return this.bodyReanim.getTrackPosition(name);
  }

  dropLoot() {
    if (this.droppedLoot) return;
    this.droppedLoot = true;
    // 原版 Zombie::Die: 掉落表 (金币/银币/钻石 概率) — 简化: 18% 金币
    if (this.fromWave !== -2 && this.board) {
      const roll = Math.random();
      if (roll < 0.14) this.board.addCoin(this.posX + 30, this.posY + 30, 25);
      else if (roll < 0.18) this.board.addCoin(this.posX + 30, this.posY + 30, 10);
    }
  }

  // ---------------- 冰冻/黄油 ----------------
  applyChill(iceTrap) {
    if (!this.canBeChilled) return;
    if (iceTrap) {
      this.iceTrapCounter = 1000;
      this.chilledCounter = 1000;
      this.board.addEffect('freezedialog', this.x, this.y);
    } else {
      if (this.chilledCounter <= 0) {
        this.chilledCounter = 1000;
        this.board.addEffect('chill', this.x, this.y);
      }
    }
    this.updateAnimSpeed();
  }

  get canBeChilled() {
    if (this.type === 'ZAMBONI' || this.isBobsledTeamWithSled) return false;
    if (this.isDeadOrDying) return false;
    if (this.phase === PH.DIGGER_TUNNELING || this.phase === PH.DIGGER_RISING || this.phase === PH.DIGGER_TUNNELING_PAUSE_WITHOUT_AXE || this.phase === PH.DIGGER_RISE_WITHOUT_AXE || this.phase === PH.RISING_FROM_GRAVE || this.phase === PH.DANCER_RISING) return false;
    if (this.mindControlled) return false;
    return true;
  }

  get canBeFrozen() {
    if (!this.canBeChilled) return false;
    if (this.phase === PH.POLEVAULTER_IN_VAULT || this.phase === PH.DOLPHIN_INTO_POOL || this.phase === PH.DOLPHIN_IN_JUMP || this.phase === PH.SNORKEL_INTO_POOL || this.isFlying || this.phase === PH.IMP_GETTING_THROWN || this.phase === PH.IMP_LANDING || this.phase === PH.BOBSLED_CRASHING || this.phase === PH.JACK_POPPING || this.phase === PH.SQUASH_RISING || this.phase === PH.SQUASH_FALLING || this.phase === PH.SQUASH_DONE_FALLING || this.isBouncingPogo) return false;
    return this.type !== 'BUNGEE' || this.phase === PH.BUNGEE_AT_BOTTOM;
  }

  hitIceTrap() {
    this.iceTrapCounter = 1000;
    this.butteredCounter = Math.min(this.butteredCounter, 0);
    this.chilledCounter = 1000;
    this.playZombieReanim('anim_frozen', RE.LOOP, 0, 0);
    this.board.game.audio.play('frozen');
    this.updateAnimSpeed();
  }

  removeIceTrap() {
    this.chilledCounter = 250;
    this.playZombieReanim('anim_idle', RE.LOOP, 0, 0);
    this.startWalkAnim(0);
    this.updateAnimSpeed();
  }

  applyButter() {
    if (!this.canBeChilled) return;
    this.butteredCounter = 500;
    this.board.game.audio.play('buttered');
    this.updateAnimSpeed();
  }

  removeButter() {
    this.startWalkAnim(0);
    this.updateAnimSpeed();
  }

  applyBurn() {
    if (this.isDeadOrDying) return;
    // 原版 Zombie::ApplyBurn: BOSS/高血量烧不死 → 只受 1800 伤害
    if (this.type === 'BOSS' || this.type === 'GARGANTUAR' || this.type === 'REDEYE' || this.bodyHealth >= 1800) {
      this.takeDamage(1800, DMG_SYS | DMG.DOESNT_CAUSE_FLASH);
      return;
    }
    this.becomeCharred();
  }

  // 焦黑僵尸替换 (原版: 生成 REANIM_ZOMBIE_CHARRED 播 crumble, 原僵尸 DieNoLoot)
  becomeCharred() {
    if (this.phase === PH.BURNED) return;
    const map = {
      CATAPULT: 'Zombie_charred_catapult', DIGGER: 'Zombie_charred_digger',
      GARGANTUAR: 'Zombie_charred_gargantuar', REDEYE: 'Zombie_charred_gargantuar',
      IMP: 'Zombie_charred_imp', ZAMBONI: 'Zombie_charred_zamboni',
    };
    const defName = map[this.type] || 'Zombie_charred';
    if (!RE.hasDef(defName)) {
      // 兜底: 无焦黑reanim → 定格烧黑 (色染)
      this.phase = PH.BURNED;
      this.phaseCounter = 200;
      this.velX = 0;
      this.stopEating();
      if (this.bodyReanim) {
        this.bodyReanim.colorOverride = [30, 24, 20, 255];
        this.bodyReanim.animRate = 0;
      }
      this.board.game.audio.play('zombie_burnt');
      return;
    }
    // 替换 reanim 实例 (保留位置/缩放)
    const old = this.bodyReanim;
    const r = Assets.reanim(defName);
    if (old) {
      r.x = old.x; r.y = old.y;
      r.scaleX = old.scaleX; r.scaleY = old.scaleY;
    }
    // 原版: crumble 粉碎动画 速率×0.9-1.1 随机
    r.play('anim_crumble', RE.PLAY_ONCE_HOLD, 24 * (0.9 + Math.random() * 0.2));
    this.bodyReanim = r;
    this.phase = PH.BURNED;
    this.charredDef = defName;
    this.velX = 0;
    this.stopEating();
    this.board.game.audio.play('zombie_burnt');
  }

  updateBurn() {
    // 焦黑僵尸: crumble 播完消失 (原版 reanim 播完 DieNoLoot)
    const r = this.bodyReanim;
    if (this.charredDef && r && r.loopCount > 0) {
      this.dieNoLoot();
      return;
    }
    this.phaseCounter--;
    if (this.phaseCounter <= 0) this.dieNoLoot();
  }

  // ---------------- 死亡 ----------------
  playDeathAnim(flags) {
    if (this.phase === PH.DYING || this.phase === PH.BURNED || this.phase === PH.MOWERED) return;
    const r = this.bodyReanim;
    if (!r || !r.animExists('anim_death')) { this.dieNoLoot(); return; }
    if (this.type === 'DOLPHIN' && this.phase !== PH.DOLPHIN_WALKING_IN_POOL) { this.dieNoLoot(); return; }
    if (this.phase === PH.SNORKEL_INTO_POOL || this.phase === PH.SNORKEL_WALKING) { this.dieNoLoot(); return; }
    if (this.iceTrapCounter > 0) this.iceTrapCounter = 0;
    if (this.butteredCounter > 0) this.butteredCounter = Math.min(this.butteredCounter, 0);
    if (flags & DMG.DOESNT_LEAVE_BODY) {
      if (this.type !== 'BOSS' && this.type !== 'GARGANTUAR' && this.type !== 'REDEYE') { this.dieNoLoot(); return; }
    }
    if (this.type === 'POGO') this.altitude = 0;
    this.stopEating();
    if (this.shieldType) this.dropShield(1);
    this.velX = 0;
    this.phase = PH.DYING;
    if (this.zombieHeight === H.UP_LADDER) this.zombieHeight = H.FALLING;

    let rate;
    if (this.type === 'FOOTBALL') rate = 24;
    else if (this.type === 'GARGANTUAR' || this.type === 'REDEYE') { rate = 14; this.board.game.audio.play('gargantuardeath'); }
    else if (this.type === 'SNORKEL') rate = 14;
    else if (this.type === 'DIGGER') rate = 18;
    else if (this.type === 'YETI') rate = 14;
    else if (this.type === 'BOSS') rate = 18;
    else rate = 24 + Math.random() * 6;

    let track = 'anim_death';
    const hit = Math.random() * 100;
    if (this.inPool && r.animExists('anim_waterdeath')) track = 'anim_waterdeath';
    else if (hit > 50 && r.animExists('anim_death2')) track = 'anim_death2';
    this.playZombieReanim(track, RE.PLAY_ONCE_HOLD, 20, rate);
    this.reanimShowPrefix('anim_tongue', RG.HIDDEN);
  }

  updateDeath() {
    const r = this.bodyReanim;
    if (!r) { this.dieNoLoot(); return; }
    if (this.zombieHeight === H.FALLING) this.updateZombieFalling();
    if (this.type === 'GARGANTUAR' || this.type === 'REDEYE') {
      if (r.shouldTrigger(0.89)) this.board.shakeBoard(0, 3);
      else if (r.shouldTrigger(0.98)) this.board.shakeBoard(0, 1);
    }
    if (this.type === 'ZAMBONI' && this.phaseCounter > 0) {
      this.phaseCounter--;
      if (this.phaseCounter === 0) {
        this.board.addEffect('boom', this.posX + 80, this.posY + 60, {});
        this.dieWithLoot();
      }
    } else if (this.type === 'CATAPULT') {
      this.phaseCounter--;
      if (this.phaseCounter === 0) {
        this.board.addEffect('boom', this.posX + 80, this.posY + 60, {});
        this.dieWithLoot();
      }
    } else if (this.zombieFade === -1 && r.loopCount > 0 && this.type !== 'BOSS') {
      this.zombieFade = this.inPool ? 10 : 100;
    }
    // 倒地音效
    if (!this.inPool) {
      const fallTime = this.fallTime;
      if (fallTime > 0 && r.shouldTrigger(fallTime)) {
        this.board.game.audio.play('zombiefalling');
      }
    }
  }

  get fallTime() {
    switch (this.type) {
      case 'SNORKEL': case 'ZAMBONI': case 'DOLPHIN': case 'BUNGEE': case 'CATAPULT': case 'IMP': case 'BOSS': return -1;
      case 'NORMAL': case 'FLAG': case 'CONE': case 'BUCKET': case 'DOOR': case 'DUCKY':
        if (this.bodyReanim.isPlaying('anim_superlongdeath')) return 0.788;
        if (this.bodyReanim.isPlaying('anim_death2')) return 0.71;
        return 0.77;
      case 'POLEVAULTER': return 0.68;
      case 'FOOTBALL': return 0.52;
      case 'NEWSPAPER': return 0.63;
      case 'DANCER': case 'BACKUP': return 0.83;
      case 'BOBSLED': return 0.81;
      case 'JACK': return 0.64;
      case 'BALLOON': return 0.68;
      case 'DIGGER': return 0.85;
      case 'POGO': return 0.84;
      case 'YETI': return 0.68;
      case 'LADDER': return 0.62;
      case 'GARGANTUAR': case 'REDEYE': return 0.86;
      default: return -1;
    }
  }

  dieNoLoot() {
    this.dead = true;
    if (this.bodyReanim) this.bodyReanim.reanimDie();
    if (this.flagReanim) this.flagReanim.reanimDie();
    if (this.specialHeadReanim) this.specialHeadReanim.reanimDie();
    if (this.type === 'BOBSLED') {
      for (const fz of this.followerZombies) {
        if (fz && !fz.dead) fz.bobsledDie();
      }
    }
  }

  bobsledDie() {
    this.dieNoLoot();
  }

  dieWithLoot() {
    this.dropLoot();
    this.dieNoLoot();
  }

  mowDown() {
    if (this.isDeadOrDying) return;
    this.playZombieReanim('anim_mowed', RE.PLAY_ONCE_HOLD, 0, 30);
    this.board.game.audio.play('mowed');
    this.zombieFade = 100;
    this.phase = PH.MOWERED;
    this.zombieHeight = H.NORMAL;
    this.velX = 0;
    this.bodyReanim.overlay[0] = 1;
    this.bodyReanim.overlay[3] = 0.5;
    this.altitude = 0;
  }

  updateMowered() {
    if (this.bodyReanim.loopCount > 0) {
      this.zombieFade = Math.min(this.zombieFade, 10);
    }
    if (this.zombieFade > 0) {
      this.zombieFade--;
      if (this.zombieFade === 0) this.dieNoLoot();
    }
  }

  // ---------------- 绘制 ----------------
  updateReanim() {
    const r = this.bodyReanim;
    if (!r || r.dead) return;
    const drawPos = this.getDrawPos();
    let offsetX = drawPos.imageOffsetX + 15;
    let offsetY = drawPos.imageOffsetY + drawPos.bodyY - 28 + 20;
    if ((this.type === 'ZAMBONI' || this.type === 'CATAPULT') && this.phase !== PH.BURNED) {
      if (this.phase === PH.DYING) {
        const shakeRange = curve(0.7, 1, r.animTime, 0, 1, 'ease_out');
        offsetX += (Math.random() * 2 - 1) * shakeRange;
        offsetY += (Math.random() * 2 - 1) * shakeRange;
      } else if (this.bodyHealth < 200) {
        offsetX += Math.random() * 2 - 1;
        offsetY += Math.random() * 2 - 1;
      }
    }
    if (this.type === 'FOOTBALL' && this.scaleZombie < 1) {
      offsetY += 20 - this.scaleZombie * 20;
    }

    let opposite = this.isWalkingBackwards;
    if (this.type === 'DANCER' || this.type === 'BACKUP') {
      opposite = false;
      if (this.phase === PH.DANCER_DANCING_IN && !this.isEating) opposite = true;
      if (this.mindControlled) opposite = !opposite;
    }
    if (opposite) offsetX += 90 * this.scaleZombie;

    // overlay 矩阵 (原版: mOverlayMatrix)
    const ov = r.overlay;
    ov[1] = 0; ov[2] = 0;
    ov[0] = this.scaleZombie;
    ov[3] = this.scaleZombie;
    r.setPosition(offsetX + 30 - this.scaleZombie * 30, offsetY + 120 - this.scaleZombie * 120);
    if (opposite) ov[0] = -this.scaleZombie;
    if (this.phase === PH.MOWERED) {
      // 割草机压扁
      ov[0] = this.scaleZombie;
      ov[3] = this.scaleZombie * 0.5;
      ov[5] = offsetY + 120 - this.scaleZombie * 120 + 30;
    }
    // 注: reanim 的 animTime 由 board 中央池推进 (原版 ReanimationHolder 语义)
  }

  getDrawPos() {
    const dp = {
      imageOffsetX: this.posX - this.x,
      imageOffsetY: this.posY - this.y,
      headX: 50, headY: 4, armY: 2,
      bodyY: -this.altitude,
      clipHeight: CLIP_HEIGHT_OFF,
    };
    switch (this.type) {
      case 'FOOTBALL': dp.imageOffsetY -= 16; break;
      case 'YETI': dp.imageOffsetY -= 20; break;
      case 'CATAPULT': dp.imageOffsetX -= 25; dp.imageOffsetY -= 18; break;
      case 'POGO': dp.imageOffsetY += 16; break;
      case 'BALLOON': dp.imageOffsetY += 17; break;
      case 'POLEVAULTER': dp.imageOffsetX -= 6; dp.imageOffsetY -= 11; break;
      case 'ZAMBONI': dp.imageOffsetX += 68; dp.imageOffsetY -= 23; break;
      case 'GARGANTUAR': case 'REDEYE': dp.imageOffsetY -= 8; break;
      case 'BOBSLED': dp.imageOffsetY -= 12; break;
    }
    if (this.phase === PH.RISING_FROM_GRAVE) {
      dp.bodyY = -this.altitude;
      if (this.inPool) dp.clipHeight = dp.bodyY;
      else dp.clipHeight = dp.bodyY + Math.min(this.phaseCounter, 40);
      if (this.isOnHighGround) dp.bodyY -= HIGH_GROUND_HEIGHT;
      return dp;
    }
    if (this.type === 'DOLPHIN') {
      const r = this.bodyReanim;
      if (this.phase === PH.DOLPHIN_INTO_POOL) {
        if (r.animTime >= 0.56 && r.animTime <= 0.65) dp.clipHeight = 0;
        else if (r.animTime >= 0.75) dp.clipHeight = -this.altitude - 10;
      } else if (this.phase === PH.DOLPHIN_RIDING) {
        dp.imageOffsetX += 70;
        dp.clipHeight = this.zombieHeight === H.DRAGGED_UNDER ? -this.altitude - 15 : -this.altitude - 10;
      } else if (this.phase === PH.DOLPHIN_IN_JUMP) {
        dp.imageOffsetX += 70 + this.altitude;
        if (r.animTime <= 0.06) dp.clipHeight = -this.altitude - 10;
        else if (r.animTime >= 0.5 && r.animTime <= 0.76) dp.clipHeight = -13;
      } else if (this.phase === PH.DOLPHIN_WALKING_IN_POOL || this.phase === PH.DYING) {
        dp.imageOffsetY += 50;
        if (this.phase === PH.DYING) dp.clipHeight = -this.altitude + 44;
        else if (this.zombieHeight === H.DRAGGED_UNDER) dp.clipHeight = -this.altitude + 36;
      } else if ((this.phase === PH.DOLPHIN_WALKING || this.phase === PH.DOLPHIN_WALKING_WITHOUT_DOLPHIN) && this.zombieHeight === H.OUT_OF_POOL) {
        dp.clipHeight = -this.altitude;
      }
      return dp;
    }
    if (this.type === 'SNORKEL') {
      const r = this.bodyReanim;
      dp.bodyY = -this.altitude;
      dp.clipHeight = CLIP_HEIGHT_OFF;
      if (this.phase === PH.SNORKEL_INTO_POOL) {
        if (r.animTime >= 0.8) dp.clipHeight = -10;
      } else if (this.inPool) {
        dp.clipHeight = -this.altitude - 5;
        dp.clipHeight += 20 - 20 * this.scaleZombie;
      }
      return dp;
    }
    if (this.inPool) {
      dp.bodyY = -this.altitude;
      dp.clipHeight = -this.altitude - 7;
      dp.clipHeight += 10 - 10 * this.scaleZombie;
      if (this.isEating) dp.clipHeight += 7;
    } else if (this.phase === PH.DANCER_RISING) {
      dp.bodyY = -this.altitude;
      dp.clipHeight = -this.altitude;
      if (this.isOnHighGround) dp.bodyY -= HIGH_GROUND_HEIGHT;
    } else if (this.phase === PH.DIGGER_RISING || this.phase === PH.DIGGER_RISE_WITHOUT_AXE) {
      dp.bodyY = -this.altitude;
      dp.clipHeight = this.phaseCounter > 20 ? -this.altitude : CLIP_HEIGHT_OFF;
    } else if (this.type === 'BUNGEE') {
      dp.bodyY = -this.altitude;
      dp.imageOffsetX -= 18;
      if (this.isOnHighGround) dp.bodyY -= HIGH_GROUND_HEIGHT;
      dp.clipHeight = CLIP_HEIGHT_OFF;
    } else {
      dp.bodyY = -this.altitude;
      dp.clipHeight = CLIP_HEIGHT_OFF;
    }
    return dp;
  }

  getZombieRect() {
    const zr = { ...this.zombieRect };
    if (this.isWalkingBackwards) zr.x = this.width - zr.x - zr.w;
    const dp = this.getDrawPos();
    zr.x += this.x;
    zr.y += this.y + dp.bodyY;
    if (dp.clipHeight > CLIP_HEIGHT_LIMIT) {
      zr.h -= dp.clipHeight;
      zr.h = Math.max(zr.h, 0);
    }
    return zr;
  }

  getZombieAttackRect() {
    const ar = { ...this.zombieAttackRect };
    if (this.isWalkingBackwards) ar.x = this.width - ar.x - ar.w;
    const dp = this.getDrawPos();
    ar.x += this.x;
    ar.y += this.y + dp.bodyY;
    return ar;
  }

  drawShadow(ctx) {
    if (this.dead || this.type === 'BUNGEE' || this.type === 'BALLOON') return;
    const dp = this.getDrawPos();
    const alpha = this.zombieFade >= 0 ? Math.min(1, this.zombieFade / 10) : 1;
    ctx.save();
    ctx.globalAlpha = 0.25 * alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const sw = this.type === 'GARGANTUAR' || this.type === 'REDEYE' ? 100 : (this.type === 'ZAMBONI' || this.type === 'CATAPULT' ? 120 : 60);
    ctx.ellipse(this.x + 55, this.y + dp.bodyY + 105, sw / 2, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    if (this.dead) return;
    const r = this.bodyReanim;
    if (!r) return;
    const dp = this.getDrawPos();

    // 原版 GameObject::BeginDraw: g->Translate(mX, mY) — reanim overlay 为相对偏移
    ctx.save();
    ctx.translate(this.x, this.y);

    // 剪裁 (泳池/地道遮挡, 原版相对坐标)
    let clipSave = null;
    if (dp.clipHeight > CLIP_HEIGHT_LIMIT) {
      clipSave = true;
      const drawHeight = 120 - dp.clipHeight + 71;
      ctx.beginPath();
      ctx.rect(dp.imageOffsetX - 200, dp.imageOffsetY + dp.bodyY - 78, 520, drawHeight);
      ctx.clip();
    }

    // 颜色状态 (DrawReanim)
    let fadeAlpha = 255;
    if (this.zombieFade >= 0) fadeAlpha = clamp(255 * this.zombieFade / 10, 0, 255);
    let colorOverride = [255, 255, 255, fadeAlpha];
    let extraAdditive = [0, 0, 0, 0];
    let enableAdditive = false;
    if (this.phase === PH.BURNED) {
      colorOverride = [0, 0, 0, fadeAlpha];
    } else if (this.mindControlled) {
      colorOverride = [128, 64, 192, fadeAlpha];
      extraAdditive = [128, 64, 192, fadeAlpha / 2];
      enableAdditive = true;
    } else if (this.chilledCounter > 0 || this.iceTrapCounter > 0) {
      colorOverride = [75, 75, 255, fadeAlpha];
      extraAdditive = [75, 75, 255, fadeAlpha / 4];
      enableAdditive = true;
    }
    if (this.justGotShotCounter > 0 && !this.isBobsledTeamWithSled) {
      const grayness = this.justGotShotCounter * 10;
      extraAdditive = [Math.min(255, grayness + extraAdditive[0]), Math.min(255, grayness + extraAdditive[1]), Math.min(255, grayness + extraAdditive[2]), 255];
      enableAdditive = true;
    }
    r.colorOverride = colorOverride;
    r.extraAdditiveColor = extraAdditive;
    r.enableExtraAdditiveDraw = enableAdditive;

    // 绘制主体 (普通组)
    if (this.type === 'BOBSLED') {
      // 雪橇前后件
      this.drawBobsledReanim(ctx, dp, true);
      r.drawRenderGroup(ctx, RG.NORMAL);
      this.drawBobsledReanim(ctx, dp, false);
    } else if (this.type === 'BUNGEE') {
      this.drawBungeeReanim(ctx);
    } else {
      r.drawRenderGroup(ctx, RG.NORMAL);
    }

    // 盾牌层 (水花轨道也在SHIELD组)
    if (this.shieldType) {
      if (this.phase === PH.BURNED) {
        r.colorOverride = [0, 0, 0, fadeAlpha];
        r.extraAdditiveColor = [0, 0, 0, 0];
        r.enableExtraAdditiveDraw = false;
      } else if (this.shieldJustGotShotCounter > 0) {
        const grayness = this.shieldJustGotShotCounter * 10;
        r.colorOverride = [grayness, grayness, grayness, fadeAlpha];
        r.extraAdditiveColor = [255, 255, 255, 255];
        r.enableExtraAdditiveDraw = true;
      } else {
        r.colorOverride = [255, 255, 255, fadeAlpha];
        r.extraAdditiveColor = [0, 0, 0, 0];
        r.enableExtraAdditiveDraw = false;
      }
      let shieldHitOffset = 0;
      if (this.shieldRecoilCounter > 0) {
        shieldHitOffset = lerp(0, 3, this.shieldRecoilCounter / 12);
      }
      ctx.save();
      ctx.translate(shieldHitOffset, 0);
      r.drawRenderGroup(ctx, RG.SHIELD);
      ctx.restore();
    }
    // 水花轨道 (无盾牌也绘制)
    if (!this.shieldType && this.type !== 'BUNGEE') {
      r.drawRenderGroup(ctx, RG.SHIELD);
    }
    // OVER_SHIELD 层 (盾上身体部分: 报纸头/门内身体)
    if (this.shieldType === 'newspaper' || this.shieldType === 'door' || this.shieldType === 'ladder') {
      r.colorOverride = colorOverride;
      r.extraAdditiveColor = extraAdditive;
      r.enableExtraAdditiveDraw = enableAdditive;
      r.drawRenderGroup(ctx, RG.OVER_SHIELD);
    }

    if (clipSave) { /* clip 在外层 restore 中一并释放 */ }
    ctx.restore();   // BeginDraw/EndDraw
  }

  drawBobsledReanim(ctx, dp, before) {
    const pos = this.getBobsledPosition();
    if (pos === -1) return;
    // 原版: 领头僵尸画雪橇; 雪橇在僵尸前/后分两层
    if (pos !== 0) return;
    const r = this.bodyReanim;
    if (!r) return;
    // 雪橇轨道绘制
    const sled = r.tracks[r.trackIndex('Zombie_bobsled_sled')] ? 'Zombie_bobsled_sled' : null;
    void sled;
    // 简化: 雪橇作为 SHIELD 组绘制于僵尸下方
    r.drawRenderGroup(ctx, before ? RG.SHIELD : RG.OVER_SHIELD);
  }

  drawBungeeReanim(ctx) {
    const r = this.bodyReanim;
    if (!r) return;
    // 绳子 (相对坐标: ctx 已 translate(this.x, this.y))
    if (this.phase !== PH.BUNGEE_CUTSCENE) {
      ctx.save();
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const ropeX = 60;
      ctx.moveTo(ropeX, -60);
      ctx.lineTo(ropeX, 30);
      ctx.stroke();
      ctx.restore();
    }
    r.drawRenderGroup(ctx, RG.NORMAL);
    // 抓住植物上提 (drawAt 内部自行处理绝对坐标 — 需先抵消外层平移)
    if (this.stolenPlant && !this.stolenPlant.dead) {
      ctx.save();
      ctx.translate(-this.x, -this.y);
      const p = this.stolenPlant;
      p.drawAt(ctx, this.x, this.y + 20 - (3000 - this.altitude) * 0.02);
      ctx.restore();
    }
  }

  // ---------- 兼容层 (供其他模块调用) ----------
  get body() { return this.bodyHealth; }
  get helm() { return this.helmHealth; }
  get shield() { return this.shieldHealth; }
  get boss() { return this.type === 'BOSS'; }
  get underwater() { return this.type === 'SNORKEL' && (this.inPool || this.phase === PH.SNORKEL_WALKING_IN_POOL) && !this.isEating; }
  get underground() { return this.type === 'DIGGER' && (this.phase === PH.DIGGER_TUNNELING || this.phase === PH.DIGGER_TUNNELING_PAUSE_WITHOUT_AXE); }
  get flyingHigh() { return this.phase === PH.BALLOON_FLYING; }
  get butter() { return this.butteredCounter > 0; }
  set butter(v) { if (v) this.applyButter(); }
  get phaseName() {
    switch (this.phase) {
      case PH.DYING: case PH.BURNED: case PH.MOWERED: return 'dying';
      default: return 'walk';
    }
  }
  get zombieType() { return this.type; }
}

module.exports = { Zombie, PH, H, DMG, RG, ZDEF, rectOverlap };
