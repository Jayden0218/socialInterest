import { fireEvent, render } from '@testing-library/react-native';
import { InterestSearchScreen } from '../features/discover/InterestSearchScreen';
import { PostSearchResults } from '../features/discover/PostSearchResults';
import { initialPagedState } from '../components/PagedPostList';
import type { PagedState } from '../components/PagedPostList';
import type { Post } from '@sih/shared';
import { singleImagePost } from './fixtures/post';

/**
 * 008/T102, US6 — THE CLIENT HALF OF POST SEARCH.
 *
 * `response-shape.spec.ts` asserts the SERVER populates every declared field.
 * It cannot see the other direction: a field the server populates and a client
 * ignores. That is 007's `ApiPage<T>` defect (`nextCursor` nested under `page`,
 * so the app never loaded a second page of anything) and it is 008's `media[0]`
 * defect — the API returned all ten photographs the whole time.
 *
 * `meta.terms` and `fallback` are exactly that shape of field, so these tests
 * assert a READER exists for each, on the surface a person actually uses.
 */
const state = (items: Post[]): PagedState<Post> => ({
  ...initialPagedState<Post>(),
  items,
});

const fallback = {
  interests: [
    { interestId: 'i-climb', name: 'Climbing', slug: 'climbing', level: 'top' as const, parent: null },
  ],
  people: [
    {
      userId: 'u2',
      handle: 'jo',
      displayName: 'Jo Ling',
      bio: null,
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
      interestFollowCount: 0,
      viewerIsFollowing: false,
      status: 'active' as const,
    },
  ],
};

describe('008/US6 the post search surface', () => {
  it('FR-023 names the words it searched on, so a stop-word query is not a mystery', () => {
    const t = render(
      <PostSearchResults
        query="the bouldering"
        state={state([singleImagePost])}
        terms={['bouldering']}
        onLoadMore={() => undefined}
        onOpenPost={() => undefined}
      />,
    );
    expect(t.getByTestId('post-search-terms').props.children).toContain('bouldering');
  });

  it('says so when a query carried no searchable word at all', () => {
    const t = render(
      <PostSearchResults
        query="the of at"
        state={state([])}
        terms={[]}
        onLoadMore={() => undefined}
        onOpenPost={() => undefined}
      />,
    );
    expect(t.getByTestId('post-search-terms').props.children).toMatch(/no searchable words/i);
  });

  /**
   * FR-022. The fallback arrives in the SAME response as the empty result, and
   * this is the assertion that it has a reader: without it the field is a
   * declared half with no other half, which is the defect class 008 exists to
   * end.
   */
  it('FR-022 renders the interests and people a miss came back with', () => {
    const opened: string[] = [];
    const t = render(
      <PostSearchResults
        query="climbing"
        state={state([])}
        terms={['climbing']}
        fallback={fallback}
        onLoadMore={() => undefined}
        onOpenPost={() => undefined}
        onOpenInterest={(id) => opened.push(id)}
        onOpenPerson={(h) => opened.push(h)}
      />,
    );
    t.getByTestId('post-search-empty');
    fireEvent.press(t.getByTestId('post-search-interest-i-climb'));
    fireEvent.press(t.getByTestId('post-search-person-jo'));
    expect(opened).toEqual(['i-climb', 'jo']);
  });

  it('prompts rather than searching for the empty string', () => {
    const t = render(
      <PostSearchResults
        query="   "
        state={state([])}
        onLoadMore={() => undefined}
        onOpenPost={() => undefined}
      />,
    );
    t.getByTestId('post-search-prompt');
    expect(t.queryByTestId('post-search-results')).toBeNull();
  });
});

/**
 * G1 AND T103. Post search is an ADDITIONAL surface, never a replacement.
 *
 * Constitution I makes interest the unit of meaning, so the one navigational
 * surface that browses by interest cannot be displaced by a text search. These
 * assert it structurally rather than by inspection.
 */
describe('008/T103 interest search stays reachable', () => {
  const screen = (mode: 'interests' | 'posts', onSelectMode?: (m: 'interests' | 'posts') => void) =>
    render(
      <InterestSearchScreen
        query="climbing"
        results={[{ interestId: 'i-climb', name: 'Climbing', slug: 'climbing', level: 'top' as const, parent: null }]}
        mode={mode}
        posts={<PostSearchResults
          query="climbing"
          state={state([])}
          terms={['climbing']}
          onLoadMore={() => undefined}
          onOpenPost={() => undefined}
        />}
        onQueryChange={() => undefined}
        onSelect={() => undefined}
        {...(onSelectMode ? { onSelectMode } : {})}
      />,
    );

  it('shows interests by default and offers the Posts tab beside them', () => {
    const t = screen('interests', () => undefined);
    t.getByTestId('interest-list');
    t.getByTestId('search-tab-interests');
    t.getByTestId('search-tab-posts');
    expect(t.queryByTestId('post-search-results')).toBeNull();
  });

  it('switches to posts and BACK, so the interest surface is never lost', () => {
    let mode: 'interests' | 'posts' = 'interests';
    const t = screen('interests', (m) => (mode = m));
    fireEvent.press(t.getByTestId('search-tab-posts'));
    expect(mode).toBe('posts');

    const posts = screen('posts', (m) => (mode = m));
    posts.getByTestId('post-search-results');
    expect(posts.queryByTestId('interest-list')).toBeNull();
    fireEvent.press(posts.getByTestId('search-tab-interests'));
    expect(mode).toBe('interests');
  });

  /**
   * A screen given no `onSelectMode` renders no tabs at all — which is what
   * keeps every earlier flow and journey selecting `interest-list` working, and
   * what makes the Posts tab an addition rather than an edit to the old screen.
   */
  it('offers no tabs where the surface was not wired for posts', () => {
    const t = screen('interests');
    expect(t.queryByTestId('search-tabs')).toBeNull();
    t.getByTestId('interest-list');
  });
});
