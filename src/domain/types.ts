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
  trip: { name: string; start: string; end: string; currency?: string; people?: number }; // dates YYYY-MM-DD ('' until set); currency = home currency for cost totals
  /** Exchange rates for cost totals: 1 unit of `base` = rates[X] units of X. */
  rates?: Rates;
  locations: Location[];
  days: Record<string, DayOverride>; // keyed by date, may sit outside the trip range
  items: Item[];
  flights: Flight[];
  stays: Stay[];
  legs: TransportLeg[]; // phase 4; always present so it slots in without a migration
  /** Checklist: things to do before you go (no date) and on a trip day. */
  tasks: Task[];
  /** Trip-wide settings that sync with the trip. */
  settings?: TripSettings;
}

/** A checklist item. With `date` it belongs to that trip day; without, it's "before you go" (optionally `by` a date). */
export interface Task {
  id: string;
  text: string;
  done?: boolean;
  date?: string;
  by?: string;
}

export interface TripSettings {
  /**
   * Your Google Maps browser key, synced through the Gist by choice so every device gets it. It must be
   * website-restricted, API-restricted and quota-capped (see the README). Left out of exports by default.
   * The GitHub token is never part of the trip.
   */
  googleMapsKey?: string;
}

export interface Money { amount: number; currency: string; perPerson?: boolean }
export interface Rates { base: string; date: string; rates: Record<string, number>; manual?: string[] }

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

/** A place's name and address in the local language (e.g. Japanese), for showing a taxi driver. Copied, never translated. */
export interface LocalText {
  name?: string;
  address?: string;
}

export interface Item {
  id: string;
  locationId: string;
  kind: ItemKind;
  title: string;
  place?: Place;
  /** Name and address in the local language. */
  local?: LocalText;
  phone?: string;
  link?: string;
  notes?: string;
  price?: Money;
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
  price?: Money;
  /** Airline booking / manage-trip link. */
  link?: string;
}

export interface Stay {
  id: string;
  name: string;
  locationId?: string;
  address: string;
  place?: Place;
  /** Name and address in the local language. */
  local?: LocalText;
  phone?: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  status: Status;
  conf: string;
  /** Old free-text cost that couldn't be read as an amount (kept as a note). */
  cost: string;
  price?: Money;
  link: string;
  notes: string;
}

export type TransportMode = 'train' | 'bus' | 'ferry' | 'car' | 'transfer' | 'other';

/** A transport booking other than a flight: train, bus, ferry, car hire, transfer. */
export interface TransportLeg {
  id: string;
  mode: TransportMode;
  /** Operator / service, e.g. "JR Hokkaido · Super Hokuto 3". */
  operator: string;
  /** Typed end points, e.g. "Sapporo Stn" → "Rusutsu Resort". */
  fromName: string;
  toName: string;
  /** Local-language name/address of each end (station, pick-up point). */
  fromLocal?: LocalText;
  toLocal?: LocalText;
  /** Trip locations at each end; when they differ this is a travel day (like a flight). */
  fromLocationId?: string;
  toLocationId?: string;
  date: string;
  depTime: string;
  arrDate: string; // '' = same day
  arrTime: string;
  duration: string;
  status: Status;
  conf: string;
  price?: Money;
  /** Old free-text cost (kept as a note). */
  cost: string;
  link: string;
  notes: string;
  /** Optional link to an activity or place to eat: getting there, or getting back. */
  itemId?: string;
  itemRole?: 'to' | 'from';
}
