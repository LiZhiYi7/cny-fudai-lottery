// 公平随机：基于 crypto 的无偏整数区间与洗牌。Node 与浏览器通用。

const cryptoObj = (() => {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      return globalThis.crypto;
    }
  } catch {
    /* ignore */
  }
  return null;
})();

/** 返回 [0, maxExclusive) 的整数，无取模偏差。 */
export function randomInt(maxExclusive) {
  const max = Math.floor(maxExclusive);
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (!cryptoObj) return Math.floor(Math.random() * max);
  const range = 0x100000000;
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    cryptoObj.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

export function randomIntRange(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  return lo + randomInt(hi - lo + 1);
}

export function randomFloat() {
  return randomInt(0x100000000) / 0x100000000;
}

/** 等概率取数组中的一个元素 */
export function pickUniform(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list[randomInt(list.length)];
}

/** Fisher-Yates 洗牌，返回新数组 */
export function shuffle(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function uid(prefix = 'id') {
  const time = Date.now().toString(36);
  const rand = randomInt(0xffffff).toString(36).padStart(5, '0');
  return `${prefix}_${time}_${rand}`;
}
