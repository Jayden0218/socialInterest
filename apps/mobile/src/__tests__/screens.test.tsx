import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Comment, Interest, InterestRef, Notification, Post } from '@sih/shared';
import App, { Shell, TABS } from '../App';
import { DataProvider } from '../data-provider';
import { HomeFeedScreen, emptyStateCopy } from '../features/feed/HomeFeedScreen';
import { InterestScreen } from '../features/discover/InterestScreen';
import { InterestSearchScreen } from '../features/discover/InterestSearchScreen';
import { CreateInterestScreen, stateForCandidates } from '../features/discover/CreateInterestScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { EditProfileScreen } from '../features/profile/EditProfileScreen';
import { EngagementBar } from '../features/engagement/EngagementBar';
import { CommentsScreen } from '../features/engagement/CommentsScreen';
import { ShareAction } from '../features/engagement/ShareAction';
import { SharedPostScreen } from '../features/posts/SharedPostScreen';
import { EditPostScreen } from '../features/posts/EditPostScreen';
import { PostDetailScreen } from '../features/posts/PostDetailScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { SafetyActions } from '../features/safety/SafetyActions';
import { initialPagedState } from '../components/PagedPostList';
import { View } from 'react-native';

const ref: InterestRef = { interestId: 'i1', name: 'Bouldering', slug: 'bouldering', level: 'top' };
const interest: Interest = { ...ref, postCount: 3, followerCount: 2, state: 'active' };
const author = { userId: 'u1', handle: 'someone', displayName: 'Someone' };
const post: Post = {
  postId: 'p1',
  author,
  interests: [ref],
  visibility: 'public',
  processingState: 'ready',
  mediaKind: 'images',
  media: [{ kind: 'image', processingState: 'ready', renditions: { original: 'https://x/1.jpg' } }],
  reactionCount: 0,
  commentCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  caption: 'hello',
};

describe('App shell', () => {
  it('renders and switches tabs', () => {
    render(<App />);
    expect(screen.getByTestId('app-root')).toBeTruthy();
    expect(screen.getByTestId('home-feed-screen')).toBeTruthy();
    fireEvent.press(screen.getByTestId('tab-discover'));
    expect(screen.getByTestId('interest-search-screen')).toBeTruthy();
  });
});

describe('HomeFeedScreen — FR-036 empty states are distinct', () => {
  const renderFeed = (hint: string | null) =>
    render(
      <HomeFeedScreen
        state={{ ...initialPagedState<Post>(), emptyStateHint: hint }}
        onLoadMore={() => undefined}
        onEmptyAction={() => undefined}
        renderPost={() => <View />}
      />,
    );

  it('an empty catalogue offers posting', () => {
    renderFeed('no_posts_yet');
    expect(screen.getByTestId('empty-state-action')).toHaveTextContent(/Create a post/);
  });

  /**
   * 007/RS-008. `no_followed_interests` is retired: a RANKED feed is never in
   * that state, so the screen must not offer "pick a few interests" as the cure
   * for an empty page. Asserted as an absence, because the copy is still in the
   * repository's history and re-adding the branch is a one-line change.
   */
  it('does not offer the withdrawn "you follow nothing" state', () => {
    expect(emptyStateCopy('no_followed_interests' as never)).toBeNull();
    renderFeed('no_followed_interests');
    // The list still renders ITS OWN empty container - that is the generic
    // "nothing here" and is not the claim. What must be gone is the COPY that
    // tells a person their feed depends on following things.
    expect(screen.queryByTestId('empty-state-action')).toBeNull();
    expect(screen.queryByText(/Pick a few interests/)).toBeNull();
    expect(screen.queryByText(/Browse interests/)).toBeNull();
  });
});

describe('InterestScreen — FR-024 roll-up is explained', () => {
  it('lists sub-interests and says where rolled-up posts came from', () => {
    render(
      <InterestScreen
        data={{ interest, subInterests: [{ ...interest, interestId: 'i2', name: 'Highball' }], rollsUpFrom: ['i2'] }}
        posts={initialPagedState<Post>()}
        followedCount={0}
        onLoadMore={() => undefined}
        onToggleFollow={() => undefined}
        onOpenSubInterest={() => undefined}
        renderPost={() => <View />}
      />,
    );
    expect(screen.getByTestId('sub-interest-list')).toBeTruthy();
    expect(screen.getByTestId('rollup-caption')).toHaveTextContent(/Including posts from 1 sub-interest/);
  });
});

describe('InterestSearchScreen — FR-026 parent disambiguation', () => {
  it('shows each sub-interest with its parent', () => {
    render(
      <InterestSearchScreen
        query="port"
        results={[{ interestId: 'i3', name: 'Portraits', slug: 'portraits', level: 'sub', parent: ref }]}
        onQueryChange={() => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByTestId('search-result-0')).toHaveTextContent(/Portraits · Bouldering/);
  });
});

describe('CreateInterestScreen — FR-023 warns before submission', () => {
  it('blocks and offers to join when a near-duplicate exists', () => {
    const candidates = [{ interest, similarity: 0.95 }];
    render(
      <CreateInterestScreen
        name="Bouldring"
        parentName="Climbing"
        state={stateForCandidates(candidates)}
        onNameChange={() => undefined}
        onJoinExisting={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByTestId('similar-warning')).toHaveTextContent(/Join it instead/);
    expect(screen.getByTestId('create-interest-submit').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('join-existing-0')).toBeTruthy();
  });

  it('only warns, without blocking, below the threshold', () => {
    render(
      <CreateInterestScreen
        name="Slab climbing"
        parentName="Climbing"
        state={stateForCandidates([{ interest, similarity: 0.78 }])}
        onNameChange={() => undefined}
        onJoinExisting={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByTestId('create-interest-submit').props.accessibilityState.disabled).toBe(false);
  });
});

describe('ProfileScreen — FR-038 and the narrow meaning of following', () => {
  it('shows counts and explains what following actually does here', () => {
    render(
      <ProfileScreen
        profile={{
          handle: 'someone',
          displayName: 'Someone',
          bio: null,
          followerCount: 12,
          followingCount: 3,
          topInterests: [ref],
          viewerIsFollowing: false,
        }}
        posts={initialPagedState<Post>()}
        isSelf={false}
        onToggleFollow={() => undefined}
        onLoadMore={() => undefined}
        renderPost={() => <View />}
      />,
    );
    expect(screen.getByTestId('follower-count')).toHaveTextContent(/12/);
    /**
     * 007/FR-029, and this assertion USED TO PIN THE WRONG SENTENCE.
     *
     * It required "interests you already follow", which is 001/FR-033 - the
     * requirement 007 WITHDREW. A ranked feed has no followed-interest set for
     * a boost to happen inside, so the screen was explaining the composed feed
     * to somebody using the ranked one, and the test was holding it there.
     *
     * What a follow does now is reorder without admitting, so that is what is
     * asserted: it ranks, and it explicitly does not widen. Both halves,
     * because "ranks higher" alone would pass on copy that still implied the
     * feed grows.
     */
    expect(screen.getByTestId('follow-hint')).toHaveTextContent(/rank/i);
    expect(screen.getByTestId('follow-hint')).toHaveTextContent(/does not widen/i);
  });
});

describe('Engagement', () => {
  it('EngagementBar reflects whether the viewer has reacted', () => {
    const onReact = jest.fn();
    render(
      <EngagementBar
        state={{ reactionCount: 4, commentCount: 1, viewerHasReacted: true }}
        onReact={onReact}
        onOpenComments={() => undefined}
        onShare={() => undefined}
      />,
    );
    expect(screen.getByTestId('react-button').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('react-button'));
    expect(onReact).toHaveBeenCalled();
  });

  it('CommentsScreen sends you back on 403 rather than showing an empty thread', () => {
    render(
      <CommentsScreen comments={[]} draft="" status={403} onDraftChange={() => undefined} onSubmit={() => undefined} />,
    );
    expect(screen.getByTestId('comments-blocked')).toHaveTextContent(/not available to you/i);
    expect(screen.queryByTestId('comment-input')).toBeNull();
  });

  it('CommentsScreen renders a thread and gates submission on a non-empty draft', () => {
    const comment: Comment = { commentId: 'c1', author, body: 'nice', createdAt: '2026-01-01T00:00:00Z' };
    render(
      <CommentsScreen comments={[comment]} draft="" onDraftChange={() => undefined} onSubmit={() => undefined} />,
    );
    expect(screen.getByTestId('comment-0')).toHaveTextContent(/nice/);
    expect(screen.getByTestId('comment-submit').props.accessibilityState.disabled).toBe(true);
  });

  it('ShareAction warns BEFORE sending a followers-only link (FR-042)', () => {
    render(
      <ShareAction visibility="followers" url="https://x/v1/posts/p1" onCopy={() => undefined} onShare={() => undefined} />,
    );
    expect(screen.getByTestId('share-warning')).toHaveTextContent(/Only your followers/);
  });
});

describe('SharedPostScreen — a block must be indistinguishable from deletion', () => {
  it('404 and a block produce identical copy', () => {
    render(<SharedPostScreen status={404} onJoin={() => undefined} />);
    const gone = screen.getByTestId('shared-post-unavailable');
    expect(gone).toHaveTextContent(/No longer available/);
    // 403 is DIFFERENT - "not for you" is informative and safe to show.
    screen.unmount();
    render(<SharedPostScreen status={403} onJoin={() => undefined} />);
    expect(screen.getByTestId('shared-post-unavailable')).toHaveTextContent(/Not available to you/);
  });

  it('a visible public post renders with a join prompt', () => {
    render(<SharedPostScreen status={200} post={post} onJoin={() => undefined} />);
    expect(screen.getByTestId('post-detail-screen')).toBeTruthy();
    expect(screen.getByTestId('join-prompt')).toBeTruthy();
  });
});

describe('EditPostScreen — FR-017 narrowing is warned about first', () => {
  const draft = { caption: 'x', interests: [ref], visibility: 'private' as const };
  it('warns that existing links will stop working', () => {
    render(
      <EditPostScreen
        draft={draft}
        original={{ ...draft, visibility: 'public' }}
        interestOptions={[ref]}
        onChange={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(screen.getByTestId('narrowing-warning')).toHaveTextContent(/links to this post will stop working/);
  });

  it('FR-006 holds on edit: saving is blocked with no interest', () => {
    render(
      <EditPostScreen
        draft={{ ...draft, interests: [] }}
        original={draft}
        interestOptions={[ref]}
        onChange={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(screen.getByTestId('edit-save').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('no-interest-warning')).toBeTruthy();
  });
});

describe('PostDetailScreen — FR-009 poster frame', () => {
  it('shows a processing notice instead of an empty box', () => {
    render(<PostDetailScreen post={{ ...post, processingState: 'processing' }} />);
    expect(screen.getByTestId('processing-notice')).toHaveTextContent(/Only you can see this/);
  });
});

describe('Notifications and safety', () => {
  it('an empty list is a normal state, not an error (FR-048)', () => {
    render(
      <NotificationsScreen
        notifications={[]}
        prefs={{ reaction: true, comment: true, follow: true, message: true }}
        onOpen={() => undefined}
        onEditPrefs={() => undefined}
      />,
    );
    expect(screen.getByTestId('notifications-empty')).toHaveTextContent(/all caught up/i);
  });

  it('says so when every category is switched off', () => {
    render(
      <NotificationsScreen
        notifications={[]}
        prefs={{ reaction: false, comment: false, follow: false, message: false }}
        onOpen={() => undefined}
        onEditPrefs={() => undefined}
      />,
    );
    expect(screen.getByTestId('notifications-empty')).toHaveTextContent(/turned off/);
  });

  it('renders a notification', () => {
    const n: Notification = {
      notificationId: 'n1',
      kind: 'follow',
      actor: author,
      createdAt: '2026-01-01T00:00:00Z',
    };
    render(
      <NotificationsScreen
        notifications={[n]}
        prefs={{ reaction: true, comment: true, follow: true, message: true }}
        onOpen={() => undefined}
        onEditPrefs={() => undefined}
      />,
    );
    expect(screen.getByTestId('notification-0')).toHaveTextContent(/Someone followed you/);
  });

  it('FR-043: an interest NAME is reportable, with its own label', () => {
    render(
      <SafetyActions subject="interest" selectedReason={null} onSelectReason={() => undefined} onReport={() => undefined} />,
    );
    expect(screen.getByTestId('safety-actions')).toHaveTextContent(/Report this interest name/);
    expect(screen.getByTestId('submit-report').props.accessibilityState.disabled).toBe(true);
  });

  it('FR-044: blocking is described accurately as mutual and follow-severing', () => {
    render(
      <SafetyActions
        subject="post"
        selectedReason="spam"
        onSelectReason={() => undefined}
        onReport={() => undefined}
        onBlock={() => undefined}
      />,
    );
    expect(screen.getByTestId('block-confirmation')).toHaveTextContent(/Unblocking later does not restore the follow/);
  });
});

describe('EditProfileScreen — FR-049 partial preference patch', () => {
  it('toggling one category leaves the others untouched', () => {
    const onChange = jest.fn();
    render(
      <EditProfileScreen
        draft={{ userId: 'u-edit', displayName: 'Me', bio: '', notificationPrefs: { reaction: true, comment: true, follow: true, message: true } }}
        onChange={onChange}
        onSave={() => undefined}
        onDeleteAccount={() => undefined}
      />,
    );
    fireEvent(screen.getByTestId('pref-reaction'), 'valueChange', false);
    expect(onChange).toHaveBeenCalledWith(
      // `message` is 004/FR-031's fourth category. The point of the test is that
      // toggling one leaves the OTHERS untouched, so the new one belongs here.
      expect.objectContaining({
        notificationPrefs: { reaction: false, comment: true, follow: true, message: true },
      }),
    );
  });

  /**
   * EVERY preference the model carries must have a switch.
   *
   * This screen kept its own three-entry category list while
   * NOTIFICATION_CATEGORIES had four, so 004/FR-031's `message` toggle existed
   * in the type, in the API and in the notifications screen's labels - and
   * nowhere a person could tap. The requirement was reported complete. An
   * Android device found it, on the first run that ever opened Edit profile.
   *
   * The expectation is DERIVED from the prefs object rather than listed here.
   * A hand-written list of four ids would pass today and miss the fifth
   * category exactly the way the last one was missed - the same argument as
   * auth-surface.spec.ts enumerating routes instead of naming them.
   */
  it('renders a switch for every notification preference the model has', () => {
    const prefs = { reaction: true, comment: true, follow: true, message: true };
    render(
      <EditProfileScreen
        draft={{ userId: 'u-edit', displayName: 'Me', bio: '', notificationPrefs: prefs }}
        onChange={() => undefined}
        onSave={() => undefined}
        onDeleteAccount={() => undefined}
      />,
    );
    const missing = Object.keys(prefs).filter((key) => screen.queryByTestId(`pref-${key}`) === null);
    expect(missing).toEqual([]);
  });
});

/**
 * Every tab in TABS must render something.
 *
 * The tab body used to be a chain of `tab === 'x' ? ... : null`, which compiles
 * happily with a tab that has no branch and renders an empty screen. That is
 * the same shape as the four defects this codebase has already shipped - a
 * screen that works and nothing that mounts it - one level up. The switch is now
 * exhaustive, and this asserts the other half: that the body is not empty.
 */
describe('every tab renders a body', () => {
  for (const t of TABS) {
    it(`tab "${t.key}" is not blank`, () => {
      const { getByTestId, unmount } = render(
        <DataProvider baseUrl="http://127.0.0.1:1">
          <Shell />
        </DataProvider>,
      );
      fireEvent.press(getByTestId(`tab-${t.key}`));
      const root = getByTestId('app-root');
      // The tab bar and the compose row are always present; a body adds more.
      expect(root.children.length).toBeGreaterThan(2);
      unmount();
    });
  }
});
