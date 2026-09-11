/**
 * NotificationsContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { useMarkNotificationsRead, useNotifications } from '../containers';
import { Failed } from './shared';

export function NotificationsContainer({ onOpen }: { onOpen: (postId: string) => void }) {
  const { state, error } = useNotifications();
  /**
   * 008/FR-005. Viewing marks them read.
   *
   * Declared BEFORE any return, which `__tests__/hooks-before-return.test.ts`
   * fails the build over: a hook after the early `error` return below is
   * "Rendered more hooks than during the previous render" the first time a load
   * fails.
   */
  useMarkNotificationsRead(state.items.length > 0);
  if (error) return <Failed message={error} />;
  return (
    <NotificationsScreen
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
