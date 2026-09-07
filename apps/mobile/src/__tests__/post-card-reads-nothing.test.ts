import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 006 GATE G2 AND G3. The card renders what it is given, and reaches for nothing.
 *
 * Constitution Principle II - visibility is decided ONCE - is about read paths.
 * A card that shows counts, authors and interests is exactly the component that
 * tempts a fetch: the natural way to show "2 comments" is to ask for comments,
 * and that is a new read path nobody routed through the filter.
 *
 * G3 rides along: a component that cannot make a request cannot leak an
 * identifier to a third party for an avatar or a colour either.
 *
 * STRUCTURAL, so it fails when the DEPENDENCY appears rather than waiting for a
 * post that exercises it - the same shape as
 * `apps/api/tests/unit/feed-does-not-read-place-follows.spec.ts`, which was
 * written that way for the same reason.
 */
const COMPONENTS = join(__dirname, '../components');

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the presentation components fetch nothing (G2, G3)', () => {
  const files = ['PostCard.tsx', 'Avatar.tsx', 'InterestChip.tsx', 'Skeleton.tsx'];

  it.each(files)('%s imports nothing from the data layer', (file) => {
    const src = strip(readFileSync(join(COMPONENTS, file), 'utf8'));
    // Any import whose path reaches `data/`, at any depth.
    expect(src).not.toMatch(/from\s+['"][^'"]*\bdata(\/|['"])/);
    expect(src).not.toMatch(/useData\b/);
  });

  it.each(files)('%s calls no network API', (file) => {
    const src = strip(readFileSync(join(COMPONENTS, file), 'utf8'));
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest|axios/);
  });

  /**
   * A remote avatar or a remote palette would satisfy every test above and still
   * breach G3, so the host list is checked too. `example.test` appears only in
   * fixtures, never here.
   */
  it.each(files)('%s contacts no third-party host', (file) => {
    const src = strip(readFileSync(join(COMPONENTS, file), 'utf8'));
    expect(src).not.toMatch(/https?:\/\//);
  });
});
