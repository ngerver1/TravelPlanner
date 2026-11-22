// The whole trip is one JSON document held in a single reducer.
import { useCallback, useEffect, useReducer, useState } from 'react';
import { emptyDoc } from './domain/normalize';
import type { TripDoc } from './domain/types';
import { loadLocal, saveLocal } from './sync/local';

type Action = { type: 'update'; fn: (d: TripDoc) => TripDoc | void } | { type: 'replace'; doc: TripDoc };

function reducer(prev: TripDoc, a: Action): TripDoc {
  if (a.type === 'replace') return { ...a.doc, updatedAt: Math.max(Date.now(), prev.updatedAt + 1) };
  const draft = structuredClone(prev);
  const next = a.fn(draft) || draft;
  next.updatedAt = Math.max(Date.now(), prev.updatedAt + 1);
  return next;
}

export type Update = (fn: (d: TripDoc) => TripDoc | void) => void;

export function useTripStore() {
  const [doc, dispatch] = useReducer(reducer, undefined, () => loadLocal() || emptyDoc());
  const [storageOk, setStorageOk] = useState(true);
  useEffect(() => {
    if (doc.updatedAt === 0) return; // untouched empty trip: nothing to save yet
    setStorageOk(saveLocal(doc));
  }, [doc]);
  const update: Update = useCallback((fn) => dispatch({ type: 'update', fn }), []);
  const replace = useCallback((d: TripDoc) => dispatch({ type: 'replace', doc: d }), []);
  return { doc, update, replace, storageOk };
}
