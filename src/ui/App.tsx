import { useMemo, useRef, useState } from 'react';
import {
  readSource, transferManyToGen5, convertToGen5, isTransferableToGen5,
  transferManyToGen7, convertToGen7, isTransferableToGen7, type SourceMon,
} from '../transfer/transfer';
import { loadGen5, type Gen5Save } from '../saves/gen5';
import { loadGen7, type Gen7Save } from '../saves/gen7';
import { readSpecies } from '../codec/pk5';
import { readSpeciesPk7 } from '../codec/pk7';
import { spriteUrl, spriteFallbackUrl } from './sprites';

type SourceGame = { id: string; label: string; gen: number; maxDex: number; ready: boolean };
type DestGame = { id: string; label: string; gen: 5 | 7; boxes: number };
type AnySave = Gen5Save | Gen7Save;

const DEST_GAMES: DestGame[] = [
  { id: 'gen5', label: 'Black / White / Black 2 / White 2', gen: 5, boxes: 24 },
  { id: 'gen7', label: 'Ultra Sun / Ultra Moon', gen: 7, boxes: 32 },
];

const SOURCE_GAMES: SourceGame[] = [
  { id: 'bw', label: 'Black / White / Black 2 / White 2', gen: 5, maxDex: 649, ready: true },
  { id: 'dppt', label: 'Diamond / Pearl / Platinum', gen: 4, maxDex: 493, ready: true },
  { id: 'hgss', label: 'HeartGold / SoulSilver', gen: 4, maxDex: 493, ready: true },
  { id: 'gba', label: 'Ruby / Sapphire / Emerald / FR / LG  (Gen 3)', gen: 3, maxDex: 386, ready: true },
  { id: 'gsc', label: 'Gold / Silver / Crystal  (Gen 2)', gen: 2, maxDex: 251, ready: true },
  { id: 'rby', label: 'Red / Blue / Yellow  (Gen 1)', gen: 1, maxDex: 151, ready: true },
];

const BOX_COLS = 6;
const SLOTS_PER_BOX = 30;

// File System Access API lets us write the save straight back to the SD card, in place.
const HAS_FSA = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

const readFile = (file: File): Promise<Uint8Array> =>
  file.arrayBuffer().then((b) => new Uint8Array(b));

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Sprite({ dex, size = 64 }: { dex: number; size?: number }) {
  const [src, setSrc] = useState(spriteUrl(dex));
  return (
    <img
      className="sprite"
      src={src}
      width={size}
      height={size}
      alt={`#${dex}`}
      onError={() => src !== spriteFallbackUrl(dex) && setSrc(spriteFallbackUrl(dex))}
    />
  );
}

export function App() {
  const [game, setGame] = useState<SourceGame>(SOURCE_GAMES[0]!);
  const [mon, setMon] = useState<SourceMon[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [moved, setMoved] = useState<Set<number>>(new Set());

  const [destGame, setDestGame] = useState<DestGame>(DEST_GAMES[0]!);
  const [save, setSave] = useState<AnySave | null>(null);
  const [targetName, setTargetName] = useState('');
  const [targetHandle, setTargetHandle] = useState<any>(null); // FileSystemFileHandle, for in-place SD save
  const [box, setBox] = useState(0);

  // Destination-generation dispatch (Gen 5 vs Gen 7) — same shapes, different formats.
  const dest = destGame.gen === 7
    ? {
        convert: convertToGen7,
        ok: (pk: Uint8Array) => isTransferableToGen7(pk),
        many: (s: AnySave, gen: number, items: SourceMon[], b: number) => transferManyToGen7(s as Gen7Save, gen, items, b),
        species: readSpeciesPk7,
      }
    : {
        convert: convertToGen5,
        ok: (pk: Uint8Array) => isTransferableToGen5(pk),
        many: (s: AnySave, gen: number, items: SourceMon[], b: number) => transferManyToGen5(s as Gen5Save, gen, items, b),
        species: readSpecies,
      };
  const [, bump] = useState(0); // force re-read after a mutation
  const [toast, setToast] = useState('');

  const srcInput = useRef<HTMLInputElement>(null);
  const dstInput = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  async function loadSource(file: File) {
    try {
      const bytes = await readFile(file);
      const list = readSource(bytes, game.gen);
      setMon(list);
      setSourceName(file.name);
      setSelected(null);
      setMoved(new Set());
      flash(`Found ${list.length} Pokémon in ${file.name}`);
    } catch (e) {
      flash(`Couldn't read that save: ${(e as Error).message}`);
    }
  }

  async function loadTarget(file: File, handle: any = null) {
    try {
      const bytes = await readFile(file);
      setSave(destGame.gen === 7 ? loadGen7(bytes) : loadGen5(bytes));
      setTargetName(file.name);
      setTargetHandle(handle);
      setBox(0);
      flash(handle ? `Loaded ${file.name} — savable to the SD in place` : `Loaded destination: ${file.name}`);
    } catch (e) {
      flash(`Not a valid ${destGame.label} save: ${(e as Error).message}`);
    }
  }

  // Open the Black 2 save off the SD card with a writable handle (so "Save to SD" writes in place).
  async function openTargetFromDisk() {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'DS save', accept: { 'application/octet-stream': ['.sav', '.dsv', '.dst', '.bin'] } }],
      });
      await loadTarget(await handle.getFile(), handle);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') flash(`Couldn't open: ${(e as Error).message}`);
    }
  }

  // Write the modified save back — in place to the SD if we have a handle, else picker/download.
  async function saveOut() {
    if (!save) return;
    const bytes = save.toBytes();
    try {
      if (targetHandle) {
        const w = await targetHandle.createWritable();
        await w.write(bytes as unknown as BufferSource);
        await w.close();
        return flash('✓ Saved back to the SD card, in place — load it on your 2DS');
      }
      if (HAS_FSA) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: targetName || 'black2.sav',
          types: [{ accept: { 'application/octet-stream': ['.sav'] } }],
        });
        const w = await handle.createWritable();
        await w.write(bytes as unknown as BufferSource);
        await w.close();
        setTargetHandle(handle);
        return flash('✓ Saved');
      }
      download(bytes, (targetName || 'black2').replace(/\.sav$/i, '') + ' (PokeBridge).sav');
      flash('Downloaded — drop it on your SD card');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') flash(`Save failed: ${(e as Error).message}`);
    }
  }

  const slots = useMemo(() => (save ? save.box(box) : []), [save, box]);

  function placeInSlot(slot: number) {
    if (!save) return flash('Load your Black 2 save on the right first.');
    if (selected == null) return flash('Pick a Pokémon on the left first.');
    if (slots[slot]) return flash('That slot is taken — pick an empty one.');
    const idx = selected;
    const pick = mon[idx]!;
    const rec = dest.convert(game.gen, pick.data, { nickname: pick.nickname, otName: pick.otName });
    const label = pick.nickname || `#${pick.species}`;
    if (!dest.ok(rec)) {
      return flash(`${label} can’t transfer up — the games don’t allow it. Skipped.`);
    }
    (save as any).setBoxSlot(box, slot, rec);
    setMoved((m) => new Set(m).add(idx));
    setSelected(null);
    bump((v) => v + 1);
    flash(`Sent ${label} → Box ${box + 1}`);
  }

  function transferAll() {
    if (!save) return flash('Load your Black 2 / White 2 save on the right first.');
    const pending = mon.map((m, i) => ({ m, i })).filter(({ i }) => !moved.has(i));
    if (pending.length === 0) return flash('Nothing left to transfer.');
    const { placed, skipped } = dest.many(save, game.gen, pending.map((p) => p.m), box);
    const handled = placed + skipped.length;
    setMoved((prev) => {
      const next = new Set(prev);
      for (let k = 0; k < handled; k++) next.add(pending[k]!.i);
      return next;
    });
    setSelected(null);
    bump((v) => v + 1);
    const skipNote = skipped.length ? ` · skipped ${skipped.length} that can’t transfer up` : '';
    const leftover = pending.length - handled;
    flash(
      leftover > 0
        ? `Transferred ${placed}${skipNote} — boxes full, ${leftover} left`
        : `Transferred ${placed}${skipNote} ✓`,
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          POKé<span>BRIDGE</span>
        </div>
        <p className="tagline">Move your Pokémon up the chain — Gen 1–5 → Black/White or Ultra Sun/Moon</p>
      </header>

      <ol className="steps">
        <li><b>1</b> Pick your old game &amp; load its save</li>
        <li><b>2</b> Pick &amp; load your destination save (Gen 5 or Ultra Sun/Moon)</li>
        <li><b>3</b> Click a Pokémon, then an empty box slot</li>
        <li><b>4</b> Download — your original file is never touched</li>
      </ol>

      <main className="bridge">
        {/* ----------------------------- SOURCE ----------------------------- */}
        <section className="panel source">
          <div className="panel-head">
            <h2>Source game</h2>
            <select
              value={game.id}
              onChange={(e) => {
                const g = SOURCE_GAMES.find((x) => x.id === e.target.value)!;
                setGame(g);
                setMon([]);
                setSourceName('');
              }}
            >
              {SOURCE_GAMES.map((g) => (
                <option key={g.id} value={g.id} disabled={!g.ready}>
                  {g.label}{g.ready ? '' : '  — coming soon'}
                </option>
              ))}
            </select>
          </div>

          {game.ready ? (
            <>
              <button className="drop" onClick={() => srcInput.current?.click()}>
                {sourceName ? <span className="loaded">◈ {sourceName}</span> : 'Load source .sav'}
              </button>
              <input
                ref={srcInput}
                type="file"
                accept=".sav,.dsv,.dst,.bin"
                hidden
                onChange={(e) => e.target.files?.[0] && loadSource(e.target.files[0])}
              />
              {mon.length > 0 && (
                <div className="bulk-row">
                  <span>{mon.length} Pokémon · {moved.size} sent</span>
                  <button className="bulk-btn" onClick={transferAll} disabled={!save || moved.size >= mon.length}>
                    Transfer all →
                  </button>
                </div>
              )}
              <div className="grid mon-grid">
                {mon.map((m, i) => (
                  <button
                    key={`${i}-${m.species}`}
                    className={`mon ${selected === i ? 'sel' : ''} ${moved.has(i) ? 'moved' : ''}`}
                    onClick={() => setSelected(i)}
                    title={`#${m.species}`}
                  >
                    <Sprite dex={m.species} />
                    <span className="mon-name">{m.nickname || `#${m.species}`}</span>
                  </button>
                ))}
                {mon.length === 0 && <p className="empty-note">No Pokémon loaded yet.</p>}
              </div>
            </>
          ) : (
            <p className="empty-note">Support for {game.label} is coming next.</p>
          )}
        </section>

        {/* ---------------------------- TRANSFER ---------------------------- */}
        <div className="conduit" aria-hidden>
          <span className={selected != null ? 'arrow live' : 'arrow'}>➜</span>
        </div>

        {/* --------------------------- DESTINATION -------------------------- */}
        <section className="panel target">
          <div className="panel-head">
            <h2>Destination</h2>
            {save ? (
              <button className="ghost" onClick={saveOut}>
                {targetHandle ? '✓ Save to SD (in place)' : HAS_FSA ? '↓ Save to SD…' : '↓ Download save'}
              </button>
            ) : (
              <select
                value={destGame.id}
                onChange={(e) => setDestGame(DEST_GAMES.find((x) => x.id === e.target.value)!)}
              >
                {DEST_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            )}
          </div>

          {!save ? (
            <>
              <button className="drop" onClick={() => (HAS_FSA ? openTargetFromDisk() : dstInput.current?.click())}>
                Load {destGame.label} .sav
              </button>
              <input
                ref={dstInput}
                type="file"
                accept=".sav,.dsv,.dst,.bin"
                hidden
                onChange={(e) => e.target.files?.[0] && loadTarget(e.target.files[0])}
              />
              <p className="empty-note">
                This is the only save PokeBridge writes to.
                {HAS_FSA ? ' Open it straight off your SD card and save back in place.' : ''}
              </p>
            </>
          ) : (
            <>
              <p className="sd-hint">
                {destGame.gen === 7 ? (
                  <>↳ For a CFW 3DS, back up the Ultra Sun/Moon save with <code>Checkpoint</code> / <code>JKSM</code>,
                  edit it here, then restore it — and use the in-game Bank/HOME link (whole boxes, no Transporter).</>
                ) : (
                  <>↳ On a CFW 2DS, this save lives next to the ROM in <code>/roms/nds/</code> (or
                  <code> /saves/</code>, per your TWiLightMenu++ setting). Save back there and load it on the console.</>
                )}
              </p>
              <div className="box-nav">
                <button onClick={() => setBox((b) => (b + destGame.boxes - 1) % destGame.boxes)}>‹</button>
                <span>Box {box + 1} / {destGame.boxes}</span>
                <button onClick={() => setBox((b) => (b + 1) % destGame.boxes)}>›</button>
              </div>
              <div className="grid box-grid" style={{ gridTemplateColumns: `repeat(${BOX_COLS}, 1fr)` }}>
                {Array.from({ length: SLOTS_PER_BOX }, (_, slot) => {
                  const occupant = slots[slot];
                  const armed = selected != null && !occupant;
                  return (
                    <button
                      key={slot}
                      className={`slot ${occupant ? 'full' : 'open'} ${armed ? 'armed' : ''}`}
                      onClick={() => placeInSlot(slot)}
                    >
                      {occupant ? <Sprite dex={dest.species(occupant)} size={48} /> : <span className="slot-dot" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
