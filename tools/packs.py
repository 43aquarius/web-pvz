#!/usr/bin/env python3
"""packs.py — 按需加载分包构建 (生成 assets/packs/*.wpz + assets/lazy.json)
分包策略:
  ui          : 菜单/标题/HUD/选项/图鉴/奖励/纸条/失败 + SelectorScreen/CrazyDave/RSP/FinalWave
  bg_day ...  : 各场景背景 + 场景专属图 (pool/fog/roof/boss)
  fx          : 阳光/金币/子弹/爆炸/水花/割草机 reanim 等战斗公共素材
  plant_<TYPE>: 每种植物一个包 (reanim + 独占图); 共享图归解锁顺序最早的植物
  zombie_core : Zombie 基础 reanim (NORMAL/CONE/BUCKET/DOOR/FLAG/DUCKY 共用) + 烧焦 + 旗帜
  zombie_<T>  : 特殊僵尸各自包
  garden      : 禅园素材
  misc        : 未使用的 reanim (credits/slotmachine 等)
包格式 WPZ2: [4B magic][4B LE idxLen][idx JSON][raw: 图片字节 + reanim JSON 文本]
"""
import json, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = ROOT

IMG_DIR = os.path.join(WEB, 'assets/images')
REANIM_DIR = os.path.join(WEB, 'assets/reanim')
PACK_DIR = os.path.join(WEB, 'assets/packs')

# ---- 植物 → reanim 映射 (与 data.js PLANTS.reanim 一致) ----
PLANT_REANIM = {
    'PEASHOOTER': 'PeaShooterSingle', 'SUNFLOWER': 'SunFlower', 'CHERRYBOMB': 'CherryBomb',
    'WALLNUT': 'Wallnut', 'POTATOMINE': 'PotatoMine', 'SNOWPEA': 'SnowPea', 'CHOMPER': 'Chomper',
    'REPEATER': 'PeaShooter', 'PUFFSHROOM': 'PuffShroom', 'SUNSHROOM': 'SunShroom',
    'FUMESHROOM': 'FumeShroom', 'GRAVEBUSTER': 'Gravebuster', 'HYPNOSHROOM': 'HypnoShroom',
    'SCAREDYSHROOM': 'ScaredyShroom', 'ICESHROOM': 'IceShroom', 'DOOMSHROOM': 'DoomShroom',
    'LILYPAD': 'LilyPad', 'SQUASH': 'Squash', 'THREEPEATER': 'ThreePeater', 'TANGLEKELP': 'Tanglekelp',
    'JALAPENO': 'Jalapeno', 'SPIKEWEED': 'Caltrop', 'TORCHWOOD': 'Torchwood', 'TALLNUT': 'Tallnut',
    'SEASHROOM': 'SeaShroom', 'PLANTERN': 'Plantern', 'CACTUS': 'Cactus', 'BLOVER': 'Blover',
    'SPLITPEA': 'SplitPea', 'STARFRUIT': 'Starfruit', 'PUMPKIN': 'Pumpkin', 'MAGNETSHROOM': 'Magnetshroom',
    'CABBAGEPULT': 'Cabbagepult', 'FLOWERPOT': 'Pot', 'KERNELPULT': 'Cornpult', 'COFFEEBEAN': 'Coffeebean',
    'GARLIC': 'Garlic', 'UMBRELLALEAF': 'Umbrellaleaf', 'MARIGOLD': 'Marigold', 'MELONPULT': 'Melonpult',
    'GATLINGPEA': 'GatlingPea', 'TWINSUNFLOWER': 'TwinSunflower', 'GLOOMSHROOM': 'GloomShroom',
    'CATTAIL': 'Cattail', 'WINTERMELON': 'WinterMelon', 'GOLDMAGNET': 'GoldMagnet',
    'SPIKEROCK': 'SpikeRock', 'COBCANNON': 'CobCannon', 'IMITATER': 'Imitater',
}
# 解锁顺序 (SEED_ORDER) — 共享图归属判定用
SEED_ORDER = ['PEASHOOTER', 'SUNFLOWER', 'CHERRYBOMB', 'WALLNUT', 'POTATOMINE', 'SNOWPEA', 'CHOMPER',
              'REPEATER', 'PUFFSHROOM', 'SUNSHROOM', 'FUMESHROOM', 'GRAVEBUSTER', 'HYPNOSHROOM',
              'SCAREDYSHROOM', 'ICESHROOM', 'DOOMSHROOM', 'LILYPAD', 'SQUASH', 'THREEPEATER',
              'TANGLEKELP', 'JALAPENO', 'SPIKEWEED', 'TORCHWOOD', 'TALLNUT', 'SEASHROOM', 'PLANTERN',
              'CACTUS', 'BLOVER', 'SPLITPEA', 'STARFRUIT', 'PUMPKIN', 'MAGNETSHROOM', 'CABBAGEPULT',
              'FLOWERPOT', 'KERNELPULT', 'COFFEEBEAN', 'GARLIC', 'UMBRELLALEAF', 'MARIGOLD', 'MELONPULT']

# ---- 僵尸 → reanim 映射 (与 data.js 一致) ----
ZOMBIE_REANIM = {
    'NORMAL': 'Zombie', 'FLAG': 'Zombie', 'CONE': 'Zombie', 'BUCKET': 'Zombie', 'DOOR': 'Zombie',
    'DUCKY': 'Zombie',
    'POLEVAULTER': 'Zombie_polevaulter', 'NEWSPAPER': 'Zombie_paper', 'FOOTBALL': 'Zombie_football',
    'DANCER': 'Zombie_dancer', 'BACKUP': 'Zombie_backup', 'SNORKEL': 'Zombie_snorkle',
    'ZAMBONI': 'Zombie_zamboni', 'BOBSLED': 'Zombie_bobsled', 'DOLPHIN': 'Zombie_dolphinrider',
    'JACK': 'Zombie_jackbox', 'BALLOON': 'Zombie_balloon', 'DIGGER': 'Zombie_digger',
    'POGO': 'Zombie_pogo', 'YETI': 'Zombie_yeti', 'BUNGEE': 'Zombie_bungi', 'LADDER': 'Zombie_ladder',
    'CATAPULT': 'Zombie_catapult', 'GARGANTUAR': 'Zombie_gargantuar', 'REDEYE': 'Zombie_gargantuar',
    'IMP': 'Zombie_imp', 'BOSS': 'Zombie_boss',
}
# 僵尸类型额外依赖包 (召唤/携带)
ZOMBIE_DEPS = {
    'GARGANTUAR': ['zombie_imp'], 'REDEYE': ['zombie_imp'], 'DANCER': ['zombie_backup'],
    'BOSS': ['zombie_core'],
}
# 烧焦变体 reanim → 所属僵尸包
CHARRED_MAP = {
    'Zombie_charred': 'zombie_core', 'Zombie_charred_digger': 'zombie_digger',
    'Zombie_charred_gargantuar': 'zombie_gargantuar', 'Zombie_charred_imp': 'zombie_imp',
    'Zombie_charred_zamboni': 'zombie_zamboni', 'Zombie_charred_catapult': 'zombie_catapult',
}

# 基础 reanim → 包
CORE_REANIM_PACK = {
    'SelectorScreen': 'ui', 'CrazyDave': 'ui', 'StartReadySetPlant': 'ui', 'FinalWave': 'ui',
    'Sun': 'fx', 'Coin_gold': 'fx', 'Coin_silver': 'fx', 'Diamond': 'fx',
    'Puff': 'fx', 'FirePea': 'fx', 'LawnMower': 'fx', 'PoolCleaner': 'fx', 'RoofCleaner': 'fx',
    'Splash': 'fx', 'SodRoll': 'bg_day', 'Rain_circle': 'bg_fog', 'Rain_splash': 'bg_fog',
    'Credits_Flower_petals': 'misc', 'SlotMachine': 'misc', 'TreeFood': 'garden',
    'Zombie_FlagPole': 'zombie_core', 'Zombie_flagpole': 'zombie_core',
    'LawnMoweredZombie': 'zombie_core',
    'Zombie_hand': 'zombie_core', 'Zombie_surprise': 'zombie_core',
    'Zombie_boss_fireball': 'zombie_boss', 'Zombie_boss_iceball': 'zombie_boss',
    'Zombie_Boss_driver': 'zombie_boss', 'Zombie_Jackson': 'misc', 'Zombie_disco': 'misc',
    'Zombie_credits_conehead': 'misc', 'Zombie_credits_dance': 'misc', 'Zombie_credits_screendoor': 'misc',
    # 远端 v7 新增 reanim 归属 (目录文件名精确匹配)
    'Hammer': 'fx',                    # 罐子锤击 (vasebreaker 加载 fx)
    'fire': 'fx', 'splash': 'fx', 'Z': 'fx', 'TextFadeOn': 'ui',
    'Rake': 'ui', 'ZombiesWon': 'ui', 'LoadBar_Zombiehead': 'ui', 'LoadBar_sprout': 'ui',
    'ZenGarden_wateringcan': 'garden', 'ZenGarden_fertilizer': 'garden', 'ZenGarden_bugspray': 'garden',
    'ZenGarden_phonograph': 'garden', 'ZenGarden_sprout': 'garden', 'Stinky': 'garden',
    'treeofWisdom': 'garden', 'TreeOfWisdomClouds': 'garden',
    'Digger_rising_dirt': 'zombie_digger',
    'zombatar_zombie_head': 'misc',
}

UI_PREFIXES = (
    'selector', 'titlescreen', 'menu', 'button', 'options', 'credits', 'seedchooser', 'seedbank',
    'seeds', 'shovel', 'flagmeter', 'almanac', 'award', 'zombieswon', 'brain', 'trophy',
    'zombienote', 'finalwave', 'approach', 'rake', 'slotmachine', 'loadhint', 'letter', 'pause',
    'moregames', 'grass_tutorial', 'conveyorbelt', 'loadbar', 'seedpacket', 'lock', 'moregames',
)
FX_PREFIXES = (
    'projectile', 'pea', 'snowpea', 'firepea', 'cabbagepult_cabbage', 'cornpult_kernal',
    'cornpult_butter', 'melonpult_melon', 'wintermelon_melon', 'cattail_spike', 'projectile_',
    'splat', 'explosion', 'powie', 'spudow', 'pow', 'ice', 'dust', 'zzz', 'sun', 'coin',
    'mindcontrol', 'plantshadow', 'tombstone', 'whitewater', 'water', 'bossexplosion', 'doom',
    'puff', 'fume', 'star', 'umbrella', 'gift', 'present', 'pinata',
)
SCENE_PREFIXES = (
    ('bg_day', ('background1', 'sod1row', 'sod3row', 'sodrollcap', 'grass')),
    ('bg_night', ('background2',)),
    ('bg_pool', ('background3', 'pool')),
    ('bg_fog', ('background4', 'fog')),
    ('bg_roof', ('background5', 'background6', 'crater_roof')),
)
GARDEN_PREFIXES = ('zengarden', 'treefood', 'daisy', 'moneybag', 'lanternshine', 'pot_water', 'rake')

# 僵尸专属图片前缀 → 包 (防具损伤阶段/变体等非 reanim 引用图)
ZOMBIE_IMG_PACK = (
    ('zombie_paper_', 'zombie_newspaper'), ('zombie_ladder_', 'zombie_ladder'),
    ('zombie_football_', 'zombie_football'), ('zombie_zamboni_', 'zombie_zamboni'),
    ('zombie_catapult_', 'zombie_catapult'), ('zombie_gargantuar_', 'zombie_gargantuar'),
    ('zombie_gargantua_', 'zombie_gargantuar'), ('zombie_polevaulter_', 'zombie_polevaulter'),
    ('zombie_snorkle_', 'zombie_snorkel'), ('zombie_digger_', 'zombie_digger'),
    ('zombie_pogo_', 'zombie_pogo'), ('zombie_yeti_', 'zombie_yeti'),
    ('zombie_bungi_', 'zombie_bungee'), ('zombie_bobsled_', 'zombie_bobsled'),
    ('zombie_balloon_', 'zombie_balloon'), ('zombie_jackbox_', 'zombie_jack'),
    ('zombie_dancer_', 'zombie_dancer'), ('zombie_backup_', 'zombie_backup'),
    ('zombie_dolphinrider_', 'zombie_dolphin'), ('zombie_imp_', 'zombie_imp'),
    ('zombie_boss', 'zombie_boss'),
    ('digger_rising_dirt', 'zombie_digger'),
)

# 植物名前缀 → 包 (损伤阶段/额外帧等非 reanim 引用图)
PLANT_IMG_PREFIX = [
    ('potatomine', 'plant_POTATOMINE'), ('flowerpot', 'plant_FLOWERPOT'), ('pot_', 'plant_FLOWERPOT'),
    ('peashooter', 'plant_PEASHOOTER'), ('sunflower', 'plant_SUNFLOWER'), ('cherrybomb', 'plant_CHERRYBOMB'),
    ('wallnut', 'plant_WALLNUT'), ('snowpea', 'plant_SNOWPEA'), ('chomper', 'plant_CHOMPER'),
    ('repeater', 'plant_REPEATER'), ('puffshroom', 'plant_PUFFSHROOM'), ('sunshroom', 'plant_SUNSHROOM'),
    ('fumeshroom', 'plant_FUMESHROOM'), ('gravebuster', 'plant_GRAVEBUSTER'), ('hypnoshroom', 'plant_HYPNOSHROOM'),
    ('scaredyshroom', 'plant_SCAREDYSHROOM'), ('iceshroom', 'plant_ICESHROOM'), ('doomshroom', 'plant_DOOMSHROOM'),
    ('lilypad', 'plant_LILYPAD'), ('squash', 'plant_SQUASH'), ('threepeater', 'plant_THREEPEATER'),
    ('tanglekelp', 'plant_TANGLEKELP'), ('jalapeno', 'plant_JALAPENO'), ('caltrop', 'plant_SPIKEWEED'),
    ('spikeweed', 'plant_SPIKEWEED'), ('spikerock', 'plant_SPIKEROCK'), ('torchwood', 'plant_TORCHWOOD'),
    ('tallnut', 'plant_TALLNUT'), ('seashroom', 'plant_SEASHROOM'), ('plantern', 'plant_PLANTERN'),
    ('cactus', 'plant_CACTUS'), ('blover', 'plant_BLOVER'), ('splitpea', 'plant_SPLITPEA'),
    ('starfruit', 'plant_STARFRUIT'), ('pumpkin', 'plant_PUMPKIN'), ('magnetshroom', 'plant_MAGNETSHROOM'),
    ('cabbagepult', 'plant_CABBAGEPULT'), ('cornpult', 'plant_KERNELPULT'), ('coffeebean', 'plant_COFFEEBEAN'),
    ('garlic', 'plant_GARLIC'), ('umbrellaleaf', 'plant_UMBRELLALEAF'), ('marigold', 'plant_MARIGOLD'),
    ('melonpult', 'plant_MELONPULT'), ('gatlingpea', 'plant_GATLINGPEA'), ('twinsunflower', 'plant_TWINSUNFLOWER'),
    ('gloomshroom', 'plant_GLOOMSHROOM'), ('cattail', 'plant_CATTAIL'), ('wintermelon', 'plant_WINTERMELON'),
    ('goldmagnet', 'plant_GOLDMAGNET'), ('cobcannon', 'plant_COBCANNON'), ('imitater', 'plant_IMITATER'),
]

# 其余明确归类 (代码直接引用但非 reanim 引用)
EXTRA_IMG_PACK = {
    'crater': 'fx', 'crater_fading': 'fx', 'crater_water_day': 'fx', 'crater_water_night': 'fx',
    'splash': 'fx', 'splash_': 'fx', 'splash_particle': 'fx', 'splash_ring': 'fx',
    'fire': 'fx', 'hammer_': 'fx', 'z.png': 'fx', 'glow_particle': 'fx',
    'diamond_mask': 'fx', 'diamond_shine': 'fx', 'pow': 'fx', 'puff_': 'fx',
    'rain': 'bg_fog',
    'stinky_': 'garden', 'sprout_': 'garden', 'pot_glow': 'garden', 'pot_shadow': 'garden',
    'pot_top_dark': 'garden', 'leafbunch': 'garden', 'leaf1': 'garden', 'leaf2': 'garden',
    'leaf3': 'garden', 'leaf4': 'garden', 'treefood': 'garden',
    'store_': 'ui', 'downarrow': 'ui', 'option': 'ui',
}

# boot 包: 标题屏 + 主菜单立即可用 (SelectorScreen reanim + 菜单直接绘制的小按钮)
BOOT_IMAGES = (
    'titlescreen.jpg',
    # 菜单背景 PNG 双胞胎 (resolveImage 优先 png; jpg 透明区被压黑 → 必须随 boot 提供)
    'selectorscreen_bg_left.png', 'selectorscreen_bg_center.png',
    'selectorscreen_bg_right.png', 'selectorscreen_bg_left_.png', 'selectorscreen_bg_center_.png',
    'selectorscreen_bg_right_.png',
    'selectorscreen_options1.png', 'selectorscreen_options2.png',
    'selectorscreen_help1.png', 'selectorscreen_help2.png',
    'selectorscreen_quit1.png', 'selectorscreen_quit2.png',
    'selectorscreen_almanac.png', 'selectorscreen_almanachighlight.png',
    'selectorscreen_levelnumbers.png', 'selectorscreen_startadventure_highlight.png',
    'selectorscreen_store.png', 'selectorscreen_storehighlight.png',
    'selectorscreen_zengarden.png', 'selectorscreen_zengardenhighlight.png',
    'selectorscreen_vasebreaker_button.png', 'selectorscreen_vasebreaker_highlight.png',
    'selectorscreen_challenges_button.png', 'selectorscreen_challenges_highlight.png',
    'selectorscreen_survival_button.png', 'selectorscreen_survival_highlight.png',
)


def load_reanims():
    out = {}
    for f in sorted(os.listdir(REANIM_DIR)):
        if f.endswith('.json') and not f.startswith('_'):
            out[f[:-5]] = json.load(open(os.path.join(REANIM_DIR, f)))
    return out


def main():
    os.makedirs(PACK_DIR, exist_ok=True)
    reanims = load_reanims()
    disk_images = {f.lower(): f for f in os.listdir(IMG_DIR)}

    # ---------- 计算每个 reanim 引用的磁盘图片 ----------
    reanim_imgs = {}   # reanimName -> [disk file names (原始大小写)]
    for name, d in reanims.items():
        refs = []
        for key in d.get('images', []):
            k = key.lower()
            if k in disk_images:
                refs.append(disk_images[k])
            else:
                # 双后缀容错
                k2 = k.replace('.png.png', '.png').replace('.jpg.jpg', '.jpg')
                if k2 in disk_images:
                    refs.append(disk_images[k2])
                else:
                    print(f'  ! reanim {name} 引用缺失图片: {key}')
        reanim_imgs[name] = refs

    # ---------- 图片 → 包 分配 ----------
    img2pack = {}
    reanim2pack = {}

    def claim_img(fname, pack):
        fl = fname.lower()
        if fl not in img2pack:
            img2pack[fl] = pack
            return True
        return False

    def claim_reanim(name, pack):
        if name not in reanim2pack:
            reanim2pack[name] = pack
            return True
        return False

    # 0) boot 包: 标题屏 + 菜单 essentials (先于植物/僵尸认领, 防止被夺)
    if 'SelectorScreen' in reanims:
        claim_reanim('SelectorScreen', 'boot')
        for f in reanim_imgs['SelectorScreen']:
            claim_img(f, 'boot')
    for f in BOOT_IMAGES:
        fl = f.lower()
        if fl in disk_images:
            claim_img(disk_images[fl], 'boot')
        else:
            print(f'  ! boot 缺图: {f}')

    # 1) 植物 (按解锁顺序 — 共享图归最早解锁者)
    for ptype in SEED_ORDER + [t for t in PLANT_REANIM if t not in SEED_ORDER]:
        rn = PLANT_REANIM[ptype]
        pack = f'plant_{ptype}'
        if rn not in reanims:
            print(f'  ! 植物缺 reanim: {ptype} -> {rn}')
            continue
        claim_reanim(rn, pack)
        for f in reanim_imgs[rn]:
            claim_img(f, pack)

    # 2) 僵尸 core 先行 (基础部件归 core)
    for rn in ['Zombie', 'Zombie_FlagPole', 'LawnMoweredZombie', 'Zombie_charred', 'Zombie_hand', 'Zombie_surprise']:
        if rn in reanims:
            claim_reanim(rn, 'zombie_core')
            for f in reanim_imgs[rn]:
                claim_img(f, 'zombie_core')

    # 3) 特殊僵尸
    for ztype, rn in ZOMBIE_REANIM.items():
        if rn in ('Zombie',):
            continue
        pack = f'zombie_{ztype.lower()}'
        claim_reanim(rn, pack)
        if rn in reanims:
            for f in reanim_imgs[rn]:
                claim_img(f, pack)
    # 烧焦变体
    for rn, pack in CHARRED_MAP.items():
        if rn in reanims:
            claim_reanim(rn, pack)
            for f in reanim_imgs[rn]:
                claim_img(f, pack)

    # 4) 基础 reanim (fx/ui/scene/garden/misc)
    for rn, pack in CORE_REANIM_PACK.items():
        if rn in reanims:
            claim_reanim(rn, pack)
            for f in reanim_imgs[rn]:
                claim_img(f, pack)

    # 5) 前缀规则归类剩余图片
    def by_prefix(fl):
        for pack, prefs in SCENE_PREFIXES:
            if any(fl.startswith(p) for p in prefs):
                return pack
        if any(fl.startswith(p) for p in GARDEN_PREFIXES):
            return 'garden'
        for p, pack in ZOMBIE_IMG_PACK:
            if fl.startswith(p):
                return pack
        for p, pack in PLANT_IMG_PREFIX:
            if fl.startswith(p):
                return pack
        for p, pack in EXTRA_IMG_PACK.items():
            if fl == p or fl.startswith(p):
                return pack
        if any(fl.startswith(p) for p in UI_PREFIXES):
            return 'ui'
        if any(fl.startswith(p) for p in FX_PREFIXES):
            return 'fx'
        if fl.startswith('crazydave_'):
            return 'ui'
        if fl.startswith(('background', 'grass')):
            return 'bg_day'
        if fl.startswith('zombienote') or fl.startswith('zombiefinalnote'):
            return 'ui'
        if fl.startswith('zombie_') or 'charred' in fl:
            return 'zombie_core'
        return None

    leftover = []
    for fl in sorted(disk_images):
        if fl not in img2pack:
            pack = by_prefix(fl)
            if pack:
                img2pack[fl] = pack
            else:
                leftover.append(fl)
    # 未归类 → misc (不被任何 reanim 引用, 不随关卡加载)
    for fl in leftover:
        img2pack[fl] = 'misc'
        print(f'  ? 未归类图片 → misc: {disk_images[fl]}')

    # 未分配 reanim → misc
    for rn in reanims:
        if rn not in reanim2pack:
            reanim2pack[rn] = 'misc'
            print(f'  ? 未归类 reanim → misc: {rn}')

    # ---------- 打包 ----------
    pack_imgs = {}
    pack_reanims = {}
    for fl, pack in img2pack.items():
        pack_imgs.setdefault(pack, []).append(disk_images[fl])
    for rn, pack in reanim2pack.items():
        pack_reanims.setdefault(pack, []).append(rn)

    total_out = 0
    for pack in sorted(set(list(pack_imgs.keys()) + list(pack_reanims.keys()))):
        names_img = sorted(pack_imgs.get(pack, []))
        names_rn = sorted(pack_reanims.get(pack, []))
        index = {"images": {}, "reanim": {}}
        blobs = []
        offset = 0
        for k in names_img:
            data = open(os.path.join(IMG_DIR, k), 'rb').read()
            mime = 'image/jpeg' if k.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
            index["images"][k.lower()] = [offset, len(data), mime]
            blobs.append(data)
            offset += len(data)
        for rn in names_rn:
            data = json.dumps(reanims[rn], separators=(',', ':')).encode('utf-8')
            index["reanim"][rn] = [offset, len(data)]
            blobs.append(data)
            offset += len(data)
        idx_bytes = json.dumps(index, separators=(',', ':')).encode('utf-8')
        out = os.path.join(PACK_DIR, pack + '.wpz')
        with open(out, 'wb') as f:
            f.write(b'WPZ2')
            f.write(struct.pack('<I', len(idx_bytes)))
            f.write(idx_bytes)
            for b in blobs:
                f.write(b)
        sz = os.path.getsize(out)
        total_out += sz
        print(f'  {pack:22s} {sz/1000:8.0f}KB  ({len(names_img):4d}图 + {len(names_rn):3d}动画)')

    # ---------- lazy.json ----------
    lazy = {
        'v': 2,
        'img2pack': {fl: p for fl, p in sorted(img2pack.items())},
        'reanim2pack': {rn.lower(): p for rn, p in sorted(reanim2pack.items())},
        'zombieDeps': ZOMBIE_DEPS,
        'plantReanim': {t: r.lower() for t, r in PLANT_REANIM.items()},
        'zombieReanim': {t: r for t, r in ZOMBIE_REANIM.items()},
    }
    with open(os.path.join(WEB, 'assets/lazy.json'), 'w', encoding='utf-8') as f:
        json.dump(lazy, f, separators=(',', ':'))
    print(f'\nassets/lazy.json -> {os.path.getsize(os.path.join(WEB, "assets/lazy.json"))/1000:.0f}KB')
    print(f'packs 总计 {total_out/1e6:.1f}MB ({len(set(list(pack_imgs.keys()) + list(pack_reanims.keys())))} 个包)')


if __name__ == '__main__':
    main()
