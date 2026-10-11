const fs = require('fs');
const path = require('path');

const V = 'D:\\OBSIDIAN\\Cangku\\选题灵感';
const NEW = ['01-在杆', '02-采用', '03-搁置', '04-垃圾桶'];
const REN = [['02-衣柜', '02-采用'], ['03-过期未处理', '03-搁置']];
const out = [];

REN.forEach(function (pair) {
  const a = path.join(V, pair[0]), b = path.join(V, pair[1]);
  if (fs.existsSync(a)) {
    if (fs.existsSync(b)) { out.push('跳过 ' + pair[0] + '（' + pair[1] + ' 已存在）'); return; }
    fs.renameSync(a, b);
    out.push('重命名  ' + pair[0] + '  →  ' + pair[1]);
  } else {
    out.push('无需重命名 ' + pair[0] + '（不存在，可能已迁移）');
  }
});

NEW.forEach(function (d) { fs.mkdirSync(path.join(V, d), { recursive: true }); });

let touched = 0;
NEW.forEach(function (d) {
  const dir = path.join(V, d);
  fs.readdirSync(dir).filter(function (f) { return /\.md$/i.test(f) && f[0] !== '_'; })
    .forEach(function (f) {
      const p = path.join(dir, f);
      const orig = fs.readFileSync(p, 'utf8');
      const s = orig.replace(/移入 02-衣柜/g, '移入 02-采用')
                    .replace(/移入 03-过期未处理/g, '移入 03-搁置');
      if (s !== orig) { fs.writeFileSync(p, s, 'utf8'); touched++; }
    });
});
out.push('更新文件内 history 的旧文件夹名：' + touched + ' 个');

const RULES = [
  '# 选题灵感箱 · 目录规则',
  '',
  '这个文件夹就是数据本身。没有数据库，没有私有格式，每一条灵感都是一个可以单独打开、单独发送、单独备份的 Markdown 文件。',
  '',
  '## 四个文件夹的含义',
  '',
  '| 文件夹 | 界面叫法 | 什么会进来 | 谁做的决定 | 会自动清理吗 |',
  '| --- | --- | --- | --- | --- |',
  '| 01-在杆 | 在杆 | 当前挂在灵感墙上的卡片 | 你 | 不会 |',
  '| 02-采用 | 采用 | 你认可、要拿去用的 | **你** | 不会 |',
  '| 03-搁置 | 搁置 | 被新卡挤出、48 小时未处理、或挂了超过 14 天的 | **系统** | 永不清理 |',
  '| 04-垃圾桶 | 垃圾桶 | 你主动点「丢掉」的 | **你** | 永不自动清理 |',
  '',
  '02 和 03 的区别是这套结构的关键：**02 是你做的决定，03 是系统替你做的决定。**',
  '03 永不清理，因为它是一份诊断报告：三个月后回头看，你能读出自己「总在记、但从来不做」的题目类型。',
  '',
  '## 一条硬规则',
  '',
  '**文件夹位置优先于文件里的任何字段。** 你把这个文件从 01 拖到 02，它就等于被采用了，程序下次启动照着文件夹重新读一遍。你可以完全不用这个程序，只用资源管理器管理它。',
  '',
  '## 文件命名',
  '',
  '`YYYYMMDD-HHMM 内容前18字.md`',
  '',
  '时间戳在前，所以在资源管理器里按名称排序就是按时间排序。',
  '',
  '## 头部字段',
  '',
  '- `id` 短标识',
  '- `created` 记录时间',
  '- `source` 记录时前台窗口的来源，比如 `知乎`、`微信`、`X`。防止你忘了灵感从哪来',
  '- `clip` 夹子颜色，用来标优先级（red / blue / amber / teal / purple / gray）',
  '- `pinned` 钉住后不参与自动淘汰',
  '- `doom_at` 绳子满时被挤出前，进入 48 小时待淘汰的时刻',
  '- `history` 每一次移动的完整流水，只追加不覆盖',
  ''
];

fs.writeFileSync(path.join(V, '_规则.md'), RULES.join('\n'), 'utf8');
out.push('已重写 _规则.md');
out.push('');
out.push('迁移后目录：');
NEW.forEach(function (d) {
  const n = fs.readdirSync(path.join(V, d)).filter(function (f) { return /\.md$/i.test(f) && f[0] !== '_'; }).length;
  out.push('  ' + d + '  →  ' + n + ' 个文件');
});

fs.writeFileSync('D:/RailBox/overlay/_migrate_out.txt', out.join('\n'), 'utf8');
