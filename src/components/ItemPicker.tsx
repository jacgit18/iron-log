import { useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { CatalogItem, CatalogKind } from '../types.ts';
import { pickerOptions, type MineOption, type PickerChoice } from '../lib/picker.js';
import { useCatalogSearch, MIN_LETTERS } from '../hooks/useCatalogSearch.js';

/* Type a name and pick from your own items, the catalog, or a new one (ADR 036, spec inline-catalog-picker). An ARIA 1.2 combobox; the
   list sits in the page flow under the input, so a sheet never clips it. The input stays a plain controlled field: typing a name and
   saving without picking works as before. The picker only reports the choice; the caller adds or schedules it. */
type Props = {
  id: string;
  label: string;
  value: string;
  onText: (v: string) => void;
  onPick: (c: PickerChoice) => void;
  mine: MineOption[];
  /** More of yours: not listed, but their catalog duplicates are left out too (see pickerOptions). */
  also?: MineOption[];
  kind: CatalogKind;
  /** The grey line under a catalog item: equipment, muscle group, brand. */
  catalogMeta?: (c: CatalogItem) => string;
  /** The create row's text. No function: no create row (the caller has its own way to add a new one). */
  createLabel?: (name: string) => string;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
};

type Opt = { key: string; choice: PickerChoice; name: string; meta?: string; badge?: string };

export default function ItemPicker({ id, label, value, onText, onPick, mine, also, kind, catalogMeta, createLabel, placeholder, maxLength, autoFocus }: Props) {
  const [open, setOpen] = useState(false);
  // The highlighted option, by key, so results arriving from the server do not move the highlight to another item.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const byBrand = kind === 'supplement';
  const { state: cat, retry } = useCatalogSearch(kind, value, open);
  const o = pickerOptions(value, mine, cat.status === 'ready' ? cat.items : [], { byBrand, serverFiltered: byBrand, also });

  const mineOpts: Opt[] = o.mine.shown.map(m => ({ key: `m-${m.id}`, choice: { kind: 'mine', id: m.id }, name: m.name, meta: m.meta, badge: m.badge }));
  const catOpts: Opt[] = o.catalog.shown.map(c => ({ key: `c-${c.id}`, choice: { kind: 'catalog', item: c }, name: c.name, meta: catalogMeta?.(c) }));
  const createOpt: Opt | null = o.create && createLabel ? { key: 'create', choice: { kind: 'create', name: o.create }, name: createLabel(o.create) } : null;
  const all = [...mineOpts, ...catOpts, ...(createOpt ? [createOpt] : [])];
  const optId = (n: number) => `${id}-opt-${n}`;
  const expanded = open && all.length > 0;
  const active = all.findIndex(x => x.key === activeKey); // -1: nothing highlighted, so Enter in the field still submits the sheet
  useEffect(() => { if (active >= 0) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' }); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (opt: Opt) => {
    const c = opt.choice;
    if (c.kind === 'mine') onText(opt.name);
    else if (c.kind === 'catalog') onText(c.item.name);
    else onText(c.name);
    setOpen(false);
    onPick(c);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!all.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = active < 0 ? (step > 0 ? 0 : all.length - 1) : (active + step + all.length) % all.length;
      setActiveKey(all[next]!.key);
    } else if (e.key === 'Enter' && expanded && active >= 0 && all[active]) {
      e.preventDefault(); pick(all[active]);
    } else if (e.key === 'Escape' && expanded) {
      // The first Escape closes the list; the next one is left to the sheet.
      e.preventDefault(); e.stopPropagation(); setOpen(false);
    } else if (e.key === 'Tab') setOpen(false);
  };
  // Focus moving to the picker's own Try again button keeps it open.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); };

  const typed = value.trim() !== '';
  const total = (g: { shown: unknown[]; hidden: number }) => g.shown.length + g.hidden;
  const catalogNote = !open || !typed ? null
    : cat.status === 'short' ? `Type at least ${MIN_LETTERS} letters to search the catalog.`
    : cat.status === 'loading' || (cat.status === 'ready' && cat.searching) ? 'Searching the catalog…'
    : cat.status === 'failed' ? (cat.reason === 'offline' ? 'The catalog needs a connection.' : cat.reason === 'refused' ? 'The catalog is not available to this account.' : 'The catalog could not be loaded.')
    : null;
  const status = !open ? '' : [
    `${total(o.mine)} of yours`,
    cat.status === 'ready' && typed ? `${total(o.catalog)}${cat.more ? '+' : ''} in the catalog` : catalogNote,
  ].filter(Boolean).join(', ');

  let n = 0;
  const row = (opt: Opt) => {
    const i = n++;
    return (
      <div key={opt.key} id={optId(i)} role="option" aria-selected={i === active} className={`pickopt${opt.choice.kind === 'create' ? ' create' : ''}`}
        onMouseDown={e => e.preventDefault()} onClick={() => pick(opt)} onMouseMove={() => { if (active !== i) setActiveKey(opt.key); }}>
        <span className="pickname">{opt.choice.kind === 'create' && <span aria-hidden="true">+ </span>}{opt.name}{opt.badge && <span className="pill custom">{opt.badge}</span>}</span>
        {opt.meta && <span className="note">{opt.meta}</span>}
      </div>
    );
  };
  const more = (h: number) => (h ? <div className="note picknote" aria-hidden="true">{h} more. Keep typing to narrow it down.</div> : null);

  return (
    <div className="picker" onBlur={onBlur}>
      <label className="field" htmlFor={id}>{label}
        <input id={id} type="text" role="combobox" autoComplete="off" value={value} placeholder={placeholder} maxLength={maxLength} autoFocus={autoFocus}
          aria-expanded={expanded} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={expanded && active >= 0 ? optId(active) : undefined}
          onFocus={() => setOpen(true)} onChange={e => { onText(e.target.value); setActiveKey(null); setOpen(true); }} onKeyDown={onKey} />
      </label>
      <div id={`${id}-list`} role="listbox" aria-label={label} className="picklist" hidden={!expanded}>
        {mineOpts.length > 0 && (
          <div role="group" aria-labelledby={`${id}-g-mine`}>
            <div className="sect" id={`${id}-g-mine`}>Yours</div>
            {mineOpts.map(row)}{more(o.mine.hidden)}
          </div>
        )}
        {catOpts.length > 0 && (
          <div role="group" aria-labelledby={`${id}-g-cat`}>
            <div className="sect" id={`${id}-g-cat`}>Catalog</div>
            {catOpts.map(row)}{more(o.catalog.hidden)}
          </div>
        )}
        {createOpt && <div role="group" aria-label="New">{row(createOpt)}</div>}
      </div>
      {catalogNote && (
        <div className="picknote">
          <span className={`note${cat.status === 'failed' ? ' err' : ''}`}>{catalogNote}</span>
          {cat.status === 'failed' && cat.reason !== 'refused' && <button type="button" className="btn sm ghost" onMouseDown={e => e.preventDefault()} onClick={retry}>Try again</button>}
        </div>
      )}
      <span className="vh" role="status" aria-live="polite">{status}</span>
    </div>
  );
}
