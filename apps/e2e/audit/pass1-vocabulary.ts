/**
 * PASS 1 OF THE ARTBOARD AUDIT — the vocabulary diff.
 *
 * Asks one question per screen: does the app render values the approved design
 * does not name? It needs no element-by-element correspondence, so it is right
 * on its first run without a mapping file — which is why it goes first.
 *
 * The app's side is `getComputedStyle` (collected by `capture-screens.ts` into
 * `docs/screens/measured.json`), never its source. The design's side is the
 * artboard parsed as data. Source-to-source would have called the typeface
 * defect a match.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allArtboards, parseArtboard } from './artboard-spec';

const MEASURED = join(__dirname, '..', '..', '..', 'docs', 'screens', 'measured.json');

/**
 * Captured screen -> the artboard it is meant to be.
 *
 * WRITTEN DOWN RATHER THAN INFERRED. A name-similarity guess would quietly pair
 * `discover-results` with nothing and report a clean run for a screen nobody
 * checked; every pairing here is a claim somebody can disagree with. Screens
 * with no artboard, and artboards with no screen, are REPORTED — never dropped.
 */
export const SCREEN_TO_ARTBOARD: Record<string, string> = {
  'sign-in': 'SignIn.dc.html',
  'cold-start': 'ColdStart.dc.html',
  'home-feed': 'Main.dc.html',
  'feed-signed-out': 'Main.dc.html',
  'post-detail': 'Post.dc.html',
  comments: 'Comments.dc.html',
  'discover-search': 'Explore.dc.html',
  'discover-results': 'Explore.dc.html',
  'discover-place-result': 'Explore.dc.html',
  'interest-space': 'Interest.dc.html',
  'place-with-rating-and-reviews': 'Place.dc.html',
  compose: 'Compose.dc.html',
  profile: 'Profile.dc.html',
  saved: 'Saved.dc.html',
  'edit-profile': 'EditProfile.dc.html',
  'chats-inbox': 'Chats.dc.html',
  'chats-inbox-with-group': 'Chats.dc.html',
  'group-conversation': 'Conversation.dc.html',
  'new-group-empty': 'NewGroup.dc.html',
  'new-group-filled': 'NewGroup.dc.html',
  activity: 'Activity.dc.html',
};

/**
 * NOT DRIFT, WITH THE REASON EACH TIME.
 *
 * An audit that reports every difference reports mostly noise, and a reader who
 * learns to skim it is worse off than one with no audit. Each entry here is a
 * difference from the artboards that is CORRECT, and says why — so a genuine
 * finding is never buried, and so removing an excuse is a reviewable act.
 */
export const NOT_DRIFT: Array<{ test: (hex: string, site: string) => boolean; why: string }> = [
  {
    // 006/R2. The hue comes from an FNV-1a hash of the id, rendered in OKLCH at
    // a fixed lightness so all 720 pass contrast. The artboards list five
    // examples; the product generates the whole space, so a hue that is in no
    // artboard is the design working rather than failing.
    test: (_h, site) => /^(avatar-|interest-chip-|interest-identity|search-result-colour-)/.test(site),
    why: 'generated avatar/interest hue (006/R2) — the artboards sample this space, they do not bound it',
  },
  {
    // CLAUDE.md, 007: the artboards' faintest grey measures 2.9:1 and `#6B7770`
    // measured 4.14:1 on the field surface, so the token was DARKENED. Here the
    // code is right and the artboard is the stale one.
    test: (h) => h === '#606c66',
    why: 'text.muted, darkened from the artboard for contrast (a stated deviation, 007)',
  },
  {
    // MEASURED, not assumed: giving `Switch` a `trackColor` changed the OFF
    // state from Material grey to `#ECEAE4`, which proves the prop is read.
    // Only `trackColor.true` is ignored by react-native-web. The props are
    // correct per React Native's API and this is the harness, not the product —
    // and it is exactly the browser-is-not-Android gap this audit keeps naming.
    // UNVERIFIED ON A DEVICE, which is why it is written down rather than
    // silently filtered.
    test: (h, site) => h === '#009688' && site.startsWith('pref-'),
    why: 'react-native-web ignores trackColor.true on Switch — NOT VERIFIED on Android',
  },
];

/** `rgb(31, 107, 63)` -> `#1f6b3f`. Transparent and alpha values are reported
 *  separately: a scrim is a deliberate token, not an off-palette colour. */
export function rgbToHex(v: string): string | null {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/.exec(v);
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) < 1) return null;
  const h = (n: string): string => Number(n).toString(16).padStart(2, '0');
  return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}`;
}

interface Measured { colors: string[]; fontSizes: string[]; fontWeights: string[]; radii: string[] }

function main(): void {
  const measured = JSON.parse(readFileSync(MEASURED, 'utf8')) as Record<string, Measured>;

  /**
   * The design's whole vocabulary, not just one artboard's.
   *
   * A screen legitimately shows chrome drawn on other artboards — the tab bar is
   * on every one of them, an avatar's placeholder grey is shared. Diffing a
   * screen against ONLY its own artboard would report that shared chrome as
   * drift on nineteen screens out of twenty.
   */
  const design = allArtboards();
  const designColors = new Set<string>();
  const designSizes = new Set<number>();
  const designRadii = new Set<string>();
  for (const a of design) {
    for (const c of a.colors) designColors.add(c);
    for (const s of a.fontSizes) designSizes.add(s);
    for (const r of a.radii) designRadii.add(r);
  }

  const rows: string[] = [];
  let offColor = 0;
  let offSize = 0;

  for (const [screen, m] of Object.entries(measured)) {
    const board = SCREEN_TO_ARTBOARD[screen];
    if (board === undefined) {
      rows.push(`  ${screen.padEnd(32)} NO ARTBOARD PAIRED — not audited`);
      continue;
    }
    const own = parseArtboard(board);

    const colors = m.colors.map(rgbToHex).filter((c): c is string => c !== null);
    const sites = (m as unknown as { colorSites?: Record<string, string> }).colorSites ?? {};
    const siteOf = (hex: string): string => {
      for (const [raw, site] of Object.entries(sites)) if (rgbToHex(raw) === hex) return site;
      return '(no site)';
    };
    const strayColors = colors
      .filter((c) => !designColors.has(c))
      .filter((c) => !NOT_DRIFT.some((r) => r.test(c, siteOf(c))));

    const sizes = m.fontSizes.map((s) => Number(s.replace('px', '')));
    const straySizes = sizes.filter((s) => !designSizes.has(s));

    const radii = m.radii.filter((r) => !designRadii.has(r) && r !== '0px');

    offColor += strayColors.length;
    offSize += straySizes.length;
    const verdict = strayColors.length + straySizes.length + radii.length === 0 ? 'clean' : 'DRIFT';
    rows.push(
      `  ${screen.padEnd(32)} ${board.replace('.dc.html', '').padEnd(14)} ${verdict}` +
        (strayColors.length ? `\n      off-palette colours: ${strayColors.join(' ')}` : '') +
        (straySizes.length ? `\n      off-scale sizes:     ${straySizes.join(' ')}` : '') +
        (radii.length ? `\n      off-scale radii:     ${radii.join(' ')}` : '') +
        (own.colors.size === 0 ? '\n      (artboard parsed no colours — check the pairing)' : ''),
    );
  }

  const paired = new Set(Object.values(SCREEN_TO_ARTBOARD));
  const unaudited = design.map((a) => a.file).filter((f) => !paired.has(f));

  console.log('PASS 1 — VOCABULARY DIFF (browser-measured; react-native-web is not Android)\n');
  console.log(`design vocabulary: ${designColors.size} colours, ${designSizes.size} type sizes, ${designRadii.size} radii\n`);
  console.log(rows.join('\n'));
  console.log(`\nARTBOARDS WITH NO CAPTURED SCREEN — NOT AUDITED: ${unaudited.length ? unaudited.join(', ') : 'none'}`);
  console.log(`totals: ${offColor} off-palette colour uses, ${offSize} off-scale size uses`);
}

main();
