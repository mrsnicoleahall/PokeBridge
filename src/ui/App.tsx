import { useMemo, useRef, useState } from 'react';
import { readSource, transferToGen5Box, type SourceMon } from '../transfer/transfer';
import { loadGen5, type Gen5Save } from '../saves/gen5';
import { readSpecies } from '../codec/pk5';
import { spriteUrl, spriteFallbackUrl } from './sprites';

type SourceGame = { id: string; label: string; gen: number; maxDex: number; ready: boolean };

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
const BOX_COUNT = 24;

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

  const [save, setSave] = useState<Gen5Save | null>(null);
  const [targetName, setTargetName] = useState('');
  const [targetHandle, setTargetHandle] = useState<any>(null); // FileSystemFileHandle, for in-place SD save
  const [box, setBox] = useState(0);
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
      setSave(loadGen5(bytes));
      setTargetName(file.name);
      setTargetHandle(handle);
      setBox(0);
      flash(handle ? `Loaded ${file.name} — savable to the SD in place` : `Loaded destination: ${file.name}`);
    } catch (e) {
      flash(`Not a valid Black/White 2 save: ${(e as Error).message}`);
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
    const pick = mon[selected]!;
    transferToGen5Box(save, box, slot, game.gen, pick.data, { nickname: pick.nickname, otName: pick.otName });
    setMoved((m) => new Set(m).add(pick.pid));
    setSelected(null);
    bump((v) => v + 1);
    flash(`Sent ${pick.nickname || `#${pick.species}`} → Box ${box + 1}`);
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          POKé<span>BRIDGE</span>
        </div>
        <p className="tagline">Move your Pokémon up the chain — Gen 1·2·3·4 → Black / White</p>
      </header>

      <ol className="steps">
        <li><b>1</b> Pick your old game &amp; load its save</li>
        <li><b>2</b> Load your Black 2 / White 2 save</li>
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
              <div className="grid mon-grid">
                {mon.map((m, i) => (
                  <button
                    key={`${m.pid}-${i}`}
                    className={`mon ${selected === i ? 'sel' : ''} ${moved.has(m.pid) ? 'moved' : ''}`}
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
            <h2>Black 2 / White 2</h2>
            {save && (
              <button className="ghost" onClick={saveOut}>
                {targetHandle ? '✓ Save to SD (in place)' : HAS_FSA ? '↓ Save to SD…' : '↓ Download save'}
              </button>
            )}
          </div>

          {!save ? (
            <>
              <button className="drop" onClick={() => (HAS_FSA ? openTargetFromDisk() : dstInput.current?.click())}>
                Load Black 2 / White 2 .sav
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
                ↳ On a CFW 2DS, this save lives next to the ROM in <code>/roms/nds/</code> (or
                <code> /saves/</code>, per your TWiLightMenu++ setting). Save back there and load it on the console.
              </p>
              <div className="box-nav">
                <button onClick={() => setBox((b) => (b + BOX_COUNT - 1) % BOX_COUNT)}>‹</button>
                <span>Box {box + 1}</span>
                <button onClick={() => setBox((b) => (b + 1) % BOX_COUNT)}>›</button>
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
                      {occupant ? <Sprite dex={readSpecies(occupant)} size={48} /> : <span className="slot-dot" />}
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
