// 一局游戏的状态：奖池、抽奖记录、兑付标记。纯数据，便于单测。

import { pickUniform } from './rng.js';

export const SESSION_STATUS = { PLAYING: 'playing', FINISHED: 'finished', ABANDONED: 'abandoned' };

export function allPlayers(session) {
  const n = session?.config?.playerCount || 0;
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** 尚未中奖的玩家号码；允许重复中奖时始终是全员。 */
export function remainingPlayers(session) {
  if (!session) return [];
  if (session.config.allowRepeatWin) return allPlayers(session);
  const won = new Set((session.draws || []).map((d) => d.player));
  return allPlayers(session).filter((n) => !won.has(n));
}

export function drawsOfLevel(session, levelIndex) {
  return (session.draws || []).filter((d) => d.levelIndex === levelIndex);
}

export function levelSlots(session, levelIndex) {
  return session.config.levels[levelIndex]?.winners || 0;
}

export function isLevelComplete(session, levelIndex) {
  return drawsOfLevel(session, levelIndex).length >= levelSlots(session, levelIndex);
}

/** 下一个还没抽满的关卡下标，全部完成后返回 -1 */
export function nextOpenLevelIndex(session) {
  const levels = session?.config?.levels || [];
  for (let i = 0; i < levels.length; i++) {
    if (!isLevelComplete(session, i)) return i;
  }
  return -1;
}

export function isSessionComplete(session) {
  return nextOpenLevelIndex(session) === -1;
}

export function totalSlots(session) {
  return (session.config.levels || []).reduce((s, lv) => s + (lv.winners || 0), 0);
}

export function createSession(config, now = Date.now()) {
  const snapshot = {
    title: config.title,
    playerCount: config.playerCount,
    allowRepeatWin: !!config.allowRepeatWin,
    levels: config.levels.map((lv) => ({
      id: lv.id,
      name: lv.name,
      prize: lv.prize,
      winners: lv.winners,
      difficulty: lv.difficulty,
    })),
  };
  return {
    schema: 1,
    id: `s_${new Date(now).toISOString().replace(/[^0-9]/g, '').slice(0, 14)}_${Math.floor(
      Math.random() * 46656
    )
      .toString(36)
      .padStart(3, '0')}`,
    status: SESSION_STATUS.PLAYING,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    finishedAt: null,
    config: snapshot,
    draws: [],
  };
}

/** 从奖池等概率抽一位；奖池为空时返回 undefined。 */
export function pickWinner(session, pick = pickUniform) {
  return pick(remainingPlayers(session));
}

/**
 * 记录一次中奖。会校验关卡名额与号码是否仍在奖池。
 * accuracy 0..1 仅用于展示“抓取精度”。
 */
export function recordDraw(session, { levelIndex, player, accuracy = 1, now = Date.now() }) {
  if (!session || session.status !== SESSION_STATUS.PLAYING) {
    throw new Error('当前没有进行中的对局');
  }
  const levels = session.config.levels;
  const lv = levels[levelIndex];
  if (!lv) throw new Error('关卡不存在');
  if (isLevelComplete(session, levelIndex)) throw new Error('本关中奖名额已抽满');
  const remaining = remainingPlayers(session);
  if (!remaining.includes(player)) {
    throw new Error('该号码不在当前奖池中（可能已中奖）');
  }
  const draw = {
    seq: session.draws.length + 1,
    levelIndex,
    levelId: lv.id,
    levelName: lv.name,
    prize: lv.prize,
    player,
    difficulty: lv.difficulty,
    accuracy: Math.max(0, Math.min(1, Number(accuracy) || 0)),
    at: new Date(now).toISOString(),
    paid: false,
  };
  session.draws.push(draw);
  session.updatedAt = new Date(now).toISOString();
  return draw;
}

export function markPaid(session, seq, paid) {
  const draw = (session.draws || []).find((d) => d.seq === seq);
  if (!draw) return null;
  draw.paid = !!paid;
  session.updatedAt = new Date().toISOString();
  return draw;
}

export function finishSession(session, now = Date.now()) {
  session.status = SESSION_STATUS.FINISHED;
  session.finishedAt = new Date(now).toISOString();
  session.updatedAt = session.finishedAt;
  return session;
}

export function abandonSession(session, now = Date.now()) {
  session.status = SESSION_STATUS.ABANDONED;
  session.updatedAt = new Date(now).toISOString();
  return session;
}

/** 恢复对局时的定位信息 */
export function resumeInfo(session) {
  const levelIndex = nextOpenLevelIndex(session);
  if (levelIndex < 0) {
    return { done: true, levelIndex: -1, slot: 0, remaining: remainingPlayers(session).length };
  }
  return {
    done: false,
    levelIndex,
    slot: drawsOfLevel(session, levelIndex).length,
    remaining: remainingPlayers(session).length,
  };
}

/** 供结算/兑奖清单/打印使用 */
export function sessionSummary(session) {
  const levels = session.config.levels.map((lv, i) => {
    const draws = drawsOfLevel(session, i);
    return {
      index: i,
      id: lv.id,
      name: lv.name,
      prize: lv.prize,
      slots: lv.winners,
      difficulty: lv.difficulty,
      winners: draws.map((d) => d.player),
      draws,
      complete: draws.length >= lv.winners,
    };
  });
  const draws = session.draws || [];
  return {
    id: session.id,
    status: session.status,
    players: session.config.playerCount,
    levels,
    totalWinners: draws.length,
    totalSlots: totalSlots(session),
    paidCount: draws.filter((d) => d.paid).length,
    pendingCount: draws.filter((d) => !d.paid).length,
    remaining: remainingPlayers(session).length,
    finishedAt: session.finishedAt,
    createdAt: session.createdAt,
  };
}
