// Gen 4/5 linear congruential RNG used to encrypt Pokémon data blocks.
// state_{n+1} = (state_n * 0x41C64E6D + 0x6073) mod 2^32
// The block cipher XORs each 16-bit data word with the high 16 bits of each successive state.
//
// BigInt is used for the multiply: 0x41C64E6D * (up to 2^32) exceeds Number.MAX_SAFE_INTEGER,
// so plain `*` would lose precision.

const MULT = 0x41c64e6d;
const ADD = 0x6073;

export function lcrngNext(seed: number): number {
  // Math.imul does the 32-bit multiply without BigInt overhead; >>> 0 wraps mod 2^32.
  return (Math.imul(seed >>> 0, MULT) + ADD) >>> 0;
}

/** Infinite stream of the high-16-bit XOR keys produced by advancing `seed`. */
export function* lcrngStream(seed: number): Generator<number, never> {
  let s = seed >>> 0;
  while (true) {
    s = lcrngNext(s);
    yield (s >>> 16) & 0xffff;
  }
}
