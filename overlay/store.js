/**
 * 灵光一挂 · 数据层
 *
 * Markdown 文件夹就是数据库。这个模块是唯一的读写入口，不依赖任何界面代码。
 * 逻辑与 Python 版 store.py 一致，但结算规则按「C 模型」重写：
 *   绳子满了 → 最旧的被新卡挤出去 → 进 03-过期未处理
 *   绳子满时最后一张（最旧）会进入 48 小时待淘汰，沙漏倒计时
 *   挂在绳上超过 14 天 → 进 03-过期未处理
 *   我主动拖进收藏夹的 → 进 02-衣柜
 */

const fs = require('fs');
const path = require('path');

const FOLDERS = [
  ['hanging', '01-在杆'],
  ['closet', '02-采用'],
  ['expired', '03-搁置'],
  ['trash', '04-垃圾桶']
];
const DIR_OF = {}, KEY_OF = {};
FOLDERS.forEach(function (f) { DIR_OF[f[0]] = f[1]; KEY_OF[f[1]] = f[0]; });

const DOOM_HOURS = 48;
const EXPIRE_DAYS = 14;
const CLIPS = ['red', 'blue', 'amber', 'teal', 'purple', 'gray'];

const FM = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/;
const TAIL = /\n*-{3,}\s*\n<sub>[\s\S]*?<\/sub>\s*$/;
const ILLEGAL = /[\\/:*?"<>|\r\n\t]/g;

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
         pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
function stamp(d) {
  return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
         pad(d.getHours()) + pad(d.getMinutes());
}
function parseDt(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
function slug(text, n) {
  const s = String(text || '').replace(ILLEGAL, '').replace(/\s+/g, ' ').trim();
  return s.slice(0, n || 18) || '未命名';
}
function makeId(d) {
  return (Math.floor(d.getTime() / 1000) & 0xFFFFFF).toString(16).padStart(6, '0');
}
function atomicWrite(p, content) {
  const tmp = p + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, p);
}

/* ---------------------------------------------------------- 解析与渲染 */

function parseFile(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const m = raw.match(FM);
  const meta = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    const lines = m[1].split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.indexOf(':') >= 0 && !/^\s*-/.test(line)) {
        const idx = line.indexOf(':');
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k === 'history') {
          const hist = [];
          let j = i + 1;
          while (j < lines.length && /^\s*-\s/.test(lines[j])) {
            hist.push(lines[j].replace(/^\s*-\s/, '').trim());
            j++;
          }
          meta.history = hist;
          i = j;
          continue;
        }
        meta[k] = v;
      }
      i++;
    }
  }
  body = body.replace(TAIL, '').trim();
  return { meta: meta, body: body };
}

function render(idea) {
  const L = ['---'];
  L.push('id: ' + idea.id);
  L.push('created: ' + idea.created);
  L.push('source: ' + (idea.source || ''));
  L.push('clip: ' + (idea.clip || 'blue'));
  L.push('pinned: ' + (idea.pinned ? 'true' : 'false'));
  if (idea.doom_at) L.push('doom_at: ' + idea.doom_at);
  L.push('history:');
  (idea.history || []).forEach(function (h) { L.push('  - ' + h); });
  L.push('---');
  L.push('');
  L.push(String(idea.text || '').trim());
  L.push('');
  L.push('---');
  L.push('<sub>' + (idea.source || '') + ' · 记录于 ' + idea.created + '</sub>');
  L.push('');
  return L.join('\n');
}

/* ---------------------------------------------------------- 仓库操作 */

/**
 * 只建四个子文件夹，【绝不代建根目录】。
 * 根目录不存在通常意味着路径写错了、或磁盘没挂上 —— 这时静默建一个空目录
 * 会让自检永远报"通过"，也会让用户误以为数据还在。
 */
function ensureVault(vault) {
  if (!fs.existsSync(vault)) return false;
  FOLDERS.forEach(function (f) { fs.mkdirSync(path.join(vault, f[1]), { recursive: true }); });
  return true;
}

function scan(vault, now) {
  now = now || new Date();
  const out = [];
  FOLDERS.forEach(function (f) {
    const key = f[0], dir = path.join(vault, f[1]);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (name) {
      if (!/\.md$/i.test(name) || name.charAt(0) === '_') return;
      const p = path.join(dir, name);
      let meta = {}, body = '';
      try { const r = parseFile(p); meta = r.meta; body = r.body; } catch (e) { return; }
      const created = parseDt(meta.created) || fs.statSync(p).mtime;
      out.push({
        id: meta.id || makeId(created),
        created: meta.created || fmt(created),
        createdDt: created,
        source: meta.source || '',
        clip: CLIPS.indexOf(meta.clip) >= 0 ? meta.clip : 'blue',
        pinned: String(meta.pinned).toLowerCase() === 'true',
        doom_at: meta.doom_at || null,
        history: meta.history || [],
        text: body,
        status: key,
        filename: name,
        path: p,
        ageDays: Math.floor((now - created) / 86400000)
      });
    });
  });
  out.sort(function (a, b) { return b.createdDt - a.createdDt; });   // 新 → 旧
  return out;
}

function save(vault, idea) {
  if (!fs.existsSync(vault)) throw new Error('数据目录不存在：' + vault);
  const dir = path.join(vault, DIR_OF[idea.status]);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, idea.filename);
  idea.path = p;
  atomicWrite(p, render(idea));
  return idea;
}

function add(vault, text, source, clip, when) {
  ensureVault(vault);
  if (!fs.existsSync(vault)) throw new Error('数据目录不存在：' + vault);
  const d = when || new Date();
  const idea = {
    id: makeId(d),
    created: fmt(d),
    createdDt: d,
    source: source || '',
    clip: CLIPS.indexOf(clip) >= 0 ? clip : 'blue',
    pinned: false,
    doom_at: null,
    history: [fmt(d) + ' · 记录于 ' + (source || '未知来源')],
    text: String(text || '').trim(),
    status: 'hanging',
    filename: stamp(d) + ' ' + slug(text) + '.md',
    ageDays: 0
  };
  let p = path.join(vault, DIR_OF.hanging, idea.filename);
  let n = 2;
  while (fs.existsSync(p)) {
    idea.filename = stamp(d) + ' ' + slug(text) + '-' + n + '.md';
    p = path.join(vault, DIR_OF.hanging, idea.filename);
    n++;
  }
  return save(vault, idea);
}

function move(vault, idea, status, reason) {
  const old = idea.path;
  idea.status = status;
  idea.doom_at = null;
  idea.history.push(fmt(new Date()) + ' · 移入 ' + DIR_OF[status] + ' · ' + reason);
  const p = path.join(vault, DIR_OF[status], idea.filename);
  idea.path = p;
  if (old && old !== p && fs.existsSync(old)) {
    try { fs.unlinkSync(old); } catch (e) {}
  }
  return save(vault, idea);
}

/* ---------------------------------------------------------- 结算 */

/**
 * 只在「展开绳子」时调用一次。
 * capacity = 每行张数 × 绳数
 */
function settle(vault, capacity, now) {
  now = now || new Date();
  const ideas = scan(vault, now);
  const hangingAsc = ideas.filter(function (i) { return i.status === 'hanging'; })
                          .sort(function (a, b) { return a.createdDt - b.createdDt; });  // 旧 → 新

  const moved = [], marked = [];

  // 1. 挤压：超出容量的最旧的先被挤出去。
  //    但【已进入待淘汰的卡片豁免】—— 它必须走完 48 小时，不能被新卡提前顶掉。
  //    这是「缓刑」能真正生效的关键：否则只要你在持续记录，
  //    它一进来就被下一张新卡替换，缓刑等于不存在。
  const over = hangingAsc.length - capacity;
  if (over > 0) {
    // 待淘汰的（doom_at）和钉住的（pinned）都豁免挤压 ——
    // 必须与下面第 3 步的淘汰规则保持一致，否则「钉住不参与自动淘汰」这个承诺是假的。
    let victims = hangingAsc.filter(function (i) { return !i.doom_at && !i.pinned; });
    let relaxed = false;
    if (victims.length < over) {
      // 兜底：钉住的卡多到挤不够数时，只能让钉住的让位。
      // 不能选择"少挤几张"——那会让卡片画到屏幕外，数据还在但你看不见，是最糟的失败模式。
      victims = hangingAsc.filter(function (i) { return !i.doom_at; });
      relaxed = true;
    }
    victims.slice(0, over).forEach(function (i) {
      move(vault, i, 'expired',
           (relaxed && i.pinned) ? '绳子已满，钉住的卡也让位（避免卡片溢出屏幕）'
                                 : '绳子已满，被新卡挤出');
      moved.push(i);
    });
  }

  const still = hangingAsc.filter(function (i) { return moved.indexOf(i) < 0; });

  // 2. 绳子满、且当前没有待淘汰卡片时，给最旧的一张打上标记
  const hasDoom = still.some(function (i) { return !!i.doom_at; });
  if (!hasDoom && still.length >= capacity && capacity > 0) {
    const oldest = still.filter(function (i) { return !i.pinned; })[0];
    if (oldest) {
      oldest.doom_at = fmt(now);
      oldest.history.push(fmt(now) + ' · 绳子已满，进入 48 小时待淘汰');
      save(vault, oldest);
      marked.push(oldest);
    }
  }

  // 3. 到点的走：48 小时待淘汰超时，或挂了超过 14 天
  still.forEach(function (i) {
    if (i.pinned) return;
    if (i.doom_at) {
      const d = parseDt(i.doom_at);
      if (d && (now - d) >= DOOM_HOURS * 3600000) {
        move(vault, i, 'expired', '待淘汰位停留 48 小时未处理');
        moved.push(i);
        return;
      }
    }
    if (i.ageDays > EXPIRE_DAYS) {
      move(vault, i, 'expired', '超过 ' + EXPIRE_DAYS + ' 天未被触碰');
      moved.push(i);
    }
  });

  return { moved: moved, marked: marked };
}

module.exports = {
  FOLDERS: FOLDERS, DIR_OF: DIR_OF, KEY_OF: KEY_OF, CLIPS: CLIPS,
  DOOM_HOURS: DOOM_HOURS, EXPIRE_DAYS: EXPIRE_DAYS,
  fmt: fmt, parseDt: parseDt, ensureVault: ensureVault,
  scan: scan, add: add, move: move, settle: settle, save: save, render: render
};
