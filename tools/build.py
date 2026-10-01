#!/usr/bin/env python3
"""build.py — 打包构建 (单script块架构, 保证执行顺序)
  python3 tools/build.py dev   -> dev.html (js+reanim内联, 图片音频相对路径, file://可玩)
  python3 tools/build.py dist  -> dist/web-pvz.html (全内嵌base64, 单文件发布)
  python3 tools/build.py pack  -> assets/pack.bin + assets/reanim.json (网络部署单请求资产包)
"""
import base64, json, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = ROOT
MODE = sys.argv[1] if len(sys.argv) > 1 else 'dev'

MODULES = ['reanim', 'data', 'assets', 'audio', 'cutscene', 'projectiles', 'zombie', 'plants', 'board', 'render', 'ui', 'screens', 'main']

HTML_HEAD = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1a1206">
<title>植物大战僵尸 · Web 原版复刻版</title>
<style>
  html, body { margin:0; padding:0; height:100%; background:#1a1206; overflow:hidden;
               overscroll-behavior:none; -webkit-text-size-adjust:100%; }
  #wrap { display:flex; align-items:center; justify-content:center; height:100%; height:100dvh;
          padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
          box-sizing:border-box; }
  canvas { max-width:100%; max-height:100%; aspect-ratio:4/3; cursor:pointer;
           box-shadow:0 0 40px rgba(0,0,0,.6);
           touch-action:none;                       /* 禁止手势滚动/缩放 */
           -webkit-user-select:none; user-select:none;
           -webkit-touch-callout:none;              /* 长按不弹菜单 */
           -webkit-tap-highlight-color:transparent; }
  /* 极简加载提示: 仅慢速(>3s)时出现, 无全屏加载动画 */
  #loadhint { position:fixed; left:0; right:0; bottom:max(14px, env(safe-area-inset-bottom)); display:none;
              color:rgba(255,233,168,.75); font-size:12px; text-align:center; z-index:10;
              font-family:"Noto Sans SC","Microsoft YaHei",sans-serif; letter-spacing:1px;
              text-shadow:0 1px 3px rgba(0,0,0,.8); pointer-events:none; }
  /* 移动端竖屏提示 (手机竖屏时可关闭, 不阻断游戏) */
  #rotate-hint { display:none; position:fixed; top:0; left:0; right:0; z-index:50; background:rgba(26,18,6,.94); color:#ffe9a8;
    flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:6px;
    font-family:"Noto Sans SC","Microsoft YaHei",sans-serif; padding:10px 16px;
    border-bottom:2px solid #c8f542; box-sizing:border-box; }
  #rotate-hint .icon { font-size:26px; animation:rot 2.2s ease-in-out infinite; display:inline-block; }
  @keyframes rot { 0%,20% { transform:rotate(0deg);} 55%,80% { transform:rotate(90deg);} 100% { transform:rotate(90deg);} }
  #rotate-hint h2 { margin:0; font-size:15px; color:#c8f542; }
  #rotate-hint p { margin:0; font-size:11px; opacity:.8; }
  #rotate-hint button { margin-top:4px; background:#4a3720; color:#ffe9a8; border:1px solid #8a6a3a; border-radius:6px;
    font-size:12px; padding:5px 14px; font-family:inherit; cursor:pointer; }
  @media (orientation:portrait) and (pointer:coarse) and (max-width:920px) {
    #rotate-hint:not(.dismissed) { display:flex; }
  }
</style>
</head>
<body>
<div id="wrap"><canvas id="game" width="800" height="600"></canvas></div>
<div id="rotate-hint">
  <span class="icon">📱</span>
  <h2>建议横屏游玩</h2>
  <p>旋转手机至横屏获得最佳体验</p>
  <button id="rotate-dismiss" type="button">仍要竖屏继续</button>
</div>
<div id="loadhint"></div>
<script>
// 竖屏提示关闭逻辑
(function () {
  var btn = document.getElementById('rotate-dismiss');
  var hint = document.getElementById('rotate-hint');
  if (btn && hint) {
    try { if (localStorage.getItem('webpvz_rotate_dismissed') === '1') hint.classList.add('dismissed'); } catch (e) { }
    btn.addEventListener('click', function () {
      hint.classList.add('dismissed');
      try { localStorage.setItem('webpvz_rotate_dismissed', '1'); } catch (e) { }
    });
  }
})();
</script>
'''

BOOT_JS = '''
// ---- 启动 ----
window.Assets = __mods['assets'];
window.__mods = __mods;
var Game = __mods['main'].Game;
window.Game = Game;
Game.boot();
'''

LOADER_PRE = '''
window.__errs = [];
window.onerror = function(msg, src, line, col, err) {
  window.__errs.push(String(msg).slice(0, 200) + ' @' + line + ':' + col);
  return false;
};
(function(){
var __mods = {};
function __require(name) {
  var key = name.replace(/^\\.\\//, '').replace(/\\.js$/, '');
  return __mods[key] || {};
}
function __def(name, src) {
  var module = { exports: {} };
  try {
    var fn = new Function('module', 'require', src + '\\n;return module.exports;');
    __mods[name] = fn(module, __require);
  } catch (e) {
    console.error('模块 ' + name + ' 失败:', e);
    window.__errs.push('模块' + name + ': ' + String(e && e.message || e));
  }
  if (name === 'assets') window.Assets = __mods[name];
}
'''

LOADER_POST = '''
})();
'''


def load_reanim_data():
    out = {}
    d = os.path.join(WEB, 'assets/reanim')
    for f in sorted(os.listdir(d)):
        if f.endswith('.json') and f != '_imginfo.json' and f != '_list.json':
            out[f[:-5]] = json.load(open(os.path.join(d, f)))
    return out


def image_list():
    return sorted(os.listdir(os.path.join(WEB, 'assets/images')))


def audio_list():
    out = []
    base = os.path.join(WEB, 'assets/audio')
    for root, dirs, files in os.walk(base):
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), base).replace(os.sep, '/')
            out.append(rel)
    return sorted(out)


def build_pack():
    """生成网络部署资产包: assets/pack.bin (全部图片单文件) + assets/reanim.json (全部reanim合一)"""
    img_dir = os.path.join(WEB, 'assets/images')
    keys = sorted(os.listdir(img_dir))
    index = {"images": {}}
    blobs = []
    offset = 0
    for k in keys:
        data = open(os.path.join(img_dir, k), 'rb').read()
        mime = 'image/jpeg' if k.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
        index["images"][k] = [offset, len(data), mime]
        blobs.append(data)
        offset += len(data)
    idx_bytes = json.dumps(index, separators=(',', ':')).encode('utf-8')
    with open(os.path.join(WEB, 'assets/pack.bin'), 'wb') as f:
        f.write(b'WPZ1')
        f.write(struct.pack('<I', len(idx_bytes)))
        f.write(idx_bytes)
        for b in blobs:
            f.write(b)
    # reanim 合一 (文本 JSON, 服务端可 gzip)
    rd = load_reanim_data()
    with open(os.path.join(WEB, 'assets/reanim.json'), 'w', encoding='utf-8') as f:
        json.dump(rd, f, separators=(',', ':'))
    print(f'assets/pack.bin -> {os.path.getsize(os.path.join(WEB, "assets/pack.bin")) / 1e6:.1f} MB ({len(keys)} 张图片)')
    print(f'assets/reanim.json -> {os.path.getsize(os.path.join(WEB, "assets/reanim.json")) / 1e6:.1f} MB ({len(rd)} 个动画)')


def build(mode):
    parts = [HTML_HEAD, '<script>\n', LOADER_PRE]
    # 数据前置
    if mode == 'dev':
        rd = load_reanim_data()
        parts.append('window.__REANIM_DATA__ = ' + json.dumps(rd, separators=(',', ':')) + ';\n')
        parts.append('window.__IMAGE_LIST__ = ' + json.dumps(image_list(), separators=(',', ':')) + ';\n')
        parts.append('window.__NO_PACK__ = true;\n')
    else:
        # 生产: 分块嵌入 (避免单个script过大)
        pass
    parts.append(LOADER_POST)
    parts.append('</script>\n')
    out = os.path.join(WEB, 'dev.html')
    if mode == 'dist':
        out = os.path.join(WEB, 'dist', 'web-pvz.html')
        os.makedirs(os.path.dirname(out), exist_ok=True)

    html = ''.join(parts)
    # 模块定义 (单独script, 依赖前置数据已就绪)
    mod_scripts = ['<script>\n(function(){\nvar __mods = {};\nfunction __require(name){var key=name.replace(/^\\.\\//, \'\').replace(/\\.js$/, \'\'); return __mods[key]||{};}\nfunction __def(name, src){var module={exports:{}}; try{var fn=new Function(\'module\',\'require\',src+\'\\n;return module.exports;\'); __mods[name]=fn(module,__require);}catch(e){console.error(\'模块 \'+name+\' 失败:\',e); window.__errs.push(\'模块\'+name+\': \'+String(e&&e.message||e));}\n if(name===\'assets\') window.Assets=__mods[name];}\n']
    for m in MODULES:
        src = open(os.path.join(WEB, f'js/{m}.js'), encoding='utf-8').read()
        mod_scripts.append(f'__def("{m}", {json.dumps(src)});\n')
    mod_scripts.append('window.__mods = __mods;\nvar Game = __mods["main"].Game; window.Game = Game;\nGame.boot();\n})();\n</script>\n</body>\n</html>\n')
    html += ''.join(mod_scripts)

    if mode == 'dist':
        # 生产模式: 嵌入式数据块 (在模块script之前)
        embed_scripts = []
        rd = load_reanim_data()
        embed_scripts.append('<script>\nwindow.__EMBED__ = {reanim:{}, images:{}, audio:{}, data:{}};\n</script>\n')
        chunk = []; size = 0
        def flush_r():
            if chunk:
                embed_scripts.append('<script>\nObject.assign(window.__EMBED__.reanim, {' + ','.join(chunk) + '});\n</script>\n')
                chunk.clear()
        for name, obj in rd.items():
            s = json.dumps(obj, separators=(',', ':'))
            e = base64.b64encode(s.encode()).decode()
            chunk.append(json.dumps(name) + ':"' + e + '"')
            size += len(e)
            if size > 3_000_000:
                flush_r(); size = 0
        flush_r()
        chunk = []; size = 0
        def flush_i():
            if chunk:
                embed_scripts.append('<script>\nObject.assign(window.__EMBED__.images, {' + ','.join(chunk) + '});\n</script>\n')
                chunk.clear()
        for k in image_list():
            e = base64.b64encode(open(os.path.join(WEB, 'assets/images', k), 'rb').read()).decode()
            chunk.append(json.dumps(k) + ':"' + e + '"')
            size += len(e)
            if size > 4_000_000:
                flush_i(); size = 0
        flush_i()
        chunk = []; size = 0
        def flush_a():
            if chunk:
                embed_scripts.append('<script>\nObject.assign(window.__EMBED__.audio, {' + ','.join(chunk) + '});\n</script>\n')
                chunk.clear()
        for k in audio_list():
            e = base64.b64encode(open(os.path.join(WEB, 'assets/audio', k), 'rb').read()).decode()
            chunk.append(json.dumps(k) + ':"' + e + '"')
            size += len(e)
            if size > 4_000_000:
                flush_a(); size = 0
        flush_a()
        # 数据文件 (图鉴文本 / 戴夫对话)
        data_chunk = []
        for dk in ['almanac_data', 'dave_dialogs']:
            dp = os.path.join(WEB, 'assets', dk + '.json')
            if os.path.exists(dp):
                e = base64.b64encode(open(dp, 'rb').read()).decode()
                data_chunk.append(json.dumps(dk) + ':"' + e + '"')
        if data_chunk:
            embed_scripts.append('<script>\nObject.assign(window.__EMBED__.data, {' + ','.join(data_chunk) + '});\n</script>\n')
        # 嵌入块插到模块script之前
        idx = html.find('<script>\n(function(){\nvar __mods = {};')
        html = html[:idx] + ''.join(embed_scripts) + html[idx:]
        # 移除dev数据前置(若有)
        html = html.replace('<script>\n(function(){\nwindow.__errs', '<script>\nwindow.__errs', 1)  # noop 保险

    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'{out} -> {os.path.getsize(out) / 1e6:.1f} MB')


if __name__ == '__main__':
    if MODE == 'pack':
        build_pack()
    else:
        build(MODE if MODE in ('dev', 'dist') else 'dev')
