// 全局常量、难度参数、默认配置。

export const APP = {
  name: '新春福袋抓抓乐',
  version: '1.0.0',
  dataSchema: 1,
};

export const LIMITS = {
  minPlayers: 2,
  maxPlayers: 20,
  minLevels: 1,
  maxLevels: 8,
  maxLevelName: 20,
  maxPrizeName: 30,
  maxTitle: 24,
  minWinners: 1,
  pinPattern: /^\d{4,6}$/,
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: '简单',
    stars: 1,
    clawSpeed: 130,
    swayAmp: 6,
    swayHz: 0.6,
    goldWidth: 46,
    pouchCount: 5,
    revealDelay: 0.7,
    wander: 10,
    fxScale: 0.7,
    desc: '慢慢来，轻松抓',
  },
  normal: {
    id: 'normal',
    label: '普通',
    stars: 2,
    clawSpeed: 190,
    swayAmp: 12,
    swayHz: 0.8,
    goldWidth: 36,
    pouchCount: 7,
    revealDelay: 1.0,
    wander: 20,
    fxScale: 1,
    desc: '有点手感了',
  },
  hard: {
    id: 'hard',
    label: '困难',
    stars: 3,
    clawSpeed: 260,
    swayAmp: 20,
    swayHz: 1.0,
    goldWidth: 28,
    pouchCount: 9,
    revealDelay: 1.4,
    wander: 34,
    fxScale: 1.25,
    desc: '手要稳，眼花缭乱',
  },
  extreme: {
    id: 'extreme',
    label: '极限',
    stars: 4,
    clawSpeed: 330,
    swayAmp: 30,
    swayHz: 1.2,
    goldWidth: 20,
    pouchCount: 11,
    revealDelay: 1.8,
    wander: 50,
    fxScale: 1.5,
    desc: '年兽捣乱，全靠手气',
  },
};

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'extreme'];

export function difficultyOf(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

let seq = 0;
export function makeId(prefix = 'id') {
  seq = (seq + 1) % 1000;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.floor(
    Math.random() * 1296
  )
    .toString(36)
    .padStart(2, '0')}`;
}

export function createDefaultConfig() {
  return {
    schema: 1,
    title: '新春福袋抓抓乐',
    playerCount: 12,
    allowRepeatWin: false,
    sound: true,
    bgm: true,
    pin: '8888',
    levels: [
      { id: 'lv_default_1', name: '第一关', prize: '暖心保温杯', winners: 3, difficulty: 'easy' },
      { id: 'lv_default_2', name: '第二关', prize: '无线蓝牙耳机', winners: 2, difficulty: 'normal' },
      { id: 'lv_default_3', name: '第三关', prize: '智能手表', winners: 1, difficulty: 'hard' },
      { id: 'lv_default_4', name: '特等奖', prize: '神秘大奖', winners: 1, difficulty: 'extreme' },
    ],
  };
}
