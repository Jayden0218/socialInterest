import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Interest } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget } from '../../ui/theme';
import { Button, Screen } from '../../ui/primitives';
import { InterestChip } from '../../components/InterestChip';

/** FR-014. The product's cap, not the store's. */
export const MAX_PICKS = 20;

/**
 * THE COLD START — A SEED, NOT A SUBSCRIPTION, AND THE WORDING CARRIES THAT.
 *
 * A ranked feed has nothing to learn from on the first session, so it asks
 * once. What it must NOT do is let that question read as "choose your feed",
 * because that is the subscription model in a different costume: the person
 * then expects these picks to be the boundary of what they see, and every later
 * exploration looks like a bug rather than the design (FR-007).
 *
 * So the copy says "to start", and says the feed learns from there, and says it
 * can be changed. Design: `design/007-ui/ColdStart.dc.html`.
 *
 * SKIPPING IS ALLOWED and is not a lesser path. FR-015 requires a populated
 * feed for somebody who picks nothing, which is why the skip control is a
 * peer of Continue rather than fine print — a first screen that cannot be
 * dismissed is the first thing the product does to a person.
 */
export function PickInterestsScreen({
  interests,
  picked,
  saving,
  onToggle,
  onContinue,
  onSkip,
}: {
  interests: Interest[];
  picked: string[];
  saving?: boolean;
  onToggle: (interestId: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const chosen = useMemo(() => new Set(picked), [picked]);
  const atCap = picked.length >= MAX_PICKS;

  return (
    <Screen testID="pick-interests-screen" scroll>
      <Text style={{ ...textStyle.display, fontWeight: '700', color: palette.text.primary }}>
        What are you into?
      </Text>
      <Text style={{ ...textStyle.body, color: palette.text.muted }}>
        Pick a few to start. Your feed learns from there, and you can change it whenever.
      </Text>

      <View
        testID="interest-picks"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.md }}
      >
        {interests.map((interest) => {
          const on = chosen.has(interest.interestId);
          // At the cap, only DESELECTION is possible. A chip that silently does
          // nothing teaches a person the screen is broken.
          const locked = atCap && !on;
          return (
            <Pressable
              key={interest.interestId}
              testID={`pick-${interest.interestId}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: locked }}
              accessibilityLabel={interest.name}
              disabled={locked}
              onPress={() => onToggle(interest.interestId)}
              style={{
                ...touchTarget,
                opacity: locked ? 0.4 : 1,
                borderRadius: radius.pill,
                borderWidth: 2,
                // Selection is a RING around the chip, not a different colour
                // inside it: the interest's own colour is its identity (006/G1)
                // and recolouring it to mean "chosen" would make two interests
                // that are both selected look like the same interest.
                borderColor: on ? palette.intent.accent : 'transparent',
              }}
            >
              {/*
                Deliberately WITHOUT onPress: an interactive chip inside an
                interactive wrapper is two tap targets stacked, and the inner
                one wins on some platforms and not others.
              */}
              <InterestChip interest={interest} />
            </Pressable>
          );
        })}
      </View>

      <Text testID="pick-count" style={{ ...textStyle.caption, color: palette.text.muted }}>
        {picked.length} picked
      </Text>

      <Button
        testID="pick-continue"
        label={saving ? 'Saving…' : 'Continue'}
        disabled={saving === true}
        onPress={onContinue}
      />
      <Button
        testID="pick-skip"
        label="Skip for now"
        variant="secondary"
        disabled={saving === true}
        onPress={onSkip}
      />
    </Screen>
  );
}
