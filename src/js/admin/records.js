// 后台：中奖记录页签（按关卡分组、兑付勾选、CSV 导出、打印兑奖单）。

import { markPaid, sessionSummary } from '../core/state.js';
import { buildCSV, buildPrintHTML } from '../core/report.js';
import { formatDate, formatDateTime, fileSafeName, escapeHtml } from '../core/format.js';
import { toast, printHTML } from '../game/ui.js';
import { CSV_FILTERS, saveTextFile } from './files.js';
import { errText, statusLabel } from './dom.js';

function hasSession(session) {
  return !!(session && session.config && Array.isArray(session.config.levels) && Array.isArray(session.draws));
}

function statsHtml(summary) {
  return `<div class="adm-stats">
    <div class="adm-stat"><span class="adm-stat-v" data-stat="winners">${summary.totalWinners}</span><span class="adm-stat-k">中奖人数</span></div>
    <div class="adm-stat"><span class="adm-stat-v" data-stat="paid">${summary.paidCount}</span><span class="adm-stat-k">已兑付</span></div>
    <div class="adm-stat"><span class="adm-stat-v" data-stat="pending">${summary.pendingCount}</span><span class="adm-stat-k">待兑付</span></div>
    <div class="adm-stat"><span class="adm-stat-v" data-stat="slots">${summary.totalSlots}</span><span class="adm-stat-k">总名额</span></div>
  </div>`;
}

function groupHtml(level) {
  const rows = level.draws.length
    ? level.draws
        .map((d) => {
          const seq = escapeHtml(d.seq);
          const player = escapeHtml(d.player);
          return `<tr data-seq="${seq}" class="${d.paid ? 'is-paid' : ''}">
        <td>${seq}</td>
        <td class="adm-num">${player} 号</td>
        <td>${escapeHtml(formatDateTime(d.at))}</td>
        <td>
          <label class="adm-check">
            <input type="checkbox" data-seq="${seq}" ${d.paid ? 'checked' : ''}
                   aria-label="标记 ${player} 号已兑付" />
            <span class="adm-check-text">${d.paid ? '已兑付' : '待兑付'}</span>
          </label>
        </td>
      </tr>`;
        })
        .join('')
    : `<tr class="adm-row-empty"><td colspan="4">本关还没有抽出中奖号码</td></tr>`;

  return `<section class="adm-group" data-level-index="${level.index}">
    <header class="adm-group-head">
      <span class="adm-group-name">${escapeHtml(level.name)}</span>
      <span class="adm-group-prize">${escapeHtml(level.prize)}</span>
      <span class="adm-group-count">已抽 ${level.draws.length} / ${level.slots} 人</span>
    </header>
    <table class="adm-table">
      <thead><tr><th style="width:64px">序号</th><th style="width:110px">中奖号码</th><th>抽取时间</th><th style="width:150px">兑付</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

export function renderRecords(body, admin) {
  const session = admin.ctx.session;
  if (!hasSession(session)) {
    body.innerHTML = `<div class="adm-empty">
      <strong>还没有对局记录</strong>
      开始一局游戏后，中奖号码、奖品和兑付状态会出现在这里，可勾选兑付、导出 CSV 或打印兑奖单。
    </div>`;
    return;
  }

  const summary = sessionSummary(session);
  const hasDraws = summary.totalWinners > 0;

  body.innerHTML = `
    ${statsHtml(summary)}
    <div class="adm-sessionbar">
      <span>本局 · ${escapeHtml(formatDate(session.createdAt))} · ${statusLabel(session.status)} · 共 ${summary.players} 位玩家</span>
      <div class="adm-btns">
        <button type="button" class="px-btn secondary" data-act="csv" ${hasDraws ? '' : 'disabled'}>导出 CSV</button>
        <button type="button" class="px-btn secondary" data-act="print" ${hasDraws ? '' : 'disabled'}>打印兑奖单</button>
      </div>
    </div>
    <div data-groups>${summary.levels.map(groupHtml).join('')}</div>`;

  function updateStats() {
    const fresh = sessionSummary(admin.ctx.session);
    const set = (name, value) => {
      const node = body.querySelector(`[data-stat="${name}"]`);
      if (node) node.textContent = String(value);
    };
    set('winners', fresh.totalWinners);
    set('paid', fresh.paidCount);
    set('pending', fresh.pendingCount);
    set('slots', fresh.totalSlots);
  }

  body.querySelectorAll('input[type="checkbox"][data-seq]').forEach((input) => {
    input.addEventListener('change', async () => {
      const seq = Number(input.getAttribute('data-seq'));
      const checked = input.checked;
      const row = input.closest('tr');
      const text = row ? row.querySelector('.adm-check-text') : null;
      const draw = markPaid(admin.ctx.session, seq, checked);
      if (!draw) {
        toast('未找到该中奖记录', 'error');
        input.checked = !checked;
        return;
      }
      input.disabled = true;
      try {
        await admin.ctx.onSessionChange(admin.ctx.session);
        if (row) row.classList.toggle('is-paid', checked);
        if (text) text.textContent = checked ? '已兑付' : '待兑付';
        updateStats();
      } catch (err) {
        markPaid(admin.ctx.session, seq, !checked);
        input.checked = !checked;
        if (row) row.classList.toggle('is-paid', !checked);
        if (text) text.textContent = !checked ? '已兑付' : '待兑付';
        toast('保存兑付状态失败：' + errText(err), 'error');
      } finally {
        input.disabled = false;
      }
    });
  });

  const csvBtn = body.querySelector('[data-act="csv"]');
  if (csvBtn) csvBtn.addEventListener('click', () => exportCSV(admin));

  const printBtn = body.querySelector('[data-act="print"]');
  if (printBtn) printBtn.addEventListener('click', () => printTicket(admin));
}

async function exportCSV(admin) {
  const session = admin.ctx.session;
  if (!hasSession(session) || !(session.draws || []).length) {
    toast('当前没有可导出的中奖记录', 'error');
    return;
  }
  const title = fileSafeName(admin.ctx.config.title, '抽奖');
  const stamp = formatDate(new Date()).replace(/-/g, '');
  const defaultName = `兑奖清单-${title}-${stamp}.csv`;
  let csv = '';
  try {
    csv = buildCSV(session);
  } catch (err) {
    toast('生成 CSV 失败：' + errText(err), 'error');
    return;
  }
  await saveTextFile({ defaultName, content: csv, filters: CSV_FILTERS });
}

function printTicket(admin) {
  const session = admin.ctx.session;
  if (!hasSession(session)) {
    toast('当前没有可打印的对局记录', 'error');
    return;
  }
  try {
    printHTML(buildPrintHTML(session, { orgName: '', printedAt: new Date() }));
  } catch (err) {
    toast('打印失败：' + errText(err), 'error');
  }
}
