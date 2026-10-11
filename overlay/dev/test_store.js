const fs = require('fs');
const path = require('path');
const store = require('D:/RailBox/overlay/store.js');

const VAULT = 'D:/RailBox/overlay/_test_vault';
const out = [];
function say(s) { out.push(s); }

function wipe(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

// ensureVault 故意不再代建根目录（否则"路径写错"会被静默建出一个空目录），
// 所以测试里要自己先把根目录建出来。
function fresh() {
  wipe(VAULT);
  fs.mkdirSync(VAULT, { recursive: true });
  store.ensureVault(VAULT);
}
function ago(days, hours) {
  return new Date(Date.now() - days * 86400000 - (hours || 0) * 3600000);
}
function snap() {
  const list = store.scan(VAULT);
  return list.map(i => i.status + ':' + i.filename.slice(9, 17) + (i.doom_at ? '(doom)' : ''))
             .sort().join('  ');
}

fresh();

say('=== 1. 写入 5 条，年龄 0/1/2/3/5 天 ===');
[[0, 0], [1, 0], [2, 0], [3, 0], [5, 0]].forEach(function (a, k) {
  store.add(VAULT, '测试灵感 ' + k, '知乎', store.CLIPS[k % 6], ago(a[0], a[1]));
});
say('在杆数量 = ' + store.scan(VAULT).filter(i => i.status === 'hanging').length);

say('');
say('=== 2. settle(capacity=3)：应挤掉最旧的 2 条，并给剩下的最旧一条（2 天）打 doom ===');
const r1 = store.settle(VAULT, 3);
say('移出 ' + r1.moved.length + ' 条：' + r1.moved.map(i => i.ageDays + '天').join(', '));
say('标记待淘汰 ' + r1.marked.length + ' 条：' + r1.marked.map(i => i.ageDays + '天').join(', ') +
    '   ← 必须是 2 天，不是 0 天');
const doomAge = r1.marked.length ? r1.marked[0].ageDays : -1;
say('判定：' + (doomAge === 2 ? '通过' : '失败（期望 2 天，实际 ' + doomAge + ' 天）'));
say('分布  ' + snap());

say('');
say('=== 3. 把 doom_at 回拨到 49 小时前，再 settle：应移入 03 ===');
const ideas = store.scan(VAULT);
const doomed = ideas.filter(i => i.doom_at)[0];
if (doomed) {
  doomed.doom_at = store.fmt(new Date(Date.now() - 49 * 3600000));
  store.save(VAULT, doomed);
  const r2 = store.settle(VAULT, 3);
  say('移出 ' + r2.moved.length + ' 条：' + r2.moved.map(i => i.text).join(', '));
} else {
  say('没找到待淘汰的卡片');
}
say('分布  ' + snap());

say('');
say('=== 4. 再放一张 20 天前的老卡，settle：应被 14 天规则收走 ===');
store.add(VAULT, '一张很老的灵感', 'X', 'red', ago(20));
const r3 = store.settle(VAULT, 3);
say('移出 ' + r3.moved.length + ' 条：' + r3.moved.map(i => i.ageDays + '天 ' + i.text).join(', '));
say('分布  ' + snap());

say('');
say('=== 5. 钉住的卡片不该被淘汰 ===');
const all = store.scan(VAULT);
const h = all.filter(i => i.status === 'hanging');
if (h.length) {
  h[0].pinned = true;
  h[0].created = store.fmt(ago(30));
  h[0].createdDt = ago(30);
  store.save(VAULT, h[0]);
  const r4 = store.settle(VAULT, 3);
  const survived = store.scan(VAULT).filter(i => i.pinned && i.status === 'hanging').length;
  say('移出 ' + r4.moved.length + ' 条；钉住的存活 ' + survived + ' 条');
} else { say('在杆为空，跳过'); }

say('');
say('=== 6. 单条文件的真实内容 ===');
const one = store.scan(VAULT)[0];
if (one) say(fs.readFileSync(one.path, 'utf8'));

say('');
say('=== 7. 【缓刑豁免挤压】待淘汰的卡片不能被新卡顶掉 ===');
fresh();
[5, 3, 2, 1].forEach(function (d, k) {
  store.add(VAULT, '测试 ' + k, '知乎', 'blue', ago(d));
});
const r7 = store.settle(VAULT, 3);
say('首次结算：移出 ' + r7.moved.length + ' 条，标记待淘汰 ' + r7.marked.length +
    ' 条（' + (r7.marked[0] ? r7.marked[0].ageDays + ' 天' : '—') + '）');
const doomId = r7.marked[0] ? r7.marked[0].id : null;

// 连续加 3 张新卡，每次都结算 —— 待淘汰那张必须活下来
for (let k = 0; k < 3; k++) {
  store.add(VAULT, '新卡 ' + k, 'X', 'red', new Date());
  store.settle(VAULT, 3);
}
const after7 = store.scan(VAULT);
const doomedAlive = after7.filter(function (i) {
  return i.id === doomId && i.status === 'hanging';
}).length;
const hangingNow = after7.filter(function (i) { return i.status === 'hanging'; }).length;
say('连续加 3 张新卡后：绳上 ' + hangingNow + ' 条；待淘汰那张 → ' +
    (doomedAlive ? '仍在绳上 ✓' : '已被顶掉 ✗'));
say('判定：' + (doomedAlive && hangingNow === 3 ? '通过（缓刑真正生效）' : '失败'));

say('');
say('=== 8. 【钉住豁免挤压】pinned 的卡片不能被挤压路径赶走 ===');
fresh();
[5, 4, 3, 2].forEach(function (d, k) {
  store.add(VAULT, '测试 ' + k, '知乎', 'blue', ago(d));
});
// 把最旧那张（5 天）钉住，容量 3 → 必须挤掉一张，但绝不能挤它
const asc8 = store.scan(VAULT).sort(function (a, b) { return a.createdDt - b.createdDt; });
const pinTarget = asc8[0];
pinTarget.pinned = true;
store.save(VAULT, pinTarget);
const r8 = store.settle(VAULT, 3);
const after8 = store.scan(VAULT);
const pinnedStill = after8.filter(function (i) {
  return i.id === pinTarget.id && i.status === 'hanging';
}).length;
const movedAge = r8.moved.map(function (i) { return i.ageDays; });
say('被挤掉的：' + (movedAge.join(', ') || '(无)') + ' 天   ← 应为 4 天的，而不是 5 天的');
say('钉住的那张（5 天）：' + (pinnedStill ? '仍在绳上 ✓' : '被挤走了 ✗'));
say('判定：' + (pinnedStill && movedAge.length === 1 && movedAge[0] === 4 ? '通过' : '失败'));

fs.writeFileSync('D:/RailBox/overlay/dev/_test_store_out.txt', out.join('\n'), 'utf8');
