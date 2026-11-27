// Editor fields for a place's local-language name and address, with "Get local name" from Google Maps.
import { useState } from 'react';
import { guessLang, LANG_LABEL, langForPlace, type LocalLang } from '../domain/local';
import type { LocalText } from '../domain/types';
import { hasGoogle, localFromGooglePlaces } from '../sync/google';
import type { Pos } from './FindOnMap';

export function LocalFields({ name, address, onChange, english, context = '', pos = null, compact, label = 'Local name / address' }: {
  name: string; address: string; onChange: (p: { localName?: string; localAddress?: string }) => void;
  /** English name to look up, and the area/address it is in. */
  english: string; context?: string; pos?: Pos;
  /** Smaller, for each end of a transport booking. */
  compact?: boolean;
  label?: string;
}) {
  const [lang, setLang] = useState<LocalLang>(() => langForPlace(pos, `${english} ${context}`));
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<LocalText | null>(null);
  const [msg, setMsg] = useState('');
  const google = hasGoogle();
  const shownLang = guessLang(`${name}${address}`, lang);

  // One request per tap; the result is only shown, and fills the fields if you accept it.
  const look = async () => {
    setBusy(true); setFound(null); setMsg('');
    try {
      // The saved Google place in the local language, or a search by name near the map position.
      const g = await localFromGooglePlaces({ placeId: pos?.placeId, query: [english, context].filter(Boolean).join(', '), near: pos }, lang);
      if (g.local) setFound(g.local);
      else setMsg(g.found ? 'Google has no local-language name or address for it.' : 'Not found on Google Maps. Try adding the area, or paste it instead.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Couldn’t reach Google Maps. Check your connection, or paste the text instead.'); }
    finally { setBusy(false); }
  };
  const canLook = !!(english.trim() || pos);
  return (
    <div className={'field span local-fields' + (compact ? ' compact' : '')}>
      <span>{label} <span className="lb-glyph" lang="ja">文</span></span>
      <input lang={shownLang} value={name} onChange={(e) => onChange({ localName: e.target.value })} placeholder="Name in the local language, e.g. ザ・ウェスティン ルスツリゾート" aria-label="Local name" />
      <textarea lang={shownLang} rows={compact ? 1 : 2} value={address} onChange={(e) => onChange({ localAddress: e.target.value })} placeholder="Address in the local language, e.g. 〒048-1711 北海道虻田郡留寿都村泉川133" aria-label="Local address" />
      <span className="row gap wrap">
        <button type="button" className="btn sm" disabled={!google || !canLook || busy} onClick={look} title={google ? undefined : 'Needs a Google Maps key (Settings)'}>{busy ? 'Looking up…' : 'Get local name'}</button>
        <select value={lang} onChange={(e) => setLang(e.target.value as LocalLang)} aria-label="Local language" className="sm">
          {(Object.keys(LANG_LABEL) as LocalLang[]).map((l) => <option key={l} value={l} lang={l}>{LANG_LABEL[l]}</option>)}
        </select>
      </span>
      {found && (
        <span className="local-found">
          <span className="muted small">Found on Google Maps:</span>
          {found.name && <b lang={lang}>{found.name}</b>}
          {found.address && <span lang={lang}>{found.address}</span>}
          <span className="row gap">
            <button type="button" className="btn sm primary" onClick={() => { onChange({ localName: found.name || name, localAddress: found.address || address }); setFound(null); }}>Use this</button>
            <button type="button" className="btn sm ghost" onClick={() => setFound(null)}>Ignore</button>
          </span>
        </span>
      )}
      {msg && <small>{msg}</small>}
      {!google && <small>Get local name needs a Google Maps key: add it in Settings. Pasting always works.</small>}
      {google && !compact && !found && !msg && <small>Shown full screen to a taxi driver (文 button). Paste it from the booking or Google Maps, or look it up.</small>}
    </div>
  );
}
