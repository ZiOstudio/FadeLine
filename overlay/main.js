const { app, BrowserWindow, globalShortcut, screen, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const store = require('./store');

const LOG = path.join(__dirname, 'overlay.log');
function log(m) {
  try { fs.appendFileSync(LOG, new Date().toISOString().slice(11, 23) + '  ' + m + '\n'); } catch (e) {}
}
process.on('uncaughtException', (e) => log('uncaught: ' + (e && e.stack || e)));

let cfg = {
  hotkey: 'Control+Alt+Q',
  secondaryHotkey: 'Control+Alt+Space',
  pythonPath: 'D:\\Python\\Python3146\\python.exe',
  vault: 'D:\\OBSIDIAN\\Cangku\\选题灵感',
  demoMode: false
};
try {
  Object.assign(cfg, JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')));
} catch (e) {
  log('config.json 读取失败，用默认值：' + e.message);
}
const VAULT = cfg.vault;

let overlay = null;
let editor = null;
let expanded = false;
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

const SELF_APPS = ['electron', 'railbox', 'railbox-overlay', 'node', 'python', 'pythonw'];
const BROWSER_SUFFIX = /\s*[-–—|·]\s*(Google Chrome|Microsoft\s*Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Chromium)\s*$/i;
const SITE_RULES = [
  [/\bon X\b/, 'X'],
  [/[\/·|]\s*X\s*$/, 'X']
];

function readForeground() {
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

function payload() {  const cap = computeCapacity();
  let ideas;
  try {
    store.ensureVault(VAULT);
    ideas = store.scan(VAULT);
  } catch (e) {
    log('扫描失败：' + e.message);
    ideas = [];
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
}

function runSettle() {
  try {
    const cap = computeCapacity();
    const r = store.settle(VAULT, cap.capacity);
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
  log('toggle expanded=' + expanded);
  if (expanded) hideOverlay(); else showOverlay();
  expanded = !expanded;
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

/* ------------------------------------------------ 启动 */

app.whenReady().then(function () {
  log('=== 启动 === 数据目录 ' + VAULT);
  createOverlay();
  overlay.showInactive();
  expanded = false;

  log('主热键 ' + cfg.hotkey + ' 注册 ' +
      (globalShortcut.register(cfg.hotkey, function () { log('★ ' + cfg.hotkey); toggle(); }) ? '成功' : '失败'));
  if (cfg.secondaryHotkey) {
    log('备用热键 ' + cfg.secondaryHotkey + ' 注册 ' +
        (globalShortcut.register(cfg.secondaryHotkey, function () { log('★ ' + cfg.secondaryHotkey); toggle(); }) ? '成功' : '失败'));
  }

  ipcMain.on('set-ignore', function (e, ignore) {
    if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  ipcMain.on('toggle', toggle);
  ipcMain.on('open-editor', function (e, p) { openEditor(p); });
  ipcMain.on('close-editor', closeEditor);
  ipcMain.on('open-folder', function () { try { shell.openPath(VAULT); } catch (err) {} });
  ipcMain.on('log', function (e, m) { log('[renderer] ' + m); });

  ipcMain.on('data-add', function (e, p) {
    const idea = store.add(VAULT, p.text, p.source, p.clip);
    log('新增 ' + idea.filename + '  来源=' + (p.source || '—'));
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-save', function (e, p) {
    const ideas = store.scan(VAULT);
    const it = ideas.filter(function (x) { return x.id === p.id; })[0];
    if (it) {
      if (p.text) it.text = p.text;
      if (p.source) it.source = p.source;
      store.save(VAULT, it);
      log('保存 ' + it.filename);
    }
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-archive', function (e, p) {
    const ideas = store.scan(VAULT);
    const it = ideas.filter(function (x) { return x.id === p.id; })[0];
    if (it) {
      store.move(VAULT, it, 'closet', '我决定采用');
      log('采用 ' + it.filename);
    }
    closeEditor();
    broadcast();
  });

  ipcMain.on('data-trash', function (e, p) {
    const ideas = store.scan(VAULT);
    const it = ideas.filter(function (x) { return x.id === p.id; })[0];
    if (it) {
      store.move(VAULT, it, 'trash', '我主动丢掉');
      log('丢掉 ' + it.filename);
    }
    closeEditor();
    broadcast();
  });

  ipcMain.handle('data-load', function () { return payload(); });

  setTimeout(function () { log('首次自动展开'); showOverlay(); expanded = true; }, 700);
});

app.on('will-quit', function () { globalShortcut.unregisterAll(); log('=== 退出 ==='); });
app.on('window-all-closed', function () { app.quit(); });
