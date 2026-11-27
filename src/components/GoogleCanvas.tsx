// The trip map on Google Maps (your own key): the same pins as before, drawn as HTML on a Google map.
// Loaded only when the Map is opened.
import { useEffect, useRef, useState } from 'react';
import { iconSvg } from './Icons';
import { googleAuthError, loadGoogle } from '../sync/google';
export interface Pin {
  key: string; lat: number; lng: number; color: string; title: string;
  filled: boolean; stay?: boolean; number?: number; onClick?: () => void;
}

const dark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
};

function pinHtml(p: Pin): { html: string; size: number } {
  const size = p.stay ? 26 : p.number != null ? 24 : 16;
  const html = p.stay
    ? `<span class="pin-stay" style="border-color:${p.color};color:${p.color}">${iconSvg('stay', 15, 2.2)}</span>`
    : p.number != null
      ? `<span class="pin-num" style="background:${p.color}">${p.number}</span>`
      : `<span class="pin-dot${p.filled ? '' : ' hollow'}" style="border-color:${p.color};${p.filled ? `background:${p.color}` : ''}"></span>`;
  return { html, size };
}

/** One pin as an HTML overlay (needs no Map ID or extra setup in Google Cloud). */
function makePin(p: Pin): google.maps.OverlayView {
  const { html, size } = pinHtml(p);
  const pos = new google.maps.LatLng(p.lat, p.lng);
  const div = document.createElement('div');
  div.className = 'pin gpin';
  div.title = p.title;
  div.setAttribute('role', 'button');
  div.setAttribute('aria-label', p.title);
  div.style.cssText = `position:absolute;width:${size}px;height:${size}px;cursor:pointer`;
  div.innerHTML = html;
  if (p.onClick) div.addEventListener('click', (e) => { e.stopPropagation(); p.onClick!(); });
  const o = new google.maps.OverlayView();
  o.onAdd = () => { o.getPanes()?.overlayMouseTarget.appendChild(div); };
  o.draw = () => {
    const pt = o.getProjection()?.fromLatLngToDivPixel(pos);
    if (pt) { div.style.left = `${pt.x - size / 2}px`; div.style.top = `${pt.y - size / 2}px`; }
  };
  o.onRemove = () => div.remove();
  return o;
}

export default function GoogleCanvas({ pins, route, height = 420 }: { pins: Pin[]; route?: boolean; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const shown = useRef<(google.maps.OverlayView | google.maps.Polyline)[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    const onAuth = () => setErr(googleAuthError());
    window.addEventListener('google-auth-failed', onAuth);
    loadGoogle().then(async () => {
      if (!live || !el.current) return;
      const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
      map.current = new Map(el.current, {
        center: { lat: 35.68, lng: 139.76 }, zoom: 4, gestureHandling: 'cooperative', clickableIcons: false,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        colorScheme: dark() ? 'DARK' : 'LIGHT',
      } as google.maps.MapOptions);
      setReady(true);
      if (googleAuthError()) onAuth();
    }, (e: Error) => live && setErr(e.message));
    return () => { live = false; window.removeEventListener('google-auth-failed', onAuth); };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    shown.current.forEach((o) => o.setMap(null));
    shown.current = [];
    if (route && pins.length > 1) {
      const line = new google.maps.Polyline({ path: pins.map((p) => ({ lat: p.lat, lng: p.lng })), strokeColor: '#667085', strokeOpacity: 0.8, strokeWeight: 2.5 });
      line.setMap(m); shown.current.push(line);
    }
    for (const p of pins) { const o = makePin(p); o.setMap(m); shown.current.push(o); }
    if (pins.length === 1) { m.setCenter({ lat: pins[0].lat, lng: pins[0].lng }); m.setZoom(14); }
    else if (pins.length) {
      const b = new google.maps.LatLngBounds();
      pins.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      m.fitBounds(b, 30);
      google.maps.event.addListenerOnce(m, 'idle', () => { if ((m.getZoom() ?? 0) > 15) m.setZoom(15); });
    }
  }, [pins, route, ready]);

  return (
    <div className="mapcanvas gmapcanvas" style={{ height }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {err && <div className="map-err">{err}</div>}
      {!ready && !err && <div className="map-err muted">Loading Google Maps…</div>}
    </div>
  );
}
