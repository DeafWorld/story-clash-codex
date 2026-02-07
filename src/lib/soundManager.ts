type LoopId = "intro" | "lobby" | "minigame" | "zombie" | "alien" | "haunted";
type CueId =
  | "button_click"
  | "scene_transition"
  | "countdown_beep"
  | "countdown_go"
  | "tap"
  | "results_reveal"
  | "timer_warning"
  | "ending_triumph"
  | "ending_survival"
  | "ending_doom";

type SoundOptions = {
  volume?: number;
};

type ActiveLoop = {
  gains: GainNode[];
  oscillators: OscillatorNode[];
};

const AUDIO_MUTED_KEY = "audioMuted";
const AUDIO_VOLUME_KEY = "audioVolume";

class SoundManager {
  private context: AudioContext | null = null;

  private masterGain: GainNode | null = null;

  private muted = false;

  private masterVolume = 0.65;

  private loops = new Map<LoopId, ActiveLoop>();

  init() {
    if (typeof window === "undefined") {
      return;
    }
    if (this.context && this.masterGain) {
      return;
    }

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    this.context = new AudioCtx();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.syncOutputLevel();
  }

  loadSavedSettings() {
    if (typeof window === "undefined") {
      return;
    }

    const muted = localStorage.getItem(AUDIO_MUTED_KEY);
    this.muted = muted === "1";

    const storedVolume = Number(localStorage.getItem(AUDIO_VOLUME_KEY));
    if (Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1) {
      this.masterVolume = storedVolume;
    }

    this.syncOutputLevel();
  }

  unlock() {
    this.init();
    if (!this.context) {
      return;
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  isMuted() {
    return this.muted;
  }

  getMasterVolume() {
    return this.masterVolume;
  }

  setMuted(next: boolean) {
    this.muted = next;
    if (typeof window !== "undefined") {
      localStorage.setItem(AUDIO_MUTED_KEY, next ? "1" : "0");
    }
    this.syncOutputLevel();
  }

  setMasterVolume(next: number) {
    this.masterVolume = Math.max(0, Math.min(1, next));
    if (typeof window !== "undefined") {
      localStorage.setItem(AUDIO_VOLUME_KEY, String(this.masterVolume));
    }
    this.syncOutputLevel();
  }

  transitionLoop(loopId: LoopId) {
    const active = [...this.loops.keys()];
    active.forEach((id) => {
      if (id !== loopId) {
        this.stopLoop(id);
      }
    });
    this.startLoop(loopId);
  }

  startLoop(loopId: LoopId) {
    this.unlock();
    if (!this.context || !this.masterGain || this.loops.has(loopId)) {
      return;
    }

    const now = this.context.currentTime;
    const gains: GainNode[] = [];
    const oscillators: OscillatorNode[] = [];

    const addOsc = (frequency: number, type: OscillatorType, gainLevel: number) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.masterGain!);
      gain.gain.linearRampToValueAtTime(gainLevel, now + 0.3);
      osc.start(now);
      gains.push(gain);
      oscillators.push(osc);
    };

    if (loopId === "intro" || loopId === "lobby") {
      addOsc(54, "sine", 0.07);
      addOsc(82, "triangle", 0.04);
    } else if (loopId === "minigame") {
      addOsc(110, "square", 0.035);
      addOsc(220, "triangle", 0.02);
    } else if (loopId === "zombie") {
      addOsc(61, "sawtooth", 0.07);
      addOsc(92, "triangle", 0.03);
    } else if (loopId === "alien") {
      addOsc(130, "sine", 0.05);
      addOsc(246, "sawtooth", 0.02);
    } else if (loopId === "haunted") {
      addOsc(73, "triangle", 0.045);
      addOsc(147, "sine", 0.03);
    }

    this.loops.set(loopId, { gains, oscillators });
  }

  stopLoop(loopId: LoopId) {
    const loop = this.loops.get(loopId);
    if (!loop || !this.context) {
      return;
    }

    const now = this.context.currentTime;
    loop.gains.forEach((gain) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.22);
    });

    window.setTimeout(() => {
      loop.oscillators.forEach((osc) => {
        try {
          osc.stop();
        } catch {
          // noop: already stopped
        }
      });
      this.loops.delete(loopId);
    }, 260);
  }

  stopAllLoops() {
    [...this.loops.keys()].forEach((loopId) => this.stopLoop(loopId));
  }

  play(cueId: CueId, options: SoundOptions = {}) {
    this.unlock();
    if (!this.context || !this.masterGain || this.muted) {
      return;
    }

    const volume = Math.max(0, Math.min(1, options.volume ?? 1));
    const now = this.context.currentTime;

    const oneTone = (frequency: number, durationMs: number, gainLevel: number, type: OscillatorType = "sine") => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.masterGain!);

      const end = now + durationMs / 1000;
      gain.gain.linearRampToValueAtTime(gainLevel * volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.start(now);
      osc.stop(end + 0.02);
    };

    if (cueId === "button_click") {
      oneTone(880, 80, 0.1, "triangle");
      return;
    }

    if (cueId === "scene_transition") {
      oneTone(420, 160, 0.09, "sine");
      oneTone(320, 160, 0.06, "sawtooth");
      return;
    }

    if (cueId === "countdown_beep") {
      oneTone(740, 110, 0.12, "square");
      return;
    }

    if (cueId === "countdown_go") {
      oneTone(523, 170, 0.12, "triangle");
      oneTone(784, 210, 0.09, "sine");
      oneTone(1046, 230, 0.08, "sine");
      return;
    }

    if (cueId === "tap") {
      oneTone(1520, 70, 0.11, "square");
      return;
    }

    if (cueId === "results_reveal") {
      oneTone(260, 300, 0.13, "triangle");
      oneTone(390, 360, 0.1, "sine");
      return;
    }

    if (cueId === "timer_warning") {
      oneTone(120, 150, 0.13, "sawtooth");
      return;
    }

    if (cueId === "ending_triumph") {
      oneTone(392, 300, 0.12, "triangle");
      oneTone(523, 360, 0.1, "sine");
      oneTone(659, 420, 0.08, "sine");
      return;
    }

    if (cueId === "ending_survival") {
      oneTone(311, 320, 0.11, "triangle");
      oneTone(392, 340, 0.08, "sine");
      return;
    }

    if (cueId === "ending_doom") {
      oneTone(147, 460, 0.13, "sawtooth");
      oneTone(110, 520, 0.1, "triangle");
    }
  }

  private syncOutputLevel() {
    if (!this.masterGain || !this.context) {
      return;
    }

    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, now, 0.05);
  }
}

export const soundManager = new SoundManager();

