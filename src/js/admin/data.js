// 后台：数据管理页签（数据目录、配置导入导出、本局数据、历史归档）。

import { createDefaultConfig } from '../core/constants.js';
import { normalizeConfig, validateConfig } from '../core/validate.js';
import { buildConfigJSON, buildSessionJSON } from '../core/report.js';
import { formatDate, formatDateTime, fileSafeName, escapeHtml } from '../core/format.js';
import { storage } from '../core/storage.js';
import { toast } from '../game/ui.js';
import { JSON_FILTERS, saveTextFile } from './files.js';
import { formatSize, errText, statusLabel } from './dom.js';
import { confirmDialog } from './dialog.js';

const MAX_IMPORT_BYTES = 1024 * 1024;

function usableSession(session) {
  return !!(session && session.config && Array.isArray(session.config.levels) && Array.isArray(session.draws));
}

function sessionNote(session) {
  if (!usableSession(session)) return '当前没有对局记录。';
  const draws = session.draws;
  const paid = draws.filter((d) => d && d.paid).length;
  return `本局：${formatDate(session.createdAt)} · ${statusLabel(session.status)} · 中奖 ${draws.length} 人 · 已兑付 ${paid} 人`;
}

function archiveRows(admin) {
  const st = admin.state.archives;
  if (st.error) {
    return `<p class="adm-error">读取归档失败：${escapeHtml(st.error)}</p>`;
  }
  if (st.loading) {
    return `<p class="adm-note">正在读取归档…</p>`;
  }
  if (!st.list.length) {
    return `<div class="adm-empty"><strong>还没有历史归档</strong>开始新一局时，上一局的对局数据会自动归档到数据目录。</div>`;
  }
  const rows = st.list
    .map((entry) => {
      const name = String((entry && entry.name) || '');
      const base = name.split('/').pop() || name;
      const size = formatSize(entry && entry.size);
      const time = entry && entry.mtime ? formatDateTime(entry.mtime) : '—';
      return `<tr>
        <td><span class="adm-file">${escapeHtml(base)}</span></td>
        <td>${escapeHtml(size)}</td>
        <td>${escapeHtml(time)}</td>
        <td class="adm-td-right"><button type="button" class="px-btn secondary adm-mini" data-archive-export="${escapeHtml(
          name
        )}">导出</button></td>
      </tr>`;
    })
    .join('');
  return `<table class="adm-table">
    <thead><tr><th>文件名</th><th style="width:100px">大小</th><th style="width:170px">时间</th><th style="width:100px"></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function paintArchiveList(admin, body) {
  const holder = body.querySelector('[data-archive-list]');
  if (!holder) return;
  holder.innerHTML = archiveRows(admin);
}

function bindArchiveButtons(admin, body) {
  body.querySelectorAll('[data-archive-export]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.getAttribute('data-archive-export');
      if (!name) return;
      btn.disabled = true;
      try {
        const data = await storage.readArchive(name);
        if (!data) {
          toast('读取归档失败，文件可能已被删除', 'error');
          return;
        }
        const base = name.split('/').pop() || 'archive.json';
        await saveTextFile({
          defaultName: base,
          content: buildSessionJSON(data),
          filters: JSON_FILTERS,
        });
      } catch (err) {
        toast('导出归档失败：' + errText(err), 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function loadArchives(admin, body) {
  const st = admin.state.archives;
  if (st.loading) return;
  admin.state.archives = { loading: true, loaded: false, list: st.list || [], error: '' };
  paintArchiveList(admin, body);
  storage
    .listArchives()
    .then((list) => {
      admin.state.archives = {
        loading: false,
        loaded: true,
        list: Array.isArray(list) ? list : [],
        error: '',
      };
    })
    .catch((err) => {
      admin.state.archives = { loading: false, loaded: true, list: [], error: errText(err) };
    })
    .finally(() => {
      if (!body.isConnected) return;
      paintArchiveList(admin, body);
      bindArchiveButtons(admin, body);
    });
}

function ensureArchives(admin, body) {
  const st = admin.state.archives;
  if (st.loaded || st.loading) return;
  loadArchives(admin, body);
}

async function openDataDir() {
  try {
    const res = await storage.openDataDir();
    if (res && res.ok) toast('已打开数据目录');
    else toast((res && res.message) || '当前环境无法打开数据目录', 'error');
  } catch (err) {
    toast('打开数据目录失败：' + errText(err), 'error');
  }
}

async function exportConfig(admin) {
  const cfg = admin.ctx.config;
  const title = fileSafeName(cfg.title, '配置');
  const stamp = formatDate(new Date()).replace(/-/g, '');
  await saveTextFile({
    defaultName: `配置-${title}-${stamp}.json`,
    content: buildConfigJSON(cfg),
    filters: JSON_FILTERS,
  });
}

async function exportSession(admin) {
  const session = admin.ctx.session;
  if (!usableSession(session)) {
    toast('当前没有可导出的对局记录', 'error');
    return;
  }
  const id = fileSafeName(session.id || '', 'session');
  const stamp = formatDate(new Date()).replace(/-/g, '');
  await saveTextFile({
    defaultName: `对局-${id}-${stamp}.json`,
    content: buildSessionJSON(session),
    filters: JSON_FILTERS,
  });
}

async function importConfig(admin, input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    toast('文件超过 1 MB，已取消导入', 'error');
    return;
  }
  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    toast('导入失败：不是有效的 JSON 文件', 'error');
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    toast('导入失败：配置内容格式不正确', 'error');
    return;
  }
  let next;
  try {
    next = normalizeConfig(parsed);
  } catch {
    toast('导入失败：配置内容无法解析', 'error');
    return;
  }
  const check = validateConfig(next);
  if (!check.ok) {
    toast('导入失败：' + check.errors[0].message, 'error');
    return;
  }
  const ok = await confirmDialog({
    title: '导入配置',
    message: `将用「${next.title}」覆盖当前设置：${next.playerCount} 位玩家、${next.levels.length} 个关卡，后台密码也会一并更新。确定导入吗？`,
    okText: '导入',
    cancelText: '取消',
  });
  if (!ok) return;
  try {
    await admin.ctx.onConfigChange(next);
  } catch (err) {
    toast('保存配置失败：' + errText(err), 'error');
    return;
  }
  admin.ctx.config = next;
  admin.replaceDraft(next);
  admin.rerender();
  toast('配置已导入并保存');
}

async function resetSession(admin) {
  if (!usableSession(admin.ctx.session)) {
    toast('当前没有对局记录', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: '重置本局',
    message: '将清空当前对局的中奖记录与兑付状态，且无法恢复（历史归档不受影响）。确定吗？',
    okText: '重置本局',
    cancelText: '取消',
    danger: true,
  });
  if (!ok) return;
  try {
    await admin.ctx.onSessionChange(null);
  } catch (err) {
    toast('重置失败：' + errText(err), 'error');
    return;
  }
  admin.ctx.session = null;
  admin.rerender();
  toast('本局记录已重置');
}

async function restoreDefault(admin) {
  const ok1 = await confirmDialog({
    title: '恢复默认设置',
    message: '将恢复出厂设置：标题、人数、关卡奖品和后台密码都会重置，并清空当前对局记录。确定继续吗？',
    okText: '继续',
    cancelText: '取消',
    danger: true,
  });
  if (!ok1) return;
  const ok2 = await confirmDialog({
    title: '再次确认',
    message: '此操作无法撤销，所有自定义关卡和本局中奖记录都会丢失（历史归档不受影响）。真的要恢复默认设置吗？',
    okText: '恢复默认',
    cancelText: '取消',
    danger: true,
  });
  if (!ok2) return;
  const defaults = createDefaultConfig();
  try {
    await admin.ctx.onConfigChange(defaults);
    await admin.ctx.onSessionChange(null);
  } catch (err) {
    toast('恢复默认设置失败：' + errText(err), 'error');
    return;
  }
  const normalized = normalizeConfig(defaults);
  admin.ctx.config = normalized;
  admin.ctx.session = null;
  admin.replaceDraft(normalized);
  admin.rerender();
  toast('已恢复默认设置（后台密码 8888）');
}

export function renderData(body, admin) {
  const session = admin.ctx.session;
  const hasSession = usableSession(session);
  const dirLabel = admin.ctx.dataDirLabel || '未知目录';

  body.innerHTML = `
    <section class="adm-card">
      <h3>数据目录</h3>
      <p class="adm-kv"><span class="adm-kv-key">当前数据目录</span><code class="adm-code">${escapeHtml(
        dirLabel
      )}</code></p>
      <div class="adm-btns">
        <button type="button" class="px-btn secondary" data-act="open-dir">打开数据目录</button>
      </div>
      <p class="adm-note">配置、本局结果与历史归档都保存在该目录；浏览器模式下使用 localStorage，无法打开文件夹。</p>
    </section>

    <section class="adm-card">
      <h3>配置备份</h3>
      <div class="adm-btns">
        <button type="button" class="px-btn secondary" data-act="export-config">导出配置 JSON</button>
        <button type="button" class="px-btn secondary" data-act="import-config">导入配置 JSON</button>
        <input type="file" accept=".json,application/json" data-import-input hidden />
      </div>
      <p class="adm-note">导入前会先校验格式；导出的是已保存的配置（未保存的修改请先点“保存设置”）。</p>
    </section>

    <section class="adm-card">
      <h3>本局数据</h3>
      <p class="adm-note" data-session-note>${escapeHtml(sessionNote(session))}</p>
      <div class="adm-btns">
        <button type="button" class="px-btn secondary" data-act="export-session" ${
          hasSession ? '' : 'disabled'
        }>导出本局 JSON</button>
        <button type="button" class="px-btn secondary" data-act="reset-session" ${
          hasSession ? '' : 'disabled'
        }>重置本局</button>
        <button type="button" class="px-btn danger" data-act="restore-default">恢复默认设置</button>
      </div>
    </section>

    <section class="adm-card">
      <h3>历史归档
        <button type="button" class="px-btn ghost adm-mini" data-act="refresh-archives">刷新</button>
      </h3>
      <div data-archive-list>${archiveRows(admin)}</div>
    </section>`;

  const importInput = body.querySelector('[data-import-input]');

  body.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'open-dir') openDataDir();
      else if (act === 'export-config') exportConfig(admin);
      else if (act === 'import-config' && importInput) importInput.click();
      else if (act === 'export-session') exportSession(admin);
      else if (act === 'reset-session') resetSession(admin);
      else if (act === 'restore-default') restoreDefault(admin);
      else if (act === 'refresh-archives') loadArchives(admin, body);
    });
  });

  if (importInput) {
    importInput.addEventListener('change', () => importConfig(admin, importInput));
  }

  bindArchiveButtons(admin, body);
  ensureArchives(admin, body);
}
