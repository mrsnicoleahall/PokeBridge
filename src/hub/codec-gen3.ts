// Gen 3 ⇄ Mon codec. Reads a decrypted 80-byte PK3 into the canonical hub object and writes one back.
// The save layer (Gen3Save.setBoxSlot) handles re-encryption and checksums; this is pure field mapping.
//
// Faithfully carried both ways: PID, OT ID, species, exp, friendship, moves + current PP + PP-ups, IVs,
// ability slot (the Gen 3 ability bit), EVs, nickname, OT name. Gen-3-only cosmetics (contest stats,
// ribbons, pokérus, met location/ball) are not part of the neutral hub and are not preserved across it —
// the same fields a real cross-gen transfer drops or re-defaults.

import { PK3_SIZE } from '../codec/pk3';
import { gen3InternalToNational, nationalToGen3Internal } from '../convert/gen3-species';
import { decodeGen3Text, encodeGen3Text } from '../convert/gen3-text';
import { abilityIdFor } from '../convert/abilities';
import type { Mon } from './mon';

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

export function gen3ReadMon(pk3: Uint8Array): Mon {
  if (pk3.length !== PK3_SIZE) throw new Error(`expected a ${PK3_SIZE}-byte decrypted PK3`);
  const s = dv(pk3);
  const pid = s.getUint32(0x00, true);
  const national = gen3InternalToNational(s.getUint16(0x20, true));
  const iv = s.getUint32(0x48, true);
  const abilityBit = (iv >>> 31) & 1;
  const ppUpByte = pk3[0x28]!;

  return {
    pid,
    nationalDex: national,
    form: 0, // Gen 3 alternate forms (Unown/Deoxys/etc.) are a later refinement
    otName: decodeGen3Text(pk3, 0x14, 7),
    otId: s.getUint32(0x04, true),
    nickname: decodeGen3Text(pk3, 0x08, 10),
    language: pk3[0x12] || 2,
    originGen: 3,
    // IV dword order is HP, Atk, Def, Spe, SpA, SpD → hub order HP, Atk, Def, SpA, SpD, Spe.
    ivs: [iv & 0x1f, (iv >>> 5) & 0x1f, (iv >>> 10) & 0x1f, (iv >>> 20) & 0x1f, (iv >>> 25) & 0x1f, (iv >>> 15) & 0x1f],
    // EV bytes order HP, Atk, Def, Spe, SpA, SpD → hub order HP, Atk, Def, SpA, SpD, Spe.
    evs: [pk3[0x38]!, pk3[0x39]!, pk3[0x3a]!, pk3[0x3c]!, pk3[0x3d]!, pk3[0x3b]!],
    moves: [s.getUint16(0x2c, true), s.getUint16(0x2e, true), s.getUint16(0x30, true), s.getUint16(0x32, true)],
    movePP: [pk3[0x34]!, pk3[0x35]!, pk3[0x36]!, pk3[0x37]!],
    ppUps: [ppUpByte & 3, (ppUpByte >> 2) & 3, (ppUpByte >> 4) & 3, (ppUpByte >> 6) & 3],
    ability: abilityIdFor(national, abilityBit),
    abilitySlot: abilityBit,
    nature: pid % 25,
    gender: 0, // Gen 3 derives gender from the PID; not separately stored (refinement: gender-ratio table)
    exp: s.getUint32(0x24, true),
    friendship: pk3[0x29]!,
    heldItem: s.getUint16(0x22, true),
  };
}

export function gen3WriteMon(mon: Mon): Uint8Array {
  const p = new Uint8Array(PK3_SIZE);
  const d = dv(p);

  d.setUint32(0x00, mon.pid >>> 0, true);
  d.setUint32(0x04, mon.otId >>> 0, true);
  p.set(encodeGen3Text(mon.nickname, 10), 0x08);
  p[0x12] = mon.language ?? 2;
  p.set(encodeGen3Text(mon.otName, 7), 0x14);

  // Growth substructure
  d.setUint16(0x20, nationalToGen3Internal(mon.nationalDex), true);
  d.setUint16(0x22, 0, true); // held item dropped (Gen 3 item ids differ from later gens)
  d.setUint32(0x24, mon.exp >>> 0, true);
  const pu = mon.ppUps ?? [0, 0, 0, 0];
  p[0x28] = (pu[0]! & 3) | ((pu[1]! & 3) << 2) | ((pu[2]! & 3) << 4) | ((pu[3]! & 3) << 6);
  p[0x29] = mon.friendship & 0xff;

  // Attacks substructure
  for (let i = 0; i < 4; i++) d.setUint16(0x2c + i * 2, mon.moves[i]!, true);
  for (let i = 0; i < 4; i++) p[0x34 + i] = mon.movePP[i]! & 0xff;

  // EVs (Gen 3 order: HP, Atk, Def, Spe, SpA, SpD)
  p[0x38] = mon.evs[0]!; p[0x39] = mon.evs[1]!; p[0x3a] = mon.evs[2]!;
  p[0x3b] = mon.evs[5]!; p[0x3c] = mon.evs[3]!; p[0x3d] = mon.evs[4]!;

  // Misc substructure: IV dword (HP, Atk, Def, Spe, SpA, SpD) + ability bit (bit 31). Egg bit left 0.
  const slot = (mon.abilitySlot ?? 0) & 1;
  const iv =
    (((mon.ivs[0]! & 0x1f)) |
      ((mon.ivs[1]! & 0x1f) << 5) |
      ((mon.ivs[2]! & 0x1f) << 10) |
      ((mon.ivs[5]! & 0x1f) << 15) |
      ((mon.ivs[3]! & 0x1f) << 20) |
      ((mon.ivs[4]! & 0x1f) << 25) |
      (slot << 31)) >>> 0;
  d.setUint32(0x48, iv, true);

  // checksum at 0x1C is set by encryptPk3 when the save layer stores this mon.
  return p;
}
