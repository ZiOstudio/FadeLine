const fs = require('fs');
const store = require('D:/RailBox/overlay/store.js');

const VAULT = 'D:\\OBSIDIAN\\Cangku\\选题灵感';
const TARGET = 20;

const TEXTS = [
  'AI 换脸的伦理边界：平台该不该强制打标',
  '为什么慢内容在短视频时代反而更留人',
  '摄影里的留白和内容里的信息密度是同一件事',
  '做不成个人品牌的人，缺的是固定输出节奏',
  '信息茧房自检：你最近三个月新增了哪些信息源',
  '「整理」本身就是拖延的一种形式',
  '选题分层：日更 · 周更 · 月更长线怎么配',
  '把评论区当选题库的采集方法',
  '冷启动阶段，内容数量比质量更重要吗',
  '从一张废片里提取可用素材的方法论',
  '记录不等于记住：捕捉工具的曝光设计',
  'AI 音乐生成对独立音乐人：工具还是替代',
  '为什么工具越多，产出越少',
  '如何判断一个热点值不值得追',
  '一个人做内容，最该自动化的是哪一环',
  '把长视频拆成多条短内容的三种拆法',
  '为什么「先做完再发布」比「打磨到完美」更有效',
  '从收藏夹里反推自己真正关心什么',
  '内容创作者的三年衰退曲线与对策'
];

const out = [];
store.ensureVault(VAULT);
const before = store.scan(VAULT);
out.push('补之前：在杆 ' + before.filter(function (i) { return i.status === 'hanging'; }).length + ' 条');

const need = TARGET - before.length;
if (need <= 0) {
  out.push('已经达到或超过 ' + TARGET + ' 条，不再补。');
} else {
  for (let k = 0; k < need; k++) {
    const days = Math.floor((k * 5) % 13);                 // 0..12 天，避开 14 天线
    const when = new Date(Date.now() - days * 86400000 - k * 2100000);
    const idea = store.add(VAULT, TEXTS[k % TEXTS.length], '测试数据', store.CLIPS[k % 6], when);
    out.push('  + ' + idea.filename + '   (' + days + ' 天)');
  }
}

const after = store.scan(VAULT);
const h = after.filter(function (i) { return i.status === 'hanging'; });
out.push('');
out.push('补之后：在杆 ' + h.length + ' 条');
out.push('年龄分布（新→旧）：' + h.map(function (i) { return i.ageDays; }).join(', '));
out.push('带待淘汰标记：' + h.filter(function (i) { return i.doom_at; }).length + ' 条');
out.push('容量 21 —— 现在 ' + h.length + ' 条，还差 ' + (21 - h.length) + ' 条触发首次淘汰');

fs.writeFileSync('D:/RailBox/overlay/_seed_out.txt', out.join('\n'), 'utf8');
