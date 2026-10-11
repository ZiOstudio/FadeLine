/**
 * 灵光一挂 · 布局与渲染纯函数
 *
 * 不依赖 DOM，两端通用：
 *   浏览器：<script src="layout.js"></script> 后用全局 Layout
 *   Node：  require('layout.js') 直接单测
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Layout = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const CARD_W = 248, CARD_H = 224, ROW_GAP = 34, SLOT_PAD = 16;
  const MAX_ROPES_HARD = 3;
  const FOLDER_MARGIN = 256;   // 底部文件收藏夹 + 边距预留
  const EXPIRE_DAYS = 14;      // 与 store.js 的 EXPIRE_DAYS 必须一致，单测里有交叉校验

  /**
   * 由屏幕逻辑尺寸推布局。
   * W/H 逻辑宽高，perRowHint 为外部指定值（0 = 自动），ideaCount 用于算实到绳数。
   */
  function computeLayout(W, H, perRowHint, ideaCount) {
    const ropeTop = Math.round(H * 0.13);
    const sag = Math.max(40, Math.min(72, Math.round(W * 0.022)));
    const perRow = perRowHint || Math.max(5, Math.min(7, Math.round(W / 360)));
    const rowStride = sag + SLOT_PAD + CARD_H + ROW_GAP;
    const room = H - ropeTop - sag - CARD_H - FOLDER_MARGIN;
    const maxRopes = Math.max(1, Math.min(MAX_ROPES_HARD, 1 + Math.floor(room / rowStride)));
    const ropes = Math.min(maxRopes, Math.max(1, Math.ceil((ideaCount || 0) / perRow)));
    return {
      ropeTop: ropeTop, sag: sag, perRow: perRow, rowStride: rowStride,
      maxRopes: maxRopes, ropes: ropes, capacity: perRow * maxRopes
    };
  }

  /* 第 r 根绳的贝塞尔路径 */
  function ropePathFor(top, W, sag) {
    return 'M 0 ' + top + ' Q ' + (W / 2) + ' ' + (top + 2 * sag) + ' ' + W + ' ' + top;
  }

  /* 全局第 k 张卡（k=0 最新）落在哪：哪根绳、绳内参数 t、屏幕坐标 */
  function placeOf(k, W, perRow, ropeTop, sag, rowStride) {
    const r = Math.floor(k / perRow), i = k % perRow, t = (i + 0.5) / perRow;
    const top = ropeTop + r * rowStride;
    return {
      r: r, t: t, x: W * t,
      y: top + 4 * sag * t * (1 - t)
    };
  }

  /**
   * 纸张褪色。返回纸面 / 正文 / 次要信息 / 边框四种颜色，外加进度 t。
   *
   * 两个关键决定：
   *
   * 1) 调色板是「淡奶油黄 → 陈年琥珀」，不是「纯白 → 灰」。
   *    新纸本来就不是白的。从纯白起步，梯度会被浪费在水洗一样看不出差别的浅色区，
   *    所以第一张就得是明显的暖黄，最后一张走到深琥珀。
   *    颜色在 HSL 空间插值（不是 RGB）—— RGB 插值经过的是发灰的中间色，
   *    HSL 插值始终留在"纸的黄"这条色相带上，看起来才像同一张纸在变老。
   *
   * 2) 曲线用 sqrt，不是线性。
   *    绳上卡片的实际年龄跨度通常只有 7 天左右（一天记 3 条 × 21 格就铺满了）。
     *    线性铺满 14 天的话，一条满绳只走完 50%，下半段全挤在一起，看不出层次。
     *    sqrt 让前 3 天就走完 46%，短绳也能看到清晰的梯度；
     *    长寿的卡片继续缓慢加深，走满 14 天刚好到最深 —— 颜色最深 = 即将被淘汰。
     *
     *    亮度跨度必须够宽（这里 89% → 66%，23 个点）：sqrt 末端趋平，
     *    跨度太窄时最后几天四舍五入后会变成同一个颜色，梯度就断了。单测盯着这一点。 */
  function aging(age) {
    const t = Math.sqrt(Math.min(Math.max(age, 0) / EXPIRE_DAYS, 1));
    const mix = function (h1, s1, l1, h2, s2, l2) {
      return 'hsl(' + Math.round(h1 + (h2 - h1) * t) + ' ' +
                      Math.round(s1 + (s2 - s1) * t) + '% ' +
                      Math.round(l1 + (l2 - l1) * t) + '%)';
    };
    return {
      t: t,
      bg:  mix(46, 72, 89,  38, 45, 66),   // 纸面：浅黄油 → 陈年琥珀
      fg:  mix(44, 18, 20,  34, 42, 25),   // 正文：深暖灰 → 深褐墨（墨迹变淡）
      dim: mix(44, 14, 45,  35, 32, 33),   // 来源与天数等次要信息
      bd:  mix(45, 42, 81,  39, 40, 58)    // 边框
    };
  }

  /* 沙漏：沙子随剩余时间下落。ratio=1 满，ratio=0 空 */
  function sandglass(ratio, urgent) {
    ratio = Math.max(0, Math.min(1, ratio));
    const col = urgent ? '#A32D2D' : '#854F0B';
    const surf = 2 + (1 - ratio) * 6.4;
    const w = 4 * (1 - (surf - 2) / 8);
    const lh = 6.4 * (1 - ratio), lw = 4 * (1 - ratio);
    let s = '<svg width="15" height="20" viewBox="0 0 16 20">';
    s += '<path d="M2 1.4 H14 M2 18.6 H14" stroke="#D3D1C7" stroke-width="1.5" stroke-linecap="round"/>';
    s += '<path d="M3 2 L13 2 L8 10 L13 18 L3 18 L8 10 Z" fill="none" stroke="#D3D1C7" stroke-width="1.3" stroke-linejoin="round"/>';
    if (ratio > 0.03) {
      s += '<path d="M' + (8 - w).toFixed(2) + ' ' + surf.toFixed(2) + ' L' +
           (8 + w).toFixed(2) + ' ' + surf.toFixed(2) + ' L8 9.5 Z" fill="' + col + '"/>';
    }
    if (ratio < 0.97) {
      s += '<path d="M' + (8 - lw).toFixed(2) + ' 17.4 L' + (8 + lw).toFixed(2) +
           ' 17.4 L8 ' + (17.4 - lh).toFixed(2) + ' Z" fill="' + col + '"/>';
    }
    if (ratio > 0.03 && ratio < 0.97) {
      s += '<path d="M8 10.2 L8 12" stroke="' + col + '" stroke-width="1.1" stroke-linecap="round"/>';
    }
    return s + '</svg>';
  }

  return {
    CARD_W: CARD_W, CARD_H: CARD_H, ROW_GAP: ROW_GAP, SLOT_PAD: SLOT_PAD,
    MAX_ROPES_HARD: MAX_ROPES_HARD, EXPIRE_DAYS: EXPIRE_DAYS,
    computeLayout: computeLayout, ropePathFor: ropePathFor,
    placeOf: placeOf, aging: aging, sandglass: sandglass
  };
});
