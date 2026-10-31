// 后台专用确认框。
//
// 为什么不用 game/ui.js 的 confirmDialog：它挂在 #ui-root（z-index 20）里，
// 而后台容器 #admin-root 是 z-index 40，弹层会被后台面板盖住导致无法点击。
// 这里把同结构的 .modal-backdrop 直接挂到 body（z-index 60），并复用 styles.css 的 .modal 样式。

export function confirmDialog({
  title = '确认',
  message = '',
  okText = '确定',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3></h3>
        <p></p>
        <div class="actions">
          <button type="button" class="px-btn secondary" data-cancel></button>
          <button type="button" class="px-btn" data-ok></button>
        </div>
      </div>`;

    wrap.querySelector('h3').textContent = title;
    wrap.querySelector('p').textContent = message;
    const okBtn = wrap.querySelector('[data-ok]');
    const cancelBtn = wrap.querySelector('[data-cancel]');
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    if (danger) okBtn.classList.add('danger');
    document.body.appendChild(wrap);

    let done = false;

    function finish(value) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(!!value);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      }
    }

    okBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) finish(false);
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => {
      try {
        okBtn.focus();
      } catch {
        /* ignore */
      }
    }, 30);
  });
}
