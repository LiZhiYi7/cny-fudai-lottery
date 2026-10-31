// rng.js 单元测试：范围、粗均匀性、洗牌不丢元素、等概率取元素。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  randomInt,
  randomIntRange,
  randomFloat,
  pickUniform,
  shuffle,
  uid,
} from '../../src/js/core/rng.js';

test('randomInt：返回值始终在 [0, maxExclusive) 内', () => {
  for (let i = 0; i < 500; i++) {
    assert.equal(randomInt(1), 0);
    const n = randomInt(6);
    assert.ok(Number.isInteger(n), '必须是整数');
    assert.ok(n >= 0 && n < 6, `6 以内，实际 ${n}`);
    const big = randomInt(1000);
    assert.ok(big >= 0 && big < 1000);
  }
  assert.equal(randomInt(0), 0);
  assert.equal(randomInt(-5), 0);
  assert.equal(randomInt(NaN), 0);
  assert.equal(randomInt(Infinity), 0);
  // 小数会向下取整
  for (let i = 0; i < 200; i++) {
    const n = randomInt(2.9);
    assert.ok(n === 0 || n === 1);
  }
});

test('randomInt：粗均匀性（固定次数上下界）', () => {
  const buckets = 6;
  const times = 6000;
  const counts = new Array(buckets).fill(0);
  for (let i = 0; i < times; i++) counts[randomInt(buckets)]++;
  const expected = times / buckets;
  for (let i = 0; i < buckets; i++) {
    assert.ok(
      counts[i] > expected * 0.7 && counts[i] < expected * 1.3,
      `桶 ${i} 计数 ${counts[i]} 偏离期望 ${expected} 过大`
    );
  }
});

test('randomIntRange：闭区间且能覆盖两端', () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const n = randomIntRange(3, 5);
    assert.ok(Number.isInteger(n));
    assert.ok(n >= 3 && n <= 5, `应落在 3–5，实际 ${n}`);
    seen.add(n);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5]);

  assert.equal(randomIntRange(5, 5), 5);
  assert.equal(randomIntRange(4.2, 4.8), 5, 'ceil/floor 后区间为空时返回 lo');
  assert.equal(randomIntRange(5, 3), 5);
});

test('randomFloat：落在 [0, 1)', () => {
  for (let i = 0; i < 200; i++) {
    const f = randomFloat();
    assert.ok(f >= 0 && f < 1, `实际 ${f}`);
  }
});

test('pickUniform：空数组/非数组返回 undefined，其余返回原元素', () => {
  assert.equal(pickUniform([]), undefined);
  assert.equal(pickUniform(null), undefined);
  assert.equal(pickUniform(undefined), undefined);
  assert.equal(pickUniform('abc'), undefined);

  const list = ['甲', '乙', '丙'];
  for (let i = 0; i < 200; i++) {
    const v = pickUniform(list);
    assert.ok(list.includes(v));
  }

  // 粗均匀：三个元素各被选中约 1/3
  const counts = new Map();
  for (let i = 0; i < 3000; i++) {
    const v = pickUniform(list);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  for (const v of list) {
    const c = counts.get(v) || 0;
    assert.ok(c > 700 && c < 1300, `元素 ${v} 被选 ${c} 次，偏离过大`);
  }
});

test('shuffle：不丢元素、不改原数组、返回新数组', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = src.slice();
  const out = shuffle(src);

  assert.notEqual(out, src, '应返回新数组');
  assert.deepEqual(src, copy, '不能修改原数组');
  assert.equal(out.length, src.length);
  assert.deepEqual([...out].sort((a, b) => a - b), src);

  // 有重复值时也能保持多重集
  const dup = ['a', 'a', 'b', 'b', 'c'];
  const shuffled = shuffle(dup);
  assert.equal(shuffled.length, 5);
  assert.deepEqual([...shuffled].sort(), ['a', 'a', 'b', 'b', 'c']);

  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle([42]), [42]);
  assert.deepEqual(shuffle(null), []);
  // 多次洗牌至少出现一次不同顺序（8 元素，概率极高）
  const orders = new Set();
  for (let i = 0; i < 8; i++) orders.add(shuffle(src).join(','));
  assert.ok(orders.size > 1, '洗牌结果不应总是原顺序');
});

test('uid：带前缀且多次调用不重复', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) {
    const id = uid('t');
    assert.match(id, /^t_[0-9a-z]+_[0-9a-z]+$/);
    ids.add(id);
  }
  assert.ok(ids.size > 490, '500 次调用应几乎不重复');
});
