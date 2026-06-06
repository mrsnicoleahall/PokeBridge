// Gen 4/5 Pokémon data is split into four 32-byte blocks (canonical A,B,C,D) which are
// stored in one of 24 orders determined by the PID. The order index is bits 13–17 of the
// PID, taken mod 24.
//
// BLOCK_ORDERS[sv][p] = the canonical block index (A=0,B=1,C=2,D=3) stored at file position p.

const BLOCK_ORDERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1],
  [1, 0, 2, 3], [1, 0, 3, 2], [1, 2, 0, 3], [1, 2, 3, 0], [1, 3, 0, 2], [1, 3, 2, 0],
  [2, 0, 1, 3], [2, 0, 3, 1], [2, 1, 0, 3], [2, 1, 3, 0], [2, 3, 0, 1], [2, 3, 1, 0],
  [3, 0, 1, 2], [3, 0, 2, 1], [3, 1, 0, 2], [3, 1, 2, 0], [3, 2, 0, 1], [3, 2, 1, 0],
];

export function blockOrderIndex(pid: number): number {
  return ((pid >>> 13) & 0x1f) % 24;
}

type Quad<T> = [T, T, T, T];

// The same 24-permutation table is used by Gen 3 (substructures, index = PID % 24) and
// Gen 4/5 (data blocks, index = blockOrderIndex(pid)). The ByOrder forms take the index directly.

/** Rearrange stored (on-disk) order back to canonical, given the order index (0–23). */
export function unshuffleByOrder<T>(stored: Quad<T>, orderIndex: number): Quad<T> {
  const order = BLOCK_ORDERS[orderIndex]!;
  const canonical = new Array<T>(4) as Quad<T>;
  for (let p = 0; p < 4; p++) canonical[order[p]!] = stored[p]!;
  return canonical;
}

/** Rearrange canonical blocks into stored (on-disk) order, given the order index (0–23). */
export function shuffleByOrder<T>(canonical: Quad<T>, orderIndex: number): Quad<T> {
  const order = BLOCK_ORDERS[orderIndex]!;
  const stored = new Array<T>(4) as Quad<T>;
  for (let p = 0; p < 4; p++) stored[p] = canonical[order[p]!]!;
  return stored;
}

/** Gen 4/5: rearrange stored block order back to canonical A,B,C,D. */
export function unshuffleBlocks<T>(stored: Quad<T>, pid: number): Quad<T> {
  return unshuffleByOrder(stored, blockOrderIndex(pid));
}

/** Gen 4/5: rearrange canonical A,B,C,D blocks into the stored order for this PID. */
export function shuffleBlocks<T>(canonical: Quad<T>, pid: number): Quad<T> {
  return shuffleByOrder(canonical, blockOrderIndex(pid));
}
