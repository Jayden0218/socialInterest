/**
 * NotificationsContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { useMarkNotificationsRead, useNotifications } from '../containers';
import { surfaceFallback } from '../ui/SurfaceStates';

export function NotificationsContainer({ onOpen }: { onOpen: (postId: string) => void }) {
  const notifications = useNotifications();
  const { state } = notifications;
  /**
   * 008/FR-005. Viewing marks them read.
   *
   * Declared BEFORE any return, which `__tests__/hooks-before-return.test.ts`
   * fails the build over: a hook after the early `error` return below is
   * "Rendered more hooks than during the previous render" the first time a load
   * fails.
   */
  useMarkNotificationsRead(state.items.length > 0);

  /**
   * 012/T018. Loading and failed only: the screen owns the EMPTY wording,
   * because it reads `prefs` to say "all categories are turned off" — a fact
   * the container does not have. One decision still, made by `usePaged`; the
   * empty branch it selects is simply rendered by the screen.
   */
  const fallback = surfaceFallback(notifications, {
    shape: 'list',
    ids: {
      loading: 'notifications-loading',
      empty: 'notifications-empty',
      failed: 'notifications-failed',
    },
    empty: { title: 'Nothing new', body: 'You are all caught up.' },
  });

  return (
    <NotificationsScreen
      refreshing={notifications.refreshing}
      onRefresh={notifications.refresh}
      {...(fallback && notifications.surface !== 'empty' ? { fallback } : {})}
      notifications={state.items}
      prefs={{ reaction: true, comment: true, follow: true, message: true, mention: true }}
      // The notification's postId, not its notificationId. Passing the latter
      // opened a post route with a notification's id, and the API answered 404
      // "No longer available" - so every notification was a dead end. A follow
      // notification has no post at all (the field is nullable), and must not
      // navigate rather than navigate to nothing.
      onOpen={(n) => {
        if (n.postId) onOpen(n.postId);
      }}
      onEditPrefs={() => undefined}
    />
  );
}

/* --- post detail, comments, safety: the remaining screens, wired --- */
