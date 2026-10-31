// state.js 单元测试：会话快照、奖池、中奖记录、兑付、恢复定位、结算汇总。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATUS,
  allPlayers,
  remainingPlayers,
  drawsOfLevel,
  levelSlots,
  isLevelComplete,
  nextOpenLevelIndex,
  isSessionComplete,
  totalSlots,
  createSession,
  pickWinner,
  recordDraw,
  markPaid,
  finishSession,
  abandonSession,
  resumeInfo,
  sessionSummary,
} from '../../src/js/core/state.js';

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

function mkLevel(over = {}) {
  return {
    id: 'lv_1',
    name: '第一关',
    prize: '保温杯',
    winners: 2,
    difficulty: 'easy',
    ...over,
  };
}

function mkConfig(over = {}) {
  return {
    title: '测试年会',
    playerCount: 6,
    allowRepeatWin: false,
    levels: [
      mkLevel(),
      mkLevel({ id: 'lv_2', name: '第二关', prize: '无线耳机', winners: 2, difficulty: 'normal' }),
    ],
    ...over,
  };
}

function newSession(over = {}) {
  return createSession(mkConfig(over), T0);
}

test('createSession：初始状态与配置快照', () => {
  const cfg = mkConfig();
  const session = createSession(cfg, T0);

  assert.equal(session.schema, 1);
  assert.equal(session.status, SESSION_STATUS.PLAYING);
  assert.equal(session.createdAt, '2026-01-01T12:00:00.000Z');
  assert.equal(session.updatedAt, session.createdAt);
  assert.equal(session.finishedAt, null);
  assert.deepEqual(session.draws, []);
  assert.match(session.id, /^s_\d+_[0-9a-z]{1,4}$/);
  assert.equal(session.config.title, '测试年会');
  assert.equal(session.config.playerCount, 6);
  assert.equal(session.config.allowRepeatWin, false);
  assert.deepEqual(session.config.levels, [
    { id: 'lv_1', name: '第一关', prize: '保温杯', winners: 2, difficulty: 'easy' },
    { id: 'lv_2', name: '第二关', prize: '无线耳机', winners: 2, difficulty: 'normal' },
  ]);

  // 快照是深拷贝：之后修改原配置不影响对局
  cfg.title = '改过的标题';
  cfg.levels[0].prize = '改过的奖品';
  cfg.levels[1].winners = 99;
  assert.equal(session.config.title, '测试年会');
  assert.equal(session.config.levels[0].prize, '保温杯');
  assert.equal(session.config.levels[1].winners, 2);
  assert.notEqual(session.config.levels[0], cfg.levels[0]);
});

test('allPlayers / remainingPlayers：去重且随中奖减少', () => {
  const session = newSession();
  assert.deepEqual(allPlayers(session), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(remainingPlayers(session), [1, 2, 3, 4, 5, 6]);

  recordDraw(session, { levelIndex: 0, player: 2, now: T0 + 1000 });
  recordDraw(session, { levelIndex: 0, player: 5, now: T0 + 2000 });
  assert.deepEqual(remainingPlayers(session), [1, 3, 4, 6]);

  // 即使中奖记录里出现重复号码，也只会被去掉一次
  session.draws.push({ ...session.draws[0], seq: 99, player: 2 });
  assert.deepEqual(remainingPlayers(session), [1, 3, 4, 6]);

  assert.deepEqual(remainingPlayers(null), []);
});

test('allowRepeatWin：奖池保留全员，同号码可再次中奖', () => {
  const session = newSession({ allowRepeatWin: true });
  assert.equal(session.config.allowRepeatWin, true);
  assert.deepEqual(remainingPlayers(session), [1, 2, 3, 4, 5, 6]);

  recordDraw(session, { levelIndex: 0, player: 1, now: T0 + 1000 });
  assert.deepEqual(remainingPlayers(session), [1, 2, 3, 4, 5, 6], '重复中奖时奖池不减少');

  const again = recordDraw(session, { levelIndex: 0, player: 1, now: T0 + 2000 });
  assert.equal(again.player, 1);
  assert.equal(again.seq, 2);
  assert.equal(session.draws.length, 2);
});

test('recordDraw：记录序号、关卡、奖品、号码、难度与精度', () => {
  const session = newSession();
  const draw = recordDraw(session, {
    levelIndex: 1,
    player: 4,
    accuracy: 0.94,
    now: T0 + 3000,
  });

  assert.equal(draw.seq, 1);
  assert.equal(draw.levelIndex, 1);
  assert.equal(draw.levelId, 'lv_2');
  assert.equal(draw.levelName, '第二关');
  assert.equal(draw.prize, '无线耳机');
  assert.equal(draw.player, 4);
  assert.equal(draw.difficulty, 'normal');
  assert.equal(draw.accuracy, 0.94);
  assert.equal(draw.at, '2026-01-01T12:00:03.000Z');
  assert.equal(draw.paid, false);
  assert.equal(session.draws.length, 1);
  assert.equal(session.updatedAt, '2026-01-01T12:00:03.000Z');

  const second = recordDraw(session, { levelIndex: 1, player: 6, accuracy: 0.5, now: T0 + 4000 });
  assert.equal(second.seq, 2);
});

test('recordDraw：精度会被夹到 0..1，缺省为 1', () => {
  const session = newSession({
    levels: [mkLevel({ winners: 6 })],
  });
  const clamped = [
    [1.7, 1],
    [-0.5, 0],
    ['abc', 0],
    [undefined, 1],
  ];
  clamped.forEach(([input, expected], i) => {
    const draw = recordDraw(session, { levelIndex: 0, player: i + 1, accuracy: input, now: T0 + i });
    assert.equal(draw.accuracy, expected, `accuracy ${input} 应规范为 ${expected}`);
  });
});

test('recordDraw：重复号码 / 不在奖池 / 抽满 / 关卡不存在 / 非进行中对局都会抛错', () => {
  const session = newSession();

  assert.throws(
    () => recordDraw(session, { levelIndex: 0, player: 0, now: T0 }),
    /奖池/
  );
  assert.throws(
    () => recordDraw(session, { levelIndex: 0, player: 7, now: T0 }),
    /奖池/
  );
  assert.throws(() => recordDraw(session, { levelIndex: 5, player: 1, now: T0 }), /关卡不存在/);

  recordDraw(session, { levelIndex: 0, player: 1, now: T0 + 1 });
  assert.throws(
    () => recordDraw(session, { levelIndex: 0, player: 1, now: T0 + 2 }),
    /奖池/
  );

  // 第一关名额 2：再抽一个即满，第三个必须报“名额已抽满”
  recordDraw(session, { levelIndex: 0, player: 2, now: T0 + 3 });
  assert.equal(isLevelComplete(session, 0), true);
  assert.throws(
    () => recordDraw(session, { levelIndex: 0, player: 3, now: T0 + 4 }),
    /名额已抽满/
  );

  finishSession(session, T0 + 5);
  assert.throws(() => recordDraw(session, { levelIndex: 1, player: 3, now: T0 + 6 }), /没有进行中的对局/);
  assert.throws(() => recordDraw(null, { levelIndex: 0, player: 1 }), /没有进行中的对局/);
});

test('pickWinner：只在剩余奖池中选人', () => {
  const session = newSession();
  recordDraw(session, { levelIndex: 0, player: 1, now: T0 + 1 });
  recordDraw(session, { levelIndex: 0, player: 4, now: T0 + 2 });

  let seen = null;
  const winner = pickWinner(session, (pool) => {
    seen = pool.slice();
    return pool[0];
  });
  assert.deepEqual(seen, [2, 3, 5, 6]);
  assert.equal(winner, 2);

  // 默认使用 pickUniform：100 次都不会抽到已中奖号码
  const won = new Set([1, 4]);
  for (let i = 0; i < 100; i++) {
    const n = pickWinner(session);
    assert.ok(n >= 1 && n <= 6);
    assert.ok(!won.has(n), `不应该抽到已中奖号码 ${n}`);
  }

  // 奖池为空时返回 undefined
  const small = newSession({
    playerCount: 2,
    levels: [mkLevel({ winners: 1 }), mkLevel({ id: 'lv_2', winners: 1 })],
  });
  recordDraw(small, { levelIndex: 0, player: 1, now: T0 });
  recordDraw(small, { levelIndex: 1, player: 2, now: T0 });
  assert.equal(pickWinner(small), undefined);
});

test('关卡进度：drawsOfLevel / levelSlots / isLevelComplete / nextOpenLevelIndex', () => {
  const session = newSession();
  assert.equal(levelSlots(session, 0), 2);
  assert.equal(levelSlots(session, 9), 0);
  assert.deepEqual(drawsOfLevel(session, 0), []);
  assert.equal(isLevelComplete(session, 0), false);
  assert.equal(nextOpenLevelIndex(session), 0);
  assert.equal(isSessionComplete(session), false);

  recordDraw(session, { levelIndex: 0, player: 1, now: T0 + 1 });
  assert.equal(drawsOfLevel(session, 0).length, 1);
  assert.equal(isLevelComplete(session, 0), false);
  recordDraw(session, { levelIndex: 0, player: 2, now: T0 + 2 });
  assert.equal(isLevelComplete(session, 0), true);
  assert.equal(nextOpenLevelIndex(session), 1);

  recordDraw(session, { levelIndex: 1, player: 3, now: T0 + 3 });
  recordDraw(session, { levelIndex: 1, player: 4, now: T0 + 4 });
  assert.equal(nextOpenLevelIndex(session), -1);
  assert.equal(isSessionComplete(session), true);
  assert.equal(totalSlots(session), 4);
});

test('markPaid：勾选/取消兑付并更新时间；未知序号返回 null', () => {
  const session = newSession();
  recordDraw(session, { levelIndex: 0, player: 1, now: T0 });
  const before = session.updatedAt;

  const paid = markPaid(session, 1, true);
  assert.equal(paid.paid, true);
  assert.equal(session.draws[0].paid, true);
  assert.ok(new Date(session.updatedAt).getTime() >= new Date(before).getTime());

  const unpaid = markPaid(session, 1, false);
  assert.equal(unpaid.paid, false);

  assert.equal(markPaid(session, 999, true), null);
  assert.equal(session.draws[0].paid, false);
});

test('finishSession / abandonSession：状态与时间戳', () => {
  const session = newSession();
  finishSession(session, T0 + 5000);
  assert.equal(session.status, SESSION_STATUS.FINISHED);
  assert.equal(session.finishedAt, '2026-01-01T12:00:05.000Z');
  assert.equal(session.updatedAt, session.finishedAt);

  const abandoned = newSession();
  abandonSession(abandoned, T0 + 6000);
  assert.equal(abandoned.status, SESSION_STATUS.ABANDONED);
  assert.equal(abandoned.updatedAt, '2026-01-01T12:00:06.000Z');
  assert.equal(abandoned.finishedAt, null);
});

test('resumeInfo：定位到未完成关卡与已抽名额', () => {
  const session = newSession();
  assert.deepEqual(resumeInfo(session), { done: false, levelIndex: 0, slot: 0, remaining: 6 });

  recordDraw(session, { levelIndex: 0, player: 3, now: T0 + 1 });
  assert.deepEqual(resumeInfo(session), { done: false, levelIndex: 0, slot: 1, remaining: 5 });

  recordDraw(session, { levelIndex: 0, player: 5, now: T0 + 2 });
  recordDraw(session, { levelIndex: 1, player: 1, now: T0 + 3 });
  assert.deepEqual(resumeInfo(session), { done: false, levelIndex: 1, slot: 1, remaining: 3 });

  recordDraw(session, { levelIndex: 1, player: 2, now: T0 + 4 });
  assert.deepEqual(resumeInfo(session), { done: true, levelIndex: -1, slot: 0, remaining: 2 });
});

test('sessionSummary：按关卡汇总、兑付统计与剩余人数', () => {
  const session = newSession();
  recordDraw(session, { levelIndex: 0, player: 6, now: T0 + 1 });
  recordDraw(session, { levelIndex: 1, player: 3, now: T0 + 2 });
  markPaid(session, 1, true);

  const summary = sessionSummary(session);
  assert.equal(summary.id, session.id);
  assert.equal(summary.status, SESSION_STATUS.PLAYING);
  assert.equal(summary.players, 6);
  assert.equal(summary.totalWinners, 2);
  assert.equal(summary.totalSlots, 4);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.remaining, 4);
  assert.equal(summary.createdAt, session.createdAt);
  assert.equal(summary.finishedAt, null);

  assert.equal(summary.levels.length, 2);
  assert.deepEqual(summary.levels[0], {
    index: 0,
    id: 'lv_1',
    name: '第一关',
    prize: '保温杯',
    slots: 2,
    difficulty: 'easy',
    winners: [6],
    draws: [session.draws[0]],
    complete: false,
  });
  assert.equal(summary.levels[1].name, '第二关');
  assert.deepEqual(summary.levels[1].winners, [3]);

  // 抽满后 complete 为 true
  recordDraw(session, { levelIndex: 0, player: 1, now: T0 + 3 });
  assert.equal(sessionSummary(session).levels[0].complete, true);

  finishSession(session, T0 + 9000);
  const finished = sessionSummary(session);
  assert.equal(finished.status, SESSION_STATUS.FINISHED);
  assert.equal(finished.finishedAt, '2026-01-01T12:00:09.000Z');
});

test('sessionSummary：空对局', () => {
  const summary = sessionSummary(newSession());
  assert.equal(summary.totalWinners, 0);
  assert.equal(summary.paidCount, 0);
  assert.equal(summary.pendingCount, 0);
  assert.equal(summary.remaining, 6);
  assert.ok(summary.levels.every((lv) => lv.complete === false && lv.winners.length === 0));
});
