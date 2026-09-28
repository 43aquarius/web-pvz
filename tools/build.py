#!/usr/bin/env python3
"""web-pvz 打包脚本：将 index.html + js/*.js 内联为单文件 HTML
用法: python3 tools/build.py [输出路径]
"""
import re
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def build(out_path=None):
    if out_path is None:
        out_path = os.path.join(ROOT, 'dist', 'web-pvz.html')
    with open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()

    def repl(m):
        src = m.group(1)
        path = os.path.join(ROOT, src)
        with open(path, 'r', encoding='utf-8') as f:
            code = f.read()
        return '<script>\n' + code + '\n</script>'

    merged = re.sub(
        r'<script src="([^"]+)"></script>',
        repl,
        html,
    )

    # 移除音频提示（单文件版同样保留首击解锁逻辑，但无需提示条）——保留提示更友好，此处保留
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(merged)

    size = os.path.getsize(out_path)
    print(f'打包完成: {out_path} ({size/1024:.1f} KB)')
    return out_path

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else None)
