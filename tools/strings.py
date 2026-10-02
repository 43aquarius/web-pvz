#!/usr/bin/env python3
"""strings.py — 从 LawnStrings.txt (UTF-16LE 官方中文) 提取游戏文案 → js/strings.js
提取: 植物名/图鉴头/图鉴正文, 僵尸名/图鉴, 戴夫对话, 纸条, 提示语
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '..', 'pvz-godot-assets', 'data', 'LawnStrings.txt')
OUT = os.path.join(ROOT, 'js', 'strings.js')

txt = open(SRC, 'rb').read().decode('utf-16-le', errors='replace')
entries = dict(re.findall(r'\[([A-Z_0-9]+)\]\r?\n(.*?)(?=\r?\n\[)', txt, re.S))
entries = {k: v.strip() for k, v in entries.items()}

# ---------- 植物 ----------
PLANT_TAGS = {
    'PEASHOOTER': 'PEASHOOTER', 'SUNFLOWER': 'SUNFLOWER', 'CHERRYBOMB': 'CHERRY_BOMB',
    'WALLNUT': 'WALL_NUT', 'POTATOMINE': 'POTATO_MINE', 'SNOWPEA': 'SNOW_PEA',
    'CHOMPER': 'CHOMPER', 'REPEATER': 'REPEATER', 'PUFFSHROOM': 'PUFF_SHROOM',
    'SUNSHROOM': 'SUN_SHROOM', 'FUMESHROOM': 'FUME_SHROOM', 'GRAVEBUSTER': 'GRAVE_BUSTER',
    'HYPNOSHROOM': 'HYPNO_SHROOM', 'SCAREDYSHROOM': 'SCAREDY_SHROOM', 'ICESHROOM': 'ICE_SHROOM',
    'DOOMSHROOM': 'DOOM_SHROOM', 'LILYPAD': 'LILY_PAD', 'SQUASH': 'SQUASH',
    'THREEPEATER': 'THREEPEATER', 'TANGLEKELP': 'TANGLE_KELP', 'JALAPENO': 'JALAPENO',
    'SPIKEWEED': 'SPIKEWEED', 'TORCHWOOD': 'TORCHWOOD', 'TALLNUT': 'TALL_NUT',
    'SEASHROOM': 'SEA_SHROOM', 'PLANTERN': 'PLANTERN', 'CACTUS': 'CACTUS', 'BLOVER': 'BLOVER',
    'SPLITPEA': 'SPLIT_PEA', 'STARFRUIT': 'STARFRUIT', 'PUMPKIN': 'PUMPKIN',
    'MAGNETSHROOM': 'MAGNET_SHROOM', 'CABBAGEPULT': 'CABBAGE_PULT', 'FLOWERPOT': 'FLOWER_POT',
    'KERNELPULT': 'KERNEL_PULT', 'COFFEEBEAN': 'COFFEE_BEAN', 'GARLIC': 'GARLIC',
    'UMBRELLALEAF': 'UMBRELLA_LEAF', 'MARIGOLD': 'MARIGOLD', 'MELONPULT': 'MELON_PULT',
    'GATLINGPEA': 'GATLING_PEA', 'TWINSUNFLOWER': 'TWIN_SUNFLOWER', 'GLOOMSHROOM': 'GLOOM_SHROOM',
    'CATTAIL': 'CATTAIL', 'WINTERMELON': 'WINTER_MELON', 'GOLDMAGNET': 'GOLD_MAGNET',
    'SPIKEROCK': 'SPIKEROCK', 'COBCANNON': 'COB_CANNON', 'IMITATER': 'IMITATER',
}
plants = {}
for ptype, tag in PLANT_TAGS.items():
    name = entries.get(tag)
    dh = entries.get(tag + '_DESCRIPTION_HEADER')
    dd = entries.get(tag + '_DESCRIPTION')
    if name:
        plants[ptype] = {'cn': name.replace('\n', ' '), 'header': (dh or '').replace('\n', ' '), 'desc': (dd or '').replace('\n', ' ')}

# ---------- 僵尸 ----------
ZOMBIE_TAGS = {
    'NORMAL': 'ZOMBIE', 'FLAG': 'FLAG_ZOMBIE', 'CONE': 'CONEHEAD_ZOMBIE',
    'POLEVAULTER': 'POLE_VAULTING_ZOMBIE', 'BUCKET': 'BUCKETHEAD_ZOMBIE', 'NEWSPAPER': 'NEWSPAPER_ZOMBIE',
    'DOOR': 'SCREEN_DOOR_ZOMBIE', 'FOOTBALL': 'FOOTBALL_ZOMBIE', 'DANCER': 'DANCING_ZOMBIE',
    'BACKUP': 'BACKUP_ZOMBIE' if 'BACKUP_ZOMBIE' in entries else 'DANCING_ZOMBIE', 'DUCKY': 'DUCKY_TUBE_ZOMBIE',
    'SNORKEL': 'SNORKEL_ZOMBIE', 'ZAMBONI': 'ZOMBIE_ZAMBONI' if 'ZOMBIE_ZAMBONI' in entries else 'ZOMBIE',
    'BOBSLED': 'ZOMBIE_BOBSLED_TEAM', 'DOLPHIN': 'DOLPHIN_RIDER_ZOMBIE',
    'JACK': 'JACK_IN_THE_BOX_ZOMBIE', 'BALLOON': 'BALLOON_ZOMBIE', 'DIGGER': 'DIGGER_ZOMBIE',
    'POGO': 'POGO_ZOMBIE', 'YETI': 'ZOMBIE_YETI', 'BUNGEE': 'BUNGEE_ZOMBIE', 'LADDER': 'LADDER_ZOMBIE',
    'CATAPULT': 'CATAPULT_ZOMBIE', 'GARGANTUAR': 'GARGANTUAR' if 'GARGANTUAR' in entries else 'ZOMBIE',
    'REDEYE': 'GARGANTUAR',
    'IMP': 'IMP' if 'IMP' in entries else 'ZOMBIE', 'BOSS': 'DR_ZOMBOS_REVENGE' if 'DR_ZOMBOS_REVENGE' in entries else 'ZOMBIE',
}
zombies = {}
for ztype, tag in ZOMBIE_TAGS.items():
    name = entries.get(tag)
    dh = entries.get(tag + '_DESCRIPTION_HEADER')
    dd = entries.get(tag + '_DESCRIPTION')
    if name:
        zombies[ztype] = {'cn': name.replace('\n', ' '), 'header': (dh or '').replace('\n', ' '), 'desc': (dd or '').replace('\n', ' ')}

# ---------- 戴夫对话 (按关卡起始编号, 连续取到缺失) ----------
def dave_seq(start):
    lines = []
    i = start
    while True:
        v = entries.get(f'CRAZY_DAVE_{i}')
        if v is None or not v.strip():
            break
        lines.append(v.strip())
        i += 1
    return lines

dave = {
    'intro_1_5': dave_seq(2400),     # 首次 1-5: 介绍 + 赠铲子
    'replay_1_5': dave_seq(2411),    # 重玩 1-5: 保龄球
    'night_2_1': dave_seq(201),      # 首次 2-1: 夜晚
    'coins_2_2': dave_seq(1401),     # 首次 2-2: 金币提示
    'slot7': dave_seq(1501),         # 首次 13-24: 第7卡槽
    'slot8': dave_seq(1551),         # 首次 16-24: 第8卡槽
    'whack_2_5': dave_seq(401),      # 2-5 打僵尸
    'pool_3_1': dave_seq(501),       # 首次 3-1: 泳池
    'little_3_5': dave_seq(701),     # 3-5 小僵尸
    'vase_4_5': dave_seq(2500),      # 4-5 罐子
    'fog_4_1': dave_seq(801),        # 首次 4-1: 雾
    'storm_4_10': dave_seq(1101),    # 4-10 暴风雨夜
    'roof_5_1': dave_seq(1201),      # 首次 5-1: 屋顶
    'bungee_5_5': dave_seq(1301),    # 首次 5-5: 蹦极+禅园
    'bungee_5_5_replay': dave_seq(1304),
    'boss_5_10': dave_seq(2300),     # 5-10 僵王
    'replay_1_1': dave_seq(1601),    # 重玩 1-1
    'izombie': dave_seq(2200),       # 我不是僵尸
    'store_first': dave_seq(301),    # 商店首次
    'taco': dave_seq(601),           # 玉米卷 (通关奖励彩蛋)
}

# ---------- 纸条 (X-5 / X-10 之后的僵尸留言) ----------
notes = {}
for i, key in enumerate(['note_1_5', 'note_1_10', 'note_2_5', 'note_2_10', 'note_3_5', 'note_3_10', 'note_4_5', 'note_4_10', 'note_5_5', 'note_5_10'], start=1):
    pass
# 原版纸条文本标签探测
for k, v in sorted(entries.items()):
    if re.match(r'^(NOTES?|ZOMBIE_NOTE)', k) and v:
        notes[k] = v.replace('\n', ' ')
# 常见: [ZOMBIE_NOTE_1..10]? 探测不到就用默认文案

out = {
    'plants': plants,
    'zombies': zombies,
    'dave': dave,
    'notes': notes,
    'misc': {
        'almanac_title': entries.get('SUBURBAN_ALMANAC', ''),
        'almanac_plants': entries.get('SUBURBAN_ALMANAC_PLANTS', ''),
        'almanac_zombies': entries.get('SUBURBAN_ALMANAC_ZOMBIES', ''),
        'store_intro': entries.get('CRAZY_DAVE_303', ''),
    },
}

js = '// ============================================================\n' \
     '// strings.js — 官方中文文案 (自动生成自 LawnStrings.txt, tools/strings.py)\n' \
     '// ============================================================\n' \
     "'use strict';\n\nconst STR = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n\n" \
     "if (typeof module !== 'undefined') module.exports = { STR };\n"
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(js)
print('plants:', len(plants), ' zombies:', len(zombies), ' dave:', {k: len(v) for k, v in dave.items() if v})
print('notes tags found:', list(notes.keys())[:12])
print('->', OUT, os.path.getsize(OUT), 'bytes')
