import { useState } from 'react';
import type { DayInfo } from '../domain/derive';
import { LocDisplay, type ColorOf } from './ui';

/** Day location: shows the chip, tap to edit; manual days get "reset to auto". */
export function InlineLoc({ info, colorOf, onSet, onReset }: { info: DayInfo; colorOf: ColorOf; onSet: (a: string, b: string) => void; onReset: () => void }) {
  const [edit, setEdit] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const open = () => { setA(info.loc?.a.id ? info.loc.a.name : ''); setB(info.loc?.b?.id ? info.loc.b.name : ''); setEdit(true); };
  const save = () => { if (a.trim()) onSet(a.trim(), b.trim()); else onReset(); setEdit(false); };
  if (edit) {
    return (
      <form className="inline-loc" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input list="known-locs" value={a} onChange={(e) => setA(e.target.value)} placeholder="Location" autoFocus onKeyDown={(e) => e.key === 'Escape' && setEdit(false)} />
        <span className="arrow">→</span>
        <input list="known-locs" value={b} onChange={(e) => setB(e.target.value)} placeholder="(to, optional)" onKeyDown={(e) => e.key === 'Escape' && setEdit(false)} />
        <button className="btn primary sm" type="submit">Set</button>
        <button className="btn ghost sm" type="button" onClick={() => setEdit(false)}>Cancel</button>
      </form>
    );
  }
  return (
    <span className="loc-edit">
      <LocDisplay loc={info.loc} colorOf={colorOf} size="lg" onClick={open} />
      {info.loc && <span className={'tag ' + (info.loc.manual ? 'manual' : 'auto')} title={info.loc.manual ? 'Set by hand' : 'Worked out from stays and flights'}>{info.loc.manual ? 'manual' : 'auto'}</span>}
      {info.loc?.manual && <button className="link sm" onClick={onReset}>reset to auto</button>}
      <button className="icon sm" onClick={open} aria-label="Edit location">✎</button>
    </span>
  );
}
