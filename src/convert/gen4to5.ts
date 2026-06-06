// Gen 4 → Gen 5 Pokémon uplift (the official Poké Transfer transformation).
//
// PK4 and PK5 share the same 136-byte block layout and nearly all field offsets, so the
// conversion is a faithful copy plus the two Gen-5-only additions:
//   0x41  Nature — explicit in Gen 5; in Gen 4 it was derived as (PID % 25). Set it to match.
//   0x42  Flags  — hidden-ability / event flags, new in Gen 5. A Gen 4 mon has none → 0.
//
// Returns the DECRYPTED PK5; the checksum is (re)computed when it's encrypted on write.

import { PK5_SIZE } from '../codec/pk5';

export function convertGen4ToGen5(pk4Decrypted: Uint8Array): Uint8Array {
  if (pk4Decrypted.length !== PK5_SIZE) {
    throw new Error(`expected a ${PK5_SIZE}-byte decrypted PK4`);
  }
  const pk5 = pk4Decrypted.slice();
  const pid = new DataView(pk5.buffer, pk5.byteOffset).getUint32(0x00, true);
  pk5[0x41] = pid % 25; // Gen 5 nature byte = Gen 4 PID-derived nature
  pk5[0x42] = 0; // Gen 5 flags (hidden ability / event) — none carried from Gen 4
  return pk5;
}
