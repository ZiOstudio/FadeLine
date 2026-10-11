const store = require('D:/RailBox/overlay/store.js');

const VAULT = 'D:\\OBSIDIAN\\Cangku\\AI kaifa\\选题灵感';
const TEST_SOURCES = ['测试数据', 'WorkBuddy'];
const out = [];

const all = store.scan(VAULT);
out.push('=== 清理前：全部 ' + all.length + ' 条 ===');
all.forEach(function (i) {
  const mark = TEST_SOURCES.indexOf(i.source) >= 0 ? '  ← 测试' : '';
  out.push('  [' + i.status + '] ' + i.source + '  |  ' + i.text.slice(0, 26) + mark);
});

// 只清来源明确是测试数据 / WorkBuddy 的
const targets = all.filter(function (i) {
  return TEST_SOURCES.indexOf(i.source) >= 0;
});

out.push('');
out.push('=== 移入 04-垃圾桶（' + targets.length + ' 条）===');
targets.forEach(function (i) {
  store.move(VAULT, i, 'trash', '清理测试数据');
  out.push('  ' + i.filename);
});

out.push('');
const after = store.scan(VAULT);
out.push('=== 清理后 ===');
['hanging', 'closet', 'expired', 'trash'].forEach(function (st) {
  const list = after.filter(function (i) { return i.status === st; });
  out.push('  ' + st + '  ' + list.length + ' 条');
});
out.push('');
out.push('=== 还剩在杆 / 采用 的（这些是你的真实数据）===');
after.filter(function (i) { return i.status === 'hanging' || i.status === 'closet'; })
  .forEach(function (i) {
    out.push('  [' + i.status + '] ' + (i.source || '(无来源)') + '  |  ' + i.text.slice(0, 30));
  });

require('fs').writeFileSync('D:/RailBox/overlay/_clean_out.txt', out.join('\n'), 'utf8');
