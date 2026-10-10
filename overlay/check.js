const fs = require('fs');
const files = ['D:/RailBox/overlay/overlay.html', 'D:/RailBox/overlay/editor.html'];
const ids = {
  'overlay.html': ['revealRect', 'cards', 'hud', 'box', 'toast', 'edge', 'add', 'anchors', 'ropeBase', 'ropeTwist'],
  'editor.html': ['source', 'text', 'clip', 'save', 'cancel', 'title', 'trash']
};
const out = [];
files.forEach(function (f) {
  const html = fs.readFileSync(f, 'utf8');
  const name = f.split('/').pop();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) { out.push(name + ': NO_SCRIPT'); return; }
  try { new Function(m[1]); out.push(name + ': JS_OK len=' + m[1].length); }
  catch (e) { out.push(name + ': JS_ERROR ' + e.message); }
  const missing = (ids[name] || []).filter(i => html.indexOf('id="' + i + '"') < 0);
  out.push(name + ': missing_ids=' + (missing.length ? missing.join(',') : 'none'));
});
['store.js', 'main.js', 'preload.js'].forEach(function (f) {
  try { require('D:/RailBox/overlay/' + f); out.push(f + ': LOAD_OK'); }
  catch (e) { out.push(f + ': LOAD_ERROR ' + e.message); }
});
fs.writeFileSync('D:/RailBox/overlay/_check_out.txt', out.join('\n'), 'utf8');
