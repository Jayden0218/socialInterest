import { Text, View } from 'react-native';
import type { Interest } from '@sih/shared';
import { activePalette as palette, space, textStyle } from '../../ui/theme';
import { Button } from '../../ui/primitives';

/** Mirrors MAX_FOLLOWED_INTERESTS on the server (research D1). */
export const MAX_FOLLOWED_INTERESTS = 200;

/** SC-006: three relevant interests within two minutes of signing up. */
export const ONBOARDING_TARGET = 3;

export type FollowState = 'following' | 'not_following' | 'pending' | 'at_limit';

export function followState(interest: Interest, followedCount: number): FollowState {
  if (interest.viewerIsFollowing) return 'following';
  return followedCount >= MAX_FOLLOWED_INTERESTS ? 'at_limit' : 'not_following';
}

export function limitMessage(followedCount: number): string | null {
  if (followedCount < MAX_FOLLOWED_INTERESTS) return null;
  return `You follow ${MAX_FOLLOWED_INTERESTS} interests, the maximum. Unfollow one to make room.`;
}

export function onboardingComplete(followedCount: number): boolean {
  return followedCount >= ONBOARDING_TARGET;
}

export function FollowInterestControl({
  interest,
  followedCount,
  onToggle,
}: {
  interest: Interest;
  followedCount: number;
  onToggle: (next: boolean) => void;
}) {
  const state = followState(interest, followedCount);
  const limit = limitMessage(followedCount);

  return (
    <View testID="follow-interest-control" style={{ gap: space.xs }}>
      <Button
        testID="follow-toggle"
        label={state === 'following' ? 'Following' : 'Follow'}
        variant={state === 'following' ? 'secondary' : 'primary'}
        disabled={state === 'at_limit'}
        onPress={() => onToggle(state !== 'following')}
      />
      {state === 'at_limit' && limit ? (
        <Text testID="follow-limit" style={{ ...textStyle.caption, color: palette.text.muted }}>
          {limit}
        </Text>
      ) : null}
    </View>
  );
}
