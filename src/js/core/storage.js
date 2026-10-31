// 存储适配器：Electron 下写 exe 旁 data/ 文件；浏览器/测试下用 localStorage。
// 所有方法均返回 Promise，调用方无需区分环境。

import { downloadBlob } from './format.js';

const PREFIX = 'cnyfudai:';
const native = typeof window !== 'undefined' && window.native && window.native.isElectron ? window.native : null;

function canUseLocalStorage() {
  try {
    const k = '__t__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const hasLS = typeof window !== 'undefined' && canUseLocalStorage();

export const storage = {
  isNative: !!native,
  mode: native ? 'file' : 'browser',

  async readJSON(name) {
    if (native) return native.store.read(name);
    if (!hasLS) return null;
    try {
      const raw = window.localStorage.getItem(PREFIX + name);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async writeJSON(name, data) {
    if (native) return native.store.write(name, data);
    if (!hasLS) return { ok: false };
    window.localStorage.setItem(PREFIX + name, JSON.stringify(data));
    return { ok: true };
  },

  async removeJSON(name) {
    if (native) return native.store.remove ? native.store.remove(name) : { ok: true };
    if (hasLS) window.localStorage.removeItem(PREFIX + name);
    return { ok: true };
  },

  async listArchives() {
    if (native) return native.store.list('archive');
    if (!hasLS) return [];
    const out = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(PREFIX + 'archive/')) continue;
      out.push({ name: key.slice(PREFIX.length), size: 0, mtime: 0 });
    }
    return out.sort((a, b) => (a.name < b.name ? 1 : -1));
  },

  async archiveSession(session) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `archive/${stamp}-${session.id}.json`;
    await this.writeJSON(name, session);
    return name;
  },

  async readArchive(name) {
    return this.readJSON(name);
  },

  async saveTextFile({ defaultName, content, filters }) {
    if (native && native.saveFile) return native.saveFile({ defaultName, content, filters });
    downloadBlob(defaultName, content, 'text/plain;charset=utf-8');
    return { ok: true, path: defaultName, browser: true };
  },

  async openDataDir() {
    if (native && native.openDataDir) return native.openDataDir();
    return { ok: false, message: '浏览器模式没有数据文件夹' };
  },

  async dataDir() {
    if (native && native.info) {
      const info = await native.info();
      return info.dataDir;
    }
    return '浏览器 localStorage';
  },
};
