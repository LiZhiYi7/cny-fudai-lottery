// 640×360 内部像素画布的统一定位常量。
// 游戏逻辑与美术共用这些坐标，修改时需同时检查 game/ 与 render/art.js。

export const VIEW = { W: 640, H: 360 };

export const MACHINE = {
  x: 52,
  y: 86,
  w: 536,
  h: 228, // 底部 314
  railY: 110, // 爪子挂轨 y
  dropY: 250, // 下爪最低 y
  floorY: 292, // 福袋底部基线
  innerLeft: 88,
  innerRight: 552,
  pouchY: 288, // 福袋中心基线
  goldBaseW: 38,
  goldBaseH: 42,
  pouchBaseW: 30,
  pouchBaseH: 34,
};

export const HUD = { top: 0, topH: 82, bottomY: 318, bottomH: 38 };

export const CONTENT = { x: 24, y: 8, w: 592, h: 344 };

// 爪子左右可移动范围
export const CLAW_RANGE = { min: 92, max: 548 };
