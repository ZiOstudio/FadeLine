const fs = require('fs');
const path = require('path');
const store = require('D:/RailBox/overlay/store.js');

const VAULT = 'D:/RailBox/overlay/_test_vault';
const out = [];
function say(s) { out.push(s); }

function wipe(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function ago(days, hours) {
  return new Date(Date.now() - days * 86400000 - (hours || 0) * 3600000);
}
function snap() {
  const list = store.scan(VAULT);
  return list.map(i => i.status + ':' + i.filename.slice(9, 17) + (i.doom_at ? '(doom)' : ''))
             .sort().join('  ');
}

wipe(VAULT);
store.ensureVault(VAULT);

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

fs.writeFileSync('D:/RailBox/overlay/_test_store_out.txt', out.join('\n'), 'utf8');
