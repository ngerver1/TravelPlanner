// The full-screen "Show local" card: a place's name and address in the local language, big, black on white,
// to show a taxi driver or a local. Works offline (it only uses the trip's saved data).
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { guessLang, telHref, wrapPieces, type LocalCardData } from '../domain/local';

// ---------- the one setting (this device only) ----------
const LANDSCAPE_KEY = 'tripPlanner.localLandscape';
export function loadLandscape(): boolean { try { return localStorage.getItem(LANDSCAPE_KEY) !== '0'; } catch { return true; } }
export function saveLandscape(on: boolean) { try { if (on) localStorage.removeItem(LANDSCAPE_KEY); else localStorage.setItem(LANDSCAPE_KEY, '0'); } catch { /* ignore */ } }

export { cardFor } from '../domain/local';

// ---------- opening it from anywhere ----------
const Ctx = createContext<(d: LocalCardData) => void>(() => {});
export const useShowLocal = () => useContext(Ctx);

export function LocalCardProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<LocalCardData | null>(null);
  const show = useCallback((d: LocalCardData) => setCard(d), []);
  const close = useCallback(() => setCard(null), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {card && <LocalCard data={card} onClose={close} />}
    </Ctx.Provider>
  );
}

/** The 文 button. Shows nothing when the place has no local text. */
export function LocalButton({ data, label, className }: { data?: LocalCardData; label?: string; className?: string }) {
  const show = useShowLocal();
  if (!data || !(data.name || data.address)) return null;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <button type="button" className={'local-btn' + (label ? ' labelled' : '') + (className ? ' ' + className : '')}
      title="Show the local name and address" aria-label={label || 'Show local name and address'}
      onClick={(e) => { e.stopPropagation(); show(data); }} onPointerDown={stop} onTouchStart={stop}>
      <span className="lb-glyph" lang="ja" aria-hidden="true">文</span>{label && <span>{label}</span>}
    </button>
  );
}

// ---------- the card ----------
/** Largest font size (px) at which the element's text fits its box, without breaking words; if even the
 *  smallest size can't fit a long word, allow breaking inside it. */
function fitText(el: HTMLElement, max: number, min = 14) {
  const fits = (widthToo: boolean) => el.scrollHeight <= el.clientHeight + 1 && (!widthToo || el.scrollWidth <= el.clientWidth + 1);
  const search = (widthToo: boolean) => {
    let lo = min, hi = max, best = min;
    for (let i = 0; i < 14 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (fits(widthToo)) { best = mid; lo = mid; } else hi = mid;
    }
    el.style.fontSize = `${Math.floor(best)}px`;
    return fits(widthToo);
  };
  el.classList.remove('force-wrap');
  if (!search(true)) { el.classList.add('force-wrap'); search(false); }
}

const Wrapped = ({ text }: { text: string }) => <>{wrapPieces(text).map((p, i) => <Fragment key={i}>{i > 0 && <wbr />}{p}</Fragment>)}</>;

/** Whether to draw the card sideways: the phone is upright and the setting is on. The phone's own rotation is never changed. */
const sideways = () => loadLandscape() && innerHeight > innerWidth;

function LocalCard({ data, onClose }: { data: LocalCardData; onClose: () => void }) {
  const inner = useRef<HTMLDivElement>(null), nameEl = useRef<HTMLDivElement>(null), addrEl = useRef<HTMLDivElement>(null);
  const lang = guessLang(`${data.name || ''} ${data.address || ''}`, data.lang);
  const [rotated, setRotated] = useState(sideways);
  const [awake, setAwake] = useState(false);
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ y: number; x: number } | null>(null);

  // Back button: the card is a history entry, so Back closes it. Closing it ourselves goes back too.
  const requestClose = useCallback(() => { if ((history.state as { localCard?: boolean } | null)?.localCard) history.back(); else onClose(); }, [onClose]);
  useEffect(() => {
    if (!(history.state as { localCard?: boolean } | null)?.localCard) history.pushState({ ...(history.state || {}), localCard: true }, '');
    const pop = () => onClose();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    const resize = () => setRotated(sideways());
    window.addEventListener('popstate', pop);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('keydown', key); window.removeEventListener('resize', resize); };
  }, [onClose, requestClose]);

  // Keep the screen on while it's open (where the browser supports it).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null, alive = true;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    const get = () => { wl?.request('screen').then((l) => { if (alive) { lock = l; setAwake(true); } else l.release().catch(() => {}); }, () => {}); };
    get();
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}); };
  }, []);

  // Text as large as fits, again whenever the screen turns or resizes.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const run = () => {
      const unit = Math.min(el.clientWidth, el.clientHeight);
      const n = nameEl.current;
      if (n) {
        // Size the name inside its share of the card, then give the address any room the name doesn't use.
        n.style.flexBasis = ''; n.style.maxHeight = '';
        fitText(n, unit * (data.address ? 0.2 : 0.3));
        if (data.address) { n.style.maxHeight = `${n.clientHeight}px`; n.style.flexBasis = 'auto'; }
      }
      if (addrEl.current) fitText(addrEl.current, unit * 0.2);
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    document.fonts?.ready.then(run, () => {});
    return () => ro.disconnect();
  }, [data, rotated]);

  // Swipe "down" as the card reads: drawn sideways, that is towards the left edge of the upright screen.
  const along = (t: { y: number; x: number }, x: number, y: number) => (rotated ? { down: t.x - x, across: Math.abs(y - t.y) } : { down: y - t.y, across: Math.abs(x - t.x) });
  const move = drag ? `translateY(${drag}px)` : '';
  return createPortal(
    <div className="lcard" role="dialog" aria-label={`${data.english}: local name and address`} data-awake={awake ? 'on' : 'off'} data-rotated={rotated ? 'yes' : 'no'}
      onTouchStart={(e) => { touch.current = { y: e.touches[0].clientY, x: e.touches[0].clientX }; }}
      onTouchMove={(e) => { const t = touch.current; if (t) setDrag(Math.max(0, along(t, e.touches[0].clientX, e.touches[0].clientY).down)); }}
      onTouchEnd={(e) => {
        const t = touch.current; touch.current = null;
        const m = t ? along(t, e.changedTouches[0].clientX, e.changedTouches[0].clientY) : { down: 0, across: 0 };
        setDrag(0);
        if (m.down > 90 && m.across < 80) requestClose();
      }}>
      <div ref={inner} className={'lc-in' + (rotated ? ' rotated' : '') + (data.name && data.address ? '' : ' single')}
        style={{ transform: (rotated ? 'translateX(100vw) rotate(90deg) ' : '') + move || undefined, opacity: drag ? Math.max(0.4, 1 - drag / 400) : undefined }}>
        <button type="button" className="lc-close" onClick={requestClose} aria-label="Close">✕</button>
        {data.name && <div ref={nameEl} className="lc-name" lang={lang}><Wrapped text={data.name} /></div>}
        {data.address && <div ref={addrEl} className="lc-addr" lang={lang}><Wrapped text={data.address} /></div>}
        <div className="lc-foot">
          <span className="lc-en">{data.english}</span>
          {data.phone && <a className="lc-phone" href={telHref(data.phone)} onTouchStart={(e) => e.stopPropagation()}>📞 {data.phone}</a>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
