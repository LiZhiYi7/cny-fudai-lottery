// report.js 单元测试：CSV 表头/BOM/转义、打印 HTML、JSON 导出。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CSV_HEADERS,
  csvEscape,
  drawRows,
  buildCSV,
  buildConfigJSON,
  buildSessionJSON,
  buildPrintHTML,
} from '../../src/js/core/report.js';
import { escapeHtml, formatDateTime } from '../../src/js/core/format.js';
import { createSession, recordDraw, markPaid } from '../../src/js/core/state.js';

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

function makeSession(over = {}) {
  const config = {
    title: '测试年会',
    playerCount: 6,
    allowRepeatWin: false,
    levels: [
      { id: 'lv_a', name: '第一关', prize: '保温杯,大号', winners: 2, difficulty: 'easy' },
      { id: 'lv_b', name: '第二关', prize: '蓝牙"耳机"\n限定', winners: 1, difficulty: 'extreme' },
      { id: 'lv_c', name: '第三关', prize: '神秘大奖', winners: 1, difficulty: 'hard' },
    ],
    ...over,
  };
  const session = createSession(config, T0);
  recordDraw(session, { levelIndex: 0, player: 3, accuracy: 0.9, now: T0 });
  recordDraw(session, { levelIndex: 0, player: 1, accuracy: 0.9, now: T0 + 1000 });
  recordDraw(session, { levelIndex: 1, player: 5, accuracy: 0.9, now: T0 + 2000 });
  markPaid(session, 1, true);
  return session;
}

test('csvEscape：逗号 / 引号 / 换行 / 空值', () => {
  assert.equal(csvEscape('普通文本'), '普通文本');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('a"b'), '"a""b"');
  assert.equal(csvEscape('a\nb'), '"a\nb"');
  assert.equal(csvEscape('a\r\nb'), '"a\r\nb"');
  assert.equal(csvEscape(''), '');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
  assert.equal(csvEscape(42), '42');
});

test('buildCSV：BOM、表头、CRLF 行尾', () => {
  const csv = buildCSV(makeSession());
  assert.equal(csv.charCodeAt(0), 0xfeff, '必须以 UTF-8 BOM 开头');
  assert.ok(csv.startsWith('\ufeff' + CSV_HEADERS.join(',') + '\r\n'));
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('\r\n'), '应使用 CRLF 换行');

  // 第一行（去掉 BOM）应正好是表头
  const firstLine = csv.slice(1).split('\r\n')[0];
  assert.equal(firstLine, '序号,关卡,奖品,中奖号码,难度,抽取时间,兑付状态');
  assert.deepEqual(CSV_HEADERS, ['序号', '关卡', '奖品', '中奖号码', '难度', '抽取时间', '兑付状态']);
});

test('buildCSV：含逗号 / 引号 / 换行的奖品被正确转义', () => {
  const csv = buildCSV(makeSession());
  // 逗号字段整体加引号
  assert.ok(csv.includes('"保温杯,大号"'));
  // 引号翻倍 + 换行字段整体加引号
  assert.ok(csv.includes('"蓝牙""耳机""\n限定"'));
  // 普通字段不加引号（序号、关卡、号码、难度保持原样）
  assert.ok(csv.includes('1,第一关,"保温杯,大号",3,简单,'));
});

test('drawRows：按序号排序、难度中文标签、兑付状态', () => {
  const session = makeSession();
  // 打乱 draws 顺序，输出仍应按 seq 排序
  session.draws.reverse();
  const rows = drawRows(session);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r[0]),
    [1, 2, 3]
  );
  assert.equal(rows[0][1], '第一关');
  assert.equal(rows[0][2], '保温杯,大号');
  assert.equal(rows[0][3], 3);
  assert.equal(rows[0][4], '简单');
  assert.equal(rows[0][5], formatDateTime(session.draws.find((d) => d.seq === 1).at));
  assert.equal(rows[0][6], '已兑付');
  assert.equal(rows[1][6], '未兑付');
  assert.equal(rows[2][4], '极限', '难度标签应转换为中文');

  const csv = buildCSV(session);
  assert.ok(csv.includes('已兑付'));
  assert.ok(csv.includes('未兑付'));
  assert.ok(csv.includes('极限'));
});

test('buildCSV：没有中奖记录时只有表头', () => {
  const session = createSession(makeSession().config, T0);
  const csv = buildCSV(session);
  assert.equal(csv, '\ufeff' + CSV_HEADERS.join(',') + '\r\n');
});

test('buildPrintHTML：包含奖品与号码、已兑付勾选、未抽取提示', () => {
  const html = buildPrintHTML(makeSession(), {
    orgName: '某某公司 <工会>',
    printedAt: T0,
  });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('兑奖清单'));
  assert.ok(html.includes('第一关'));
  assert.ok(html.includes('保温杯,大号'));
  assert.ok(html.includes('<td class="num">3 号</td>'), '中奖号码应显示为“3 号”');
  assert.ok(html.includes('<td class="num">5 号</td>'));
  assert.equal(html.match(/<span class="box">✓<\/span>/g).length, 1, '只有已兑付的一条打勾');
  assert.equal(html.match(/<span class="box"><\/span>/g).length, 2, '未兑付的显示空框');
  assert.ok(html.includes('（未抽取）'), '第三关未抽应显示未抽取');
  assert.ok(html.includes('某某公司 &lt;工会&gt;'), '组织名应转义');
  assert.ok(html.includes('中奖人数：3 人'));
  assert.ok(html.includes('共 3 条'));
});

test('buildPrintHTML：对奖品 / 关卡名 / 标题做 HTML 转义', () => {
  const config = {
    title: '<b>年会</b> & "抽奖"',
    playerCount: 3,
    allowRepeatWin: false,
    levels: [
      { id: 'x1', name: '<第一关>', prize: '<script>alert("x")</script>', winners: 1, difficulty: 'easy' },
    ],
  };
  const session = createSession(config, T0);
  recordDraw(session, { levelIndex: 0, player: 2, now: T0 });

  const html = buildPrintHTML(session);
  assert.ok(html.includes('&lt;b&gt;年会&lt;/b&gt; &amp; &quot;抽奖&quot;'));
  assert.ok(html.includes('&lt;第一关&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert'), '不得输出未转义的脚本');
  assert.ok(!html.includes('<b>年会</b>'), '不得输出未转义的标题');
});

test('buildPrintHTML：空对局也生成完整文档', () => {
  const session = createSession(makeSession().config, T0);
  const html = buildPrintHTML(session);
  assert.ok(html.includes('中奖人数：0 人'));
  assert.ok(html.includes('共 0 条'));
  assert.equal(html.match(/（未抽取）/g).length, 3);
});

test('buildConfigJSON / buildSessionJSON：可被 JSON.parse 还原', () => {
  const session = makeSession();
  const cfgJSON = buildConfigJSON(session.config);
  assert.ok(cfgJSON.endsWith('\n'));
  assert.deepEqual(JSON.parse(cfgJSON), session.config);

  const sesJSON = buildSessionJSON(session);
  assert.ok(sesJSON.endsWith('\n'));
  assert.equal(JSON.parse(sesJSON).id, session.id);
  assert.equal(JSON.parse(sesJSON).draws.length, 3);
});

test('escapeHtml / formatDateTime：基础格式', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.match(formatDateTime(T0), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(formatDateTime('not-a-date'), '—');
});
