# 植物大战僵尸 · Web 原版复刻版 (Web PvZ)

基于**原版 PopCap 素材**的浏览器版《植物大战僵尸》复刻。使用原版 reanim 骨骼动画数据与原版音乐音效，在 Web Canvas 上完整重现游戏体验。

## 特性

- **48 种植物** — 全部原版植物（含升级植物：机枪射手、双子向日葵、忧郁菇、香蒲、冰西瓜、吸金磁、地刺王、玉米加农炮、模仿者）
- **26 种僵尸** — 全部原版僵尸（含路障/铁桶/铁门/橄榄球/撑杆/读报/舞王+伴舞/冰车/雪橇/海豚/玩偶匣/气球/矿工/跳跳/雪人/蹦极/梯子/投石车/巨人/小鬼/红眼巨人/僵王博士）
- **原版骨骼动画** — 直接解析原版 `.reanim` 动画数据在 Canvas 上逐轨道渲染，动画与原版一致
- **原版音乐音效** — 9 首场景 BGM + 170 余种音效
- **5 大场景** — 白天草坪 / 黑夜庭院 / 泳池派对 / 浓雾迷踪 / 屋顶决战（含坡度、花盆、水行、雾、墓碑）
- **50 关冒险模式** — 按原版顺序解锁植物与僵尸，5-10 为僵王博士 Boss 战
- **完整玩法系统** — 阳光经济、种子冷却、睡莲/花盆/南瓜机制、蘑菇昼眠、割草机、一大波僵尸、图鉴、无尽模式、localStorage 存档

## 游玩

**方式一（推荐）**：从 [Releases](https://github.com/43aquarius/web-pvz/releases) 下载 `web-pvz.html`（约 42MB），双击用浏览器打开即可游玩，无需安装。

**方式二**：克隆本仓库后本地打开：

```bash
git clone https://github.com/43aquarius/web-pvz.git
cd web-pvz
open dist/web-pvz.html     # macOS
# 或直接用浏览器打开 dist/web-pvz.html
```

**方式三**（开发调试）：

```bash
python3 tools/build.py dev    # 生成 dev.html (引用 assets/ 目录)
python3 tools/build.py dist   # 生成 dist/web-pvz.html (全内嵌单文件)
```

## 操作

| 操作 | 说明 |
|---|---|
| 点击卡片 → 点击草地 | 种植植物 |
| 点击阳光 / 金币 | 收集 |
| 点击铲子 → 点击植物 | 铲除 |
| 点击玉米加农炮 → 点击目标格 | 发射玉米导弹 |
| `空格` | 加速 (1x/2x/4x) |
| `Esc` / `P` | 暂停 |

## 技术

- **渲染**：800×600 Canvas 2D，自研 reanim 骨骼动画引擎（fill-in 关键帧继承、轨道渲染组、图片覆盖、多层动画合成）
- **数据**：植物/僵尸/关卡数值取自开源复刻项目 [PvZ-Portable](https://github.com/wszqkzqk/PvZ-Portable)（普僵 270 血、啃食 100 DPS、冰减速 0.4 等）
- **素材**：原版 reanim 动画与图片、音频提取自 [PVZ-Godot-Dream](https://github.com/hsk-dream/PVZ-Godot-Dream) 的历史版本，仅供学习交流
- **打包**：单文件 HTML，全部素材以 base64 内嵌，`file://` 协议可直接游玩

## 目录结构

```
web-pvz/
├── index.html          # 开发入口
├── dev.html            # 构建生成的开发版
├── dist/web-pvz.html   # 构建生成的发布版单文件
├── js/                 # 游戏源码 (CommonJS 风格模块)
│   ├── reanim.js       # 骨骼动画引擎
│   ├── data.js         # 48植物/26僵尸/50关卡数值定义
│   ├── board.js        # 战场核心 (波次/阳光/割草机/墓碑)
│   ├── plants.js       # 植物行为
│   ├── zombies.js      # 僵尸行为
│   ├── projectiles.js  # 子弹系统
│   ├── render.js       # 场景渲染
│   ├── ui.js           # HUD/选卡/图鉴/菜单
│   ├── audio.js        # 原版BGM/SFX播放
│   ├── assets.js       # 资产加载
│   └── main.js         # 游戏主循环/状态机
├── assets/             # 原版素材 (reanim JSON/图片/音频)
└── tools/build.py      # 打包脚本
```

## 许可

代码以 MIT 许可发布。游戏素材版权归 PopCap/EA 所有，本项目仅供学习交流，请勿用于商业用途。
