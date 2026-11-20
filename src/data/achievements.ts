/**
 * Life achievements, drawn on the Misc page as an advancement tree. This is a small
 * preview; the plan is a fuller, interactive version later.
 *
 * The idea and part of the code are borrowed from He Geng's life-achievements
 * (https://github.com/genghe02/life-achievements), with thanks.
 *
 * The achievements themselves are in achievements.json, next to this file, in the same
 * shape as the tree on the page:
 *
 *   "story"       the main line, in order: each entry is a chapter (middle school, high
 *                 school, university, ...), and the achievements unlocked from it are
 *                 nested in its "children" (which may have children of their own)
 *   "sideQuests"  moments that are not part of that line
 *
 * Each achievement has:
 *
 *   title, description   what is shown on the board
 *   done                 true once unlocked; false shows it as locked
 *   icon                 one of the pixel icons in pixel-icons.ts: pickaxe, axe, sword,
 *                        book, gem, star, cap, cup, map, mic, note, news, scroll
 *   when                 optional: the year it was unlocked
 *   xp                   optional: the experience it is worth once unlocked (default 100)
 *   secret               optional: true hides the title and description of a locked one
 *   children             optional: achievements unlocked from this one
 *
 * A mistake in the file (a missing field, an icon that does not exist) stops the build
 * and says which entry.
 */
import { z } from 'astro/zod';
import { check } from '../lib/data';
import { ICONS, type PixelIcon } from './pixel-icons';
import data from './achievements.json';

export interface Achievement {
  title: string;
  description: string;
  /** Year it was unlocked; leave it out if you would rather not say. */
  when?: string;
  /** Experience this achievement is worth once unlocked (default 100). */
  xp?: number;
  done: boolean;
  secret?: boolean;
  /** One of the pixel icons in pixel-icons.ts. */
  icon: PixelIcon;
  children?: Achievement[];
}

const icons = Object.keys(ICONS) as [PixelIcon, ...PixelIcon[]];
const achievement: z.ZodType<Achievement> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    // a year may be written with or without quotes
    when: z
      .union([z.string(), z.number()])
      .transform((value) => String(value))
      .optional(),
    xp: z.number().positive().optional(),
    done: z.boolean(),
    secret: z.boolean().optional(),
    icon: z.enum(icons),
    children: z.array(achievement).optional(),
  }),
);

const board = check(z.object({ story: z.array(achievement), sideQuests: z.array(achievement) }), data, 'src/data/achievements.json');

export const story: Achievement[] = board.story;
export const sideQuests: Achievement[] = board.sideQuests;
