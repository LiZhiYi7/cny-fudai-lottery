// 构建 Windows 便携 exe：node scripts/build.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

if (!fs.existsSync(path.join(ROOT, 'node_modules', 'electron'))) {
  console.error('[build] 缺少依赖，请先运行 npm install');
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, 'build', 'icon.ico'))) {
  console.warn('[build] 缺少 build/icon.ico，将使用 Electron 默认图标');
}

const cli = path.join(ROOT, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
if (!fs.existsSync(cli)) {
  console.error('[build] 未找到 electron-builder，请先运行 npm install');
  process.exit(1);
}

console.log('[build] electron-builder', cli);

// 构建请使用真正的 Node.js（npm scripts 默认就是）。
// 若在 Electron 内嵌 Node 环境中运行，process.execPath 可能指向 Electron，可用 REAL_NODE 指定 node.exe。
let nodeExe = process.env.REAL_NODE || process.execPath;
if (process.versions.electron && !process.env.REAL_NODE) {
  console.error('[build] 当前 node 是 Electron 运行时，请安装 Node.js 或设置 REAL_NODE=<node.exe 路径>');
  process.exit(1);
}
console.log('[build] node', nodeExe);

const r = spawnSync(nodeExe, [cli, '--win', 'portable', '--x64'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
});
if (r.status !== 0) {
  console.error('[build] 失败，exit code =', r.status);
  process.exit(r.status || 1);
}

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  const files = fs
    .readdirSync(dist)
    .filter((f) => f.endsWith('.exe'))
    .map((f) => ({ name: f, size: (fs.statSync(path.join(dist, f)).size / 1024 / 1024).toFixed(1) + 'MB' }));
  console.log('[build] 产物：', files);
}
