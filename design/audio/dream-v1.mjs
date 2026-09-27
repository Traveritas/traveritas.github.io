// "梦 / Dream" BGM v1 — note generator for Ableton (via AbletonMCP).
// 72 BPM, 4/4, 32-bar seamless loop (128 beats). Key centre: F Lydian / A minor,
// ending on E7 so the loop falls a half-step back into Fmaj (phrygian pull).
// Wake state should share tempo + length + chord grid so the two can crossfade in sync.
//
// Usage: node dream-v1.mjs  -> writes out/<track>.json (arrays of AbletonMCP note dicts)

import { mkdirSync, writeFileSync } from "node:fs";

const LOOP = 128;
const N = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, B: 11 };
const p = (name) => { // "G#3" -> midi (C4 = 60)
  const m = name.match(/^([A-G]#?)(-?\d)$/);
  return N[m[1]] + (Number(m[2]) + 1) * 12;
};
const note = (pitch, start, duration, velocity) => ({
  pitch: typeof pitch === "string" ? p(pitch) : pitch,
  start_time: +start.toFixed(3), duration: +duration.toFixed(3),
  velocity: Math.max(1, Math.min(127, Math.round(velocity))), mute: false,
});

// 8 chords x 4 bars. pad = upper voicing (rootless-ish), bass = root.
const CHORDS = [
  { name: "Fmaj9#11", bass: "F2", pad: ["E3", "A3", "C4", "G4", "B4"], tones: ["A", "C", "E", "G", "B"] },
  { name: "Em7add11", bass: "E2", pad: ["G3", "B3", "D4", "A4"],       tones: ["E", "G", "B", "D", "A"] },
  { name: "Dm9",      bass: "D2", pad: ["F3", "A3", "C4", "E4"],       tones: ["D", "F", "A", "C", "E"] },
  { name: "Cmaj9",    bass: "C2", pad: ["E3", "G3", "B3", "D4"],       tones: ["C", "E", "G", "B", "D"] },
  { name: "Fmaj9",    bass: "F2", pad: ["A3", "C4", "E4", "G4"],       tones: ["F", "A", "C", "E", "G"] },
  { name: "Am9",      bass: "A1", pad: ["C4", "E4", "G4", "B4"],       tones: ["A", "C", "E", "G", "B"] },
  { name: "Dm11",     bass: "D2", pad: ["C4", "F4", "G4", "A4"],       tones: ["D", "F", "G", "A", "C"] },
  { name: "E7sus4>E7", bass: "E2", pad: null,                          tones: ["E", "A", "B", "D"] },
];
// section dynamics A(intro) B(theme) C(theme 2) D(echo / dissolve)
const secVel = (beat) => [62, 58, 74, 60][Math.floor(beat / 32)];

const tracks = {};

// ── Pad ──────────────────────────────────────────────
tracks.pad = [];
CHORDS.forEach((c, i) => {
  const t = i * 16;
  if (c.pad) c.pad.forEach((n, k) => tracks.pad.push(note(n, t, 16, secVel(t) - k * 2)));
  else {
    ["D4", "A3", "B3", "E4"].forEach((n) => tracks.pad.push(note(n, t, 8, secVel(t))));        // E7sus4
    ["G#3", "B3", "D4", "E4"].forEach((n) => tracks.pad.push(note(n, t + 8, 8, secVel(t) + 4))); // E7
  }
});

// ── Sub bass ─────────────────────────────────────────
tracks.bass = CHORDS.map((c, i) => note(c.bass, i * 16, 16, i < 2 ? 55 : 72));

// ── Drone: E + B pedal (fits every chord in the loop), retriggered each half ─
tracks.drone = [0, 64].flatMap((t) => [note("E3", t, 64, 60), note("B3", t, 64, 50), note("E4", t + 16, 48, 38)]);

// ── Melody (from design/mocks/melody.txt; one token = one beat, "-" = hold) ─
// line 1: G-1 C F G - G B 'E D - - - - B 'E D - - - - B 'E D
// line 2: G-1 C F G - 'E G C B - - - - G C B   (+ a third "G C B" to mirror line 1)
const parseLine = (tokens, start, oct = 0, vel = 72) => {
  const out = []; let t = start;
  tokens.forEach((tok, i) => {
    if (tok === "-") { t++; return; }
    let d = 1; while (tokens[i + d] === "-") d++;
    const pitch = p(tok) + oct * 12;
    const phrasePeak = /5$/.test(tok) ? 8 : 0; // lean into the upper notes
    out.push(note(pitch, t, d, vel + phrasePeak - (i === 0 ? 10 : 0)));
    t++;
  });
  return out;
};
const L1 = "G3 C4 F4 G4 - G4 B4 E5 D5 - - - - B4 E5 D5 - - - - B4 E5 D5 - - -".split(" ");
const L2 = "G3 C4 F4 G4 - E5 G4 C5 B4 - - - - G4 C5 B4 - - - - G4 C5 B4 - - -".split(" ");
tracks.melody = [
  ...parseLine(L1, 33, 0, 70),      // section B, bar 9 beat 2
  ...parseLine(L2, 65, 0, 76),      // section C
  // section D: the motifs return an octave up, quiet, like a memory
  note("B5", 100, 1, 52), note("E6", 101, 1, 56), note("D6", 102, 5, 50),
  note("G5", 116, 1, 48), note("C6", 117, 1, 52), note("B5", 118, 6, 46),
];

// ── Strings: slow counter-line under themes 2 + dissolve ─
tracks.strings = [
  ["C4", 64], ["A3", 72], ["E4", 80], ["D4", 88],
  ["D4", 96], ["C4", 104], ["B3", 112], ["G#3", 120],
].map(([n, t], i) => note(n, t, 8, 60 + (i === 2 ? 8 : 0)));
// a high harmonic that shimmers over section C only
tracks.strings.push(note("E5", 68, 12, 40), note("G5", 84, 10, 38));

// ── Sparkle: sparse, drip-like high chord tones (deterministic pseudo-random) ─
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const RHYTHMS = [
  [0.5, 3.25, 5.75, 8.5, 10, 13.25, 14.75],
  [1, 2.75, 6.5, 9.25, 11.5, 14],
  [0.75, 4.5, 7.25, 10.5, 12.75],
  [2, 5.25, 8.75, 12, 15.25],
];
tracks.sparkle = [];
CHORDS.forEach((c, i) => {
  const t0 = i * 16;
  const sec = Math.floor(t0 / 32);
  let rhythm = RHYTHMS[i % 4];
  if (sec === 1 || sec === 2) rhythm = rhythm.filter((_, k) => k % 2 === 0); // make room for melody
  let prev = -1;
  rhythm.forEach((off) => {
    let tone; do tone = c.tones[Math.floor(rnd() * c.tones.length)]; while (tone === prev && c.tones.length > 1);
    prev = tone;
    const oct = rnd() < 0.3 ? 6 : 5;
    tracks.sparkle.push(note(`${tone}${oct}`, t0 + off, Math.min(1.5, LOOP - t0 - off), 38 + rnd() * 26));
  });
});

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
for (const [k, v] of Object.entries(tracks)) {
  if (v.some((n) => n.start_time + n.duration > LOOP + 1e-6)) throw new Error(`${k} overruns loop`);
  writeFileSync(new URL(`./out/${k}.json`, import.meta.url), JSON.stringify(v));
  console.log(k, v.length);
}
