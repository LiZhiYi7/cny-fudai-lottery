// 后台：基础设置页签（标题 / 人数 / 开关 / 后台密码）。

import { LIMITS } from '../core/constants.js';
import { escapeHtml } from '../core/format.js';
import { clearFieldErrorText } from './dom.js';

function errRow(field, admin) {
  return `<p class="adm-error" data-field-error="${field}">${escapeHtml(admin.errorFor(field))}</p>`;
}

export function renderSettings(body, admin) {
  const d = admin.state.draft;
  const pinConfirm = admin.state.pinConfirm;

  body.innerHTML = `
    <section class="adm-card">
      <h3>基础设置</h3>
      <div class="adm-row">
        <div class="adm-field">
          <label class="adm-label" for="adm-title">游戏标题（最多 ${LIMITS.maxTitle} 字）</label>
          <input id="adm-title" class="adm-input" data-field="title" type="text"
                 maxlength="${LIMITS.maxTitle}" value="${escapeHtml(d.title)}"
                 autocomplete="off" spellcheck="false" />
          ${errRow('title', admin)}
        </div>
        <div class="adm-field">
          <label class="adm-label" for="adm-players">玩家人数（${LIMITS.minPlayers}–${LIMITS.maxPlayers} 人）</label>
          <input id="adm-players" class="adm-input" data-field="playerCount" type="number"
                 min="${LIMITS.minPlayers}" max="${LIMITS.maxPlayers}" step="1"
                 value="${escapeHtml(d.playerCount)}" />
          ${errRow('playerCount', admin)}
        </div>
      </div>
      <div class="adm-switches">
        <label class="adm-switch">
          <input type="checkbox" data-field="allowRepeatWin" ${d.allowRepeatWin ? 'checked' : ''} />
          <span class="adm-switch-track" aria-hidden="true"></span>
          <span>允许重复中奖</span>
        </label>
        <label class="adm-switch">
          <input type="checkbox" data-field="sound" ${d.sound ? 'checked' : ''} />
          <span class="adm-switch-track" aria-hidden="true"></span>
          <span>游戏音效</span>
        </label>
        <label class="adm-switch">
          <input type="checkbox" data-field="bgm" ${d.bgm ? 'checked' : ''} />
          <span class="adm-switch-track" aria-hidden="true"></span>
          <span>背景音乐</span>
        </label>
      </div>
      <p class="adm-note">开启“允许重复中奖”后，各关中奖名额合计可以超过玩家人数；关闭时名额合计不得超过玩家总数。</p>
    </section>

    <section class="adm-card">
      <h3>后台密码</h3>
      <div class="adm-row">
        <div class="adm-field">
          <label class="adm-label" for="adm-pin">新密码（4–6 位数字）</label>
          <input id="adm-pin" class="adm-input" data-field="pin" type="password" inputmode="numeric"
                 maxlength="6" value="${escapeHtml(d.pin)}" autocomplete="new-password" />
          ${errRow('pin', admin)}
        </div>
        <div class="adm-field">
          <label class="adm-label" for="adm-pin2">确认新密码</label>
          <input id="adm-pin2" class="adm-input" data-field="pinConfirm" type="password" inputmode="numeric"
                 maxlength="6" value="${escapeHtml(pinConfirm)}" autocomplete="new-password" />
          ${errRow('pinConfirm', admin)}
        </div>
      </div>
      <p class="adm-note">密码只保存在本机配置中；忘记密码时可删除数据目录下的 config.json 恢复默认 8888。</p>
    </section>`;

  const titleInput = body.querySelector('[data-field="title"]');
  const playersInput = body.querySelector('[data-field="playerCount"]');
  const pinInput = body.querySelector('[data-field="pin"]');
  const pinConfirmInput = body.querySelector('[data-field="pinConfirm"]');

  titleInput.addEventListener('input', () => {
    d.title = titleInput.value;
    admin.clearError('title');
    clearFieldErrorText(titleInput);
    admin.draftChanged();
  });

  playersInput.addEventListener('input', () => {
    const raw = playersInput.value;
    if (raw === '') {
      d.playerCount = '';
    } else {
      const n = Number(raw);
      d.playerCount = Number.isFinite(n) ? Math.trunc(n) : '';
    }
    admin.clearError('playerCount');
    clearFieldErrorText(playersInput);
    admin.draftChanged();
  });

  body.querySelectorAll('.adm-switch input[data-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const field = input.getAttribute('data-field');
      d[field] = input.checked;
      admin.draftChanged();
    });
  });

  function filterPin(raw) {
    return String(raw || '').replace(/\D/g, '').slice(0, 6);
  }

  pinInput.addEventListener('input', () => {
    const clean = filterPin(pinInput.value);
    if (clean !== pinInput.value) pinInput.value = clean;
    d.pin = clean;
    admin.clearError('pin');
    admin.clearError('pinConfirm');
    clearFieldErrorText(pinInput);
    const confirmErr = body.querySelector('[data-field-error="pinConfirm"]');
    if (confirmErr) confirmErr.textContent = '';
    admin.draftChanged();
  });

  pinConfirmInput.addEventListener('input', () => {
    const clean = filterPin(pinConfirmInput.value);
    if (clean !== pinConfirmInput.value) pinConfirmInput.value = clean;
    admin.state.pinConfirm = clean;
    admin.clearError('pinConfirm');
    clearFieldErrorText(pinConfirmInput);
    admin.draftChanged();
  });
}
