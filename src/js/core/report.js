// 兑奖清单：CSV 与打印 HTML 的纯函数构建器，方便单测。

import { formatDateTime, formatDate, escapeHtml } from './format.js';
import { difficultyOf } from './constants.js';

export const CSV_HEADERS = ['序号', '关卡', '奖品', '中奖号码', '难度', '抽取时间', '兑付状态'];

export function csvEscape(value) {
  const s = String(value === undefined || value === null ? '' : value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function drawRows(session) {
  return (session.draws || [])
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((d) => [
      d.seq,
      d.levelName,
      d.prize,
      d.player,
      difficultyOf(d.difficulty).label,
      formatDateTime(d.at),
      d.paid ? '已兑付' : '未兑付',
    ]);
}

export function buildCSV(session) {
  const lines = [CSV_HEADERS, ...drawRows(session)].map((row) => row.map(csvEscape).join(','));
  // BOM 让 Excel 正确识别 UTF-8
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

export function buildConfigJSON(config) {
  return JSON.stringify(config, null, 2) + '\n';
}

export function buildSessionJSON(session) {
  return JSON.stringify(session, null, 2) + '\n';
}

/**
 * 打印用 A4 兑奖单；自带样式，调用方只需写入隐藏容器并 print()。
 */
export function buildPrintHTML(session, { orgName = '', printedAt = new Date() } = {}) {
  const levels = session.config.levels;
  const rows = [];
  for (const lv of levels) {
    const draws = (session.draws || []).filter((d) => d.levelId === lv.id);
    if (!draws.length) {
      rows.push(
        `<tr><td>${escapeHtml(lv.name)}</td><td>${escapeHtml(lv.prize)}</td><td colspan="2" class="muted">（未抽取）</td></tr>`
      );
      continue;
    }
    for (const d of draws) {
      rows.push(
        `<tr><td>${escapeHtml(lv.name)}</td><td>${escapeHtml(lv.prize)}</td><td class="num">${escapeHtml(
          d.player
        )} 号</td><td><span class="box">${d.paid ? '✓' : ''}</span></td></tr>`
      );
    }
  }
  const total = (session.draws || []).length;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>兑奖清单 - ${escapeHtml(session.config.title || '新春福袋抓抓乐')}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #1b1018; margin: 0; }
  h1 { text-align: center; font-size: 26px; letter-spacing: 4px; margin: 0 0 4px; }
  .sub { text-align: center; font-size: 12px; color: #665; margin-bottom: 14px; }
  .meta { display: flex; justify-content: space-between; font-size: 12px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #555; padding: 7px 8px; text-align: left; }
  th { background: #f2e6d8; font-weight: 700; }
  td.num { font-weight: 700; letter-spacing: 1px; }
  .box { display: inline-block; width: 16px; height: 16px; border: 1px solid #333; text-align: center;
         line-height: 15px; font-size: 13px; }
  .muted { color: #888; }
  .foot { margin-top: 22px; display: flex; justify-content: space-between; font-size: 12px; }
  .sign { margin-top: 34px; font-size: 12px; color: #444; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<h1>${escapeHtml(session.config.title || '新春福袋抓抓乐')} · 兑奖清单</h1>
<div class="sub">${orgName ? escapeHtml(orgName) + ' · ' : ''}中奖号码凭本单兑付</div>
<div class="meta"><span>游戏日期：${formatDate(session.createdAt)}</span><span>中奖人数：${total} 人</span><span>打印时间：${formatDateTime(printedAt)}</span></div>
<table>
  <thead><tr><th style="width:120px">关卡</th><th>奖品</th><th style="width:100px">中奖号码</th><th style="width:80px">已兑付</th></tr></thead>
  <tbody>${rows.join('')}</tbody>
</table>
<div class="sign">兑奖人签字：____________________　　经办人：____________________　　日期：____________________</div>
<div class="foot"><span>本清单由「新春福袋抓抓乐」自动生成</span><span>共 ${total} 条</span></div>
</body></html>`;
}
