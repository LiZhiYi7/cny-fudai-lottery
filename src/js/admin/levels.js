// 后台：关卡与奖品页签（1–8 关，增删改排序，名额实时统计）。

import { LIMITS, DIFFICULTIES, DIFFICULTY_ORDER, makeId } from '../core/constants.js';
import { escapeHtml } from '../core/format.js';
import { toast } from '../game/ui.js';
import { clearFieldErrorText } from './dom.js';
import { confirmDialog } from './dialog.js';

export function difficultyStars(id) {
  const d = DIFFICULTIES[id] || DIFFICULTIES.normal;
  const on = Math.max(0, Math.min(4, Number(d.stars) || 0));
  return '★'.repeat(on) + '☆'.repeat(4 - on);
}

export function difficultyText(id) {
  const d = DIFFICULTIES[id] || DIFFICULTIES.normal;
  return `${difficultyStars(d.id)} ${d.label}`;
}

function levelSlotTotals(draft) {
  const players = Number(draft.playerCount);
  const total = (Array.isArray(draft.levels) ? draft.levels : []).reduce(
    (sum, lv) => sum + (Number(lv.winners) || 0),
    0
  );
  const safePlayers = Number.isFinite(players) ? players : 0;
  const over = !draft.allowRepeatWin && total > safePlayers;
  return { players: safePlayers, total, over };
}

function levelCard(lv, index, total, admin) {
  const draft = admin.state.draft;
  const maxWinners = Math.max(LIMITS.minWinners, Number(draft.playerCount) || LIMITS.minWinners);
  const options = DIFFICULTY_ORDER.map((id) => {
    const item = DIFFICULTIES[id];
    const selected = lv.difficulty === id ? 'selected' : '';
    return `<option value="${id}" ${selected}>${difficultyStars(id)} ${item.label}</option>`;
  }).join('');
  const err = (key) =>
    escapeHtml(admin.errorFor(`levels.${index}.${key}`));
  const selectedDiff = DIFFICULTIES[lv.difficulty] ? lv.difficulty : 'normal';

  return `<article class="adm-level" data-index="${index}">
    <header class="adm-level-head">
      <span class="adm-level-no">第 ${index + 1} 关</span>
      <span class="adm-diff" data-diff>${difficultyText(selectedDiff)}</span>
      <div class="adm-level-tools">
        <button type="button" class="px-btn secondary adm-mini" data-act="up" ${index === 0 ? 'disabled' : ''}>上移</button>
        <button type="button" class="px-btn secondary adm-mini" data-act="down" ${index === total - 1 ? 'disabled' : ''}>下移</button>
        <button type="button" class="px-btn ghost adm-mini danger" data-act="del" ${total <= 1 ? 'disabled' : ''}>删除</button>
      </div>
    </header>
    <div class="adm-row adm-level-fields">
      <div class="adm-field">
        <label class="adm-label">关卡名称（最多 ${LIMITS.maxLevelName} 字）</label>
        <input class="adm-input" data-field="name" type="text" maxlength="${LIMITS.maxLevelName}"
               value="${escapeHtml(lv.name)}" autocomplete="off" spellcheck="false" />
        <p class="adm-error" data-field-error="levels.${index}.name">${err('name')}</p>
      </div>
      <div class="adm-field">
        <label class="adm-label">奖品名称（最多 ${LIMITS.maxPrizeName} 字）</label>
        <input class="adm-input" data-field="prize" type="text" maxlength="${LIMITS.maxPrizeName}"
               value="${escapeHtml(lv.prize)}" autocomplete="off" spellcheck="false" />
        <p class="adm-error" data-field-error="levels.${index}.prize">${err('prize')}</p>
      </div>
      <div class="adm-field adm-field-narrow">
        <label class="adm-label">中奖人数（1–${maxWinners}）</label>
        <input class="adm-input" data-field="winners" type="number" min="${LIMITS.minWinners}"
               max="${maxWinners}" step="1" value="${escapeHtml(lv.winners)}" />
        <p class="adm-error" data-field-error="levels.${index}.winners">${err('winners')}</p>
      </div>
      <div class="adm-field adm-field-narrow">
        <label class="adm-label">难度</label>
        <select class="adm-input adm-select" data-field="difficulty">${options}</select>
        <p class="adm-error" data-field-error="levels.${index}.difficulty">${err('difficulty')}</p>
      </div>
    </div>
  </article>`;
}

function renderSlotbar(admin) {
  const draft = admin.state.draft;
  const { players, total, over } = levelSlotTotals(draft);
  const left = players - total;
  const hint = over
    ? `超出 ${total - players} 个名额：请减少中奖人数，或在“基础设置”里开启“允许重复中奖”`
    : `剩余 ${left} 个名额可分配`;
  return `<div class="adm-slotbar${over ? ' over' : ''}" data-slotbar>
      <span class="adm-slot-main">名额合计 <b data-slot-total>${total}</b> / 玩家 <b data-slot-players>${players}</b> 人</span>
      <span class="adm-slot-hint" data-slot-hint>${escapeHtml(hint)}</span>
    </div>`;
}

export function renderLevels(body, admin) {
  const draft = admin.state.draft;
  const levels = Array.isArray(draft.levels) ? draft.levels : [];
  const cards = levels.map((lv, index) => levelCard(lv, index, levels.length, admin)).join('');

  body.innerHTML = `
    ${renderSlotbar(admin)}
    <p class="adm-error" data-field-error="levels">${escapeHtml(admin.errorFor('levels'))}</p>
    <div class="adm-level-list" data-level-list>${cards}</div>
    <div class="adm-level-actions">
      <button type="button" class="px-btn secondary" data-act="add" ${levels.length >= LIMITS.maxLevels ? 'disabled' : ''}>＋ 新增一关</button>
      <span class="adm-note">共 ${levels.length} / ${LIMITS.maxLevels} 关 · 改动后点右下角“保存设置”生效</span>
    </div>`;

  const list = body.querySelector('[data-level-list]');

  function getLevel(index) {
    const arr = admin.state.draft.levels;
    return arr && arr[index] ? arr[index] : null;
  }

  function refreshSlotbar() {
    const holder = body.querySelector('[data-slotbar]');
    if (!holder) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = renderSlotbar(admin);
    const fresh = wrap.firstElementChild;
    holder.replaceWith(fresh);
    admin.updateFooter();
  }

  list.addEventListener('input', (e) => {
    const input = e.target.closest('[data-field]');
    if (!input) return;
    const card = input.closest('.adm-level');
    if (!card) return;
    const index = Number(card.getAttribute('data-index'));
    const lv = getLevel(index);
    if (!lv) return;
    const field = input.getAttribute('data-field');
    if (field === 'name' || field === 'prize') {
      lv[field] = input.value;
    } else if (field === 'winners') {
      const raw = input.value;
      if (raw === '') lv.winners = '';
      else {
        const n = Number(raw);
        lv.winners = Number.isFinite(n) ? Math.trunc(n) : 0;
      }
    } else {
      return;
    }
    admin.clearError(`levels.${index}.${field}`);
    clearFieldErrorText(input);
    if (field === 'winners') refreshSlotbar();
    else admin.draftChanged();
  });

  list.addEventListener('change', (e) => {
    const select = e.target.closest('select[data-field="difficulty"]');
    if (!select) return;
    const card = select.closest('.adm-level');
    if (!card) return;
    const index = Number(card.getAttribute('data-index'));
    const lv = getLevel(index);
    if (!lv) return;
    lv.difficulty = DIFFICULTIES[select.value] ? select.value : 'normal';
    const diffEl = card.querySelector('[data-diff]');
    if (diffEl) diffEl.textContent = difficultyText(lv.difficulty);
    admin.clearError(`levels.${index}.difficulty`);
    clearFieldErrorText(select);
    admin.draftChanged();
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const card = btn.closest('.adm-level');
    if (!card) return;
    const index = Number(card.getAttribute('data-index'));
    const draftNow = admin.state.draft;
    const levelsNow = draftNow.levels;
    const act = btn.getAttribute('data-act');

    if (act === 'up' && index > 0) {
      const tmp = levelsNow[index - 1];
      levelsNow[index - 1] = levelsNow[index];
      levelsNow[index] = tmp;
      admin.rerender();
    } else if (act === 'down' && index < levelsNow.length - 1) {
      const tmp = levelsNow[index + 1];
      levelsNow[index + 1] = levelsNow[index];
      levelsNow[index] = tmp;
      admin.rerender();
    } else if (act === 'del') {
      if (levelsNow.length <= LIMITS.minLevels) {
        toast(`至少保留 ${LIMITS.minLevels} 个关卡`, 'error');
        return;
      }
      const lv = levelsNow[index];
      const ok = await confirmDialog({
        title: '删除关卡',
        message: `确定删除「${lv.name}」（${lv.prize}，${lv.winners} 人）吗？删除后需要点“保存设置”才会生效。`,
        okText: '删除',
        cancelText: '取消',
        danger: true,
      });
      if (!ok) return;
      levelsNow.splice(index, 1);
      admin.rerender();
    }
  });

  const addBtn = body.querySelector('[data-act="add"]');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const draftNow = admin.state.draft;
      const levelsNow = draftNow.levels;
      if (levelsNow.length >= LIMITS.maxLevels) {
        toast(`最多 ${LIMITS.maxLevels} 个关卡`, 'error');
        return;
      }
      const no = levelsNow.length + 1;
      levelsNow.push({
        id: makeId('lv'),
        name: `第${no}关`,
        prize: '待定奖品',
        winners: 1,
        difficulty: DIFFICULTY_ORDER[Math.min(no - 1, DIFFICULTY_ORDER.length - 1)],
      });
      admin.rerender();
    });
  }
}
