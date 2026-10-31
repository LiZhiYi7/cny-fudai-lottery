// 后台管理入口：PIN 门禁 → 面板 → 关闭后 resolve。
//
// 由 App 动态 import 后调用：
//   await openAdmin({ config, session, dataDirLabel, onConfigChange, onSessionChange, onClose })
// 只在通过 ctx 传入的接口上操作，不读取应用内部状态。

import { normalizeConfig } from '../core/validate.js';
import { createDefaultConfig } from '../core/constants.js';
import { toast } from '../game/ui.js';
import { createGate, resolvePin } from './gate.js';
import { createPanel } from './panel.js';
import { confirmDialog } from './dialog.js';

let active = null;

function isValidSession(session) {
  if (!session || typeof session !== 'object') return false;
  const cfg = session.config;
  if (!cfg || !Array.isArray(cfg.levels) || !Number.isInteger(cfg.playerCount)) return false;
  if (!Array.isArray(session.draws)) return false;
  if (['playing', 'finished', 'abandoned'].indexOf(session.status) < 0) return false;
  if (cfg.levels.length === 0) return false;
  for (const lv of cfg.levels) {
    if (!lv || typeof lv !== 'object') return false;
    if (typeof lv.name !== 'string' || typeof lv.prize !== 'string') return false;
    if (!Number.isInteger(lv.winners) || lv.winners < 0) return false;
  }
  for (const draw of session.draws) {
    if (!draw || typeof draw !== 'object') return false;
    if (!Number.isInteger(draw.player) || draw.player < 1 || draw.player > cfg.playerCount) return false;
    if (
      !Number.isInteger(draw.levelIndex) ||
      draw.levelIndex < 0 ||
      draw.levelIndex >= cfg.levels.length
    ) {
      return false;
    }
  }
  return true;
}

function normalizeCtx(ctx) {
  const raw = ctx && typeof ctx === 'object' ? ctx : {};
  let config;
  try {
    config = normalizeConfig(raw.config || createDefaultConfig());
  } catch {
    config = normalizeConfig(createDefaultConfig());
  }
  return {
    config,
    session: isValidSession(raw.session) ? raw.session : null,
    dataDirLabel:
      typeof raw.dataDirLabel === 'string' && raw.dataDirLabel ? raw.dataDirLabel : '未知目录',
    onConfigChange: async (next) => {
      if (typeof raw.onConfigChange === 'function') await raw.onConfigChange(next);
    },
    onSessionChange: async (next) => {
      if (typeof raw.onSessionChange === 'function') await raw.onSessionChange(next);
    },
    onClose: () => {
      if (typeof raw.onClose === 'function') raw.onClose();
    },
  };
}

/**
 * 打开后台管理面板，返回的 Promise 在面板关闭后 resolve。
 * @param {object} ctx
 */
export async function openAdmin(ctx) {
  const host = document.getElementById('admin-root');
  if (!host) {
    toast('后台容器缺失，无法打开管理面板', 'error');
    return;
  }
  if (active) return active.promise;

  const safe = normalizeCtx(ctx);
  let gate = null;
  let panel = null;
  let closed = false;
  let closing = false;
  let resolvePromise = null;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  active = { promise };

  host.classList.add('open');
  host.setAttribute('aria-hidden', 'false');
  host.innerHTML = '';

  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    // 确认框自己处理 Esc，避免一次关闭两层
    if (document.querySelector('.modal-backdrop')) return;
    e.preventDefault();
    e.stopPropagation();
    doClose(!panel);
  }

  function onBackdropPointer(e) {
    if (e.target !== host) return;
    doClose(!panel);
  }

  async function doClose(force) {
    if (closed || closing) return;
    closing = true;
    if (panel && !force) {
      let dirty = false;
      try {
        dirty = panel.isDirty();
      } catch {
        dirty = false;
      }
      if (dirty) {
        const ok = await confirmDialog({
          title: '关闭后台',
          message: '当前有未保存的设置修改，关闭后将丢弃这些修改。确定关闭吗？',
          okText: '放弃修改并关闭',
          cancelText: '继续编辑',
          danger: true,
        });
        if (!ok) {
          closing = false;
          return;
        }
      }
    }
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    host.removeEventListener('pointerdown', onBackdropPointer);
    if (gate) {
      try {
        gate.destroy();
      } catch {
        /* ignore */
      }
      gate = null;
    }
    panel = null;
    host.classList.remove('open');
    host.innerHTML = '';
    host.setAttribute('aria-hidden', 'true');
    active = null;
    try {
      safe.onClose();
    } catch (err) {
      console.warn('[admin] onClose 出错', err);
    }
    if (resolvePromise) resolvePromise();
  }

  function mountPanel() {
    if (closed) return;
    try {
      panel = createPanel({ ctx: safe, requestClose: () => doClose(false) });
      host.appendChild(panel.el);
    } catch (err) {
      toast('后台面板初始化失败：' + (err && err.message ? err.message : String(err)), 'error');
      doClose(true);
    }
  }

  try {
    gate = createGate({
      pin: resolvePin(safe.config),
      onUnlock: () => {
        if (closed) return;
        if (gate) {
          gate.destroy();
          gate = null;
        }
        mountPanel();
      },
      onCancel: () => doClose(true),
    });
    host.appendChild(gate.el);
    document.addEventListener('keydown', onKeyDown, true);
    host.addEventListener('pointerdown', onBackdropPointer);
  } catch (err) {
    closed = true;
    active = null;
    document.removeEventListener('keydown', onKeyDown, true);
    host.removeEventListener('pointerdown', onBackdropPointer);
    host.classList.remove('open');
    host.innerHTML = '';
    host.setAttribute('aria-hidden', 'true');
    if (resolvePromise) resolvePromise();
    throw err;
  }

  return promise;
}
