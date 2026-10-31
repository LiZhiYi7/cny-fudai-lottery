// PIN 门禁：4–6 位数字密码 + 数字键盘；连续 5 次错误锁定 10 秒。

import { LIMITS } from '../core/constants.js';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 10_000;
// 输入位数与密码长度一致时，短暂延迟后自动提交（键盘/触屏都顺手；按 Enter 或“确认”会立即提交）
const AUTO_SUBMIT_DELAY = 150;
const KEYS = [
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '4', label: '4' },
  { key: '5', label: '5' },
  { key: '6', label: '6' },
  { key: '7', label: '7' },
  { key: '8', label: '8' },
  { key: '9', label: '9' },
  { key: 'back', label: '退格', aria: '退格' },
  { key: '0', label: '0' },
  { key: 'ok', label: '确认', aria: '确认密码' },
];

/** 取当前生效的后台密码；配置损坏时回退 8888。 */
export function resolvePin(config) {
  const pin = String((config && config.pin) || '');
  return LIMITS.pinPattern.test(pin) ? pin : '8888';
}

/**
 * 渲染 PIN 门禁。
 * @param {{ pin: string, onUnlock: () => void, onCancel: () => void }} options
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function createGate({ pin, onUnlock, onCancel }) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-gate';

  const keypadHtml = KEYS.map((k) => {
    const aria = k.aria ? ` aria-label="${k.aria}"` : '';
    return `<button type="button" class="px-btn admin-key" data-key="${k.key}"${aria}>${k.label}</button>`;
  }).join('');

  wrap.innerHTML = `
    <div class="admin-gate-card" role="dialog" aria-modal="true" aria-label="请输入后台密码">
      <span class="admin-gate-badge">新 春 福 袋 · 后 台</span>
      <h2>后台管理</h2>
      <p class="admin-gate-sub">请输入 4–6 位数字密码</p>
      <input class="admin-pin-input" data-pin-input type="password" inputmode="numeric"
             pattern="[0-9]*" maxlength="6" autocomplete="off" spellcheck="false"
             placeholder="输入后台密码" aria-label="后台密码" />
      <p class="admin-gate-error" data-gate-error role="status" aria-live="polite"></p>
      <div class="admin-keypad" data-keypad>${keypadHtml}</div>
      <div class="admin-gate-foot">
        <span class="admin-gate-hint" data-gate-hint>按 Enter 确认 · Esc 退出</span>
        <button type="button" class="px-btn ghost" data-gate-cancel>取消</button>
      </div>
    </div>`;

  const card = wrap.querySelector('.admin-gate-card');
  const input = wrap.querySelector('[data-pin-input]');
  const errorEl = wrap.querySelector('[data-gate-error]');
  const hintEl = wrap.querySelector('[data-gate-hint]');
  const keypad = wrap.querySelector('[data-keypad]');
  const cancelBtn = wrap.querySelector('[data-gate-cancel]');

  let attempts = 0;
  let locked = false;
  let lockedUntil = 0;
  let lockTimer = 0;
  let autoTimer = 0;
  let done = false;

  function setError(message) {
    errorEl.textContent = message || '';
    input.classList.toggle('invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function setHint(message) {
    hintEl.textContent = message;
  }

  function shake() {
    card.classList.remove('shake');
    // 强制回流，让连续错误也能重新播放动画
    void card.offsetWidth;
    card.classList.add('shake');
  }

  function setControlsEnabled(enabled) {
    input.disabled = !enabled;
    keypad.querySelectorAll('button').forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  function endLock() {
    if (lockTimer) {
      clearInterval(lockTimer);
      lockTimer = 0;
    }
    locked = false;
    lockedUntil = 0;
    attempts = 0;
    setControlsEnabled(true);
    setError('');
    setHint('按 Enter 确认 · Esc 退出');
    input.focus();
  }

  function startLock() {
    locked = true;
    lockedUntil = Date.now() + LOCK_MS;
    input.value = '';
    setControlsEnabled(false);
    setError('');
    setHint('密码错误次数过多，已锁定 10 秒');
    if (lockTimer) clearInterval(lockTimer);
    lockTimer = setInterval(() => {
      const left = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      if (left <= 0) {
        endLock();
        return;
      }
      setHint(`密码错误次数过多，请 ${left} 秒后再试`);
    }, 200);
  }

  function finish() {
    if (done) return;
    done = true;
    cleanup();
    onUnlock();
  }

  function submit() {
    if (done || locked) return;
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
    const value = input.value.replace(/\D/g, '');
    if (!LIMITS.pinPattern.test(value)) {
      setError('请输入 4–6 位数字密码');
      shake();
      input.focus();
      return;
    }
    if (value === pin) {
      finish();
      return;
    }
    attempts += 1;
    input.value = '';
    if (attempts >= MAX_ATTEMPTS) {
      startLock();
      shake();
      return;
    }
    setError(`密码错误，还可尝试 ${MAX_ATTEMPTS - attempts} 次`);
    shake();
    input.focus();
  }

  /** 输满密码长度后自动提交；长度不匹配（用户退格）则不提交。 */
  function scheduleSubmit() {
    if (done || locked) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      autoTimer = 0;
      if (done || locked) return;
      if (input.value.replace(/\D/g, '').length !== pin.length) return;
      submit();
    }, AUTO_SUBMIT_DELAY);
  }

  function appendDigit(digit) {
    if (done || locked) return;
    const clean = input.value.replace(/\D/g, '');
    if (clean.length >= 6) return;
    input.value = (clean + digit).slice(0, 6);
    setError('');
    if (input.value.length === pin.length) scheduleSubmit();
  }

  function backspace() {
    if (done || locked) return;
    input.value = input.value.replace(/\D/g, '').slice(0, -1);
    setError('');
  }

  input.addEventListener('input', () => {
    const clean = input.value.replace(/\D/g, '').slice(0, 6);
    if (clean !== input.value) input.value = clean;
    setError('');
    if (clean.length === pin.length) scheduleSubmit();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  keypad.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (!btn || btn.disabled) return;
    const key = btn.getAttribute('data-key');
    if (key === 'back') backspace();
    else if (key === 'ok') submit();
    else appendDigit(key);
    if (!done && !locked) input.focus();
  });

  cancelBtn.addEventListener('click', () => {
    if (done) return;
    cleanup();
    onCancel();
  });

  function cleanup() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
    if (lockTimer) {
      clearInterval(lockTimer);
      lockTimer = 0;
    }
  }

  // 打开后自动聚焦密码框，方便直接敲键盘
  setTimeout(() => {
    if (!done) input.focus();
  }, 40);

  return {
    el: wrap,
    destroy() {
      done = true;
      cleanup();
      wrap.remove();
    },
  };
}
