// Loud, audible feedback sounds using Web Audio API (no asset files).
let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  if (_ctx!.state === "suspended") _ctx!.resume().catch(() => {});
  return _ctx;
}

type Tone = {
  freq: number;
  endFreq?: number;
  dur: number;
  delay?: number;
  type?: OscillatorType;
  gain?: number;
};

function play(tones: Tone[]) {
  const ac = ctx();
  if (!ac) return;
  const now = ac.currentTime;
  for (const t of tones) {
    const start = now + (t.delay || 0);
    const end = start + t.dur;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = t.type || "sine";
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(t.endFreq, end);
    }
    const peak = t.gain ?? 0.6;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

// Short upward chirp — for successful save (invoice, payment, etc.)
export function playSuccess() {
  play([
    { freq: 660, endFreq: 990, dur: 0.18, type: "sine", gain: 0.6 },
    { freq: 990, endFreq: 1320, dur: 0.18, delay: 0.18, type: "sine", gain: 0.55 },
  ]);
}

// Quick click — for adding item to cart
export function playAdd() {
  play([{ freq: 1200, dur: 0.08, type: "triangle", gain: 0.5 }]);
}

// Loud double descending buzz — for errors
export function playError() {
  play([
    { freq: 440, endFreq: 220, dur: 0.18, type: "square", gain: 0.55 },
    { freq: 440, endFreq: 220, dur: 0.18, delay: 0.2, type: "square", gain: 0.55 },
  ]);
}
