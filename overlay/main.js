const { app, BrowserWindow, globalShortcut, screen, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const store = require('./store');

/* 打包之后代码会被塞进 app.asar，那是个只读的归档 —— 配置和日志必须写到
   别处，否则启动就崩（或者改了设置存不下来）。开发时沿用同目录，方便调试。 */
const IN_ASAR = __dirname.indexOf('app.asar') >= 0;
const DATA_DIR = IN_ASAR ? app.getPath('userData') : __dirname;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

const LOG = path.join(DATA_DIR, 'overlay.log');
function log(m) {
  try { fs.appendFileSync(LOG, new Date().toISOString().slice(11, 23) + '  ' + m + '\n'); } catch (e) {}
}
process.on('uncaughtException', (e) => log('uncaught: ' + (e && e.stack || e)));

// 原生 win32（koffi）：在进程内直接调 Windows API，替代原来的 foreground.py / check_game.py。
// 这样成品发给普通用户时不需要对方先装 Python，也不用每次 spawn 子进程。
const win32 = require('./win32');
const NATIVE_OK = win32.init();
if (!NATIVE_OK) log('原生模块不可用，来源识别与全屏检测将回退到 Python：' + win32.reason());

/* ------------------------------------------------ 配置

   首次运行会自己生成 config.json：数据目录默认落到「文档\灵光一挂」，
   Python 自动探测。目标是 clone 下来双击就能跑，什么都不用手配。 */

const CFG_PATH = path.join(DATA_DIR, 'config.json');
const FIRST_RUN = !fs.existsSync(CFG_PATH);

// 来源识别的默认表放在代码里，而不是配置里 —— 这是应用自带的知识。
// config.json 只需要写用户自己想加的条目，会和这里合并（不是替换）。
const DEFAULT_SOURCE_NAMES = {
  chrome: '浏览器', msedge: '浏览器', firefox: '浏览器', brave: '浏览器',
  opera: '浏览器', vivaldi: '浏览器', msedgewebview2: '应用',
  wechat: '微信', weixin: '微信', qq: 'QQ', tim: 'TIM',
  dingtalk: '钉钉', feishu: '飞书', lark: '飞书',
  code: 'VS Code', cursor: 'Cursor', obsidian: 'Obsidian',
  notepad: '记事本', explorer: '资源管理器',
  winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', onenote: 'OneNote',
  telegram: 'Telegram', discord: 'Discord', spotify: 'Spotify',
  photoshop: 'Photoshop', figma: 'Figma',
  snippingtool: '截图', snipaste: 'Snipaste'
};

const DEFAULT_SITE_NAMES = {
  '知乎': '知乎', '小红书': '小红书', '微博': '微博',
  bilibili: 'B站', '哔哩哔哩': 'B站', '抖音': '抖音', '豆瓣': '豆瓣',
  '掘金': '掘金', csdn: 'CSDN', '语雀': '语雀', '微信读书': '微信读书',
  '公众号': '公众号', '少数派': '少数派', '36氪': '36氪', '虎嗅': '虎嗅',
  '即刻': '即刻', v2ex: 'V2EX', github: 'GitHub',
  stackoverflow: 'Stack Overflow', 'stack overflow': 'Stack Overflow',
  youtube: 'YouTube', twitter: 'X', 'x.com': 'X',
  reddit: 'Reddit', medium: 'Medium', substack: 'Substack',
  notion: 'Notion', figma: 'Figma',
  '百度': '百度', google: 'Google', bing: 'Bing'
};

const CFG_DEFAULTS = {
  hotkey: 'Control+Alt+Q',
  _hotkey: '主热键。若被别的程序占用、或被键盘钩子吞掉，换一个即可。',
  secondaryHotkey: 'Control+Alt+Space',
  _secondaryHotkey: '备用热键，能注册上就注册。',

  vault: '',
  _vault: '四个文件夹所在的根目录。首次运行默认是「文档\\灵光一挂」。'
        + '移动或改名后要跟着改这里，否则绳子会是空的。',

  pythonPath: '',
  _pythonPath: '通常留空即可 —— 来源识别和全屏检测默认走内置的原生模块，不需要 Python。'
             + '只有原生模块加载失败时才会回退到这里，那时填一个 python.exe 的绝对路径。',

  backupDir: '',
  _backupDir: '自动快照存放处。默认放在数据目录旁边。留空字符串则关闭备份。',
  backupKeep: 28,
  _backupKeep: '保留最近多少份快照。每 6 小时一份，28 份约 7 天。',

  autoStart: false,
  _autoStart: '开机自动启动。程序会在 Windows 启动文件夹里放一个指向自己的快捷方式；'
            + '托盘菜单里可以开关。',

  obsidianVault: '',
  _obsidianVault: 'Obsidian 仓库名，用于托盘菜单的「在 Obsidian 中搜索」。'
                + '留空则自动取数据目录的上一级文件夹名。',

  demoMode: false,
  _demoMode: '改成 true 会在界面上补一些假卡片，方便看满屏时三根绳和沙漏的样子，不写进磁盘。',

  gameProcesses: [],
  _gameProcesses: '无边框窗口运行的游戏检测不到，把它们的进程名（小写）填这里兜底，'
                + '例如 ["cs2.exe", "valorant.exe"]。',

  introSeen: false
};

let rawCfg = {};
try { rawCfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch (e) {}

let cfg = Object.assign({}, CFG_DEFAULTS, rawCfg);
cfg.sourceNames = Object.assign({}, DEFAULT_SOURCE_NAMES, rawCfg.sourceNames || {});
cfg.siteNames = Object.assign({}, DEFAULT_SITE_NAMES, rawCfg.siteNames || {});

function saveCfg() {
  try {
    fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    log('写配置失败：' + e.message);
    return false;
  }
}

function defaultVault() {
  let base;
  try { base = app.getPath('documents'); }
  catch (e) { base = path.join(require('os').homedir(), 'Documents'); }
  return path.join(base, '灵光一挂');
}

/* 自动找 Python。跳过 WindowsApps 下的应用商店占位器
   —— 那不是真解释器，调用它会弹微软商店而不是执行脚本。 */
function detectPython() {
  const usable = function (p) {
    try { return !!p && fs.existsSync(p) && p.toLowerCase().indexOf('windowsapps') < 0; }
    catch (e) { return false; }
  };
  try {
    const out = cp.execSync('where python.exe', { encoding: 'utf8', timeout: 4000 });
    for (const line of out.split(/\r?\n/)) {
      const p = line.trim();
      if (usable(p)) return p;
    }
  } catch (e) {}
  const la = process.env.LOCALAPPDATA || '';
  const guesses = [];
  for (let v = 314; v >= 310; v--) {
    guesses.push(path.join(la, 'Programs', 'Python', 'Python' + v, 'python.exe'));
    guesses.push('C:\\Python' + v + '\\python.exe');
  }
  for (const g of guesses) if (usable(g)) return g;
  return '';
}

// 用户没配的，这里补上
if (!(typeof rawCfg.vault === 'string' && rawCfg.vault.trim())) cfg.vault = defaultVault();
if (!cfg.pythonPath) cfg.pythonPath = detectPython();
if (!cfg.backupDir) cfg.backupDir = path.join(path.dirname(cfg.vault), '_灵光一挂备份');

let VAULT = cfg.vault;   // 可被「重新选择数据目录」改写

// 首次运行：把四个文件夹建出来、落一份 config.json
if (FIRST_RUN) {
  try {
    ['01-在杆', '02-采用', '03-搁置', '04-垃圾桶'].forEach(function (d) {
      fs.mkdirSync(path.join(VAULT, d), { recursive: true });
    });
    log('首次运行：数据目录 = ' + VAULT);
  } catch (e) {
    log('首次运行创建数据目录失败：' + e.message);
  }
  log('首次运行：原生模块 = ' + (NATIVE_OK ? '可用' : '不可用（将回退 Python）'));
  if (!NATIVE_OK && cfg.pythonPath) log('             回退 Python = ' + cfg.pythonPath);
  saveCfg();
}

let overlay = null;
let editor = null;
let tray = null;
let expanded = false;
let hotkeyOn = false;
let gameActive = false;
let wa = { x: 0, y: 0, width: 0, height: 0 };

/* ------------------------------------------------ 容量：由屏幕逻辑尺寸决定 */

const CARD_W = 248, CARD_H = 224, ROW_GAP = 34, SLOT_PAD = 16;

function computeCapacity() {
  const W = wa.width, H = wa.height;
  const ROPE_TOP = Math.round(H * 0.13);
  const SAG = Math.max(40, Math.min(72, Math.round(W * 0.022)));
  const perRow = Math.max(5, Math.min(7, Math.round(W / 360)));
  const stride = SAG + SLOT_PAD + CARD_H + ROW_GAP;
  const room = H - ROPE_TOP - SAG - CARD_H - 256;
  const maxRopes = Math.max(1, Math.min(3, 1 + Math.floor(room / stride)));
  return { perRow: perRow, maxRopes: maxRopes, capacity: perRow * maxRopes };
}

/* ------------------------------------------------ 前台来源 */

const SELF_APPS = ['electron', 'fadeline', 'fadeline-overlay', 'node', 'python', 'pythonw'];
const BROWSER_SUFFIX = /\s*[-–—|·]\s*(Google Chrome|Microsoft\s*Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Chromium)\s*$/i;
const SITE_RULES = [
  [/\bon X\b/, 'X'],
  [/[\/·|]\s*X\s*$/, 'X']
];

function readForeground() {
  // 首选：原生调用，无子进程、无外部依赖
  if (NATIVE_OK) {
    try { return win32.foreground(); }
    catch (e) { log('原生抓前台失败：' + e.message); }
  }
  // 回退：Python（老路子，只在原生模块不可用时才会走到）
  if (!cfg.pythonPath) return { app: '', title: '' };
  try {
    const out = String(cp.execFileSync(cfg.pythonPath, [path.join(__dirname, 'foreground.py')],
      { timeout: 3000, encoding: 'ascii' })).trim();
    if (!out) return { app: '', title: '' };
    return JSON.parse(Buffer.from(out, 'base64').toString('utf8'));
  } catch (e) {
    log('抓前台失败：' + e.message);
    return { app: '', title: '' };
  }
}

function friendlySource(fg) {
  if (!fg || !fg.app) return '';
  const proc = String(fg.app).toLowerCase();
  if (SELF_APPS.indexOf(proc) >= 0) return '';
  const title = String(fg.title || '').replace(BROWSER_SUFFIX, '').trim();
  for (let i = 0; i < SITE_RULES.length; i++) {
    if (SITE_RULES[i][0].test(title)) return SITE_RULES[i][1];
  }
  const sites = cfg.siteNames || {};
  for (const k in sites) {
    if (k.charAt(0) === '_') continue;
    if (title.toLowerCase().indexOf(k.toLowerCase()) >= 0) return sites[k];
  }
  const apps = cfg.sourceNames || {};
  return apps[proc] || fg.app;
}

let ctxSource = '';
function captureSource() {
  const fg = readForeground();
  const s = friendlySource(fg);
  log('前台 app=' + fg.app + ' → 来源=' + (s || '(无效)'));
  return s;
}

/* ------------------------------------------------ 数据接口 */

let lastAction = null;   // { moves:[{id,from,to}], label, at } 最近一次写盘动作，供撤销
function recordAction(moves, label) {
  if (moves && moves.length) lastAction = { moves: moves, label: label, at: Date.now() };
}

function payload() {
  const cap = computeCapacity();
  // 自检必须在 ensureVault 之前跑 —— 否则它会把目录建出来，让自检永远报"通过"
  const problems = selfCheck();
  const vaultBroken = problems.some(function (p) { return p.fix === 'vault'; });

  let ideas = [];
  if (!vaultBroken) {
    try {
      store.ensureVault(VAULT);
      ideas = store.scan(VAULT);
    } catch (e) {
      log('扫描失败：' + e.message);
    }
  }
  const now = Date.now();
  const list = ideas.map(function (i) {
    let hoursLeft = null;
    if (i.doom_at) {
      const d = store.parseDt(i.doom_at);
      if (d) hoursLeft = Math.max(0, Math.round(store.DOOM_HOURS - (now - d.getTime()) / 3600000));
    }
    return {
      id: i.id, text: i.text, source: i.source, clip: i.clip,
      pinned: i.pinned, status: i.status, age: i.ageDays,
      created: i.created, filename: i.filename,
      doom: !!i.doom_at, hoursLeft: hoursLeft,
      daysLeft: Math.max(0, store.EXPIRE_DAYS - i.ageDays)
    };
  });
  const hanging = list.filter(function (x) { return x.status === 'hanging'; });
  return {
    ideas: list,
    capacity: cap.capacity,
    perRow: cap.perRow,
    maxRopes: cap.maxRopes,
    hanging: hanging.length,
    full: hanging.length >= cap.capacity,
    demo: !!cfg.demoMode,
    introSeen: !!cfg.introSeen,
    problems: problems,
    undo: lastAction ? { at: lastAction.at, label: lastAction.label } : null,
    vault: VAULT,
    counts: {
      hanging: hanging.length,
      closet: list.filter(function (x) { return x.status === 'closet'; }).length,
      expired: list.filter(function (x) { return x.status === 'expired'; }).length,
      trash: list.filter(function (x) { return x.status === 'trash'; }).length
    }
  };
}

// 每次数据变动后主动推给浮层。之前用 invoke，返回值回到了编辑器窗口，
// 浮层永远不知道数据变了 —— 这就是「新增后必须收起再展开才看得到」的原因。
function broadcast() {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('data-changed', payload());
  if (tray) { try { tray.setContextMenu(buildTrayMenu()); } catch (e) {} }
}

function countIn(sub) {
  try {
    return fs.readdirSync(path.join(VAULT, sub))
      .filter(function (f) { return /\.md$/i.test(f) && f[0] !== '_'; }).length;
  } catch (e) { return 0; }
}

function obsVaultName() {
  return cfg.obsidianVault || path.basename(path.dirname(VAULT));
}

function runSettle() {
  try {
    const cap = computeCapacity();
    const r = store.settle(VAULT, cap.capacity);
    if (r.moved.length) {
      recordAction(r.moved.map(function (i) { return { id: i.id, from: 'hanging', to: 'expired' }; }),
                   r.moved.length + ' 条已移入搁置');
    }
    if (r.moved.length || r.marked.length) {
      log('结算：挤出/过时 ' + r.moved.length + ' 条，' +
          '新进入待淘汰 ' + r.marked.length + ' 条');
      r.moved.concat(r.marked).forEach(function (i) {
        log('   · ' + i.filename);
      });
    } else {
      log('结算：无需处理（容量 ' + cap.capacity + '）');
    }
  } catch (e) {
    log('结算失败：' + e.message);
  }
}

/* ------------------------------------------------ 窗口 */

function createOverlay() {
  const d = screen.getPrimaryDisplay();
  wa = d.workArea;
  overlay = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, skipTaskbar: true,
    focusable: false, fullscreenable: false, show: false, alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile('overlay.html');
  overlay.on('closed', function () { overlay = null; });
  const cap = computeCapacity();
  log('浮层 ' + wa.width + 'x' + wa.height + ' · 每行 ' + cap.perRow +
      ' · 最多 ' + cap.maxRopes + ' 绳 · 容量 ' + cap.capacity);
}

function showOverlay() {
  if (gameActive) { log('游戏中，忽略唤起'); return; }
  if (!overlay || overlay.isDestroyed()) return;
  overlay.showInactive();
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.moveTop();
  ctxSource = captureSource();
  runSettle();                                   // 只在展开这一刻结算
  overlay.webContents.send('expand');
}

function hideOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.send('collapse');
}

function toggle() {
  // 日志打印切换【之后】的状态。之前打的是切换前的值，
  // 写着 "expanded=true" 而实际结果是收起了 —— 调试时极易读反。
  if (expanded) { hideOverlay(); expanded = false; }
  else { showOverlay(); expanded = true; }
  log('toggle → 现在' + (expanded ? '展开' : '收起'));
}

/* ------------------------------------------------ 编辑器 */

function openEditor(p) {
  if (p && p.mode === 'new' && !p.source) {
    let s = captureSource();
    if (!s) { s = ctxSource; log('抓到自己，回退到展开时来源：' + (s || '(无)')); }
    p.source = s;
  }
  const r = p.rect || { left: 0, top: 0, width: CARD_W, height: CARD_H };
  const W = Math.round(r.width) + 16;
  const H = Math.round(r.height) + 108;
  const x = Math.round(wa.x + r.left - 8);
  const y = Math.round(wa.y + r.top - 10);

  if (editor && !editor.isDestroyed()) {
    editor.setBounds({ x: x, y: y, width: W, height: H });
    editor.show(); editor.moveTop(); editor.focus();
    editor.webContents.send('load', p);
    return;
  }
  editor = new BrowserWindow({
    x: x, y: y, width: W, height: H,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  editor.setAlwaysOnTop(true, 'screen-saver');
  editor.loadFile('editor.html');
  editor.once('ready-to-show', function () {
    editor.show(); editor.moveTop(); editor.focus();
    editor.webContents.send('load', p);
  });
  editor.on('closed', function () {
    editor = null;
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('edit-closed');
  });
}

function closeEditor() {
  if (editor && !editor.isDestroyed()) editor.close();
}

/* ------------------------------------------------ 自动快照备份 */

function tsStamp() {
  const d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach(function (e) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
  });
}

function backupVault(reason) {
  if (!cfg.backupDir) return;
  try {
    if (!fs.existsSync(VAULT)) { log('备份跳过：数据目录不存在'); return; }
    const dest = path.join(cfg.backupDir, '选题灵感-' + tsStamp());
    if (fs.existsSync(dest)) { log('备份跳过：' + path.basename(dest) + ' 已存在'); return; }
    copyDir(VAULT, dest);

    // 只清理备份目录里我们自己的快照，且严格限制在该目录内
    const root = path.resolve(cfg.backupDir);
    const all = fs.readdirSync(cfg.backupDir)
      .filter(function (n) { return n.indexOf('选题灵感-') === 0; })
      .sort();
    const keep = Math.max(2, cfg.backupKeep || 28);
    while (all.length > keep) {
      const old = all.shift();
      const p = path.resolve(path.join(cfg.backupDir, old));
      if (p.indexOf(root) !== 0) continue;          // 越界保护
      try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {}
    }
    log('已备份 ' + path.basename(dest) + '（当前保留 ' + all.length + ' 份）' + (reason ? ' · ' + reason : ''));
  } catch (e) {
    log('备份失败：' + e.message);
  }
}

/* ------------------------------------------------ 启动自检 */

const NEED_DIRS = ['01-在杆', '02-采用', '03-搁置', '04-垃圾桶'];

function selfCheck() {
  const problems = [];

  if (!fs.existsSync(VAULT)) {
    problems.push({
      level: 'error', fix: 'vault',
      text: '数据目录不存在',
      hint: VAULT + ' — 请重新选择，或修改 config.json 的 vault'
    });
  } else {
    NEED_DIRS.forEach(function (d) {
      const p = path.join(VAULT, d);
      if (!fs.existsSync(p)) {
        try { fs.mkdirSync(p, { recursive: true }); }
        catch (e) { problems.push({ level: 'error', text: '无法创建文件夹 ' + d, hint: e.message }); }
      }
    });
  }

  // 来源识别与全屏检测：原生模块（koffi）能用就万事大吉，它是首选路径不需要任何外部环境。
  // 只有原生模块没加载、且又没有 Python 兜底时，才降级并告警。
  if (!NATIVE_OK && !fs.existsSync(cfg.pythonPath)) {
    problems.push({
      level: 'warn', fix: 'python',
      text: '来源识别与全屏检测不可用',
      hint: '原生模块未加载（' + win32.reason() + '），也没找到 Python 兜底。'
          + '其余功能不受影响。'
    });
  }
  if (!fs.existsSync(path.join(__dirname, 'tray.png'))) {
    problems.push({ level: 'warn', text: '缺少 tray.png', hint: '托盘图标会显示为空白' });
  }
  return problems;
}

/* ------------------------------------------------ 开机自启 */

// 写 Windows 启动文件夹里的快捷方式，而不是 app.setLoginItemSettings()。
// 因为开发模式（未打包）下后者很可能只注册 electron.exe 而不带项目路径，
// 开机后会启动一个空的 Electron，用户还完全不知道发生了什么。
function startupLnkPath() {
  return path.join(app.getPath('appData'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', '灵光一挂.lnk');
}

function isAutoStartOn() {
  try { return fs.existsSync(startupLnkPath()); } catch (e) { return false; }
}

function setAutoStart(on, cb) {
  cfg.autoStart = !!on;
  saveCfg();
  const lnk = startupLnkPath();
  if (!on) {
    try {
      if (fs.existsSync(lnk)) fs.unlinkSync(lnk);
      log('已关闭开机自启（删除快捷方式）');
      cb && cb(true);
    } catch (e) {
      log('删除快捷方式失败：' + e.message);
      cb && cb(false);
    }
    return;
  }
  // 用 -EncodedCommand（base64 的 UTF-16LE）传脚本，彻底避开中文被按 GBK 误解的问题
  const script = [
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut(' + JSON.stringify(lnk) + ')',
    '$s.TargetPath = ' + JSON.stringify(process.execPath),
    '$s.Arguments = ' + JSON.stringify(__dirname),
    '$s.WorkingDirectory = ' + JSON.stringify(__dirname),
    '$s.WindowStyle = 1',
    '$s.Description = "灵光一挂 · 灵感墙"',
    '$s.Save()'
  ].join('; ');
  const enc = Buffer.from(script, 'utf16le').toString('base64');
  cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc],
    { timeout: 8000 }, function (err) {
      if (err) { log('创建快捷方式失败：' + err.message); cb && cb(false); return; }
      log('已开启开机自启 → ' + lnk);
      cb && cb(true);
    });
}

/* ------------------------------------------------ 托盘 */

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '展开 / 收起绳子    Ctrl+Alt+Q', click: function () { toggle(); } },
    { type: 'separator' },
    { label: '打开灵感箱', click: function () { try { shell.openPath(VAULT); } catch (e) {} } },
    { label: '打开采用区（' + countIn('02-采用') + ' 条）', click: function () { try { shell.openPath(path.join(VAULT, '02-采用')); } catch (e) {} } },
    { label: '打开搁置区（' + countIn('03-搁置') + ' 条）', click: function () { try { shell.openPath(path.join(VAULT, '03-搁置')); } catch (e) {} } },
    { label: '打开垃圾桶（' + countIn('04-垃圾桶') + ' 条）', click: function () { try { shell.openPath(path.join(VAULT, '04-垃圾桶')); } catch (e) {} } },
    {
      label: '在 Obsidian 中搜索',
      click: function () {
        try { shell.openExternal('obsidian://search?vault=' + encodeURIComponent(obsVaultName())); }
        catch (e) { try { shell.openPath(VAULT); } catch (e2) {} }
      }
    },
    {
      label: '立即备份一次',
      click: function () { backupVault('手动'); if (tray) tray.setContextMenu(buildTrayMenu()); }
    },
    { type: 'separator' },
    {
      label: '开机自动启动', type: 'checkbox', checked: isAutoStartOn(),
      click: function (mi) {
        setAutoStart(mi.checked, function () {
          if (tray) tray.setContextMenu(buildTrayMenu());   // 重建菜单刷新勾选态
        });
      }
    },
    { label: '打开日志', click: function () { try { shell.openPath(LOG); } catch (e) {} } },
    { type: 'separator' },
    { label: '退出', click: function () { app.quit(); } }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('灵光一挂 · 灵感箱');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', function () { toggle(); });
  log('托盘已创建（开机自启：' + (isAutoStartOn() ? '开' : '关') + '）');
}

/* ------------------------------------------------ 游戏 / 全屏检测 */

function registerHotkeys() {
  if (hotkeyOn) return;
  hotkeyOn = globalShortcut.register(cfg.hotkey, function () { log('★ ' + cfg.hotkey); toggle(); });
  if (hotkeyOn) log('热键已注册 ' + cfg.hotkey);
  if (hotkeyOn && cfg.secondaryHotkey) {
    globalShortcut.register(cfg.secondaryHotkey, function () { log('★ ' + cfg.secondaryHotkey); toggle(); });
  }
}

function releaseHotkeys() {
  if (!hotkeyOn) return;
  globalShortcut.unregister(cfg.hotkey);
  if (cfg.secondaryHotkey) globalShortcut.unregister(cfg.secondaryHotkey);
  hotkeyOn = false;
  log('热键已注销（全屏/游戏）');
}

// 一次 spawn 同时拿到全屏状态和前台进程名，base64 传避免编码问题。
// 用 execFile（异步）而不是 execFileSync，避免每 2 秒阻塞主进程 150ms。
function queryGameState(cb) {
  // 首选：原生调用。原来每次都要 spawn 一个 python.exe（约 150ms），现在直接读。
  if (NATIVE_OK) {
    try { cb(win32.gameState()); return; }
    catch (e) { log('原生全屏检测失败：' + e.message); }
  }
  if (!cfg.pythonPath) { cb({ state: 5, app: '' }); return; }
  cp.execFile(cfg.pythonPath, [path.join(__dirname, 'check_game.py')],
    { timeout: 2500, encoding: 'ascii', windowsHide: true },
    function (err, stdout) {
      if (err || !stdout) return cb({ state: 5, app: '' });
      try {
        const d = JSON.parse(Buffer.from(String(stdout).trim(), 'base64').toString('utf8'));
        cb({ state: d.state, app: String(d.app || '').toLowerCase() });
      } catch (e) {
        cb({ state: 5, app: '' });
      }
    });
}

let pollTimer = null;
let pollLogged = false;
function pollGame() {
  queryGameState(function (g) {
    if (!pollLogged) {
      pollLogged = true;
      log('游戏检测启动：state=' + g.state + ' app=' + g.app);
    }
    const list = (cfg.gameProcesses || []).map(function (x) { return String(x).toLowerCase(); });
    const blacklisted = g.app && list.indexOf(g.app) >= 0;
    const hard = g.state === 3 || g.state === 4 || g.state === 1 || g.state === 6 || blacklisted;
    const soft = g.state === 2;

    if (hard || soft) {
      if (expanded) {
        hideOverlay();
        expanded = false;
        log('检测到全屏/游戏 state=' + g.state + (blacklisted ? ' 黑名单:' + g.app : '') + '，收起浮层');
      }
      if (hard) { releaseHotkeys(); gameActive = true; }
    } else {
      if (!hotkeyOn) { registerHotkeys(); gameActive = false; }
    }
    pollTimer = setTimeout(pollGame, expanded ? 1500 : 3000);
  });
}

/* ------------------------------------------------ 启动 */

// 单实例锁：开机自启和手动点击快捷方式同时发生时，不会挂出两根绳子。
// 第二个实例会立刻退出，并把已运行的那个实例的浮层切换一次。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('已有实例在运行，本实例退出');
  app.quit();
}
app.on('second-instance', function () {
  log('收到第二个实例的启动请求，切换浮层');
  toggle();
});

app.whenReady().then(function () {
  if (!gotLock) return;
  log('=== 启动 === 数据目录 ' + VAULT);
  createOverlay();
  createTray();
  overlay.showInactive();
  expanded = false;

  registerHotkeys();

  ipcMain.on('set-ignore', function (e, ignore) {
    if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  ipcMain.on('toggle', toggle);
  ipcMain.on('open-editor', function (e, p) { openEditor(p); });
  ipcMain.on('close-editor', closeEditor);
  ipcMain.on('open-folder', function () { try { shell.openPath(VAULT); } catch (err) {} });

  // 告警条上的「重新选择数据目录」——让用户能直接修好，而不是只被告知哪儿坏了
  ipcMain.on('pick-vault', function () {
    const opts = {
      title: '选择灵感箱的数据目录（里面应有 01-在杆 / 02-采用 / 03-搁置 / 04-垃圾桶）',
      properties: ['openDirectory', 'createDirectory']
    };
    const parent = (overlay && !overlay.isDestroyed()) ? overlay : null;
    const p = parent ? dialog.showOpenDialog(parent, opts) : dialog.showOpenDialog(opts);
    p.then(function (r) {
      if (r.canceled || !r.filePaths || !r.filePaths.length) return;
      VAULT = r.filePaths[0];
      cfg.vault = VAULT;
      saveCfg();
      try { store.ensureVault(VAULT); } catch (e) { log('创建目录失败：' + e.message); }
      lastAction = null;
      log('数据目录已改为：' + VAULT);
      broadcast();
    }).catch(function (e) { log('选择数据目录失败：' + e.message); });
  });

  ipcMain.on('open-config', function () {
    try { shell.openPath(path.join(__dirname, 'config.json')); } catch (e) {}
  });

  ipcMain.on('log', function (e, m) { log('[renderer] ' + m); });

  ipcMain.on('dismiss-intro', function () {
    cfg.introSeen = true;
    if (saveCfg()) log('首次引导已关闭，写回 config.json');
  });

  ipcMain.on('data-add', function (e, p) {
    try {
      const idea = store.add(VAULT, p.text, p.source, p.clip);
      log('新增 ' + idea.filename + '  来源=' + (p.source || '—'));
    } catch (err) {
      log('★新增失败：' + err.message);
    }
    lastAction = null;   // 新增可能触发挤压，之前的撤销作废
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-save', function (e, p) {
    const ideas = store.scan(VAULT);
    const it = ideas.filter(function (x) { return x.id === p.id; })[0];
    if (it) {
      try {
        if (p.text) it.text = p.text;
        if (p.source) it.source = p.source;
        store.save(VAULT, it);
        log('保存 ' + it.filename);
      } catch (err) {
        log('★保存失败：' + err.message);
      }
    }
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-archive', function (e, p) {
    const ideas = store.scan(VAULT);
    const it = ideas.filter(function (x) { return x.id === p.id; })[0];
    if (it) {
      const from = it.status;
      store.move(VAULT, it, 'closet', '我决定采用');
      recordAction([{ id: it.id, from: from, to: 'closet' }], '已采用');
      log('采用 ' + it.filename);
    }
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-adopt', function (e, p) {
    const ideas = store.scan(VAULT);
    const it = ideas.filter(function (x) { return x.id === p.id; })[0];
    if (it) {
      const from = it.status;
      if (p.text) it.text = p.text;
      if (p.source) it.source = p.source;
      store.move(VAULT, it, 'closet', '我决定采用');
      recordAction([{ id: it.id, from: from, to: 'closet' }], '已采用');
      log('采用 ' + it.filename);
    }
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-trash', function (e, p) {
    const ideas = store.scan(VAULT);
    const it = ideas.filter(function (x) { return x.id === p.id; })[0];
    if (it) {
      const from = it.status;
      store.move(VAULT, it, 'trash', '我主动丢掉');
      recordAction([{ id: it.id, from: from, to: 'trash' }], '已丢掉');
      log('丢掉 ' + it.filename);
    }
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-undo', function () {
    if (!lastAction) return;
    const ideas = store.scan(VAULT);
    let n = 0;
    lastAction.moves.forEach(function (m) {
      const it = ideas.filter(function (x) { return x.id === m.id; })[0];
      if (it && it.status === m.to) {
        store.move(VAULT, it, m.from, '撤销上一次移动');
        n++;
      }
    });
    log('撤销 ' + n + ' 条');
    lastAction = null;
    broadcast();
  });

  ipcMain.handle('data-load', function () { return payload(); });

  setTimeout(function () { log('首次自动展开'); showOverlay(); expanded = true; }, 700);
  setTimeout(pollGame, 5000);   // 启动 5 秒后开始游戏检测轮询

  // 配置说要开机自启但快捷方式不见了（被误删 / 被杀软隔离），补建回来
  if (cfg.autoStart && !isAutoStartOn()) {
    log('配置要求开机自启，但启动文件夹里没有快捷方式，补建');
    setTimeout(function () { setAutoStart(true); }, 1500);
  }

  // 启动自检结果写进日志（界面上由浮层渲染告警条）
  log('前台抓取后端：' + (NATIVE_OK ? '内置原生模块' : 'Python 回退'
      + (cfg.pythonPath ? '（' + cfg.pythonPath + '）' : '（未配置）')));
  const ps = selfCheck();
  if (ps.length) ps.forEach(function (p) { log('★自检[' + p.level + '] ' + p.text + ' — ' + p.hint); });
  else log('自检通过：数据目录 / 前台抓取 / 托盘图标 均正常');

  // 自动快照：启动 20 秒后一次，之后每 6 小时一次
  if (cfg.backupDir) {
    setTimeout(function () { backupVault('启动时'); }, 20000);
    setInterval(function () { backupVault('定时'); }, 6 * 3600 * 1000);
  } else {
    log('自动备份未启用（config.json 的 backupDir 为空）');
  }
});

app.on('will-quit', function () { globalShortcut.unregisterAll(); log('=== 退出 ==='); });
app.on('window-all-closed', function () { app.quit(); });
