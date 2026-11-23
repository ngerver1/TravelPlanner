// v2 trip document. The whole trip is one JSON document (trip.json).

export type Status = 'idea' | 'planned' | 'booked';
export type Slot = 'morning' | 'afternoon' | 'evening';
export type Meal = 'breakfast' | 'lunch' | 'dinner';
export type ActivityCategory = 'sight' | 'activity' | 'shopping' | 'coffee' | 'nightlife' | 'other';
export type ItemSize = 'quick' | 'half' | 'full';
export type ItemKind = 'activity' | 'restaurant';

export interface TripDoc {
  schema: 2;
  rev: number;
  updatedAt: number;
  trip: { name: string; start: string; end: string }; // YYYY-MM-DD ('' until set)
  locations: Location[];
  days: Record<string, DayOverride>; // keyed by date, may sit outside the trip range
  items: Item[];
  flights: Flight[];
  stays: Stay[];
  legs: TransportLeg[]; // phase 4; always present so it slots in without a migration
}

export interface Location {
  id: string;
  name: string;
  colorIndex?: number;
  place?: Place;
}

export interface DayOverride {
  locationId?: string;
  toLocationId?: string;
  notes?: string;
}

export interface Place {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  mapsUrl?: string;
}

export interface Item {
  id: string;
  locationId: string;
  kind: ItemKind;
  title: string;
  place?: Place;
  link?: string;
  notes?: string;
  /** Free text, e.g. "¥3,000 pp". */
  cost?: string;
  status: Status;
  mustDo?: boolean;
  done?: boolean;
  // activities only
  category?: ActivityCategory;
  size?: ItemSize;
  includesEvening?: boolean;
  // restaurants only
  meals?: Meal[];
  cuisine?: string;
  booking?: string;
  placements: Placement[]; // activities: 0 or 1; restaurants: any number
}

export interface Placement {
  date: string;
  slot?: Slot;
  meal?: Meal;
  order: number;
  time?: string; // HH:MM
  chosen?: boolean;
}

export interface Flight {
  id: string;
  airline: string;
  flightNo: string;
  from: string; // IATA
  to: string;
  depDate: string;
  depTime: string;
  arrDate: string;
  arrTime: string;
  status: Status;
  conf: string;
  notes: string;
}

export interface Stay {
  id: string;
  name: string;
  locationId?: string;
  address: string;
  place?: Place;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  status: Status;
  conf: string;
  cost: string;
  link: string;
  notes: string;
}

export type TransportMode = 'train' | 'bus' | 'ferry' | 'car' | 'other';

export interface TransportLeg {
  id: string;
  mode: TransportMode;
  fromLocationId?: string;
  toLocationId?: string;
  date: string;
  depTime: string;
  arrTime: string;
  duration: string;
  operator: string;
  cost: string;
  status: Status;
  conf: string;
  notes: string;
}
