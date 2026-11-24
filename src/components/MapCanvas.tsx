// Leaflet map with OpenStreetMap tiles (CARTO basemaps, light or dark). No API key needed.
// Loaded lazily (only when a map is shown).
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface Pin {
  key: string; lat: number; lng: number; color: string; title: string;
  filled: boolean; stay?: boolean; number?: number; onClick?: () => void;
}

const dark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export default function MapCanvas({ pins, route, height = 420 }: { pins: Pin[]; route?: boolean; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark() ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(m);
    m.setView([35.68, 139.76], 4);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (route && pins.length > 1) L.polyline(pins.map((p) => [p.lat, p.lng] as [number, number]), { color: '#667085', weight: 2.5, dashArray: '5 6', opacity: 0.8 }).addTo(g);
    for (const p of pins) {
      const html = p.stay
        ? `<span class="pin-stay" style="border-color:${p.color}">🛏</span>`
        : p.number != null
          ? `<span class="pin-num" style="background:${p.color}">${p.number}</span>`
          : `<span class="pin-dot${p.filled ? '' : ' hollow'}" style="border-color:${p.color};${p.filled ? `background:${p.color}` : ''}"></span>`;
      const size = p.stay ? 26 : p.number != null ? 24 : 16;
      const mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ html, className: 'pin', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), title: p.title, keyboard: true });
      mk.bindTooltip(esc(p.title), { direction: 'top', offset: [0, -size / 2] });
      if (p.onClick) mk.on('click', p.onClick);
      mk.addTo(g);
    }
    const fit = () => {
      m.invalidateSize();
      if (pins.length === 1) m.setView([pins[0].lat, pins[0].lng], 14);
      else if (pins.length) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
    };
    fit();
    const t = setTimeout(fit, 120); // again once the container has its final size
    return () => clearTimeout(t);
  }, [pins, route]);

  return <div ref={el} className="mapcanvas" style={{ height }} />;
}
