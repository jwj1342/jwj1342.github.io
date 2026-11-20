/**
 * Footprints: the places on the globe on the Misc page. To add one, add an entry here
 * and deploy. `lat` and `lon` are in degrees (north and east positive; look a city up
 * on any map and copy its coordinates).
 *
 * `kind` decides the dot's colour and which filter shows it:
 *   'conference'  a conference or academic visit
 *   'base'        somewhere lived, studied or worked
 *   'trip'        a personal trip, or where a postcard came from
 *
 * `purpose` is the few words shown after the country: the conference's name,
 * "Studying", "Traveling" and so on. Keep it that short, so the list reads evenly.
 *
 * `photo` is optional: the address of a picture to show when the place is picked, for
 * example one already uploaded for the photo wall (https://photos.wenjia.me/...).
 */
export type FootprintKind = 'conference' | 'base' | 'trip';

export interface Footprint {
  place: string;
  country: string;
  lat: number;
  lon: number;
  /** A year, or a month and year. Leave it out if you would rather not say. */
  when?: string;
  kind: FootprintKind;
  purpose: string;
  photo?: string;
}

/** Newest first. */
export const footprints: Footprint[] = [
  { place: 'Budapest', country: 'Hungary', lat: 47.4979, lon: 19.0402, when: '2026', kind: 'conference', purpose: 'EMNLP 2026' },
  { place: 'Vienna', country: 'Austria', lat: 48.2082, lon: 16.3738, when: '2026', kind: 'trip', purpose: 'Traveling' },
  { place: 'Prague', country: 'Czechia', lat: 50.0755, lon: 14.4378, when: '2026', kind: 'trip', purpose: 'Traveling' },
  { place: 'San Diego', country: 'United States', lat: 32.7157, lon: -117.1611, when: '2026', kind: 'conference', purpose: 'ACL 2026' },
  { place: 'Los Angeles', country: 'United States', lat: 34.0522, lon: -118.2437, when: '2026', kind: 'trip', purpose: 'Traveling' },
  { place: 'San Francisco', country: 'United States', lat: 37.7749, lon: -122.4194, when: '2026', kind: 'trip', purpose: 'Traveling' },
  { place: 'Beijing', country: 'China', lat: 39.9042, lon: 116.4074, kind: 'base', purpose: 'Working' },
  { place: 'Hangzhou', country: 'China', lat: 30.2741, lon: 120.1551, when: '2024', kind: 'base', purpose: 'Studying' },
  { place: 'Kaifeng', country: 'China', lat: 34.7972, lon: 114.3076, when: '2021', kind: 'base', purpose: 'Studying' },
];

/** How each kind is named on the filter buttons, and which pixel icon stands for it. */
export const footprintKinds: Record<FootprintKind, { label: string; icon: 'scroll' | 'cap' | 'map' }> = {
  conference: { label: 'Conferences', icon: 'scroll' },
  base: { label: 'Study & work', icon: 'cap' },
  trip: { label: 'Trips', icon: 'map' },
};
