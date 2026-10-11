const fs = require('fs');
const path = require('path');

const SRC = 'D:\\OBSIDIAN\\Cangku\\选题灵感';
const DST = 'D:\\OBSIDIAN\\Cangku\\AI kaifa\\选题灵感';
const MOVE = ['01-在杆', '02-采用', '03-搁置', '04-垃圾桶', '_规则.md'];
const DIRS = ['01-在杆', '02-采用', '03-搁置', '04-垃圾桶'];
const out = [];

fs.mkdirSync(DST, { recursive: true });

MOVE.forEach(function (n) {
  const a = path.join(SRC, n), b = path.join(DST, n);
  if (!fs.existsSync(a)) { out.push('跳过 ' + n + '（源不存在）'); return; }
  if (fs.existsSync(b)) { out.push('!! 跳过 ' + n + '（目标已存在，需人工处理）'); return; }
  fs.renameSync(a, b);                    // 同盘移动，瞬间完成且原子
  out.push('已移动  ' + n);
});

out.push('');
out.push('=== 迁移后 AI kaifa\\选题灵感 ===');
let total = 0;
DIRS.forEach(function (d) {
  const p = path.join(DST, d);
  const n = fs.existsSync(p)
    ? fs.readdirSync(p).filter(function (f) { return /\.md$/i.test(f) && f[0] !== '_'; }).length
    : -1;
  if (n > 0) total += n;
  out.push('  ' + d + '  →  ' + n + ' 个 .md');
});
out.push('  合计 ' + total + ' 条');
out.push('  _规则.md 存在: ' + fs.existsSync(path.join(DST, '_规则.md')));

out.push('');
out.push('=== 原目录残留 ===');
if (fs.existsSync(SRC)) {
  fs.readdirSync(SRC).forEach(function (n) {
    const p = path.join(SRC, n);
    out.push('  ' + n + (fs.statSync(p).isDirectory() ? '  [目录]' : ''));
  });
} else {
  out.push('  （目录已不存在）');
}

fs.writeFileSync('D:/RailBox/overlay/_move_out.txt', out.join('\n'), 'utf8');
