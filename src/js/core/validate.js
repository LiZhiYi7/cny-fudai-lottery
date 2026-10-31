// 配置规范化与校验。错误信息直接展示给管理员，保持中文、可操作。

import { LIMITS, DIFFICULTIES, createDefaultConfig, makeId } from './constants.js';

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function trimStr(value, fallback = '') {
  return String(value === undefined || value === null ? fallback : value).trim();
}

/** 尽量把任意输入整理成合法结构；不保证通过 validate。 */
export function normalizeConfig(input) {
  const base = createDefaultConfig();
  const raw = input && typeof input === 'object' ? input : {};
  const out = {
    schema: 1,
    title: trimStr(raw.title, base.title) || base.title,
    playerCount: toInt(raw.playerCount, base.playerCount),
    allowRepeatWin: raw.allowRepeatWin === undefined ? base.allowRepeatWin : !!raw.allowRepeatWin,
    sound: raw.sound === undefined ? base.sound : !!raw.sound,
    bgm: raw.bgm === undefined ? base.bgm : !!raw.bgm,
    pin: trimStr(raw.pin, base.pin) || base.pin,
    levels: [],
  };

  const levels = Array.isArray(raw.levels) ? raw.levels : base.levels;
  const seen = new Set();
  out.levels = levels.map((lv, i) => {
    const item = lv && typeof lv === 'object' ? lv : {};
    let id = trimStr(item.id);
    if (!id || seen.has(id)) id = makeId('lv');
    seen.add(id);
    const diff = DIFFICULTIES[item.difficulty] ? item.difficulty : 'normal';
    return {
      id,
      name: trimStr(item.name, `第${i + 1}关`) || `第${i + 1}关`,
      prize: trimStr(item.prize, ''),
      winners: toInt(item.winners, 1),
      difficulty: diff,
    };
  });
  if (out.levels.length === 0) out.levels = base.levels.map((l) => ({ ...l, id: makeId('lv') }));

  return out;
}

/**
 * 严格校验，返回 { ok, errors:[{field,message}], stats }
 * field 使用点路径便于界面定位，如 "levels.0.prize"。
 */
export function validateConfig(config) {
  const errors = [];
  const push = (field, message) => errors.push({ field, message });
  if (!config || typeof config !== 'object') {
    return { ok: false, errors: [{ field: '', message: '配置为空或格式错误' }], stats: null };
  }

  const playerCount = Number(config.playerCount);
  if (!Number.isInteger(playerCount)) push('playerCount', '玩家人数必须是整数');
  else if (playerCount < LIMITS.minPlayers || playerCount > LIMITS.maxPlayers)
    push('playerCount', `玩家人数需在 ${LIMITS.minPlayers}–${LIMITS.maxPlayers} 之间`);

  const title = trimStr(config.title);
  if (!title) push('title', '游戏标题不能为空');
  else if ([...title].length > LIMITS.maxTitle)
    push('title', `游戏标题最多 ${LIMITS.maxTitle} 个字`);

  if (!LIMITS.pinPattern.test(String(config.pin || ''))) push('pin', '后台密码需为 4–6 位数字');

  const levels = Array.isArray(config.levels) ? config.levels : null;
  if (!levels) push('levels', '关卡配置缺失');
  else {
    if (levels.length < LIMITS.minLevels) push('levels', `至少需要 ${LIMITS.minLevels} 个关卡`);
    if (levels.length > LIMITS.maxLevels) push('levels', `最多 ${LIMITS.maxLevels} 个关卡`);
    const ids = new Set();
    levels.forEach((lv, i) => {
      const at = `levels.${i}`;
      if (!lv || typeof lv !== 'object') {
        push(at, '关卡数据格式错误');
        return;
      }
      if (lv.id && ids.has(lv.id)) push(`${at}.id`, '关卡 ID 重复');
      if (lv.id) ids.add(lv.id);
      const name = trimStr(lv.name);
      if (!name) push(`${at}.name`, `第 ${i + 1} 关的名称不能为空`);
      else if ([...name].length > LIMITS.maxLevelName)
        push(`${at}.name`, `第 ${i + 1} 关名称最多 ${LIMITS.maxLevelName} 个字`);
      const prize = trimStr(lv.prize);
      if (!prize) push(`${at}.prize`, `第 ${i + 1} 关的奖品名称不能为空`);
      else if ([...prize].length > LIMITS.maxPrizeName)
        push(`${at}.prize`, `第 ${i + 1} 关奖品名称最多 ${LIMITS.maxPrizeName} 个字`);
      if (!Number.isInteger(Number(lv.winners)) || Number(lv.winners) < LIMITS.minWinners)
        push(`${at}.winners`, `第 ${i + 1} 关的中奖人数至少为 ${LIMITS.minWinners}`);
      else if (Number(lv.winners) > playerCount)
        push(`${at}.winners`, `第 ${i + 1} 关中奖人数不能超过玩家总数 ${playerCount}`);
      if (!DIFFICULTIES[lv.difficulty]) push(`${at}.difficulty`, `第 ${i + 1} 关难度无效`);
    });

    if (levels.length > 0 && !config.allowRepeatWin) {
      const total = levels.reduce((s, lv) => s + (Number(lv && lv.winners) || 0), 0);
      if (total > playerCount) {
        push(
          'levels',
          `各关中奖名额合计 ${total} 人，超过玩家总数 ${playerCount} 人；请减少名额或开启“允许重复中奖”`
        );
      }
    }
  }

  const stats =
    levels && Number.isInteger(playerCount)
      ? {
          playerCount,
          levelCount: levels.length,
          totalSlots: levels.reduce((s, lv) => s + (Number(lv && lv.winners) || 0), 0),
        }
      : null;

  return { ok: errors.length === 0, errors, stats };
}

/** 开始游戏前的最终检查 + 统计 */
export function prepareConfig(config) {
  const normalized = normalizeConfig(config);
  const result = validateConfig(normalized);
  return { config: normalized, ...result };
}
