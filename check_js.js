const fs = require('fs');
const path = 'D:/RailBox/panel.html';
const html = fs.readFileSync(path, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('NO_SCRIPT'); process.exit(0); }
try {
  new Function(m[1]);
  console.log('JS_SYNTAX_OK len=' + m[1].length);
} catch (e) {
  console.log('JS_SYNTAX_ERROR: ' + e.message);
}
const ids = ['rails', 'detail', 'folders', 'statCap', 'vaultPath', 'btnReload', 'btnFolder'];
const missing = ids.filter(i => html.indexOf('id="' + i + '"') < 0);
console.log('MISSING_IDS=' + (missing.length ? missing.join(',') : 'none'));
