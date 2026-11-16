import type { Transition, Variants } from "framer-motion";

/**
 * Motion tokens. Curves are the strong custom ones from the design reference,
 * because the built-in `ease`/`ease-out` read soft rather than decisive.
 *
 * Rules this file encodes:
 * - routine UI stays under 300ms
 * - an entrance is ease-out (fast start feels responsive), never ease-in
 * - exits are faster than entrances
 * - stagger delays stay between 30 and 80ms and never block interaction
 */
export const EASE = {
  /** Entrances, transform hover. */
  enter: [0.22, 1, 0.36, 1],
  /** Slides and anything moving on screen. */
  move: [0.25, 1, 0.5, 1],
  /** Press feedback. */
  press: [0.25, 0.46, 0.45, 0.94],
  /** Colour and opacity only. */
  colour: "ease",
} as const;

export const DURATION = {
  press: 0.12,
  state: 0.2,
  enter: 0.24,
  exit: 0.16,
  page: 0.3,
} as const;

export const STAGGER_STEP = 0.04;

/** Page content: a short crossfade per route change. Opacity only, because the
 *  dashboard already staggers its own cards and one entrance per container is
 *  the rule. */
export const pageEnter: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.page, ease: EASE.enter } },
};

/** Container that cascades its children. Decorative, never blocks input. */
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1, transition: { staggerChildren: STAGGER_STEP } },
};

/** Child of `staggerContainer`. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.enter, ease: EASE.enter } },
};

/** Something that needs attention arriving late (a warning banner). */
export const slideDown: Variants = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.state, ease: EASE.enter } },
};

/** Press feedback shared by tiles and buttons wrapped in motion. */
export const tapScale = { scale: 0.98 } as const;

export const pressTransition: Transition = { duration: DURATION.press, ease: EASE.press };
