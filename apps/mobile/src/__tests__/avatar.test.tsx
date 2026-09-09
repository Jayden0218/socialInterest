import { render } from '@testing-library/react-native';
import { Avatar } from '../components/Avatar';

/**
 * 008/US5 — AN AVATAR IS AN IMAGE WHEN THERE IS ONE.
 *
 * `Avatar` drew a generated disc and NOTHING ELSE, and its own comment said so:
 * "GENERATED, NEVER FETCHED ... replaced by an image later without touching a
 * single call site." The prediction was right and this is the later.
 *
 * The half that must not regress is FR-019: a person with no avatar sees exactly
 * what they always have. The server sends `null` rather than an empty string
 * precisely so this branch is unambiguous — an empty string would be an `Image`
 * pointed at nothing.
 */
describe('008/FR-017 Avatar renders an uploaded picture', () => {
  it('renders the image when a url is given', () => {
    const t = render(<Avatar userId="u1" displayName="Ada Baird" url="https://example.test/a.jpg" />);
    // The WRAPPER is selectable, and the image inside carries the source.
    expect(t.getByTestId('avatar-u1')).toBeTruthy();
    expect(t.getByTestId('avatar-image-u1').props.source).toEqual({ uri: 'https://example.test/a.jpg' });
  });

  /**
   * The fallback is asserted by the ABSENCE of the image, not by finding the
   * letter. The initial `Text` is deliberately hidden from assistive technology
   * — an avatar is decorative and the name sits beside it as real text — so
   * `getByText('A')` cannot find it and never could. Asserting the letter would
   * have meant either weakening the query or, worse, un-hiding the glyph to make
   * a test pass.
   */
  it.each([
    ['no url at all', undefined],
    ['an explicit null, which is what the server sends', null],
    // Defensive on purpose: the contract says null, and a server or stub that
    // sent '' would otherwise produce an <Image> pointed at nothing — a loading
    // avatar forever rather than a person with no photo.
    ['an empty string', ''],
  ])('FR-019 falls back to the derived disc with %s', (_label, url) => {
    const t = render(<Avatar userId="u1" displayName="Ada Baird" url={url} />);
    expect(t.getByTestId('avatar-u1')).toBeTruthy();
    expect(t.queryByTestId('avatar-image-u1')).toBeNull();
  });

  /**
   * THE REGRESSION THIS FILE ACTUALLY CAUGHT.
   *
   * `avatar-<userId>` must stay selectable by a test AND by Maestro whether the
   * person has a photograph or not. The first version of the image branch put
   * `accessibilityElementsHidden` on the node carrying the testID, which makes
   * it invisible to both — for people WITH an avatar only, so a fixture of
   * faceless accounts would never have shown it.
   */
  it('keeps the SAME testID either way — a flow must not need to know', () => {
    const withImage = render(<Avatar userId="u7" displayName="Jo" url="https://example.test/a.jpg" />);
    const without = render(<Avatar userId="u7" displayName="Jo" />);
    expect([
      Boolean(withImage.getByTestId('avatar-u7')),
      Boolean(without.getByTestId('avatar-u7')),
    ]).toEqual([true, true]);
  });
});
