const fs = require('fs');
const path = require('path');

// 路径一律基于 __dirname 解析，不要用相对进程工作目录的写法
// （'../overlay.html' 会随你从哪里调用脚本而变，换个目录跑就找不到文件）。
const ROOT = path.join(__dirname, '..');
const files = ['overlay.html', 'editor.html'];
const ids = {
  'overlay.html': ['revealRect', 'cards', 'hud', 'box', 'toast', 'alarm', 'edge', 'add',
                   'anchors', 'ropePaths', 'intro', 'introOk'],
  'editor.html': ['source', 'text', 'clip', 'save', 'cancel', 'title', 'trash']
};
const out = [];

files.forEach(function (name) {
  const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) { out.push(name + ': NO_SCRIPT'); return; }
  try { new Function(m[1]); out.push(name + ': JS_OK len=' + m[1].length); }
  catch (e) { out.push(name + ': JS_ERROR ' + e.message); }
  const missing = (ids[name] || []).filter(i => html.indexOf('id="' + i + '"') < 0);
  out.push(name + ': missing_ids=' + (missing.length ? missing.join(',') : 'none'));
});

['store.js', 'main.js', 'preload.js', 'layout.js'].forEach(function (f) {
  try { require(path.join(ROOT, f)); out.push(f + ': LOAD_OK'); }
  catch (e) {
    // main.js / preload.js 依赖 electron，在纯 Node 下必然报错，这不算失败
    const isElectron = /requestSingleInstanceLock|exposeInMainWorld/.test(e.message);
    out.push(f + ': ' + (isElectron ? 'NEEDS_ELECTRON（正常）' : 'LOAD_ERROR ' + e.message));
  }
});

fs.writeFileSync(path.join(__dirname, '_check_out.txt'), out.join('\n'), 'utf8');
