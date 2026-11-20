/**
 * Footprints: the places on the globe on the Misc page.
 *
 * The places themselves are in footprints.json, next to this file. To add one, add a
 * line there and push. Each place has:
 *
 *   place     the city's name
 *   country   its country
 *   lat, lon  its position in degrees (north and east positive; look the city up on any
 *             map and copy its coordinates)
 *   when      a year, or a month and year. Leave it out if you would rather not say.
 *   kind      decides the dot's colour and which filter shows it:
 *               "conference"  a conference or academic visit
 *               "base"        somewhere lived, studied or worked
 *               "trip"        a personal trip, or where a postcard came from
 *   purpose   the few words shown after the country: the conference's name, "Studying",
 *             "Traveling" and so on. Keep it that short, so the list reads evenly.
 *   photo     optional: the address of a picture to show when the place is picked, for
 *             example one already uploaded for the photo wall (https://photos.wenjia.me/...).
 *
 * The list is shown in the file's order, so keep the newest first. A mistake in the file
 * (a missing field, a kind that does not exist) stops the build and says which entry.
 */
import { z } from 'astro/zod';
import { check } from '../lib/data';
import data from './footprints.json';

const kinds = ['conference', 'base', 'trip'] as const;
export type FootprintKind = (typeof kinds)[number];

const footprint = z.object({
  place: z.string().min(1),
  country: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  // a year may be written with or without quotes
  when: z
    .union([z.string(), z.number()])
    .transform((value) => String(value))
    .optional(),
  kind: z.enum(kinds),
  purpose: z.string().min(1),
  photo: z.url().optional(),
});
export type Footprint = z.infer<typeof footprint>;

export const footprints: Footprint[] = check(z.array(footprint), data, 'src/data/footprints.json');

/** How each kind is named on the filter buttons, and which pixel icon stands for it. */
export const footprintKinds: Record<FootprintKind, { label: string; icon: 'scroll' | 'cap' | 'map' }> = {
  conference: { label: 'Conferences', icon: 'scroll' },
  base: { label: 'Study & work', icon: 'cap' },
  trip: { label: 'Trips', icon: 'map' },
};
