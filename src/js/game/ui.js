// DOM 弹层：toast、确认框、打印。

import { audio } from './audio.js';

export function toast(message, type = 'info', ms = 2600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

export function confirmDialog({
  title = '确认',
  message = '',
  okText = '确定',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('ui-root') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3></h3>
        <p></p>
        <div class="actions">
          <button class="px-btn secondary" data-cancel>${escapeText(cancelText)}</button>
          <button class="px-btn" data-ok>${escapeText(okText)}</button>
        </div>
      </div>`;
    wrap.querySelector('h3').textContent = title;
    wrap.querySelector('p').textContent = message;
    if (danger) wrap.querySelector('[data-ok]').style.background = '#b3172a';
    root.appendChild(wrap);

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'Enter') finish(true);
      e.stopPropagation();
    };
    wrap.querySelector('[data-ok]').addEventListener('click', () => {
      audio.click();
      finish(true);
    });
    wrap.querySelector('[data-cancel]').addEventListener('click', () => {
      audio.click();
      finish(false);
    });
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) finish(false);
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => wrap.querySelector('[data-ok]').focus(), 30);
  });
}

export function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 用隐藏 iframe 打印完整 HTML 文档，不依赖主页面结构。 */
export function printHTML(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => frame.remove(), 1200);
  };
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (err) {
        toast('打印失败：' + (err?.message || err), 'error');
      }
      cleanup();
    }, 250);
  };
  frame.srcdoc = html;
}
