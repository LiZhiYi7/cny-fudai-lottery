// Electron 主进程（CommonJS）：自定义 app:// 协议、便携数据目录、单实例、截图自测、IPC。
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const devUrl = process.env.DEV_URL || '';
const isDev = !!devUrl;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function argValue(flag) {
  const hit = process.argv.find((a) => a === flag || a.startsWith(flag + '='));
  if (!hit) return null;
  if (hit === flag) {
    const i = process.argv.indexOf(hit);
    return process.argv[i + 1] || null;
  }
  return hit.slice(flag.length + 1) || null;
}

const shotPath = argValue('--screenshot');
const shotScreen = argValue('--screen') || 'home';
const isTest = process.argv.includes('--test');

let mainWindow = null;
let dataDir = '';
let dirty = false;
let forceClose = false;
let windowState = { width: 1280, height: 720, x: undefined, y: undefined };
let saveStateTimer = null;

// 自定义协议需在 ready 之前声明
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

async function isWritable(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, '.write-probe');
    await fs.writeFile(probe, '1');
    await fs.unlink(probe);
    return true;
  } catch {
    return false;
  }
}

async function resolveDataDir() {
  const candidates = [];
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) candidates.push(path.join(portableDir, 'data'));
  if (!app.isPackaged) candidates.push(path.join(ROOT, 'data'));
  candidates.push(path.join(app.getPath('userData'), 'data'));
  for (const dir of candidates) {
    if (await isWritable(dir)) return dir;
  }
  return path.join(app.getPath('userData'), 'data');
}

function dataPath(name) {
  const clean = String(name || '').replace(/\\/g, '/');
  if (!/^[A-Za-z0-9._/-]+\.json$/.test(clean) || clean.includes('..')) {
    throw new Error('非法的数据文件名');
  }
  const full = path.resolve(dataDir, clean);
  if (!full.startsWith(dataDir + path.sep)) throw new Error('非法的数据路径');
  return full;
}

async function readJSON(name) {
  try {
    const raw = await fs.readFile(dataPath(name), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    console.warn('[store] read failed', name, err && err.message);
    return null;
  }
}

async function writeJSON(name, data) {
  const file = dataPath(name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return { ok: true, path: file };
}

async function listData(sub) {
  const clean = String(sub || '').replace(/\\/g, '/');
  if (!/^[A-Za-z0-9._-]+$/.test(clean)) return [];
  const dir = path.resolve(dataDir, clean);
  if (!dir.startsWith(dataDir)) return [];
  try {
    const names = await fs.readdir(dir);
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const st = await fs.stat(path.join(dir, name));
        out.push({ name: `${clean}/${name}`, size: st.size, mtime: st.mtimeMs });
      } catch {
        /* ignore */
      }
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  } catch {
    return [];
  }
}

async function loadWindowState() {
  const saved = await readJSON('state.json');
  if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
    windowState = {
      width: Math.max(960, Math.min(3840, saved.width)),
      height: Math.max(540, Math.min(2160, saved.height)),
      x: Number.isFinite(saved.x) ? saved.x : undefined,
      y: Number.isFinite(saved.y) ? saved.y : undefined,
    };
  }
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const win = mainWindow;
  if (win.isFullScreen() || win.isMinimized()) return;
  const b = win.getContentBounds();
  const next = { width: b.width, height: b.height, x: b.x, y: b.y };
  windowState = next;
  writeJSON('state.json', next).catch(() => {});
}

function schedulePersist() {
  if (saveStateTimer) clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(persistWindowState, 600);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    useContentSize: true,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#07040a',
    show: false,
    autoHideMenuBar: true,
    title: '新春福袋抓抓乐',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.setZoomFactor(1);

  const params = new URLSearchParams();
  if (shotPath) params.set('screen', shotScreen);
  if (isTest) params.set('test', '1');
  const qs = params.toString() ? '?' + params.toString() : '';

  if (isDev) {
    mainWindow.loadURL(devUrl + qs);
  } else {
    mainWindow.loadURL(`app://game/index.html${qs}`);
  }

  mainWindow.webContents.on('console-message', (...args) => {
    const evt = args[0];
    const msg = evt && typeof evt === 'object' && evt.message ? evt.message : args[2];
    const level = evt && typeof evt === 'object' && evt.level !== undefined ? evt.level : args[1];
    console.log(`[renderer:${level}] ${msg}`);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[window] did-fail-load', code, desc, url);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.once('ready-to-show', () => {
    if (!shotPath) mainWindow.show();
  });

  mainWindow.on('resize', schedulePersist);
  mainWindow.on('move', schedulePersist);

  mainWindow.on('close', (ev) => {
    if (forceClose || !dirty) {
      persistWindowState();
      return;
    }
    ev.preventDefault();
    dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['继续对局', '退出游戏'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: '对局还没结束',
        message: '当前对局还没有结束，确定要退出吗？',
        detail: '已开出的中奖记录会保留，下次打开可以继续。',
      })
      .then(({ response }) => {
        if (response === 1) {
          forceClose = true;
          mainWindow.close();
        }
      });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (shotPath) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          const out = path.resolve(shotPath);
          await fs.mkdir(path.dirname(out), { recursive: true });
          await fs.writeFile(out, image.toPNG());
          console.log('[screenshot] saved', out);
        } catch (err) {
          console.error('[screenshot] failed', err);
        }
        forceClose = true;
        app.quit();
      }, 2600);
    });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    dataDir = await resolveDataDir();
    console.log('[data]', dataDir);
    await loadWindowState();

    protocol.handle('app', async (request) => {
      try {
        const url = new URL(request.url);
        let rel = decodeURIComponent(url.pathname || '/');
        if (rel === '/' || rel === '') rel = '/index.html';
        const file = path.normalize(path.join(SRC, rel));
        if (!file.startsWith(SRC)) {
          return new Response('Forbidden', { status: 403 });
        }
        const data = await fs.readFile(file);
        return new Response(data, {
          headers: {
            'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'cache-control': 'no-cache',
          },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    });

    ipcMain.handle('store:read', (_e, name) => readJSON(name));
    ipcMain.handle('store:write', (_e, name, data) => writeJSON(name, data));
    ipcMain.handle('store:list', (_e, sub) => listData(sub));
    ipcMain.handle('store:dir', () => dataDir);
    ipcMain.handle('file:save', async (_e, opts = {}) => {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '保存文件',
        defaultPath: path.join(app.getPath('documents'), opts.defaultName || 'export.txt'),
        filters: opts.filters || [{ name: '所有文件', extensions: ['*'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      await fs.writeFile(filePath, String(opts.content ?? ''), 'utf8');
      return { ok: true, path: filePath };
    });
    ipcMain.handle('app:openDataDir', async () => {
      const err = await shell.openPath(dataDir);
      return { ok: !err, message: err || '' };
    });
    ipcMain.handle('app:toggleFullscreen', () => {
      if (!mainWindow) return false;
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return mainWindow.isFullScreen();
    });
    ipcMain.handle('app:isFullscreen', () => (mainWindow ? mainWindow.isFullScreen() : false));
    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      dataDir,
      isPackaged: app.isPackaged,
      portable: !!process.env.PORTABLE_EXECUTABLE_DIR,
      electron: process.versions.electron,
    }));
    ipcMain.on('app:dirty', (_e, value) => {
      dirty = !!value;
    });
    ipcMain.on('app:quit', () => {
      forceClose = true;
      app.quit();
    });

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
