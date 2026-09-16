/**
 * THE ICON SET — 012/T004, transcribed from `design/012-ui/_icons.txt`.
 *
 * SIXTEEN icons, and that number is the whole argument for hand-authored paths
 * over a library. `@expo/vector-icons` ships several thousand glyphs across a
 * dozen families; taking one would mean shipping a font for sixteen of them and
 * — the part that matters — accepting whatever that family's stroke weight and
 * corner treatment happen to be.
 *
 * 012/R8's finding was NOT "there are no icons". It was that the interface has
 * nothing to be consistent WITH: five navigation destinations drawn as an 8x8
 * dot, a reaction rendered as the character `♥`, a comment count as a bare
 * number. A borrowed family whose stroke disagrees with the type scale is that
 * same problem wearing better clothes.
 *
 * Every path is on a 24x24 grid and is drawn by `Icon.tsx` at stroke 1.75 with
 * round caps and joins. NOTHING ELSE MAY DRAW AN ICON — `every-action-has-an-
 * icon.test.ts` fails the build otherwise, which is the only way a set stays a
 * set.
 *
 * `heart` and `activity` are deliberately the same outline, as are `chats` and
 * `comment`: the artboards draw them that way, because a reaction and the
 * surface that lists reactions should read as the same idea.
 */

/** One drawable child of an icon, in the only two shapes the set uses. */
export type IconElement =
  | { kind: 'path'; d: string; filled?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; filled?: boolean };

/**
 * Every name the set defines, written out rather than inferred.
 *
 * `as const satisfies Record<string, readonly IconElement[]>` looks tidier and
 * is wrong here: it narrows each entry to its own literal shape, so `filled`
 * stops existing on the fifteen icons that do not carry it and `Icon.tsx`
 * cannot read it at all. An explicit union keeps the exhaustiveness — a name
 * added below without being added here is a typecheck failure, which is the
 * property that was wanted from `as const` in the first place.
 */
export type IconName =
  | 'home'
  | 'explore'
  | 'chats'
  | 'activity'
  | 'profile'
  | 'plus'
  | 'heart'
  | 'comment'
  | 'share'
  | 'save'
  | 'back'
  | 'search'
  | 'more'
  | 'close'
  | 'camera'
  | 'check'
  // Three beyond the artboards — see the note below.
  | 'play'
  | 'send'
  | 'star';

export const ICON_PATHS: Record<IconName, readonly IconElement[]> = {
  home: [{ kind: 'path', d: 'M3.6 10.2 12 3.8l8.4 6.4V20a1 1 0 0 1-1 1h-4.6v-6.1H9.2V21H4.6a1 1 0 0 1-1-1Z' }],
  explore: [{ kind: 'circle', cx: 12, cy: 12, r: 8.4 }, { kind: 'path', d: 'm15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5Z' }],
  chats: [{ kind: 'path', d: 'M20.4 12.6c0 3.7-3.5 6.7-7.9 6.7a9.6 9.6 0 0 1-2.6-.35L5.2 20.4l1.2-3.3a6.4 6.4 0 0 1-2.8-5.2c0-3.7 3.6-6.7 8-6.7s8.8 2.7 8.8 7.4Z' }],
  activity: [{ kind: 'path', d: 'M12 20.3s-7.3-4.4-7.3-9.2A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.3 2.9c0 4.8-7.3 9.2-7.3 9.2Z' }],
  profile: [{ kind: 'circle', cx: 12, cy: 8.2, r: 3.7 }, { kind: 'path', d: 'M4.9 20.3a7.1 7.1 0 0 1 14.2 0' }],
  plus: [{ kind: 'path', d: 'M12 5.6v12.8M5.6 12h12.8' }],
  heart: [{ kind: 'path', d: 'M12 20.3s-7.3-4.4-7.3-9.2A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.3 2.9c0 4.8-7.3 9.2-7.3 9.2Z' }],
  comment: [{ kind: 'path', d: 'M20.4 12.3c0 3.8-3.8 6.9-8.4 6.9a9.9 9.9 0 0 1-2.5-.3L4.8 20.4l1.3-3.5a6.5 6.5 0 0 1-2.5-5c0-3.8 3.8-6.9 8.4-6.9s8.4 3.1 8.4 6.9Z' }],
  share: [{ kind: 'path', d: 'M12 15.4V3.9m0 0L8.2 7.7M12 3.9l3.8 3.8' }, { kind: 'path', d: 'M5.2 13.4v5.7a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1v-5.7' }],
  save: [{ kind: 'path', d: 'M6.6 4.6h10.8v15.8L12 16.2l-5.4 4.2Z' }],
  back: [{ kind: 'path', d: 'M14.6 5.4 8 12l6.6 6.6' }],
  search: [{ kind: 'circle', cx: 11, cy: 11, r: 6.4 }, { kind: 'path', d: 'm15.8 15.8 4 4' }],
  more: [{ kind: 'circle', cx: 5.4, cy: 12, r: 1.5, filled: true }, { kind: 'circle', cx: 12, cy: 12, r: 1.5, filled: true }, { kind: 'circle', cx: 18.6, cy: 12, r: 1.5, filled: true }],
  close: [{ kind: 'path', d: 'M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6' }],
  camera: [{ kind: 'path', d: 'M3.6 8.6h3.3l1.5-2.2h7.2l1.5 2.2h3.3v10.3a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1Z' }, { kind: 'circle', cx: 12, cy: 13.6, r: 3.3 }],
  check: [{ kind: 'path', d: 'm5.4 12.4 4.2 4.2 9-9.2' }],

  /**
   * THREE ICONS THE ARTBOARDS DO NOT DRAW, ADDED DELIBERATELY AND RECORDED HERE.
   *
   * `design/012-ui/_icons.txt` defines sixteen, and they cover every control on
   * the twenty-four screens it draws. Three controls in the shipped product live
   * on screens it did not draw, and each was a character standing in for a
   * picture — which is the thing this whole feature exists to end:
   *
   *   play  — the video affordance on a post card, previously `▶ Video`
   *   send  — the conversation composer's submit, previously `➤`
   *   star  — a place rating, previously `★` / `☆`
   *
   * Leaving them as characters to avoid touching the approved set would have
   * been the worse answer: the set would be "consistent" only by excluding the
   * places it failed to cover, and SC-009 counts the whole product.
   *
   * Drawn on the same 24 grid for the same 1.75 stroke, so they are consistent
   * BY CONSTRUCTION rather than by having been eyeballed next to the others —
   * which is the entire argument for hand-authored paths over a borrowed family.
   */
  play: [{ kind: 'path', d: 'M9 6.4 18.2 12 9 17.6Z' }],
  send: [
    { kind: 'path', d: 'M20.4 3.6 10.4 13.6' },
    { kind: 'path', d: 'M20.4 3.6 14.1 20.4l-3.7-6.8-6.8-3.7Z' },
  ],
  star: [{ kind: 'path', d: 'm12 4.3 2.4 5.3 5.8.6-4.3 3.9 1.2 5.7-5.1-2.9-5.1 2.9 1.2-5.7-4.3-3.9 5.8-.6Z' }],
};

/** The 24x24 grid every path above is drawn on. */
export const ICON_VIEWBOX = 24;
