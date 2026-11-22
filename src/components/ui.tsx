import { useEffect, useState, type ReactNode, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { STATUSES, STATUS_LABEL } from '../domain/constants';
import type { Status } from '../domain/types';
import type { DayLoc, LocRef, Night, Derived } from '../domain/derive';

export type ColorOf = Derived['colorOf'];

export function LocChip({ loc, colorOf, size, onClick, title }: {
  loc: LocRef | null | undefined; colorOf: ColorOf; size?: string; onClick?: () => void; title?: string;
}) {
  if (!loc) return null;
  const c = colorOf(loc);
  return (
    <span className={'loc ' + (size || '')} style={{ background: c.bg, color: c.fg, borderColor: c.border }} onClick={onClick} title={title}>
      <i style={{ background: c.solid }} />{loc.name}
    </span>
  );
}

export function LocDisplay({ loc, colorOf, size, onClick }: {
  loc: { a: LocRef; b: LocRef | null } | DayLoc | null; colorOf: ColorOf; size?: string; onClick?: () => void;
}) {
  if (!loc) return <span className={'loc unplanned ' + (size || '')} onClick={onClick}>Unplanned</span>;
  return (
    <span className="locpair" onClick={onClick}>
      <LocChip loc={loc.a} colorOf={colorOf} size={size} />
      {loc.b && <><span className="arrow">→</span><LocChip loc={loc.b} colorOf={colorOf} size={size} /></>}
    </span>
  );
}

export function StatusPill({ value, onChange, small }: { value: Status; onChange?: (s: Status) => void; small?: boolean }) {
  const next = () => onChange && onChange(STATUSES[(STATUSES.indexOf(value) + 1) % STATUSES.length]);
  return (
    <button type="button" className={`pill st-${value} ${small ? 'sm' : ''}`} onClick={(e) => { e.stopPropagation(); next(); }}
      title={onChange ? 'Click to change status' : ''} disabled={!onChange}>
      {STATUS_LABEL[value]}
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  // Rendered at the page level so no parent (e.g. the blurred sticky header) can clip it.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + (wide ? 'wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-h"><h3>{title}</h3><button className="icon" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export const Field = ({ label, children, hint, span }: { label: string; children: ReactNode; hint?: ReactNode; span?: boolean }) => (
  <label className={'field ' + (span ? 'span' : '')}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <div className="seg">
      {STATUSES.map((s) => (
        <button type="button" key={s} className={value === s ? `on st-${s}` : ''} onClick={() => onChange(s)}>{STATUS_LABEL[s]}</button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([k, label]) => (
        <button type="button" key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

/** Small form-state helper: bind('field') gives value/onChange for an input. */
export function useForm<T extends object>(initial: T) {
  const [f, setF] = useState<T>(initial);
  const bind = (k: keyof T & string, tf?: (v: string) => string) => ({
    value: (f[k] as unknown as string | undefined) ?? "",
    onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: tf ? tf(e.target.value) : e.target.value })),
  });
  return [f, setF, bind] as const;
}

export function ConfirmDel({ onDelete, label = 'Delete' }: { onDelete: () => void; label?: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn danger ghost" onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="confirm">Sure? <button className="btn danger" onClick={onDelete}>{label}</button>
      <button className="btn ghost" onClick={() => setAsk(false)}>Keep</button></span>
  );
}

export function NightBadge({ night, onClick }: { night: Night; onClick?: (e: MouseEvent) => void }) {
  switch (night.kind) {
    case 'end': return <span className="night end">Trip ends</span>;
    case 'plane': return <span className="night plane">✈ Night on plane</span>;
    case 'none': return <span className="night none" onClick={onClick}>NO STAY</span>;
    default:
      return (
        <span className={`night st-${night.kind}`} onClick={onClick} title={`${night.stay.name || 'Stay'} — ${STATUS_LABEL[night.kind]}`}>
          <b>{STATUS_LABEL[night.kind]}</b> {night.stay.name || 'Stay'}{night.count > 1 ? ` +${night.count - 1}` : ''}
        </span>
      );
  }
}

export const cssVars = (v: Record<string, string | undefined>) => v as CSSProperties;
