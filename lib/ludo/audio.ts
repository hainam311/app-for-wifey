// Cờ cá ngựa đôi lứa — Zero-Asset Web Audio API Synthesizer
// Pure client-side synthesis: 0 KB external audio files, instant load, no network latency.

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let muted = false;
const listeners = new Set<() => void>();

function initAudio() {
  if (typeof window === "undefined") return;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      // @ts-expect-error Webkit prefix support
      window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);

    try {
      muted = localStorage.getItem("ludo_muted") === "true";
    } catch {
      muted = false;
    }
    masterGain.gain.setValueAtTime(muted ? 0 : 0.45, audioCtx.currentTime);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

export function isMuted(): boolean {
  if (typeof window !== "undefined") {
    try {
      muted = localStorage.getItem("ludo_muted") === "true";
    } catch {
      // fallback
    }
  }
  return muted;
}

export function toggleMute(): boolean {
  initAudio();
  muted = !muted;
  try {
    localStorage.setItem("ludo_muted", muted ? "true" : "false");
  } catch {
    // Ignore storage errors
  }
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(muted ? 0 : 0.45, audioCtx.currentTime);
  }
  listeners.forEach((fn) => fn());
  return muted;
}

export function onMuteChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// 1. playDiceRoll: crisp wooden/plastic dice rattle + landing pop
export function playDiceRoll() {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  // Multiple rattle taps
  for (let i = 0; i < 5; i++) {
    const t = now + i * 0.055 + Math.random() * 0.015;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320 + Math.random() * 220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.035);

    gain.gain.setValueAtTime(0.25 - i * 0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  // Final landing pop
  const landingTime = now + 0.32;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(260, landingTime);
  osc.frequency.exponentialRampToValueAtTime(60, landingTime + 0.07);

  gain.gain.setValueAtTime(0.4, landingTime);
  gain.gain.exponentialRampToValueAtTime(0.001, landingTime + 0.07);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(landingTime);
  osc.stop(landingTime + 0.08);
}

// 2. playHop: cute playful wooden board tap / gallop sound
export function playHop() {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  // Double tap like a cute clip-clop
  [0, 0.07].forEach((delay, idx) => {
    if (!audioCtx || !masterGain) return;
    const t = now + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(idx === 0 ? 520 : 680, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.045);

    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  });
}

// 3. playDeploy: bright ascending arpeggio chime when horse spawns
export function playDeploy() {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5 (Bright major chime)
  notes.forEach((freq, idx) => {
    if (!audioCtx || !masterGain) return;
    const t = now + idx * 0.065;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.23);
  });
}

// 4. playKick: dramatic cartoon boing + explosion thud
export function playKick() {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;

  // Boing oscillator
  const boing = audioCtx.createOscillator();
  const boingGain = audioCtx.createGain();
  boing.type = "sine";
  boing.frequency.setValueAtTime(140, now);
  boing.frequency.exponentialRampToValueAtTime(580, now + 0.12);
  boing.frequency.exponentialRampToValueAtTime(180, now + 0.28);

  boingGain.gain.setValueAtTime(0.5, now);
  boingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

  boing.connect(boingGain);
  boingGain.connect(masterGain);
  boing.start(now);
  boing.stop(now + 0.3);

  // Thud
  const thud = audioCtx.createOscillator();
  const thudGain = audioCtx.createGain();
  thud.type = "triangle";
  thud.frequency.setValueAtTime(120, now + 0.05);
  thud.frequency.exponentialRampToValueAtTime(30, now + 0.25);

  thudGain.gain.setValueAtTime(0.5, now + 0.05);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  thud.connect(thudGain);
  thudGain.connect(masterGain);
  thud.start(now + 0.05);
  thud.stop(now + 0.26);

  // Short noise burst
  const noiseBuf = createNoiseBuffer(audioCtx, 0.15);
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuf;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(600, now);
  filter.Q.setValueAtTime(1.2, now);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  noiseSource.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start(now);
}

// 5. playHomeStep: rising pitch chime (1..6) when climbing home ladder
export function playHomeStep(step: number) {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  // C Major scale frequencies for steps 1..6
  const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0]; // C5, D5, E5, F5, G5, A5
  const clampedStep = Math.max(1, Math.min(6, step));
  const freq = scale[clampedStep - 1] ?? 523.25;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.36);
}

// 6. playWin: joyful celebratory fanfare chord progression
export function playWin() {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  // Victory Fanfare: C5 -> E5 -> G5 -> C6 held chord
  const chords = [
    { freq: 523.25, time: 0, dur: 0.16 }, // C5
    { freq: 659.25, time: 0.14, dur: 0.16 }, // E5
    { freq: 783.99, time: 0.28, dur: 0.16 }, // G5
    { freq: 1046.5, time: 0.44, dur: 0.65 }, // C6
    { freq: 1318.51, time: 0.44, dur: 0.65 }, // E6
  ];

  chords.forEach(({ freq, time, dur }) => {
    if (!audioCtx || !masterGain) return;
    const t = now + time;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  });
}
