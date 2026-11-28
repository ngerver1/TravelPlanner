// A checklist: tick items off, add one, remove one. "Before you go" items can have a "by" date.
import { useState } from 'react';
import { fmtLong, todayStr } from '../domain/dates';
import type { Task } from '../domain/types';
import { DateInput } from './inputs';

export interface TaskActions {
  add: (text: string, where: { date?: string; by?: string }) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
}

/** Not done first (earliest "by" first, then the rest in the order added), done last. */
export const sortTasks = (list: Task[]) => [...list].sort((a, b) =>
  Number(!!a.done) - Number(!!b.done) || (a.by || '9999').localeCompare(b.by || '9999'));

export function TaskList({ tasks, actions, date, withBy, placeholder = 'Add a to-do', compact }: {
  tasks: Task[]; actions: TaskActions; date?: string; withBy?: boolean; placeholder?: string; compact?: boolean;
}) {
  const [text, setText] = useState('');
  const [by, setBy] = useState('');
  const today = todayStr();
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    actions.add(text.trim(), date ? { date } : by ? { by } : {});
    setText(''); setBy('');
  };
  return (
    <div className={'tasks' + (compact ? ' compact' : '')}>
      {tasks.length > 0 && (
        <ul>
          {sortTasks(tasks).map((t) => {
            const late = !t.done && t.by && t.by < today;
            return (
              <li key={t.id} className={'task' + (t.done ? ' done' : '')}>
                <label>
                  <input type="checkbox" checked={!!t.done} onChange={() => actions.toggle(t.id)} />
                  <span className="task-text">{t.text}</span>
                </label>
                {t.by && <span className={'task-by small' + (late ? ' late' : '')}>{late ? 'overdue · ' : 'by '}{fmtLong(t.by)}</span>}
                <button type="button" className="icon sm task-x" aria-label={`Remove “${t.text}”`} onClick={() => actions.remove(t.id)}>✕</button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="task-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        {withBy && text.trim() && <DateInput value={by} onChange={(e) => setBy(e.target.value)} aria-label="By (optional)" className="task-date" />}
        <button className="btn sm" disabled={!text.trim()}>Add</button>
      </form>
    </div>
  );
}
