const fs = require('fs');
const cp = require('child_process');

const DIR = __dirname + '/..';
const cfg = JSON.parse(fs.readFileSync(DIR + '/config.json', 'utf8'));
const SELF = ['electron', 'railbox', 'railbox-overlay', 'node', 'python', 'pythonw'];
const BROWSER_SUFFIX = /\s*[-–—|·]\s*(Google Chrome|Microsoft\s*Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Chromium)\s*$/i;

function friendlySource(fg) {
  if (!fg || !fg.app) return '';
  const proc = String(fg.app).toLowerCase();
  if (SELF.indexOf(proc) >= 0) return '(自己，作废)';
  const title = String(fg.title || '').replace(BROWSER_SUFFIX, '').trim();
  const sites = cfg.siteNames || {};
  for (const k in sites) {
    if (k.charAt(0) === '_') continue;
    if (title.toLowerCase().indexOf(k.toLowerCase()) >= 0) return sites[k];
  }
  const apps = cfg.sourceNames || {};
  return apps[proc] || fg.app;
}

const out = [];

function variants() {
  const base = [DIR + '/foreground.py'];
  const tries = [
    { name: 'execFileSync(ascii, windowsHide)', fn: () => cp.execFileSync(cfg.pythonPath, base, { timeout: 5000, encoding: 'ascii', windowsHide: true }) },
    { name: 'execFileSync(ascii)', fn: () => cp.execFileSync(cfg.pythonPath, base, { timeout: 5000, encoding: 'ascii' }) },
    { name: 'spawnSync(stdout buffer)', fn: () => cp.spawnSync(cfg.pythonPath, base, { timeout: 5000, windowsHide: true }).stdout },
    { name: 'shell:true', fn: () => cp.execSync('"' + cfg.pythonPath + '" "' + DIR + '/foreground.py"', { timeout: 5000, windowsHide: true }) }
  ];
  return tries;
}

out.push('=== 0. 哪种调用方式能成功 ===');
let good = null, goodRaw = '';
variants().forEach(function (t) {
  try {
    const r = t.fn();
    const raw = Buffer.isBuffer(r) ? r.toString('ascii').trim() : String(r).trim();
    if (!raw) throw new Error('空输出');
    out.push('  OK   ' + t.name + '  长度=' + raw.length);
    if (!good) { good = t.name; goodRaw = raw; }
  } catch (e) {
    out.push('  FAIL ' + t.name + '  ' + e.message);
  }
});
out.push('  采用：' + (good || '(全都失败)'));

out.push('');
out.push('=== 1. 真实抓取 + base64 解码（编码验证） ===');
if (goodRaw) {
  try {
    const fg = JSON.parse(Buffer.from(goodRaw, 'base64').toString('utf8'));
    out.push('app   = [' + fg.app + ']');
    out.push('title = [' + fg.title + ']');
    out.push('来源  = [' + friendlySource(fg) + ']');
    out.push('含替换字符(乱码) = ' + /[\uFFFD]/.test(JSON.stringify(fg)));
  } catch (e) {
    out.push('解码失败: ' + e.message + ' 原文=' + goodRaw.slice(0, 60));
  }
} else {
  out.push('(没有可用的抓取方式)');
}

out.push('');
out.push('=== 2. 映射规则抽样 ===');
const cases = [
  ['chrome', '关于 AI 换脸的伦理边界 - 知乎'],
  ['chrome', 'Home / X - Google Chrome'],
  ['chrome', '一个有意思的视频 - YouTube'],
  ['chrome', '随便一个网页标题'],
  ['chrome', '少数派 - 高效工作，品质生活'],
  ['chrome', 'How to cook - Stack Overflow'],
  ['WeChat', '微信'],
  ['msedge', '某篇文章 - Microsoft Edge'],
  ['Code', 'overlay.html - RailBox - Visual Studio Code'],
  ['Obsidian', '选题灵感箱 - Obsidian'],
  ['feishu', '飞书'],
  ['electron', '晾衣杆'],
  ['unknownapp', '某某']
];
cases.forEach(function (c) {
  out.push(c[0].padEnd(12) + ' | ' + c[1] + '  →  [' + friendlySource({ app: c[0], title: c[1] }) + ']');
});

fs.writeFileSync(DIR + '/_test_out.txt', out.join('\n'), 'utf8');
