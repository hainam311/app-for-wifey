// Bắn tăng — Zero-Asset Web Audio API Synthesizer
// Pure client-side synthesis: 0 KB external audio files, instant load, no network latency.

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let chargeOsc: OscillatorNode | null = null;
let chargeGain: GainNode | null = null;

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
    
    // Check initial mute state from localStorage
    try {
      muted = localStorage.getItem("tank_muted") === "true";
    } catch {
      muted = false;
    }
    masterGain.gain.setValueAtTime(muted ? 0 : 0.4, audioCtx.currentTime);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

export function isMuted(): boolean {
  if (typeof window !== "undefined") {
    try {
      muted = localStorage.getItem("tank_muted") === "true";
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
    localStorage.setItem("tank_muted", muted ? "true" : "false");
  } catch {
    // Ignore storage errors
  }
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(muted ? 0 : 0.4, audioCtx.currentTime);
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

// Generate a quick buffer of white noise for explosions and punch
function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// --- 1. Power Charge Sound (Rising frequency matching power 1..100) ---
export function playCharge(powerPercent: number) {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const targetFreq = 180 + Math.min(100, Math.max(0, powerPercent)) * 4.8; // 180Hz to 660Hz

  if (!chargeOsc) {
    chargeOsc = audioCtx.createOscillator();
    chargeOsc.type = "triangle";
    chargeOsc.frequency.setValueAtTime(targetFreq, now);

    chargeGain = audioCtx.createGain();
    chargeGain.gain.setValueAtTime(0.01, now);
    chargeGain.gain.linearRampToValueAtTime(0.22, now + 0.05);

    chargeOsc.connect(chargeGain);
    chargeGain.connect(masterGain);
    chargeOsc.start(now);
  } else {
    chargeOsc.frequency.setTargetAtTime(targetFreq, now, 0.04);
  }
}

export function stopCharge() {
  if (chargeGain && audioCtx) {
    const now = audioCtx.currentTime;
    chargeGain.gain.linearRampToValueAtTime(0.001, now + 0.05);
  }
  if (chargeOsc && audioCtx) {
    const now = audioCtx.currentTime;
    chargeOsc.stop(now + 0.06);
    setTimeout(() => {
      chargeOsc?.disconnect();
      chargeGain?.disconnect();
      chargeOsc = null;
      chargeGain = null;
    }, 80);
  } else {
    chargeOsc = null;
    chargeGain = null;
  }
}

// --- 2. Shot Cannon Blast ---
export function playShot(kind: "s1" | "s2" | "ss" = "s1") {
  stopCharge();
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const dur = kind === "ss" ? 0.35 : kind === "s2" ? 0.28 : 0.22;
  const startFreq = kind === "ss" ? 420 : kind === "s2" ? 360 : 310;
  const endFreq = 65;

  // Pitch sweep oscillator
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = kind === "ss" ? "sawtooth" : "square";
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);

  gain.gain.setValueAtTime(kind === "ss" ? 0.55 : 0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + dur);

  // Punchy noise pop
  const noiseBuf = createNoiseBuffer(audioCtx, dur * 0.7);
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuf;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(800, now);
  noiseFilter.Q.setValueAtTime(1.5, now);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(kind === "ss" ? 0.45 : 0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.7);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start(now);
}

// --- 3. Explosion Boom ---
export function playBoom(kind: "s1" | "s2" | "ss" = "s1") {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const dur = kind === "ss" ? 0.95 : kind === "s2" ? 0.75 : 0.6;

  // Sub-bass thud oscillator
  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(kind === "ss" ? 140 : 110, now);
  osc.frequency.exponentialRampToValueAtTime(25, now + dur * 0.8);

  oscGain.gain.setValueAtTime(kind === "ss" ? 0.65 : 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.8);

  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + dur * 0.8);

  // Crackling dirt & shockwave noise
  const noiseBuf = createNoiseBuffer(audioCtx, dur);
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(kind === "ss" ? 1100 : 850, now);
  filter.frequency.exponentialRampToValueAtTime(90, now + dur);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(kind === "ss" ? 0.55 : 0.4, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
}

// --- 4. Victory Chime (Happy Major Arpeggio) ---
export function playWin() {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    if (!audioCtx || !masterGain) return;
    const noteTime = now + idx * 0.12;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, noteTime);

    gain.gain.setValueAtTime(0.35, noteTime);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(noteTime);
    osc.stop(noteTime + 0.36);
  });
}

// --- 5. Defeat Tone (Melancholic Descending Tone) ---
export function playDefeat() {
  if (muted) return;
  initAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const notes = [311.13, 293.66, 261.63]; // Eb4, D4, C4
  notes.forEach((freq, idx) => {
    if (!audioCtx || !masterGain) return;
    const noteTime = now + idx * 0.22;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, noteTime);

    gain.gain.setValueAtTime(0.3, noteTime);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(noteTime);
    osc.stop(noteTime + 0.46);
  });
}
