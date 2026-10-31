// 渲染进程入口
import { App } from './game/app.js';

const canvas = document.getElementById('stage');
const app = new App(canvas);

app.boot().catch((err) => {
  console.error(err);
  const frame = document.getElementById('stage-frame');
  if (frame) {
    frame.innerHTML = `<div style="color:#fff3d6;font:14px 'Microsoft YaHei';padding:24px;line-height:1.8">
      游戏启动失败：${String(err && err.message ? err.message : err)}
    </div>`;
  }
});
