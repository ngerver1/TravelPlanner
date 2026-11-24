// An embedded Google map (the classic keyless embed). Shows one place, or directions through several.
import { embedDirections, embedPlace } from '../domain/maps';

export function GoogleMap({ query, route, mode, height = 220, title = 'Google map' }: {
  query?: string; route?: string[]; mode?: 'transit' | 'walking' | 'driving'; height?: number; title?: string;
}) {
  const src = route ? embedDirections(route, mode) : query ? embedPlace(query) : null;
  if (!src) return null;
  return (
    <iframe className="gmap" src={src} title={title} height={height} loading="lazy"
      referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
  );
}
