import { memo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from './icons';

export type { IconName };

/**
 * THE ONE PLACE AN ICON IS DRAWN — 012/T005, FR-027 to FR-029.
 *
 * Until this component existed the application had NO icons at all: five
 * navigation destinations were an 8x8 `View` with a pill radius, a reaction was
 * the character `♥`, a comment count was a bare number after a middot. That
 * single fact explains more of the owner's "the UI is very bad" than every
 * skeleton and empty state in feature 012 combined, and none of the state work
 * touches it (012/R8).
 *
 * `every-action-has-an-icon.test.ts` fails the build if anything outside this
 * file draws one. That guard is what makes the set a set rather than sixteen
 * drawings that currently agree.
 */

/**
 * THREE SIZES, AND A FREE-FORM ONE IS NOT AVAILABLE.
 *
 * A `size?: number` prop is how a set stops being a set: the first screen that
 * needs "just a bit bigger" passes 22, the next passes 21, and within a feature
 * the product has an icon scale nobody decided on. These three come from the
 * artboards and each has one job.
 *
 * The union is the enforcement. Nothing here throws at runtime or clamps a bad
 * value, because a typecheck failure at the call site is the cheaper place to
 * find it — the same argument `theme.color.*` was DELETED under rather than
 * left exported and zeroed (006).
 */
export const ICON_SIZE = {
  /** Beside a count — a reaction total, a comment total. */
  count: 13,
  /** An action a finger presses — react, share, save, back, search, close. */
  action: 20,
  /** A navigation destination in the tab bar. */
  nav: 23,
} as const;

export type IconSizeName = keyof typeof ICON_SIZE;

/**
 * 1.75 on a 24-grid, round caps and joins, from `design/012-ui/_icons.txt`.
 *
 * Constants rather than props. A per-call stroke width is the borrowed-family
 * problem arriving from inside the house: sixteen icons that each match their
 * own screen and none of which match each other.
 */
const STROKE_WIDTH = 1.75;

export interface IconProps {
  name: IconName;
  /** One of three. There is deliberately no numeric escape hatch. */
  size?: IconSizeName;
  /**
   * The stroke colour. Required in practice via the call site's palette read —
   * `Text` inheriting black was the 006 defect that put near-black captions on
   * a near-black ground, and an icon defaulting to a colour nobody chose is the
   * same mistake in a shape that cannot be read at all.
   */
  color: string;
  /**
   * Decorative by default: an icon beside its own label or count is read twice
   * by a screen reader otherwise. Pass a label where the icon is the ONLY
   * meaning — a bare `more` or `close` control.
   */
  label?: string;
  /**
   * The ON state of a toggle — a reaction given, a post saved, a star awarded.
   *
   * A real requirement rather than an escape hatch, and the shipped product
   * proves it: the reaction control rendered `♥` against `♡`, saving rendered
   * `★` against `☆`, and a rating filled its stars left to right. Every one of
   * those is one idea in two states, so the alternative is a second icon name
   * per toggle and a set that is half duplicates.
   *
   * Fills the shape with the same colour and drops the stroke, so an outline
   * and its filled twin have the same silhouette — which is what makes the
   * change read as a state rather than as a different picture.
   */
  filled?: boolean;
  testID?: string;
}

function IconComponent({ name, size = 'action', color, label, filled = false, testID }: IconProps) {
  const px = ICON_SIZE[size];
  const elements = ICON_PATHS[name];

  return (
    <Svg
      width={px}
      height={px}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      fill="none"
      stroke={color}
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      testID={testID}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      // Without a label this is decoration beside text that already says it.
      accessibilityElementsHidden={label === undefined}
      importantForAccessibility={label === undefined ? 'no-hide-descendants' : 'yes'}
    >
      {elements.map((el, i) => {
        // `el.filled` is the path's own nature (the three dots of `more` are
        // discs, never outlines); `filled` is the caller's state.
        const solid = el.filled === true || filled;
        return el.kind === 'path' ? (
          <Path key={i} d={el.d} fill={solid ? color : 'none'} stroke={solid ? 'none' : color} />
        ) : (
          <Circle
            key={i}
            cx={el.cx}
            cy={el.cy}
            r={el.r}
            fill={solid ? color : 'none'}
            stroke={solid ? 'none' : color}
          />
        );
      })}
    </Svg>
  );
}

/**
 * Memoised because the feed renders one per card per action — and because
 * 007's crash was a `FlatList` prop whose identity changed every render. An
 * icon is pure in its props and there is no reason to redraw it.
 */
export const Icon = memo(IconComponent);
