import type { MediaItem, Post } from '@sih/shared';

/**
 * 008/FR-035, US10 — WHAT A SCREEN READER SAYS ABOUT A PICTURE.
 *
 * Three sources, in order, and the last one is the point:
 *
 *   1. the author's own description (`altText`) — always preferred;
 *   2. the caption, which at least says what the post is about;
 *   3. a fallback naming the post's INTEREST and AUTHOR.
 *
 * The fallback exists because the alternative is the word "image", which tells
 * a person nothing at all — they know it is an image; the screen reader just
 * said so. "Photography, by Ada Baird" is not a description, and does not
 * pretend to be one, but it lets somebody decide whether to open the post.
 *
 * A pure function, so every surface says the same thing and none of them has to
 * remember the order.
 */
export function mediaLabel(
  post: Pick<Post, 'caption' | 'interests' | 'author'>,
  item?: Pick<MediaItem, 'altText'> | null,
): string {
  const described = item?.altText?.trim();
  if (described) return described;
  const caption = post.caption?.trim();
  if (caption) return caption;
  const interest = post.interests?.[0]?.name;
  const author = post.author?.displayName;
  if (interest && author) return `${interest}, by ${author}`;
  if (interest) return `A post in ${interest}`;
  if (author) return `A post by ${author}`;
  return 'Post media';
}
