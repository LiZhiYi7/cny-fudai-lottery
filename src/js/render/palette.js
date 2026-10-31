// 限定调色板：春节庙会夜。新增颜色请尽量从这里取，保持整体统一。

export const PLT = {
  void: '#07040a',
  ink: '#140d18',
  ink2: '#1d1322',
  night: '#221736',
  night2: '#2c1d44',
  plum: '#3a2650',
  plum2: '#493160',
  red: '#d72b3f',
  redLight: '#ff5060',
  redDark: '#8e1424',
  redDeep: '#560b17',
  gold: '#ffd05a',
  goldLight: '#ffefa8',
  goldDark: '#c78a24',
  bronze: '#8a5a1e',
  cream: '#fff3d6',
  white: '#ffffff',
  jade: '#5ad6a3',
  cyan: '#8fe8ff',
  orange: '#ff9440',
  pink: '#ff7aa8',
  grey: '#7a6b7f',
  greyLight: '#bcabbe',
  greyDark: '#463850',
  skin: '#ffd9b0',
  black: '#000000',
};

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function parseHex(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r, g, b) {
  const c = (v) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** 明暗调整：amt 负数变暗，正数变亮。 */
export function shade(hex, amt) {
  const { r, g, b } = parseHex(hex);
  if (amt >= 0) {
    return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  }
  const k = 1 + amt;
  return toHex(r * k, g * k, b * k);
}

/** 两色按 t(0..1) 混合。 */
export function mix(a, b, t) {
  const x = parseHex(a);
  const y = parseHex(b);
  const k = clamp01(t);
  return toHex(x.r + (y.r - x.r) * k, x.g + (y.g - x.g) * k, x.b + (y.b - x.b) * k);
}

/** hex + 透明度 → rgba() 字符串。 */
export function alpha(hex, a) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${clamp01(a)})`;
}
