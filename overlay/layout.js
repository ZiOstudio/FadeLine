/**
 * 晾衣杆 · 布局与渲染纯函数
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

  /* 按晾晒天数给纸片上色：0 天纯白，20 天到最深 */
  function aging(age) {
    const t = Math.min(age / 20, 1), m = function (a, b) { return Math.round(a + (b - a) * t); };
    return {
      bg: 'rgb(' + m(255, 214) + ',' + m(255, 210) + ',' + m(255, 201) + ')',
      fg: 'rgb(' + m(44, 140) + ',' + m(44, 136) + ',' + m(42, 128) + ')',
      bd: 'rgb(' + m(228, 197) + ',' + m(225, 191) + ',' + m(218, 181) + ')'
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
    MAX_ROPES_HARD: MAX_ROPES_HARD,
    computeLayout: computeLayout, ropePathFor: ropePathFor,
    placeOf: placeOf, aging: aging, sandglass: sandglass
  };
});
