/**
 * 直接调用 Windows API，替代原来的 foreground.py / check_game.py。
 *
 * 为什么换掉 Python：成品要发给普通用户，不能要求对方先装 Python。
 * koffi 是基于 Node-API 的原生模块，同一个预编译二进制在 Node 和 Electron 里都能用；
 * 而且不用起子进程 —— 原来每次要 spawn 一个 python.exe，现在直接在进程内调用，更快。
 *
 * ⚠️ 原生二进制不在 koffi 包里，而在它的可选依赖 @koromix/koffi-win32-x64。
 * 如果那个包装不上（比如 npm 挡住了安装脚本），init() 返回 false，
 * 调用方应当回退到 Python 或直接降级 —— 不要让它把主流程带崩。
 */

let api = null;
let why = '';

function init() {
  if (api) return true;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const shell32 = koffi.load('shell32.dll');

    api = {
      GetForegroundWindow: user32.func('void *GetForegroundWindow()'),
      GetWindowTextW: user32.func(
        'int GetWindowTextW(void *hWnd, _Out_ uint16_t *lpString, int nMaxCount)'),
      GetWindowThreadProcessId: user32.func(
        'uint32_t GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)'),
      OpenProcess: kernel32.func(
        'void *OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)'),
      QueryFullProcessImageNameW: kernel32.func(
        'int QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags,'
        + ' _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)'),
      CloseHandle: kernel32.func('int CloseHandle(void *hObject)'),
      SHQueryUserNotificationState: shell32.func(
        'int SHQueryUserNotificationState(_Out_ int *pquns)')
    };
    why = '';
    return true;
  } catch (e) {
    api = null;
    why = e.message;
    return false;
  }
}

function available() { return !!api; }
function reason() { return why; }

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const QUNS_ACCEPTS_NOTIFICATIONS = 5;

/* 前台进程名（不带 .exe，保留原始大小写） */
function foregroundApp() {
  const hwnd = api.GetForegroundWindow();
  if (!hwnd) return '';
  const pb = Buffer.alloc(4);
  api.GetWindowThreadProcessId(hwnd, pb);
  const pid = pb.readUInt32LE(0);
  if (!pid) return '';
  const h = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!h) return '';
  try {
    const eb = Buffer.alloc(2048);
    const sz = Buffer.alloc(4);
    sz.writeUInt32LE(1024, 0);
    if (!api.QueryFullProcessImageNameW(h, 0, eb, sz)) return '';
    const full = eb.toString('utf16le', 0, sz.readUInt32LE(0) * 2);
    return (full.split(/[\\/]/).pop() || '').replace(/\.exe$/i, '');
  } finally {
    api.CloseHandle(h);
  }
}

/* 前台窗口标题 */
function foregroundTitle() {
  const hwnd = api.GetForegroundWindow();
  if (!hwnd) return '';
  const buf = Buffer.alloc(2048);
  const n = api.GetWindowTextW(hwnd, buf, 1024);
  return n > 0 ? buf.toString('utf16le', 0, n * 2).trim() : '';
}

/* 等价于原来的 foreground.py：{app, title} */
function foreground() {
  return { app: foregroundApp(), title: foregroundTitle() };
}

/**
 * 等价于原来的 check_game.py：{state, app}
 *
 * state 是 SHQueryUserNotificationState 的返回值：
 *   1 不在场 · 2 有全屏窗口/演示（宽泛，全屏看视频也会命中）
 *   3 全屏 D3D（基本就是全屏游戏）· 4 投屏 · 5 正常桌面 · 6 安静时间
 * 拿不到就返回 5（正常），宁可少收一次浮层，也不要误收。
 */
function gameState() {
  let state = QUNS_ACCEPTS_NOTIFICATIONS;
  try {
    const st = Buffer.alloc(4);
    if (api.SHQueryUserNotificationState(st) === 0) {
      const v = st.readInt32LE(0);
      if (v >= 1 && v <= 6) state = v;      // 越界就认为不可信，保持 5
    }
  } catch (e) {}
  let app = '';
  try { app = foregroundApp().toLowerCase(); } catch (e) {}
  return { state: state, app: app };
}

module.exports = { init, available, reason, foreground, gameState };
