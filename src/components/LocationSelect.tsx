// A real dropdown of the trip's locations, plus "New location…". Replaces typing with suggestions,
// which doesn't work reliably on phones. Values are names; the app finds or creates the location on save.
import { createContext, useContext, useState } from 'react';

export const LocationNames = createContext<string[]>([]);
type Change = (e: { target: { value: string } }) => void;

export function LocationSelect({ value, onChange, emptyLabel = '— None —', autoFocus, 'aria-label': aria }: {
  value: string; onChange: Change; emptyLabel?: string; autoFocus?: boolean; 'aria-label'?: string;
}) {
  const names = useContext(LocationNames);
  const known = names.some((n) => n.toLowerCase() === value.trim().toLowerCase());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const emit = (v: string) => onChange({ target: { value: v } });
  if (adding) {
    const done = () => { if (draft.trim()) emit(draft.trim()); setAdding(false); setDraft(''); };
    return (
      <span className="locsel-new">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New location name" autoFocus aria-label="New location name"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') setAdding(false); }} />
        <button type="button" className="btn sm primary" onClick={done} disabled={!draft.trim()}>OK</button>
        <button type="button" className="btn sm ghost" onClick={() => setAdding(false)}>Cancel</button>
      </span>
    );
  }
  return (
    <select value={value} autoFocus={autoFocus} aria-label={aria}
      onChange={(e) => { if (e.target.value === '__new') setAdding(true); else emit(e.target.value); }}>
      <option value="">{emptyLabel}</option>
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
      {value && !known && <option value={value}>{value} (new)</option>}
      <option value="__new">+ New location…</option>
    </select>
  );
}
