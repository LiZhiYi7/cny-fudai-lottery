// validateConfig / prepareConfig 单元测试：人数、关卡、奖品、名额、难度、PIN 等边界。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultConfig } from '../../src/js/core/constants.js';
import { normalizeConfig, validateConfig, prepareConfig } from '../../src/js/core/validate.js';

function mkLevel(over = {}) {
  return {
    id: 'lv_t1',
    name: '第一关',
    prize: '保温杯',
    winners: 1,
    difficulty: 'easy',
    ...over,
  };
}

function mkConfig(over = {}) {
  return {
    ...createDefaultConfig(),
    playerCount: 6,
    levels: [
      mkLevel(),
      mkLevel({ id: 'lv_t2', name: '第二关', prize: '无线耳机', winners: 2, difficulty: 'normal' }),
    ],
    ...over,
  };
}

const fields = (res) => res.errors.map((e) => e.field);
const allMessages = (res) => res.errors.map((e) => e.message).join('\n');

test('validateConfig：默认配置通过并返回统计', () => {
  const res = validateConfig(mkConfig());
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.stats, { playerCount: 6, levelCount: 2, totalSlots: 3 });
});

test('validateConfig：玩家人数边界 0 / 1 / 2 / 20 / 21', () => {
  for (const count of [0, 1]) {
    const res = validateConfig(
      mkConfig({
        playerCount: count,
        levels: [mkLevel({ winners: 1 }), mkLevel({ id: 'lv_t2', winners: 1 })],
      })
    );
    assert.equal(res.ok, false, `${count} 人应判定为非法`);
    assert.ok(fields(res).includes('playerCount'), `${count} 人应产生 playerCount 错误`);
  }

  const two = validateConfig(
    mkConfig({
      playerCount: 2,
      levels: [mkLevel({ winners: 1 }), mkLevel({ id: 'lv_t2', winners: 1 })],
    })
  );
  assert.equal(two.ok, true, '2 人为下限，应通过');

  const twenty = validateConfig(mkConfig({ playerCount: 20 }));
  assert.equal(twenty.ok, true, '20 人为上限，应通过');

  const over = validateConfig(mkConfig({ playerCount: 21 }));
  assert.equal(over.ok, false);
  assert.ok(fields(over).includes('playerCount'));
  assert.match(allMessages(over), /2.{1}20/);
});

test('validateConfig：非整数人数', () => {
  for (const count of [3.5, 'abc', NaN]) {
    const res = validateConfig(mkConfig({ playerCount: count }));
    assert.equal(res.ok, false);
    assert.ok(fields(res).includes('playerCount'));
    assert.match(allMessages(res), /整数/);
  }
  // 非法人数下无法得到可靠统计
  assert.equal(validateConfig(mkConfig({ playerCount: 3.5 })).stats, null);
  // 人数为非整数但可转为整数时，winners 上限检查会以 Number(playerCount) 比较
  assert.equal(validateConfig(mkConfig({ playerCount: '6' })).ok, true, '数字字符串人数应可接受');
});

test('validateConfig：关卡数量 0 / 1 / 9', () => {
  const none = validateConfig(mkConfig({ levels: [] }));
  assert.equal(none.ok, false);
  assert.ok(fields(none).includes('levels'));
  assert.match(allMessages(none), /至少需要 1 个关卡/);

  const one = validateConfig(mkConfig({ playerCount: 20, levels: [mkLevel()] }));
  assert.equal(one.ok, true);

  const nine = validateConfig({
    ...mkConfig({ playerCount: 20 }),
    levels: Array.from({ length: 9 }, (_, i) =>
      mkLevel({ id: `lv_${i}`, name: `第${i + 1}关`, winners: 1 })
    ),
  });
  assert.equal(nine.ok, false);
  assert.ok(fields(nine).includes('levels'));
  assert.match(allMessages(nine), /最多 8 个关卡/);
});

test('validateConfig：空奖品 / 空关卡名', () => {
  const noPrize = validateConfig(mkConfig({ levels: [mkLevel({ prize: '   ' }), mkLevel({ id: 'lv_t2' })] }));
  assert.equal(noPrize.ok, false);
  assert.ok(fields(noPrize).includes('levels.0.prize'));
  assert.match(allMessages(noPrize), /奖品名称不能为空/);

  const noName = validateConfig(mkConfig({ levels: [mkLevel({ name: '' }), mkLevel({ id: 'lv_t2' })] }));
  assert.equal(noName.ok, false);
  assert.ok(fields(noName).includes('levels.0.name'));
  assert.match(allMessages(noName), /名称不能为空/);
});

test('validateConfig：中奖人数必须 ≥ 1 且不超过玩家数', () => {
  const zero = validateConfig(
    mkConfig({ playerCount: 3, levels: [mkLevel({ winners: 0 }), mkLevel({ id: 'lv_t2', winners: 1 })] })
  );
  assert.equal(zero.ok, false);
  assert.ok(fields(zero).includes('levels.0.winners'));
  assert.match(allMessages(zero), /至少为 1/);

  const tooMany = validateConfig(
    mkConfig({ playerCount: 2, levels: [mkLevel({ winners: 3 }), mkLevel({ id: 'lv_t2', winners: 1 })] })
  );
  assert.equal(tooMany.ok, false);
  assert.ok(fields(tooMany).includes('levels.0.winners'));
  assert.match(allMessages(tooMany), /不能超过玩家总数/);
});

test('validateConfig：名额总和超过玩家数；开启重复中奖可放宽', () => {
  const cfg = {
    ...mkConfig({ playerCount: 3 }),
    levels: [
      mkLevel({ id: 'lv_a', winners: 2 }),
      mkLevel({ id: 'lv_b', name: '第二关', prize: '耳机', winners: 2, difficulty: 'normal' }),
    ],
  };
  const strict = validateConfig(cfg);
  assert.equal(strict.ok, false);
  assert.ok(fields(strict).includes('levels'));
  assert.match(allMessages(strict), /合计 4 人.*超过玩家总数 3 人/);

  const relaxed = validateConfig({ ...cfg, allowRepeatWin: true });
  assert.equal(relaxed.ok, true, 'allowRepeatWin 为 true 时不应再校验名额总和');
  assert.equal(relaxed.stats.totalSlots, 4);
});

test('validateConfig：非法难度', () => {
  const res = validateConfig(mkConfig({ levels: [mkLevel({ difficulty: 'legend' }), mkLevel({ id: 'lv_t2' })] }));
  assert.equal(res.ok, false);
  assert.ok(fields(res).includes('levels.0.difficulty'));
  assert.match(allMessages(res), /难度无效/);
});

test('validateConfig：超长文本（标题 24 / 关卡名 20 / 奖品名 30）', () => {
  const longTitle = validateConfig(mkConfig({ title: '新'.repeat(25) }));
  assert.equal(longTitle.ok, false);
  assert.ok(fields(longTitle).includes('title'));
  assert.match(allMessages(longTitle), /最多 24 个字/);

  const longName = validateConfig(
    mkConfig({ levels: [mkLevel({ name: '关'.repeat(21) }), mkLevel({ id: 'lv_t2' })] })
  );
  assert.equal(longName.ok, false);
  assert.ok(fields(longName).includes('levels.0.name'));
  assert.match(allMessages(longName), /最多 20 个字/);

  const longPrize = validateConfig(
    mkConfig({ levels: [mkLevel({ prize: '奖'.repeat(31) }), mkLevel({ id: 'lv_t2' })] })
  );
  assert.equal(longPrize.ok, false);
  assert.ok(fields(longPrize).includes('levels.0.prize'));
  assert.match(allMessages(longPrize), /最多 30 个字/);

  // 恰好到上限应通过
  assert.equal(validateConfig(mkConfig({ title: '新'.repeat(24) })).ok, true);
  // 按字符（码点）计数：20 个 emoji 视为 20 个字
  assert.equal(
    validateConfig(
      mkConfig({ levels: [mkLevel({ name: '🧧'.repeat(20) }), mkLevel({ id: 'lv_t2' })] })
    ).ok,
    true
  );
});

test('validateConfig：非法 PIN', () => {
  for (const pin of ['123', '1234567', '12a4', '', '  8888  ', null]) {
    const res = validateConfig(mkConfig({ pin }));
    assert.equal(res.ok, false, `PIN ${JSON.stringify(pin)} 应非法`);
    assert.ok(fields(res).includes('pin'));
    assert.match(allMessages(res), /4.{1}6 位数字/);
  }
  for (const pin of ['0000', '8888', '123456', 8888]) {
    const res = validateConfig(mkConfig({ pin }));
    assert.equal(res.ok, true, `PIN ${JSON.stringify(pin)} 应合法`);
  }
});

test('validateConfig：空标题与空配置', () => {
  const emptyTitle = validateConfig(mkConfig({ title: '   ' }));
  assert.equal(emptyTitle.ok, false);
  assert.ok(fields(emptyTitle).includes('title'));

  for (const bad of [null, undefined, 'x', 42]) {
    const res = validateConfig(bad);
    assert.equal(res.ok, false);
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0].message, /配置为空或格式错误/);
  }
});

test('validateConfig：关卡 ID 重复', () => {
  const res = validateConfig(
    mkConfig({
      levels: [mkLevel({ id: 'same' }), mkLevel({ id: 'same', name: '第二关', difficulty: 'normal' })],
    })
  );
  assert.equal(res.ok, false);
  assert.ok(fields(res).includes('levels.1.id'));
  assert.match(allMessages(res), /关卡 ID 重复/);
});

test('validateConfig：关卡数据为非对象时返回错误而不是抛异常', () => {
  let res = null;
  assert.doesNotThrow(() => {
    res = validateConfig(mkConfig({ levels: [null, 42] }));
  });
  assert.ok(res, '应返回结果对象');
  assert.equal(res.ok, false);
  assert.ok(fields(res).includes('levels.0'));
  assert.ok(fields(res).includes('levels.1'));
  assert.match(allMessages(res), /关卡数据格式错误/);

  // prepareConfig 会先把 null 规范化成空关卡对象，再由校验拦下空奖品/空名称
  let prepared = null;
  assert.doesNotThrow(() => {
    prepared = prepareConfig({ playerCount: 6, levels: [null] });
  });
  assert.equal(prepared.ok, false);
  assert.ok(prepared.errors.some((e) => String(e.field).startsWith('levels.0')));
});

test('prepareConfig：先规范化再校验，去空格并补默认值', () => {
  const res = prepareConfig({
    title: '  2026 年会抽奖  ',
    playerCount: '5',
    pin: ' 1234 ',
    levels: [
      { name: '  头奖  ', prize: '  手机  ', winners: '2', difficulty: 'hard' },
      { name: '', prize: '  平板  ', winners: 3, difficulty: 'nope' },
    ],
  });
  assert.equal(res.ok, true, allMessages(res));
  assert.equal(res.config.title, '2026 年会抽奖');
  assert.equal(res.config.playerCount, 5);
  assert.equal(res.config.pin, '1234');
  assert.equal(res.config.levels[0].name, '头奖');
  assert.equal(res.config.levels[0].prize, '手机');
  assert.equal(res.config.levels[0].winners, 2);
  assert.equal(res.config.levels[0].difficulty, 'hard');
  assert.equal(res.config.levels[1].name, '第2关');
  assert.equal(res.config.levels[1].prize, '平板');
  assert.equal(res.config.levels[1].difficulty, 'normal');
  assert.equal(res.stats.totalSlots, 5);
});

test('prepareConfig：空奖品不再兜底，会被校验拦下', () => {
  const res = prepareConfig({
    title: '年会',
    playerCount: '5',
    pin: '8888',
    levels: [
      { name: '第一关', prize: '  ', winners: 2, difficulty: 'easy' },
      { name: '第二关', prize: '平板', winners: 3, difficulty: 'normal' },
    ],
  });
  assert.equal(res.ok, false);
  assert.equal(res.config.levels[0].prize, '', 'normalizeConfig 应保留空奖品而不是填“待定奖品”');
  assert.ok(res.errors.some((e) => e.field === 'levels.0.prize'));
  assert.match(allMessages(res), /奖品名称不能为空/);
});

test('normalizeConfig：缺省值、去空格、补 id', () => {
  const out = normalizeConfig({});
  const base = createDefaultConfig();
  assert.equal(out.title, base.title);
  assert.equal(out.playerCount, 12);
  assert.equal(out.pin, '8888');
  assert.equal(out.schema, 1);
  assert.equal(out.allowRepeatWin, false);
  assert.equal(out.sound, true);
  assert.equal(out.bgm, true);
  assert.equal(out.levels.length, 4);
  assert.deepEqual(
    out.levels.map((l) => l.id),
    ['lv_default_1', 'lv_default_2', 'lv_default_3', 'lv_default_4']
  );

  const trimmed = normalizeConfig({
    title: '  年会  ',
    playerCount: '8',
    pin: ' 4321 ',
    levels: [
      { name: '  特等奖  ', prize: '  电脑  ', winners: '3', difficulty: 'extreme' },
    ],
  });
  assert.equal(trimmed.title, '年会');
  assert.equal(trimmed.playerCount, 8);
  assert.equal(trimmed.pin, '4321');
  assert.equal(trimmed.levels[0].name, '特等奖');
  assert.equal(trimmed.levels[0].prize, '电脑');
  assert.equal(trimmed.levels[0].winners, 3);
  assert.equal(trimmed.levels[0].difficulty, 'extreme');
  assert.match(trimmed.levels[0].id, /^lv_/);

  // 空字符串标题/密码回退默认值
  const blank = normalizeConfig({ title: '   ', pin: '', sound: false, bgm: false });
  assert.equal(blank.title, base.title);
  assert.equal(blank.pin, base.pin);
  assert.equal(blank.sound, false);
  assert.equal(blank.bgm, false);

  // 非对象输入按默认处理
  assert.equal(normalizeConfig(null).playerCount, 12);
  assert.equal(normalizeConfig('oops').levels.length, 4);
});

test('normalizeConfig：空关卡列表使用默认关卡，重复 id 会被替换', () => {
  const empty = normalizeConfig({ levels: [] });
  assert.equal(empty.levels.length, 4);
  for (const lv of empty.levels) {
    assert.match(lv.id, /^lv_/);
    assert.notEqual(lv.id, 'lv_default_1');
  }

  const dup = normalizeConfig({
    levels: [
      { id: 'dup', name: 'A', prize: 'P', winners: 1, difficulty: 'easy' },
      { id: 'dup', name: 'B', prize: 'Q', winners: 1, difficulty: 'normal' },
      { id: '', name: 'C', prize: 'R', winners: 1, difficulty: 'hard' },
    ],
  });
  const ids = dup.levels.map((l) => l.id);
  assert.equal(new Set(ids).size, 3, 'id 必须唯一');
  assert.equal(ids[0], 'dup');
  assert.notEqual(ids[1], 'dup');
  assert.match(ids[2], /^lv_/);
});

test('normalizeConfig：非法值兜底', () => {
  const out = normalizeConfig({
    playerCount: 'abc',
    levels: [
      { name: '', prize: '', winners: 'abc', difficulty: 'impossible' },
      null,
    ],
  });
  assert.equal(out.playerCount, 12);
  assert.equal(out.levels.length, 2);
  assert.equal(out.levels[0].name, '第1关');
  assert.equal(out.levels[0].prize, '', '空奖品不再兜底为“待定奖品”');
  assert.equal(out.levels[0].winners, 1);
  assert.equal(out.levels[0].difficulty, 'normal');
  assert.equal(out.levels[1].name, '第2关');
});
