// Gen 3 stores an *internal* species index, not the National Dex number.
// Kanto/Johto (1–251) line up 1:1; the 25 internal slots 252–276 are unused; Hoenn species occupy
// internal 277–411, which correspond to National 252–386 in order. So the map is a piecewise shift.

export function gen3InternalToNational(internal: number): number {
  if (internal >= 1 && internal <= 251) return internal;
  if (internal >= 277 && internal <= 411) return internal - 25;
  return 0; // unused (252–276) or out of range
}
