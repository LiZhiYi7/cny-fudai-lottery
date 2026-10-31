// 难度参数表与默认配置常量单元测试。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APP,
  LIMITS,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  difficultyOf,
  makeId,
  createDefaultConfig,
} from '../../src/js/core/constants.js';

test('DIFFICULTIES：四档齐全且顺序固定', () => {
  assert.deepEqual(Object.keys(DIFFICULTIES), ['easy', 'normal', 'hard', 'extreme']);
  assert.deepEqual(DIFFICULTY_ORDER, ['easy', 'normal', 'hard', 'extreme']);
  for (const id of DIFFICULTY_ORDER) {
    assert.ok(DIFFICULTIES[id], `缺少难度 ${id}`);
  }
});

test('DIFFICULTIES：每档字段完整且类型正确', () => {
  const required = {
    id: 'string',
    label: 'string',
    stars: 'number',
    clawSpeed: 'number',
    swayAmp: 'number',
    swayHz: 'number',
    goldWidth: 'number',
    pouchCount: 'number',
    revealDelay: 'number',
    wander: 'number',
    fxScale: 'number',
    desc: 'string',
  };
  for (const [key, diff] of Object.entries(DIFFICULTIES)) {
    assert.equal(diff.id, key, 'id 应与键名一致');
    for (const [field, type] of Object.entries(required)) {
      assert.equal(typeof diff[field], type, `${key}.${field} 类型应为 ${type}`);
    }
    assert.ok(diff.label.length > 0, `${key} 需要中文标签`);
    assert.ok(diff.desc.length > 0, `${key} 需要一句描述`);
    assert.ok(diff.clawSpeed > 0);
    assert.ok(diff.goldWidth > 0);
    assert.ok(diff.pouchCount > 0);
    assert.ok(diff.stars >= 1);
  }
});

test('DIFFICULTIES：难度递进（速度递增、金袋变窄、福袋变多）', () => {
  const list = DIFFICULTY_ORDER.map((id) => DIFFICULTIES[id]);

  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i].clawSpeed > list[i - 1].clawSpeed, '爪子速度应随难度递增');
    assert.ok(list[i].swayAmp > list[i - 1].swayAmp, '摆动幅度应随难度递增');
    assert.ok(list[i].swayHz > list[i - 1].swayHz, '摆动频率应随难度递增');
    assert.ok(list[i].goldWidth < list[i - 1].goldWidth, '金福袋宽度应随难度递减');
    assert.ok(list[i].pouchCount > list[i - 1].pouchCount, '福袋数量应随难度递增');
    assert.ok(list[i].revealDelay >= list[i - 1].revealDelay, '揭晓等待不应变短');
    assert.ok(list[i].stars === i + 1, '星级应递增 1→4');
  }
  assert.equal(list[0].stars, 1);
  assert.equal(list[3].stars, 4);
});

test('difficultyOf：未知难度回退普通', () => {
  assert.equal(difficultyOf('easy'), DIFFICULTIES.easy);
  assert.equal(difficultyOf('extreme'), DIFFICULTIES.extreme);
  assert.equal(difficultyOf('nope'), DIFFICULTIES.normal);
  assert.equal(difficultyOf(undefined), DIFFICULTIES.normal);
  assert.equal(difficultyOf(null), DIFFICULTIES.normal);
});

test('LIMITS：边界值符合需求（2–20 人、1–8 关）', () => {
  assert.equal(LIMITS.minPlayers, 2);
  assert.equal(LIMITS.maxPlayers, 20);
  assert.equal(LIMITS.minLevels, 1);
  assert.equal(LIMITS.maxLevels, 8);
  assert.equal(LIMITS.maxTitle, 24);
  assert.equal(LIMITS.maxLevelName, 20);
  assert.equal(LIMITS.maxPrizeName, 30);
  assert.equal(LIMITS.minWinners, 1);
  assert.ok(LIMITS.pinPattern.test('8888'));
  assert.ok(LIMITS.pinPattern.test('123456'));
  assert.ok(!LIMITS.pinPattern.test('123'));
  assert.ok(!LIMITS.pinPattern.test('1234567'));
  assert.ok(!LIMITS.pinPattern.test('abcd'));
});

test('createDefaultConfig：默认 12 人 4 关，字段合法', () => {
  const cfg = createDefaultConfig();
  assert.equal(cfg.schema, 1);
  assert.equal(cfg.playerCount, 12);
  assert.equal(cfg.title, APP.name);
  assert.equal(cfg.pin, '8888');
  assert.equal(cfg.allowRepeatWin, false);
  assert.equal(cfg.sound, true);
  assert.equal(cfg.bgm, true);
  assert.equal(cfg.levels.length, 4);
  assert.equal(
    cfg.levels.reduce((s, lv) => s + lv.winners, 0),
    7,
    '默认名额合计 7，未超过 12 人'
  );
  assert.deepEqual(
    cfg.levels.map((lv) => lv.difficulty),
    ['easy', 'normal', 'hard', 'extreme']
  );
  for (const lv of cfg.levels) {
    assert.match(lv.id, /^lv_/);
    assert.ok(lv.name.length > 0);
    assert.ok(lv.prize.length > 0);
    assert.ok(lv.winners >= 1);
  }

  // 每次调用返回独立对象
  const a = createDefaultConfig();
  const b = createDefaultConfig();
  assert.notEqual(a, b);
  assert.notEqual(a.levels, b.levels);
});

test('makeId：前缀与唯一性', () => {
  const ids = new Set();
  for (let i = 0; i < 300; i++) {
    const id = makeId('lv');
    assert.match(id, /^lv_[0-9a-z]+$/);
    ids.add(id);
  }
  assert.ok(ids.size > 295, '300 次调用应几乎不重复');
  assert.match(makeId(), /^id_/);
});
