// 后台主面板：页签切换、草稿配置、保存/放弃、脏状态提示。

import { normalizeConfig, validateConfig } from '../core/validate.js';
import { clone, deepEqual } from './dom.js';
import { renderSettings } from './settings.js';
import { renderLevels } from './levels.js';
import { renderRecords } from './records.js';
import { renderData } from './data.js';
import { toast } from '../game/ui.js';

const TABS = [
  { id: 'settings', label: '基础设置' },
  { id: 'levels', label: '关卡与奖品' },
  { id: 'records', label: '中奖记录' },
  { id: 'data', label: '数据管理' },
];

const CONFIG_TABS = ['settings', 'levels'];
const CONFIG_FIELDS = ['title', 'playerCount', 'pin', 'pinConfirm', 'allowRepeatWin', 'sound', 'bgm'];

/**
 * 创建后台面板。
 * @param {{ ctx: object, requestClose: () => void }} options
 */
export function createPanel({ ctx, requestClose }) {
  const state = {
    tab: 'settings',
    draft: clone(ctx.config),
    pinConfirm: String(ctx.config.pin),
    errors: [],
    saving: false,
    archives: { loading: false, loaded: false, list: [], error: '' },
  };

  const root = document.createElement('div');
  root.className = 'admin-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '后台管理');
  root.innerHTML = `
    <header class="admin-head">
      <h2>后 台 管 理</h2>
      <span class="adm-meta" data-meta></span>
      <button type="button" class="px-btn ghost" data-act="close">关闭（Esc）</button>
    </header>
    <nav class="admin-tabs" data-tabs role="tablist" aria-label="后台功能"></nav>
    <div class="admin-body" data-body></div>
    <footer class="admin-foot">
      <span class="adm-hint" data-hint></span>
      <button type="button" class="px-btn secondary" data-act="cancel">放弃修改</button>
      <button type="button" class="px-btn" data-act="save">保存设置</button>
    </footer>`;

  const tabsEl = root.querySelector('[data-tabs]');
  const body = root.querySelector('[data-body]');
  const hintEl = root.querySelector('[data-hint]');
  const saveBtn = root.querySelector('[data-act="save"]');
  const cancelBtn = root.querySelector('[data-act="cancel"]');

  tabsEl.innerHTML = TABS.map(
    (t) =>
      `<button type="button" class="px-btn secondary admin-tab" data-tab="${t.id}" role="tab" aria-selected="false">${t.label}</button>`
  ).join('');

  // ---------- 草稿与校验 ----------
  function slotStats() {
    const d = state.draft;
    const players = Number(d.playerCount);
    const levels = Array.isArray(d.levels) ? d.levels : [];
    const total = levels.reduce((sum, lv) => sum + (Number(lv.winners) || 0), 0);
    const safePlayers = Number.isFinite(players) ? players : 0;
    const over = !d.allowRepeatWin && total > safePlayers;
    return { players: safePlayers, total, over };
  }

  function isDirty() {
    return !deepEqual(state.draft, ctx.config) || String(state.pinConfirm) !== String(ctx.config.pin);
  }

  function errorFor(field) {
    const hit = state.errors.find((e) => e.field === field);
    return hit ? hit.message : '';
  }

  function clearError(field) {
    if (!state.errors.length) return;
    state.errors = state.errors.filter((e) => e.field !== field);
  }

  function draftChanged() {
    updateFooter();
  }

  // ---------- 保存 / 放弃 ----------
  function collectErrors() {
    const raw = clone(state.draft);
    const list = [];
    const check = validateConfig(raw);
    if (!check.ok) list.push(...check.errors);
    if (String(state.pinConfirm) !== String(raw.pin)) {
      list.push({ field: 'pinConfirm', message: '两次输入的密码不一致' });
    }
    const seen = new Set();
    const deduped = [];
    for (const err of list) {
      if (err.field && seen.has(err.field)) continue;
      if (err.field) seen.add(err.field);
      deduped.push(err);
    }
    return deduped;
  }

  async function save() {
    if (state.saving) return;
    const errors = collectErrors();
    state.errors = errors;
    if (errors.length) {
      const first = errors[0];
      if (String(first.field).startsWith('levels')) state.tab = 'levels';
      else if (CONFIG_FIELDS.indexOf(first.field) >= 0) state.tab = 'settings';
      render();
      toast(
        errors.length === 1 ? first.message : `有 ${errors.length} 处需要修改：${first.message}`,
        'error'
      );
      return;
    }
    let next;
    try {
      next = normalizeConfig(clone(state.draft));
    } catch {
      toast('配置格式错误，无法保存', 'error');
      return;
    }
    const check = validateConfig(next);
    if (!check.ok) {
      state.errors = check.errors;
      render();
      toast('配置校验未通过：' + check.errors[0].message, 'error');
      return;
    }
    state.saving = true;
    updateFooter();
    try {
      await ctx.onConfigChange(next);
    } catch (err) {
      state.saving = false;
      updateFooter();
      toast('保存失败：' + (err && err.message ? err.message : String(err)), 'error');
      return;
    }
    state.saving = false;
    ctx.config = next;
    state.draft = clone(next);
    state.pinConfirm = String(next.pin);
    state.errors = [];
    toast('设置已保存');
    render();
  }

  function cancel() {
    state.draft = clone(ctx.config);
    state.pinConfirm = String(ctx.config.pin);
    state.errors = [];
    state.saving = false;
    toast('已放弃未保存的修改');
    render();
  }

  function replaceDraft(config) {
    state.draft = clone(config);
    state.pinConfirm = String(config.pin);
    state.errors = [];
    state.saving = false;
    updateFooter();
  }

  // ---------- 渲染 ----------
  function updateFooter() {
    const configTab = CONFIG_TABS.indexOf(state.tab) >= 0;
    if (saveBtn) saveBtn.hidden = !configTab;
    if (cancelBtn) cancelBtn.hidden = !configTab;
    if (!hintEl) return;
    if (!configTab) {
      hintEl.classList.remove('over');
      hintEl.textContent =
        state.tab === 'records' ? '勾选兑付后会立即保存到本机' : '导出、导入与重置操作会立即生效';
      return;
    }
    const { players, total, over } = slotStats();
    const parts = [`名额合计 ${total} / 玩家 ${players} 人`];
    if (over) parts.push(`已超出 ${total - players} 个名额`);
    if (isDirty()) parts.push('有未保存的修改');
    hintEl.textContent = parts.join(' · ');
    hintEl.classList.toggle('over', over);
    if (saveBtn) saveBtn.disabled = over || state.saving;
    if (cancelBtn) cancelBtn.disabled = state.saving;
  }

  function render() {
    const meta = root.querySelector('[data-meta]');
    if (meta) {
      const d = state.draft;
      const count = Array.isArray(d.levels) ? d.levels.length : 0;
      meta.textContent = `${d.title || '未命名'} · ${d.playerCount || '?'} 位玩家 · ${count} 个关卡`;
    }
    tabsEl.querySelectorAll('[data-tab]').forEach((btn) => {
      const active = btn.getAttribute('data-tab') === state.tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (state.tab === 'settings') renderSettings(body, api);
    else if (state.tab === 'levels') renderLevels(body, api);
    else if (state.tab === 'records') renderRecords(body, api);
    else renderData(body, api);
    updateFooter();
  }

  function setTab(id) {
    if (TABS.every((t) => t.id !== id)) return;
    if (state.tab === id) return;
    state.tab = id;
    body.scrollTop = 0;
    render();
  }

  // ---------- 事件 ----------
  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    setTab(btn.getAttribute('data-tab'));
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.getAttribute('data-act');
    if (act === 'save') save();
    else if (act === 'cancel') cancel();
    else if (act === 'close') requestClose();
  });

  // 面板公开给各页签使用的接口
  const api = {
    ctx,
    state,
    errorFor,
    clearError,
    draftChanged,
    updateFooter,
    replaceDraft,
    rerender: render,
    isDirty,
    requestClose,
  };

  api.el = root;

  render();
  return api;
}
