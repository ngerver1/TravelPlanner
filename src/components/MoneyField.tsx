import { createContext, useContext } from 'react';
import { CURRENCIES, isCurrency } from '../domain/money';
import type { Money } from '../domain/types';
import { Field } from './ui';

/** Home currency and the currencies already used in the trip (listed first). */
export const CostContext = createContext<{ home: string; used: string[] }>({ home: 'AUD', used: [] });

export interface MoneyDraft { amount: string; currency: string; perPerson: boolean }
export const fromMoney = (m: Money | undefined, home: string): MoneyDraft =>
  m ? { amount: String(m.amount), currency: m.currency, perPerson: !!m.perPerson } : { amount: '', currency: home, perPerson: false };
export function toMoney(d: MoneyDraft): Money | undefined {
  const n = Number(d.amount.replace(/[, ]/g, ''));
  if (!d.amount.trim() || !isFinite(n) || n < 0 || !isCurrency(d.currency)) return undefined;
  return d.perPerson ? { amount: n, currency: d.currency, perPerson: true } : { amount: n, currency: d.currency };
}

export function MoneyField({ label = 'Cost', value, onChange, allowPerPerson = true, hint }: {
  label?: string; value: MoneyDraft; onChange: (v: MoneyDraft) => void; allowPerPerson?: boolean; hint?: string;
}) {
  const { home, used } = useContext(CostContext);
  const list = [...new Set([home, ...used, value.currency, ...CURRENCIES])].filter(isCurrency);
  const bad = value.amount.trim() !== '' && !toMoney(value);
  return (
    <Field label={label} span hint={bad ? 'Enter a number, e.g. 3000 or 45.50' : hint}>
      <span className="money">
        <input className={bad ? 'bad' : ''} inputMode="decimal" placeholder="Amount" value={value.amount} aria-label={`${label} amount`}
          onChange={(e) => onChange({ ...value, amount: e.target.value.replace(/[^\d.,]/g, '') })} />
        <select value={value.currency} onChange={(e) => onChange({ ...value, currency: e.target.value })} aria-label="Currency">
          {list.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {allowPerPerson && (
          <span className="seg sm">
            <button type="button" className={!value.perPerson ? 'on' : ''} onClick={() => onChange({ ...value, perPerson: false })}>total</button>
            <button type="button" className={value.perPerson ? 'on' : ''} onClick={() => onChange({ ...value, perPerson: true })}>per person</button>
          </span>
        )}
      </span>
    </Field>
  );
}
