// The whole trip is one JSON document held in a single reducer, with the last 20 changes kept for undo.
import { useCallback, useEffect, useReducer, useState } from 'react';
import { emptyDoc } from './domain/normalize';
import type { TripDoc } from './domain/types';
import { loadLocal, saveLocal } from './sync/local';

const UNDO_LIMIT = 20;
interface State { doc: TripDoc; past: TripDoc[] }
type Action =
  | { type: 'update'; fn: (d: TripDoc) => TripDoc | void }
  | { type: 'replace'; doc: TripDoc }
  | { type: 'undo' }
  | { type: 'load'; doc: TripDoc }      // a copy from the Gist: taken as-is, not an edit, clears undo
  | { type: 'setRev'; rev: number };    // after saving to the Gist

const stamp = (next: TripDoc, prev: TripDoc) => ({ ...next, updatedAt: Math.max(Date.now(), prev.updatedAt + 1) });

function reducer(s: State, a: Action): State {
  const push = (next: TripDoc) => ({ doc: stamp(next, s.doc), past: [...s.past, s.doc].slice(-UNDO_LIMIT) });
  switch (a.type) {
    case 'replace': return push({ ...a.doc, rev: s.doc.rev }); // an import is a local edit on top of what's synced
    case 'load': return { doc: a.doc, past: [] };
    case 'setRev': return { ...s, doc: { ...s.doc, rev: a.rev } };
    case 'update': {
      const draft = structuredClone(s.doc);
      const next = a.fn(draft) || draft;
      return push({ ...next, rev: s.doc.rev });
    }
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { doc: { ...stamp(prev, s.doc), rev: s.doc.rev }, past: s.past.slice(0, -1) };
    }
  }
}

export type Update = (fn: (d: TripDoc) => TripDoc | void) => void;

export function useTripStore() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ doc: loadLocal() || emptyDoc(), past: [] }));
  const { doc } = state;
  const [storageOk, setStorageOk] = useState(true);
  useEffect(() => {
    if (doc.updatedAt === 0) return; // untouched empty trip: nothing to save yet
    setStorageOk(saveLocal(doc));
  }, [doc]);
  const update: Update = useCallback((fn) => dispatch({ type: 'update', fn }), []);
  const replace = useCallback((d: TripDoc) => dispatch({ type: 'replace', doc: d }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const load = useCallback((d: TripDoc) => dispatch({ type: 'load', doc: d }), []);
  const setRev = useCallback((rev: number) => dispatch({ type: 'setRev', rev }), []);
  return { doc, update, replace, undo, load, setRev, canUndo: state.past.length > 0, storageOk };
}
