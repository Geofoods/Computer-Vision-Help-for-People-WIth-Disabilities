// Generates the HandTap launch film soundtrack: a soft score in F major plus
// soft, bubbly SFX at the film's cue times. Writes a 48 kHz stereo float WAV.
import fs from 'node:fs';

const SR = 48000;
const DUR = 67;
const N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);       // dry bus
const RL = new Float32Array(N), RR = new Float32Array(N);     // reverb send
const SL = new Float32Array(N), SRb = new Float32Array(N);    // SFX bus (dry)

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- helpers ----------
function addVoice({ at, dur, f0, f1 = f0, glide = dur, amp, attack = 0.01, release = dur * 0.6,
  pan = 0, wave = 'sine', send = 0.2, lp = 0, bus = 'music', partials = null }) {
  const s0 = Math.floor(at * SR), n = Math.floor((dur + release) * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  const dl = bus === 'sfx' ? SL : L, dr = bus === 'sfx' ? SRb : R;
  let ph = 0, y = 0;
  const a = lp ? 1 - Math.exp(-2 * Math.PI * lp / SR) : 1;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx < 0) continue; if (idx >= N) break;
    const t = i / SR;
    const f = t < glide ? f0 * Math.pow(f1 / f0, t / glide) : f1;
    ph += 2 * Math.PI * f / SR;
    let v;
    if (partials) { v = 0; for (const [k, g, d] of partials) v += g * Math.sin(ph * k) * Math.exp(-t / d); }
    else if (wave === 'tri') v = (2 / Math.PI) * Math.asin(Math.sin(ph));
    else v = Math.sin(ph);
    // envelope: raised-cosine attack, sustain to dur, exponential release
    let e;
    if (t < attack) e = 0.5 - 0.5 * Math.cos(Math.PI * t / attack);
    else if (t < dur) e = 1;
    else e = Math.exp(-(t - dur) / (release / 4));
    v *= e * amp;
    y += a * (v - y);
    dl[idx] += y * gl; dr[idx] += y * gr;
    RL[idx] += y * gl * send; RR[idx] += y * gr * send;
  }
}

// percussive "bubble": short sine with upward glide, soft attack, exp decay
function bubble(at, f0, f1, decay, amp, pan = 0, send = 0.25) {
  addVoice({ at, dur: 0.004, f0, f1, glide: decay * 0.7, amp, attack: 0.006, release: decay * 4,
    pan, send, lp: 5000, bus: 'sfx' });
}

function noiseSwell(at, attack, decay, f0, f1, amp, pan = 0) {
  const s0 = Math.floor(at * SR), n = Math.floor((attack + decay * 4) * SR);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR, tot = attack + decay;
    const f = f0 * Math.pow(f1 / f0, Math.min(1, t / tot));
    const a = 1 - Math.exp(-2 * Math.PI * f / SR);
    y1 += a * ((rand() * 2 - 1) - y1); y2 += a * (y1 - y2);
    const e = t < attack ? Math.sin((Math.PI / 2) * t / attack) ** 2 : Math.exp(-(t - attack) / decay);
    const v = y2 * e * amp;
    SL[idx] += v * (1 - pan) * 0.7; SRb[idx] += v * (1 + pan) * 0.7;
    RL[idx] += v * 0.3; RR[idx] += v * 0.3;
  }
}

// ---------- SFX (tuned to F major pentatonic) ----------
const PENT = [77, 79, 81, 84, 86, 89]; // F5 G5 A5 C6 D6 F6
let keyIdx = 0;
const SFX = {
  tick: (at) => bubble(at, mtof(81) * 0.72, mtof(84), 0.035, 0.10, (rand() - 0.5) * 0.4),
  click: (at) => { bubble(at, mtof(72) * 0.7, mtof(77), 0.06, 0.20); bubble(at + 0.012, mtof(60), mtof(65), 0.08, 0.10); },
  key: (at) => {
    const m = PENT[keyIdx++ % 4];
    addVoice({ at, dur: 0.004, f0: mtof(m), amp: 0.16, attack: 0.005, release: 0.9, pan: (keyIdx % 2 ? -0.25 : 0.25),
      send: 0.3, lp: 4500, bus: 'sfx', partials: [[1, 1, 0.25], [2, 0.25, 0.06], [4, 0.12, 0.02]] });
    bubble(at, mtof(m) * 0.75, mtof(m), 0.03, 0.06);
  },
  lock: (at) => { bubble(at, mtof(77) * 0.7, mtof(77), 0.09, 0.17, -0.2, 0.35); bubble(at + 0.1, mtof(84) * 0.7, mtof(84), 0.12, 0.15, 0.2, 0.4); },
  chime: (at) => [77, 81, 84].forEach((m, i) => addVoice({ at: at + i * 0.08, dur: 0.004, f0: mtof(m), amp: 0.11, attack: 0.008,
    release: 1.6, pan: (i - 1) * 0.35, send: 0.5, lp: 5000, bus: 'sfx', partials: [[1, 1, 0.6], [2, 0.18, 0.15], [3, 0.06, 0.08]] })),
  shimmer: (at) => { for (let i = 0; i < 5; i++) { const m = PENT[1 + i % 5] + 12 * (i > 2); bubble(at + i * 0.035 + rand() * 0.01, mtof(m) * 0.75, mtof(m), 0.03, 0.035, (rand() - 0.5) * 0.8, 0.5); } },
  swish: (at) => noiseSwell(at, 0.12, 0.18, 250, 1400, 0.10),
};

const CUES = [
  [0.4, 'tick'], [3.3, 'tick'], [5.2, 'lock'], [6.35, 'swish'], [11.5, 'click'],
  [19.0, 'click'], [19.0, 'shimmer'], [22.0, 'click'], [22.0, 'shimmer'], [24.45, 'tick'],
  [29.8, 'chime'], [32.0, 'tick'], [33.55, 'chime'], [34.3, 'tick'],
  [38.6, 'key'], [40.1, 'key'], [41.6, 'key'], [43.1, 'key'], [37.4, 'tick'], [38.6, 'tick'], [39.8, 'tick'], [41.0, 'tick'], [42.4, 'tick'],
  [47.45, 'tick'], [51.0, 'tick'], [51.34, 'tick'], [51.48, 'click'], [51.48, 'shimmer'],
  ...[[50.05, 'swish'], [50.75, 'click'], [51.05, 'click'], [51.45, 'swish'], [52.15, 'lock'], [53.3, 'shimmer']].map(([at, k]) => [at + 7, k]),
].sort((a, b) => a[0] - b[0]);
for (const [at, k] of CUES) SFX[k](at);

// ---------- Score: 84 BPM, F major ----------
const BPM = 84, BEAT = 60 / BPM, BAR = BEAT * 4;
// [bass root, chord tones]
const PROG = [
  [41, [65, 69, 72, 76, 79]],   // Fmaj9
  [38, [62, 65, 69, 72, 76]],   // Dm9
  [46, [62, 65, 69, 70, 74]],   // Bbmaj7/9-ish
  [48, [64, 67, 72, 74, 79]],   // Cadd9
];
const END_MUSIC = 62.2;   // last chord lands here, rings into the credits
const nBars = Math.ceil(END_MUSIC / BAR);

for (let b = 0; b < nBars; b++) {
  const t0 = b * BAR;
  const [root, tones] = PROG[Math.floor(b / 2) % 4];
  const isChordStart = b % 2 === 0;
  // pad: one chord every 2 bars, detuned pair per note
  if (isChordStart) {
    tones.slice(0, 4).forEach((m, i) => {
      for (const det of [-0.06, 0.06]) addVoice({ at: t0, dur: BAR * 2, f0: mtof(m - 12 + det), amp: 0.022, attack: 1.4, release: 2.2,
        pan: det > 0 ? 0.5 : -0.5, wave: 'tri', send: 0.6, lp: 1400 });
    });
  }
  // bass from bar 4
  if (b >= 4) for (const beat of [0, 2.5]) addVoice({ at: t0 + beat * BEAT, dur: BEAT * 1.2, f0: mtof(root), amp: 0.09, attack: 0.02, release: 0.4, send: 0.05, lp: 400 });
  // soft kick from bar 8 (except breakdown bars 16-17)
  if (b >= 8 && !(b === 16 || b === 17)) for (const beat of [0, 2]) addVoice({ at: t0 + beat * BEAT, dur: 0.01, f0: 120, f1: 48, glide: 0.08, amp: 0.16, attack: 0.003, release: 0.35, send: 0.02, lp: 300 });
  // soft brushed hat on offbeats from bar 8
  if (b >= 8 && !(b === 16 || b === 17)) for (let e = 1; e < 8; e += 2) noiseSwellMusic(t0 + e * BEAT / 2, 0.004, 0.03, 0.012);
  // bubbly arpeggio from bar 2, eighth notes
  if (b >= 2) {
    const pattern = [0, 2, 1, 3, 2, 4, 1, 3];
    pattern.forEach((p, e) => {
      if (b < 4 && e % 2) return; // sparser at first
      const m = tones[p] + (e === 5 ? 12 : 0);
      const at = t0 + e * BEAT / 2;
      if (at > END_MUSIC - 0.3) return;
      addVoice({ at, dur: 0.004, f0: mtof(m), amp: 0.045, attack: 0.006, release: 0.7, pan: e % 2 ? 0.35 : -0.35,
        send: 0.4, lp: 3000, partials: [[1, 1, 0.22], [2, 0.3, 0.05], [3, 0.08, 0.03]] });
    });
  }
}
function noiseSwellMusic(at, attack, decay, amp) {
  const s0 = Math.floor(at * SR), n = Math.floor((attack + decay * 5) * SR);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const idx = s0 + i; if (idx >= N) break;
    const t = i / SR, w = rand() * 2 - 1, hp = w - p; p = w; // crude highpass
    const e = t < attack ? t / attack : Math.exp(-(t - attack) / decay);
    L[idx] += hp * e * amp * 0.8; R[idx] += hp * e * amp;
  }
}
// final chord: Fmaj9 rings through the credits
[53, 60, 65, 69, 72, 76].forEach((m, i) => {
  addVoice({ at: END_MUSIC, dur: 1.5, f0: mtof(m), amp: 0.03, attack: 0.8, release: 4.5, pan: (i % 2 ? 0.4 : -0.4), wave: 'tri', send: 0.7, lp: 1600 });
});
addVoice({ at: END_MUSIC, dur: 0.004, f0: mtof(77), amp: 0.06, attack: 0.006, release: 2.5, send: 0.6, lp: 4000, partials: [[1, 1, 0.8], [2, 0.2, 0.2]] });
addVoice({ at: END_MUSIC, dur: 1.5, f0: mtof(29), amp: 0.08, attack: 0.05, release: 3, lp: 300 });

// ---------- gentle ducking of music under SFX ----------
const duck = new Float32Array(N); let env = 0;
for (let i = 0; i < N; i++) {
  const x = Math.abs(SL[i]) + Math.abs(SRb[i]);
  env = x > env ? env + (x - env) * 0.01 : env * 0.99985;
  duck[i] = 1 / (1 + env * 2.5);
}
for (let i = 0; i < N; i++) { L[i] = L[i] * duck[i] + SL[i]; R[i] = R[i] * duck[i] + SRb[i]; }

// ---------- reverb (Freeverb-style) ----------
function reverb(inp, combs, aps) {
  const out = new Float32Array(N);
  for (const d of combs) { const buf = new Float32Array(d); let j = 0, f = 0;
    for (let i = 0; i < N; i++) { const y = buf[j]; f = y * 0.7 + f * 0.3; buf[j] = inp[i] + f * 0.84; out[i] += y; j = (j + 1) % d; } }
  for (const d of aps) { const buf = new Float32Array(d); let j = 0;
    for (let i = 0; i < N; i++) { const b = buf[j]; const x = out[i]; buf[j] = x + b * 0.5; out[i] = b - x; j = (j + 1) % d; } }
  return out;
}
const sc = SR / 44100;
const wl = reverb(RL, [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * sc)), [556, 441, 341, 225].map((d) => Math.round(d * sc)));
const wr = reverb(RR, [1139, 1211, 1300, 1379, 1445, 1514, 1580, 1640].map((d) => Math.round(d * sc)), [579, 464, 364, 248].map((d) => Math.round(d * sc)));
for (let i = 0; i < N; i++) { L[i] += wl[i] * 0.06; R[i] += wr[i] * 0.06; }

// ---------- master fades + soft clip ----------
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = Math.min(1, t / 1.5);
  if (t > DUR - 3.5) g *= Math.max(0, (DUR - t) / 3.5) ** 1.5;
  L[i] = Math.tanh(L[i] * g * 1.2) / 1.2; R[i] = Math.tanh(R[i] * g * 1.2) / 1.2;
}

// ---------- write float WAV ----------
const data = Buffer.alloc(N * 8);
for (let i = 0; i < N; i++) { data.writeFloatLE(L[i], i * 8); data.writeFloatLE(R[i], i * 8 + 4); }
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.writeFileSync(process.argv[2] || 'soundtrack.wav', Buffer.concat([h, data]));
console.log('wrote', DUR, 's,', CUES.length, 'cues');
