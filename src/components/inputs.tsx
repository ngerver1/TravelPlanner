// Date and time fields that always show DD/MM/YYYY and 24-hour HH:MM, whatever the phone's settings.
// onChange receives an input-like event so they drop in where <input> was used; it only fires with
// a complete valid value ('YYYY-MM-DD' / 'HH:MM') or '' when cleared.
import { useEffect, useRef, useState } from 'react';
import { fmtDMY, maskDMY, maskTime, parseDMY, parseTime } from '../domain/dates';

type Change = (e: { target: { value: string } }) => void;
const emit = (onChange: Change, value: string) => onChange({ target: { value } });

export function DateInput({ value, onChange, min, max, className, ...rest }: {
  value: string; onChange: Change; min?: string; max?: string; className?: string; 'aria-label'?: string; autoFocus?: boolean;
}) {
  const [text, setText] = useState(fmtDMY(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { if (parseDMY(text) !== value) setText(fmtDMY(value)); /* eslint-disable-line */ }, [value]);
  const bad = text !== '' && !parseDMY(text);
  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  return (
    <span className={'dt-input' + (bad ? ' bad' : '') + (className ? ' ' + className : '')}>
      <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={text} maxLength={10} {...rest}
        onChange={(e) => {
          const t = maskDMY(e.target.value);
          setText(t);
          if (!t) emit(onChange, '');
          else { const iso = parseDMY(t); if (iso) emit(onChange, iso); }
        }}
        onBlur={() => { if (bad) setText(fmtDMY(value)); }} />
      <button type="button" className="dt-pick" onClick={openPicker} aria-label="Pick a date" tabIndex={-1}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M1.5 6.5h13M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </button>
      <input ref={picker} type="date" className="dt-native" tabIndex={-1} aria-hidden="true" value={value} min={min} max={max}
        onChange={(e) => { setText(fmtDMY(e.target.value)); emit(onChange, e.target.value); }} />
    </span>
  );
}

export function TimeInput({ value, onChange, className, ...rest }: {
  value: string; onChange: Change; className?: string; 'aria-label'?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => { if (parseTime(text) !== value) setText(value); /* eslint-disable-line */ }, [value]);
  const bad = text !== '' && !parseTime(text);
  return (
    <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} {...rest}
      className={(className || '') + ' tm-input' + (bad ? ' bad' : '')} value={text}
      onChange={(e) => {
        const t = maskTime(e.target.value);
        setText(t);
        if (!t) emit(onChange, '');
        else { const v = parseTime(t); if (v && t.length === 5) emit(onChange, v); }
      }}
      onBlur={() => {
        const v = parseTime(text);
        if (v) { setText(v); if (v !== value) emit(onChange, v); } else if (text) setText(value);
      }} />
  );
}
