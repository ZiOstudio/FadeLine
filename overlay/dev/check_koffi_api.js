/* 摸清 koffi 的传参方式，为 win32.js 定型。跑法：node check_koffi_api.js */
const koffi = require('D:/RailBox/overlay/node_modules/koffi');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const shell32 = koffi.load('shell32.dll');

const GetForegroundWindow = user32.func('void *GetForegroundWindow()');
const GetWindowTextW = user32.func('int GetWindowTextW(void *hWnd, _Out_ uint16_t *lpString, int nMaxCount)');
const GetWindowThreadProcessId = user32.func('uint32_t GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)');
const OpenProcess = kernel32.func('void *OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)');
const QueryFullProcessImageNameW = kernel32.func('int QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)');
const CloseHandle = kernel32.func('int CloseHandle(void *hObject)');
const SHQueryUserNotificationState = shell32.func('int SHQueryUserNotificationState(_Out_ int *pquns)');

const out = [];
const say = (s) => out.push(s);

say('koffi ' + koffi.version);
say('');

// ---- 1. 全屏状态：用 4 字节 Buffer 接输出 ----
try {
  const st = Buffer.alloc(4);
  const hr = SHQueryUserNotificationState(st);
  say('SHQueryUserNotificationState: hr=' + hr + ' state=' + st.readInt32LE(0) +
      '  （5 = 正常桌面）');
} catch (e) { say('SHQuery 失败: ' + e.message); }

say('');

// ---- 2. 前台窗口句柄 ----
let hwnd = null;
try {
  hwnd = GetForegroundWindow();
  say('GetForegroundWindow → ' + hwnd);
} catch (e) { say('GetForegroundWindow 失败: ' + e.message); }

// ---- 3. 窗口标题：UTF-16 Buffer ----
try {
  const buf = Buffer.alloc(2048);
  const n = GetWindowTextW(hwnd, buf, 1024);
  const title = n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
  say('GetWindowTextW → n=' + n + ' title="' + title + '"');
} catch (e) { say('GetWindowTextW 失败: ' + e.message); }

// ---- 4. 进程 ID ----
let pid = 0;
try {
  const pb = Buffer.alloc(4);
  GetWindowThreadProcessId(hwnd, pb);
  pid = pb.readUInt32LE(0);
  say('GetWindowThreadProcessId → pid=' + pid);
} catch (e) { say('GetWindowThreadProcessId 失败: ' + e.message); }

// ---- 5. 进程可执行文件全路径（现代 API，权限要求比 GetModuleFileNameEx 低）----
try {
  const h = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, 0, pid);
  say('OpenProcess → handle=' + h);
  if (h) {
    const eb = Buffer.alloc(2048);
    const sz = Buffer.alloc(4);
    sz.writeUInt32LE(1024, 0);
    const ok = QueryFullProcessImageNameW(h, 0, eb, sz);
    const full = ok ? eb.toString('utf16le', 0, sz.readUInt32LE(0) * 2) : '';
    say('QueryFullProcessImageNameW → ok=' + ok + ' 路径="' + full + '"');
    say('  → 进程名 = "' + (full.split(/[\\/]/).pop() || '').replace(/\.exe$/i, '') + '"');
    CloseHandle(h);
  }
} catch (e) { say('进程路径查询失败: ' + e.message); }

require('fs').writeFileSync('D:/RailBox/overlay/dev/_koffi_api_out.txt', out.join('\n'), 'utf8');
