import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadHubSave, enumerateMon, firstEmptySlot } from './saveio';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

describe('hub save I/O adapter', () => {
  it('enumerates real mon from a Gen 3 and a Gen 5 save uniformly', () => {
    expect(enumerateMon(loadHubSave(3, fixture('emerald.sav'))).length).toBeGreaterThan(0);
    expect(enumerateMon(loadHubSave(5, fixture('b2w2.sav'))).length).toBeGreaterThan(0);
  });

  it('places a Mon into an empty slot and finds it again after export+reload', () => {
    const src = enumerateMon(loadHubSave(3, fixture('emerald.sav')))[0]!.mon;
    const dest = loadHubSave(3, fixture('emerald.sav'));
    const spot = firstEmptySlot(dest)!;
    expect(spot).not.toBeNull();
    dest.place(spot.box, spot.slot, src);
    const reloaded = loadHubSave(3, dest.toBytes());
    expect(reloaded.slot(spot.box, spot.slot)?.nationalDex).toBe(src.nationalDex);
    expect(reloaded.slot(spot.box, spot.slot)?.pid).toBe(src.pid);
  });
});
