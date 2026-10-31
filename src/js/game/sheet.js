// 兑奖清单（DOM 面板）：分组列出奖品与中奖序号、勾选兑付、导出 CSV、打印。

import { sessionSummary, markPaid } from '../core/state.js';
import { buildCSV, buildPrintHTML } from '../core/report.js';
import { formatDate, formatDateTime, fileSafeName } from '../core/format.js';
import { storage } from '../core/storage.js';
import { toast, printHTML, escapeText } from './ui.js';
import { audio } from './audio.js';

export class ResultSheet {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    };
  }

  open() {
    const app = this.app;
    if (!app.session || !(app.session.draws || []).length) {
      toast('还没有中奖记录');
      return;
    }
    this.close(true);
    this.render();
    document.addEventListener('keydown', this.onKey, true);
  }

  render() {
    const app = this.app;
    const session = app.session;
    const summary = sessionSummary(session);
    const rows = session.draws
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((d) => {
        const level = summary.levels[d.levelIndex];
        return `<tr data-seq="${d.seq}">
          <td>${d.seq}</td>
          <td>${escapeText(level ? level.name : d.levelName)}</td>
          <td>${escapeText(d.prize)}</td>
          <td class="num">${d.player} 号</td>
          <td>${escapeText(formatDateTime(d.at))}</td>
          <td class="${d.paid ? 'paid' : 'unpaid'}">${d.paid ? '已兑付' : '待兑付'}</td>
          <td><input type="checkbox" ${d.paid ? 'checked' : ''} aria-label="标记 ${d.player} 号已兑付" /></td>
        </tr>`;
      })
      .join('');

    const el = document.createElement('div');
    el.className = 'sheet-backdrop';
    el.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="兑奖清单">
        <div class="sheet-header">
          <h2>兑 奖 清 单</h2>
          <span class="meta" data-meta>${summary.totalWinners} 人中奖 · 已兑付 ${summary.paidCount} 人 · ${formatDate(
            session.createdAt
          )}</span>
          <button class="px-btn ghost" data-close>关闭</button>
        </div>
        <div class="sheet-body">
          <table>
            <thead><tr><th>序号</th><th>关卡</th><th>奖品</th><th>中奖号码</th><th>抽取时间</th><th>状态</th><th>兑付</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="sheet-foot">
          <button class="px-btn secondary" data-csv>导出 CSV</button>
          <button class="px-btn secondary" data-print>打印兑奖单</button>
          <button class="px-btn" data-close>关闭</button>
        </div>
      </div>`;
    (document.getElementById('ui-root') || document.body).appendChild(el);
    this.el = el;

    const close = () => this.close();
    el.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        close();
      })
    );
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) close();
    });
    el.querySelector('[data-csv]').addEventListener('click', () => this.exportCSV());
    el.querySelector('[data-print]').addEventListener('click', () => this.print());

    el.querySelectorAll('tbody tr').forEach((tr) => {
      const seq = Number(tr.getAttribute('data-seq'));
      const input = tr.querySelector('input[type="checkbox"]');
      if (!input) return;
      input.addEventListener('change', async () => {
        markPaid(session, seq, input.checked);
        tr.querySelector('td:nth-child(6)').textContent = input.checked ? '已兑付' : '待兑付';
        tr.querySelector('td:nth-child(6)').className = input.checked ? 'paid' : 'unpaid';
        await app.persistSession();
        this.updateMeta();
      });
    });
  }

  updateMeta() {
    if (!this.el) return;
    const summary = sessionSummary(this.app.session);
    const meta = this.el.querySelector('[data-meta]');
    if (meta) {
      meta.textContent = `${summary.totalWinners} 人中奖 · 已兑付 ${summary.paidCount} 人 · ${formatDate(
        this.app.session.createdAt
      )}`;
    }
  }

  async exportCSV() {
    const app = this.app;
    const csv = buildCSV(app.session);
    const name = `兑奖清单-${fileSafeName(app.config.title, '抽奖')}-${formatDate(new Date()).replace(/-/g, '')}.csv`;
    const res = await storage.saveTextFile({
      defaultName: name,
      content: csv,
      filters: [{ name: 'CSV 表格', extensions: ['csv'] }],
    });
    if (res && res.ok) toast('已导出：' + (res.path || name));
    else if (res && res.canceled) toast('已取消导出');
    else toast('导出失败', 'error');
  }

  print() {
    const app = this.app;
    const html = buildPrintHTML(app.session, {
      orgName: '',
      printedAt: new Date(),
    });
    printHTML(html);
  }

  close(silent = false) {
    document.removeEventListener('keydown', this.onKey, true);
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    if (!silent && this.app.screen && this.app.screen.rebuild) this.app.screen.rebuild();
  }
}
