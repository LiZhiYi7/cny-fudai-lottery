// 纯 Web Audio 合成音效与 chiptune 背景音乐，无外部音频文件。

const MELODY = [
  // 五声音阶小调味的 16 步循环（MIDI 音高，0 为休止）
  72, 0, 74, 76, 79, 0, 76, 74,
  72, 0, 69, 0, 67, 69, 72, 0,
  76, 0, 79, 81, 79, 76, 74, 0,
  72, 74, 76, 0, 72, 0, 67, 0,
];
const BASS = [48, 0, 43, 0, 45, 0, 43, 0, 41, 0, 43, 0, 48, 0, 45, 0];

function midiToFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.enabled = true;
    this.musicOn = true;
    this.bgmTimer = null;
    this.nextNoteTime = 0;
    this.step = 0;
    this._lastHover = 0;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.5;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicOn && this.enabled && !this.bgmTimer) this.startBgm();
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? 0.8 : 0;
    if (this.enabled) {
      this.ensure();
    } else {
      this.stopBgm();
    }
  }

  setBgm(on) {
    this.musicOn = !!on;
    if (this.musicOn) {
      this.ensure();
      this.startBgm();
    } else {
      this.stopBgm();
    }
  }

  tone({ freq = 440, dur = 0.1, type = 'square', vol = 0.2, slideTo = null, delay = 0, dest = null }) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({ dur = 0.2, vol = 0.15, delay = 0, dest = null, filter = 1800 } = {}) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filter;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest || this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  click() {
    this.tone({ freq: 880, dur: 0.05, type: 'square', vol: 0.12 });
  }

  hover() {
    const now = performance.now();
    if (now - this._lastHover < 60) return;
    this._lastHover = now;
    this.tone({ freq: 1240, dur: 0.03, type: 'sine', vol: 0.05 });
  }

  countdown(n) {
    const freq = n <= 1 ? 920 : n === 2 ? 700 : 540;
    this.tone({ freq, dur: 0.14, type: 'square', vol: 0.2 });
    if (n <= 1) {
      this.tone({ freq: 1380, dur: 0.18, type: 'triangle', vol: 0.14, delay: 0.05 });
    }
  }

  drop() {
    this.tone({ freq: 900, dur: 0.28, type: 'sawtooth', vol: 0.14, slideTo: 160 });
    this.noise({ dur: 0.1, vol: 0.05, filter: 900 });
  }

  grab() {
    this.tone({ freq: 150, dur: 0.08, type: 'square', vol: 0.22 });
    this.noise({ dur: 0.12, vol: 0.16, filter: 2400 });
  }

  miss() {
    this.tone({ freq: 340, dur: 0.18, type: 'square', vol: 0.16, slideTo: 180 });
    this.tone({ freq: 240, dur: 0.2, type: 'triangle', vol: 0.1, delay: 0.06 });
  }

  open() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.16, type: 'square', vol: 0.12, delay: i * 0.07 })
    );
  }

  win() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) =>
      this.tone({ freq: f, dur: 0.24, type: 'square', vol: 0.16, delay: i * 0.09 })
    );
    this.noise({ dur: 0.5, vol: 0.1, filter: 3000, delay: 0.2 });
  }

  firework() {
    this.noise({ dur: 0.35, vol: 0.08, filter: 1500 });
    this.tone({ freq: 90, dur: 0.2, type: 'sine', vol: 0.1 });
  }

  error() {
    this.tone({ freq: 180, dur: 0.24, type: 'square', vol: 0.16, slideTo: 80 });
  }

  pluck(midi, time) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.14, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.34);
  }

  bass(midi, time) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.1, time + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.46);
  }

  startBgm() {
    if (!this.musicOn || !this.enabled) return;
    const ctx = this.ctx;
    if (!ctx || this.bgmTimer) return;
    const stepDur = 60 / 96 / 2;
    this.nextNoteTime = ctx.currentTime + 0.2;
    this.step = 0;
    const tick = () => {
      if (!this.musicOn || !this.enabled) {
        this.stopBgm();
        return;
      }
      while (this.nextNoteTime < ctx.currentTime + 0.6) {
        const i = this.step % MELODY.length;
        const note = MELODY[i];
        if (note) this.pluck(note, this.nextNoteTime);
        if (i % 4 === 0) {
          const b = BASS[Math.floor(i / 2) % BASS.length];
          if (b) this.bass(b, this.nextNoteTime);
        }
        this.nextNoteTime += stepDur;
        this.step++;
      }
    };
    this.bgmTimer = setInterval(tick, 150);
    tick();
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const audio = new AudioEngine();
