import { mediaLabel } from '../components/mediaLabel';

/**
 * 008/US10, FR-035. The order matters, and the LAST case is the requirement.
 */
const post = {
  caption: 'a walk at dawn',
  interests: [{ interestId: 'i1', name: 'Photography', slug: 'photography', level: 'top' as const, parent: null }],
  author: { userId: 'u1', handle: 'ada', displayName: 'Ada Baird' },
} as unknown as Parameters<typeof mediaLabel>[0];

describe('008/FR-035 what a screen reader says about a picture', () => {
  it('prefers the author\'s own description', () => {
    expect(mediaLabel(post, { altText: 'A heron on a post' })).toBe('A heron on a post');
  });

  it('falls back to the caption when there is no description', () => {
    expect(mediaLabel(post, { altText: null })).toBe('a walk at dawn');
  });

  it('names the INTEREST and AUTHOR rather than saying "image"', () => {
    // The requirement, stated as an assertion: "image" tells a person nothing —
    // they know it is an image, the screen reader just said so.
    expect(mediaLabel({ ...post, caption: null } as typeof post, null)).toBe(
      'Photography, by Ada Baird',
    );
  });

  it('degrades sensibly when even those are missing', () => {
    expect(mediaLabel({ caption: null } as unknown as typeof post, null)).toBe('Post media');
  });

  it('treats whitespace as absent, so a blank description is not a label', () => {
    expect(mediaLabel(post, { altText: '   ' })).toBe('a walk at dawn');
  });
});
