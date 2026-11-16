class SoundEngine {
  private ctx: AudioContext | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  public enabled = true;
  public musicEnabled = false;

  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.08,
    delay = 0
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  playClick() {
    this.playTone(620, 0.06, 'triangle', 0.06);
  }

  playCookStart() {
    this.playTone(440, 0.08, 'sine', 0.07, 0);
    this.playTone(554, 0.1, 'sine', 0.07, 0.06);
  }

  playCookReady() {
    this.playTone(587.33, 0.12, 'triangle', 0.09, 0);
    this.playTone(783.99, 0.12, 'triangle', 0.09, 0.09);
    this.playTone(1046.5, 0.22, 'triangle', 0.1, 0.18);
  }

  playCoin() {
    this.playTone(987.77, 0.08, 'sine', 0.09, 0);
    this.playTone(1318.51, 0.2, 'sine', 0.09, 0.07);
  }

  playClean() {
    this.playTone(520, 0.06, 'sine', 0.06, 0);
    this.playTone(760, 0.09, 'sine', 0.06, 0.05);
  }

  playBuy() {
    this.playTone(523.25, 0.08, 'triangle', 0.08, 0);
    this.playTone(659.25, 0.08, 'triangle', 0.08, 0.07);
    this.playTone(783.99, 0.15, 'triangle', 0.09, 0.14);
  }

  playLevelUp() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.playTone(n, 0.18, 'triangle', 0.1, i * 0.09));
  }

  playBurnt() {
    this.playTone(220, 0.18, 'sawtooth', 0.06, 0);
    this.playTone(165, 0.25, 'sawtooth', 0.06, 0.14);
  }

  playQuestComplete() {
    this.playTone(659.25, 0.1, 'sine', 0.09, 0);
    this.playTone(880, 0.1, 'sine', 0.09, 0.08);
    this.playTone(1174.66, 0.22, 'sine', 0.1, 0.16);
  }

  setMusicEnabled(active: boolean) {
    this.musicEnabled = active;
    if (!active || !this.enabled) {
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      return;
    }
    if (this.musicTimer !== null) return;

    // Gentle 2010 bistro lounge arpeggio (Cmaj7 -> Am7 -> Dm7 -> G7)
    const chords = [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [293.66, 349.23, 440.0, 523.25],
      [196.0, 246.94, 293.66, 349.23],
    ];

    const playStep = () => {
      if (!this.enabled || !this.musicEnabled) return;
      const chord = chords[Math.floor(this.musicStep / 4) % chords.length];
      const note = chord[this.musicStep % 4];
      this.playTone(note, 0.42, 'sine', 0.022, 0);
      this.musicStep = (this.musicStep + 1) % 16;
    };

    playStep();
    this.musicTimer = window.setInterval(playStep, 520);
  }
}

export const soundEngine = new SoundEngine();
