export type Surface = 'path' | 'grass' | 'rock' | 'shore' | 'snow';

export class Soundscape {
  soundOn = true;
  musicOn = true;
  private running = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sound: GainNode | null = null;
  private music: GainNode | null = null;
  private wind: GainNode | null = null;
  private water: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rain: GainNode | null = null;
  private drip = 0;
  private tones: { osc: OscillatorNode; gain: GainNode }[] = [];
  private noise: AudioBuffer | null = null;
  private step = 0;
  private chirp = 1.2;

  unlock() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  setSound(on: boolean) {
    this.soundOn = on;
    if (this.sound) this.sound.gain.value = on ? 1 : 0;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.music) this.music.gain.value = on ? 1 : 0;
  }

  setRunning(on: boolean) {
    if (this.running === on) return;
    this.running = on;
    if (this.master) this.master.gain.value = on ? 0.85 : 0;
  }

  update(dt: number, state: { moving: number; surface: Surface; shore: number; hours: number; elapsed: number; rain: number; snow: number }) {
    if (!this.ctx || !this.running) return;
    const gust = 0.55 + 0.45 * Math.sin(state.elapsed * 0.17) * Math.sin(state.elapsed * 0.05);
    if (this.wind) this.wind.gain.value = (0.08 + gust * 0.1) * (1 - state.snow * 0.35 + state.rain * 0.3);
    if (this.windFilter) this.windFilter.frequency.value = (280 + gust * 220) * (1 - state.snow * 0.45);
    if (this.rain) this.rain.gain.value = state.rain * 0.3;
    this.drip -= dt;
    if (state.rain > 0.2 && this.drip <= 0 && this.soundOn) {
      this.drip = (0.02 + Math.random() * 0.12) / state.rain;
      this.patter(state.rain);
    }
    if (this.water) this.water.gain.value = Math.max(0, 1 - state.shore / 22) * 0.28;
    this.retune(state.hours);
    if (state.moving > 0.2 && this.soundOn) {
      this.step -= dt * (0.9 + state.moving * 2.4);
      if (this.step <= 0) {
        this.step = 1;
        this.footstep(state.surface, state.moving);
      }
    } else this.step = Math.min(this.step, 0.35);
    const night = (state.hours >= 19.5 || state.hours < 5.2) && state.rain < 0.3 && state.snow < 0.3;
    this.chirp -= dt;
    if (night && this.chirp <= 0 && this.soundOn) {
      this.chirp = 0.35 + Math.random() * 1.4;
      this.insect();
    }
  }

  state() {
    return { soundOn: this.soundOn, musicOn: this.musicOn, running: this.running && this.ctx?.state === 'running' };
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.985 + white * 0.015;
      data[i] = Math.max(-1, Math.min(1, brown * 12));
    }
    this.noise = buffer;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.sound = ctx.createGain();
    this.music = ctx.createGain();
    this.sound.gain.value = this.soundOn ? 1 : 0;
    this.music.gain.value = this.musicOn ? 1 : 0;
    this.sound.connect(this.master);
    this.music.connect(this.master);
    const windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.12;
    windSource.connect(this.windFilter).connect(this.wind).connect(this.sound);
    windSource.start();
    const waterSource = ctx.createBufferSource();
    waterSource.buffer = buffer;
    waterSource.loop = true;
    waterSource.playbackRate.value = 0.55;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 620;
    waterFilter.Q.value = 0.7;
    this.water = ctx.createGain();
    this.water.gain.value = 0;
    waterSource.connect(waterFilter).connect(this.water).connect(this.sound);
    waterSource.start();
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = buffer;
    rainSource.loop = true;
    rainSource.playbackRate.value = 2.6;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 700;
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    rainSource.connect(rainFilter).connect(this.rain).connect(this.sound);
    rainSource.start();
    for (const frequency of [55, 82.4, 123.5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = 0.02;
      osc.connect(gain).connect(this.music);
      osc.start();
      this.tones.push({ osc, gain });
    }
    this.ctx = ctx;
    return ctx;
  }

  private retune(hours: number) {
    if (!this.ctx) return;
    const night = hours >= 19 || hours < 5;
    const dusk = hours >= 16.5 && hours < 19.5;
    const dawn = hours >= 5 && hours < 8;
    const chord = night ? [55, 82.4, 110] : dusk ? [61.7, 92.5, 155.6] : dawn ? [73.4, 110, 146.8] : [98, 146.8, 196];
    const level = night ? 0.045 : dusk ? 0.055 : dawn ? 0.03 : 0.016;
    this.tones.forEach((tone, i) => {
      tone.osc.frequency.setTargetAtTime(chord[i], this.ctx!.currentTime, 1.4);
      tone.gain.gain.setTargetAtTime(level / (i + 1), this.ctx!.currentTime, 1.2);
    });
  }

  private footstep(surface: Surface, moving: number) {
    if (!this.ctx || !this.noise || !this.sound) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = surface === 'rock' ? 1.8 : surface === 'shore' ? 0.45 : surface === 'path' ? 1.15 : surface === 'snow' ? 1.4 : 0.8;
    const filter = this.ctx.createBiquadFilter();
    filter.type = surface === 'rock' ? 'highpass' : surface === 'snow' ? 'bandpass' : 'lowpass';
    filter.frequency.value = surface === 'rock' ? 1400 : surface === 'path' ? 1600 : surface === 'shore' ? 500 : surface === 'snow' ? 1100 : 780;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const loud = (surface === 'shore' ? 0.22 : 0.14) * (0.7 + moving * 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(loud, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (surface === 'shore' ? 0.16 : surface === 'snow' ? 0.13 : 0.07));
    source.connect(filter).connect(gain).connect(this.sound);
    source.start(now);
    source.stop(now + 0.2);
  }

  private patter(rain: number) {
    if (!this.ctx || !this.noise || !this.sound) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 2 + Math.random() * 2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800 + Math.random() * 2600;
    filter.Q.value = 3;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05 * rain * (0.4 + Math.random() * 0.6), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    source.connect(filter).connect(gain).connect(this.sound);
    source.start(now, Math.random() * 1.5);
    source.stop(now + 0.06);
  }

  private insect() {
    if (!this.ctx || !this.sound) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3600 + Math.random() * 700, now);
    osc.frequency.exponentialRampToValueAtTime(4200 + Math.random() * 400, now + 0.045);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(this.sound);
    osc.start(now);
    osc.stop(now + 0.08);
  }
}
