// ============================================================
// VibeVault – Deterministic pseudo-random helpers
// Used so simulated market data is stable across launches.
// ============================================================

/** 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG: returns a generator of floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic noise in [0, 1) for a (seed, n) pair. */
export function noise01(seed: number, n: number): number {
  return mulberry32((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n, 0xc2b2ae35)) >>> 0)();
}
