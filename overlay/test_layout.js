const assert = require('assert');
const fs = require('fs');
const L = require('D:/RailBox/overlay/layout.js');
const out = [];
let pass = 0, fail = 0;

function t(name, fn) {
  try { fn(); pass++; out.push('通过  ' + name); }
  catch (e) { fail++; out.push('失败  ' + name + '   ' + e.message); }
}

t('常量与预期一致（卡片 248x224、间隙 34、卡上距 16）', function () {
  assert.strictEqual(L.CARD_W, 248);
  assert.strictEqual(L.CARD_H, 224);
  assert.strictEqual(L.ROW_GAP, 34);
  assert.strictEqual(L.SLOT_PAD, 16);
});

t('computeLayout: 2560x1392 → 每行 7、最多 3 绳、容量 21', function () {
  const l = L.computeLayout(2560, 1392, null, 21);
  assert.strictEqual(l.perRow, 7);
  assert.strictEqual(l.maxRopes, 3);
  assert.strictEqual(l.ropes, 3);
  assert.strictEqual(l.perRow * l.maxRopes, 21);
  assert.strictEqual(l.ropeTop, 181);
  assert.strictEqual(l.sag, 56);
  assert.strictEqual(l.rowStride, 330);
});

t('computeLayout: 1920x1040 → 每行 5、最多 2 绳', function () {
  const l = L.computeLayout(1920, 1040, null, 21);
  assert.strictEqual(l.perRow, 5);
  assert.strictEqual(l.maxRopes, 2);
});

t('computeLayout: 空箱 ropes 至少 1，不会是 0', function () {
  const l = L.computeLayout(2560, 1392, null, 0);
  assert.strictEqual(l.ropes, 1);
});

t('placeOf: 第 0 张（最新）在第 0 根绳最左列', function () {
  const l = L.computeLayout(2560, 1392, null, 21);
  const p = L.placeOf(0, 2560, l.perRow, l.ropeTop, l.sag, l.rowStride);
  assert.strictEqual(p.r, 0);
  assert.strictEqual(p.t, 0.5 / 7);
});

t('placeOf: 第 7 张在第 1 根绳（跨绳推挤）', function () {
  const l = L.computeLayout(2560, 1392, null, 21);
  const p = L.placeOf(7, 2560, l.perRow, l.ropeTop, l.sag, l.rowStride);
  assert.strictEqual(p.r, 1);
});

t('placeOf: 第 20 张（最旧）在第 2 根绳最右列 —— 待淘汰位', function () {
  const l = L.computeLayout(2560, 1392, null, 21);
  const p = L.placeOf(20, 2560, l.perRow, l.ropeTop, l.sag, l.rowStride);
  assert.strictEqual(p.r, 2);
  assert.strictEqual(p.t, 6.5 / 7);
});

t('placeOf: 同一根绳内左新右旧（x 随 k 递增）', function () {
  const l = L.computeLayout(2560, 1392, null, 21);
  const a = L.placeOf(0, 2560, l.perRow, l.ropeTop, l.sag, l.rowStride);
  const b = L.placeOf(6, 2560, l.perRow, l.ropeTop, l.sag, l.rowStride);
  assert.ok(a.x < b.x);
});

t('placeOf: 第二根绳整体比第一根旧（y 更靠下）', function () {
  const l = L.computeLayout(2560, 1392, null, 21);
  const a = L.placeOf(6, 2560, l.perRow, l.ropeTop, l.sag, l.rowStride);
  const b = L.placeOf(7, 2560, l.perRow, l.ropeTop, l.sag, l.rowStride);
  assert.ok(a.y < b.y);
});

t('aging: 0 天纯白，20 天最深，10 天在中间', function () {
  const a = L.aging(0), b = L.aging(20), c = L.aging(10);
  assert.strictEqual(a.bg, 'rgb(255,255,255)');
  assert.notStrictEqual(a.bg, b.bg);
  assert.ok(c.bg !== a.bg && c.bg !== b.bg);
});

t('sandglass: 满沙只有上腔，空沙只有下腔', function () {
  const full = L.sandglass(1, false), empty = L.sandglass(0, false);
  assert.ok(full.indexOf('9.5') >= 0, '满沙应有上腔沙');
  assert.ok(full.indexOf('17.4') === -1, '满沙不应有下腔沙堆');
  assert.ok(empty.indexOf('9.5') === -1, '空沙不应有上腔沙');
  assert.ok(empty.indexOf('17.4') >= 0, '空沙应有下腔沙堆');
});

t('sandglass: 紧急(≤12h)用红色，平时用琥珀', function () {
  assert.ok(L.sandglass(0.2, true).indexOf('#A32D2D') >= 0);
  assert.ok(L.sandglass(0.2, false).indexOf('#854F0B') >= 0);
});

t('sandglass: 比例会被夹在 0..1（不产生 NaN）', function () {
  assert.ok(L.sandglass(5, false).indexOf('NaN') === -1);
  assert.ok(L.sandglass(-3, false).indexOf('NaN') === -1);
});

t('ropePathFor: 二次贝塞尔控制点 y = top + 2*sag', function () {
  const d = L.ropePathFor(181, 2560, 56);
  assert.ok(d.indexOf('Q 1280 293') >= 0);
});

out.push('');
out.push('通过 ' + pass + ' / 失败 ' + fail);
fs.writeFileSync('D:/RailBox/overlay/_test_layout_out.txt', out.join('\n'), 'utf8');
