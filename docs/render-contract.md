# 渲染契约（Render Contract）

所有游戏画面在 **640×360** 的内部像素画布上绘制，再由 `Render` 以整数倍最近邻放大到窗口。
禁止外部图片/网络资源；一切用 Canvas 2D + 代码绘制。模块为原生 ESM。

## 模块归属

| 文件 | 归属 | 作用 |
|---|---|---|
| `src/js/render/geometry.js` | 核心模块 | 统一坐标常量 |
| `src/js/render/palette.js` | 核心模块 | 限定调色板 + 明暗工具 |
| `src/js/render/engine.js` | 核心模块 | 画布初始化、整数缩放、坐标换算 |
| `src/js/render/text.js` | 核心模块 | 点阵数字 + 中文硬像素字 + 测量 |
| `src/js/render/index.js` | 核心模块 | 汇总导出（契约固定） |
| `src/js/render/art.js` | 渲染模块 | 场景、娃娃机、福袋、爪子、标题、卡片、面板、按钮 |
| `src/js/render/sprites.js` | 渲染模块 | 可复用像素精灵（灯笼/金币/年兽/小人等） |
| `src/js/render/fx.js` | 渲染模块 | 彩纸、烟花、金币雨、震屏、闪白、转场 |

## geometry.js（核心模块提供）

```js
export const VIEW = { W: 640, H: 360 };
export const MACHINE = {
  x: 52, y: 86, w: 536, h: 228,     // 机身外框，底部 314
  railY: 110,                        // 爪子挂轨 y
  dropY: 250,                        // 下爪最低 y
  floorY: 292,                       // 福袋底部基线
  innerLeft: 88, innerRight: 552,    // 玻璃内可用横向范围
  pouchY: 288,                       // 福袋中心基线
  goldBaseW: 38, goldBaseH: 42,      // 金福袋基准尺寸
  pouchBaseW: 30, pouchBaseH: 34,
};
export const HUD = { top: 0, topH: 82, bottomY: 318, bottomH: 38 };
export const CONTENT = { x: 24, y: 8, w: 592, h: 344 };
```

## engine.js（核心模块提供）

```js
Render.init(canvas)      // 固定 640×360，绑定 resize，设置 pixelated
Render.begin()           // 重置变换并清屏
Render.end()
Render.scale             // 当前整数缩放倍率
Render.pointer(evt)      // 鼠标/触摸 → 640×360 坐标 {x,y}
Render.onResize(cb)
```

## text.js（核心模块提供）

```js
Txt.measure(text, opts)                                  // {w,h}，支持 \n
Txt.draw(ctx, text, x, y, opts)                          // 中文硬像素字
Txt.digits(ctx, text, x, y, opts)                        // 5×7 点阵数字/符号
Txt.fit(text, maxWidth, opts)                            // 超宽截断加省略号
// opts: { size=16, color, align='left'|'center'|'right',
//         valign='top'|'middle'|'bottom', outline=0, outlineColor, shadow=0,
//         alpha=1, weight='bold', unit=2 (digits), glow=false }
```

## fx.js（渲染模块实现）

```js
FX.clear()
FX.update(dt)                        // 由主循环调用
FX.drawBack(ctx)                     // 在场景之后、主体之前
FX.drawFront(ctx)                    // 最上层（彩纸/金币雨/闪白）
FX.getShake()                        // {x,y} 当前震屏偏移
FX.confetti(x, y, count, opts)       // opts: {spread, speed, colors, gravity}
FX.firework(x, y, opts)              // opts: {color, count, scale}
FX.coinRain(seconds)
FX.sparks(x, y, count, color)
FX.shake(amount, seconds)
FX.flash(color, seconds)
FX.ring(x, y, color, radius, seconds) // 开奖光环
```

## art.js（渲染模块实现）

```js
Art.background(ctx, scene, t, opts)
// scene: 'home' | 'stage' | 'finale' | 'admin'
// 夜空/星/月/庙檐剪影/灯笼串/雪/前景观众剪影。静态层缓存到离屏 canvas。

Art.title(ctx, t)                    // 主标题「新春福袋抓抓乐」+ 副标题
Art.machine(ctx, state, t)           // 完整娃娃机 + 福袋 + 爪子 + 灯光
Art.finale(ctx, t, summary)          // 终场舞台 + 烟花
Art.winnerCard(ctx, { number, prize, levelName, t, accuracy }) // 揭晓卡片
Art.playerToken(ctx, { number, x, y, scale, won, dim, t })   // 名单/剩余玩家令牌
Art.panel(ctx, { x, y, w, h, variant })                      // 像素面板（暗红/金边/铆钉）
Art.button(ctx, { x, y, w, h, label, hover, disabled, primary, t })
Art.icon(ctx, name, x, y, scale)     // 'gift' 'lantern' 'coin' 'star' 'sound' 'back' 等
Art.levelBadge(ctx, { x, y, difficulty })                    // 难度星标
```

### Art.machine 的 state 协议

```js
{
  phase: 'idle'|'aim'|'drop'|'grab'|'lift'|'open'|'miss'|'retry',
  t: number,                 // 本关小游戏已运行秒数
  clawX: number,             // 640 坐标系
  clawY: number,             // railY → dropY
  clawOpen: number,          // 0 合 / 1 开
  grab: null | { kind: 'gold'|'normal', id: string },
  pouches: [{ id, x, y, gold, open: 0..1, lift: 0..1, scale, wobble }],
  goldId: string|null,
  misses: number,
  assist: boolean,           // 连续未中后的保底提示
  spotlight: 0..1,
  revealNumber: string|null, // 已开奖号码（字符串）
  shake: number
}
```

## 视觉要求

- 精细像素风：无抗锯齿、2px 硬边、统一 1px 深色描边、限定调色板、少量抖动过渡。
- 春节：深蓝夜空、红灯笼、金色装饰、雪、庙会屋檐、烟花；机器为红金配色。
- 中文字全部走 `Txt`，数字优先 `Txt.digits`；不得引入字体文件。
- 动效：灯笼摇摆、跑马灯、福袋轻微呼吸、爪子钢丝绳、开袋光柱、纸屑、烟花、金币雨、震屏。
- 性能：640×360、静态层缓存、粒子上限 400，稳定 60fps。
- `sandbox.html` 需分区展示：背景三场景、机器各阶段、福袋/金福袋、爪子、奖卡、按钮/面板、粒子，并带 640×360 显示框。

## 集成方式

`src/js/render/index.js` 固定导出：`{ Render, Txt, FX, Art, PLT, VIEW, MACHINE, HUD }`。
游戏侧只通过该入口使用渲染，不直接 import 子文件。
