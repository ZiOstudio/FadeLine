const assert = require('assert');
const L = require('../layout.js');
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

t('aging: 0 天是明显的浅黄油（不是纯白），14 天到陈年琥珀', function () {
  assert.strictEqual(L.aging(0).bg, 'hsl(46 72% 89%)');
  assert.strictEqual(L.aging(14).bg, 'hsl(38 45% 66%)');
  assert.strictEqual(L.aging(30).bg, L.aging(14).bg, '超过 14 天要夹住');
  assert.strictEqual(L.aging(-3).bg, L.aging(0).bg, '负数要夹住');
});

t('aging: sqrt 曲线 —— 前 3 天就走完 46%，短绳也看得出层次', function () {
  assert.strictEqual(L.aging(0).t, 0);
  assert.ok(Math.abs(L.aging(3).t - 0.4629) < 0.005, '3 天 t=' + L.aging(3).t);
  assert.ok(Math.abs(L.aging(7).t - 0.7071) < 0.005, '7 天 t=' + L.aging(7).t);
  assert.strictEqual(L.aging(14).t, 1);
});

t('aging: 亮度随年龄严格递减，跨度至少 20 个点（否则末端梯度会断）', function () {
  const light = function (c) { return parseInt(c.match(/(\d+)%\)$/)[1], 10); };
  let prev = 101;
  for (let d = 0; d <= 14; d++) {
    const l = light(L.aging(d).bg);
    assert.ok(l < prev, d + ' 天的亮度 ' + l + ' 应严格小于 ' + prev + '（四舍五入后撞车说明跨度不够）');
    prev = l;
  }
  const span = light(L.aging(0).bg) - light(L.aging(14).bg);
  assert.ok(span >= 20, '首尾亮度跨度只有 ' + span + ' 个点，梯度会看不出层次');
});

t('aging: 相邻每一天颜色都必须不同（梯度看得见）', function () {
  for (let d = 0; d < 14; d++) {
    assert.notStrictEqual(L.aging(d).bg, L.aging(d + 1).bg, d + '→' + (d + 1) + ' 天颜色相同');
  }
});

t('aging: 最深处的正文对比度仍达 WCAG AA（≥4.5）', function () {
  const lum = function (hsl) {
    const m = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const mm = l - c / 2;
    const seg = Math.floor(h * 6);
    let r = 0, g = 0, b = 0;
    if (seg === 0) { r = c; g = x; } else if (seg === 1) { r = x; g = c; }
    else if (seg === 2) { g = c; b = x; } else if (seg === 3) { g = x; b = c; }
    else if (seg === 4) { r = x; b = c; } else { r = c; b = x; }
    const f = function (v) { v += mm; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = L.aging(14);
  const ratio = (lum(a.bg) + 0.05) / (lum(a.fg) + 0.05);
  assert.ok(ratio >= 4.5, '最深处的对比度只有 ' + ratio.toFixed(2));
});

t('aging: 渐变跨度与 store.js 的 EXPIRE_DAYS 一致（防止两边漂移）', function () {
  const store = require('../store.js');
  assert.strictEqual(L.EXPIRE_DAYS, store.EXPIRE_DAYS);
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

// 直接打到 stdout，并用退出码表态 —— 否则 `npm test` 看起来什么都没发生，
// CI 也拿不到失败信号。（以前是写进 dev/_test_*.txt，得自己去翻。）
console.log(out.join('\n'));
process.exit(fail ? 1 : 0);
