"use client";

// Tiny WebAudio feedback tones for scanning — no asset files.
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

function tone(freq: number, ms: number, type: OscillatorType = "square", gain = 0.05) {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ac.destination);
  const now = ac.currentTime;
  osc.start(now);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
  osc.stop(now + ms / 1000);
}

/** Crisp confirmation beep on a successful scan. */
export function beepOk() {
  tone(1180, 70);
}

/** Lower double-buzz for an unknown / out-of-stock scan. */
export function beepError() {
  tone(320, 120, "sawtooth", 0.06);
  setTimeout(() => tone(240, 160, "sawtooth", 0.06), 110);
}
