import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Interest } from '@sih/shared';
import { activePalette as palette, MIN_TOUCH_TARGET, radius, space, textStyle } from '../../ui/theme';
import { Button, Screen, ScreenHeader } from '../../ui/primitives';
import { InterestWord } from '../../components/InterestWord';
import { Icon } from '../../ui/Icon';
import { interestColour } from '../../ui/interest-colour';

/** Two per row with a gap between, which `space.sm` takes out of the row. */
const COLUMN_PERCENT = 48;

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
 * So the copy says the feed STARTS with something in it and can be changed —
 * `ColdStart.dc.html`'s own words. Design: `design/012-ui/ColdStart.dc.html`.
 *
 * SKIPPING IS ALLOWED and is not a lesser path. FR-015 requires a populated
 * feed for somebody who picks nothing, which is why Skip is reachable from the
 * header before anything is chosen rather than being fine print at the bottom —
 * a first screen that cannot be dismissed is the first thing the product does
 * to a person.
 *
 * 012/T041. THE CHIPS BECAME CARDS, because the artboard draws a two-column
 * grid and a wrapped row of pills is a different screen. The grid also fixes
 * something the pills were bad at: interest names are now whatever people type,
 * so they vary in length, and a wrapped row of variable-width pills has a
 * ragged right edge that reads as broken rather than as flowing.
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
      {/*
        SKIP SITS IN THE HEADER, per the artboard, and that is a real change
        rather than a move: it is reachable before anything is picked and
        without reading to the bottom of a list whose length nobody controls
        any more. The old bottom button stays too — see below.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ScreenHeader title="What are you into?" />
        <Pressable
          testID="pick-skip-header"
          accessibilityRole="button"
          accessibilityLabel="Skip choosing interests"
          disabled={saving === true}
          onPress={onSkip}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{ alignSelf: 'center', minWidth: MIN_TOUCH_TARGET, alignItems: 'flex-end' }}
        >
          <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Skip</Text>
        </Pressable>
      </View>
      <Text style={{ ...textStyle.body, color: palette.text.secondary }}>
        Pick a few and your feed starts with something in it. You can change this whenever.
      </Text>

      <View
        testID="interest-picks"
        // TWO COLUMNS, per the artboard. Not a FlatList: this list is capped at
        // thirty and the screen already scrolls, so a virtualised list nested in
        // a ScrollView would be 007/R6's defect for no benefit.
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
                // Two per row, allowing for the gap between them.
                width: `${COLUMN_PERCENT}%`,
                minHeight: MIN_TOUCH_TARGET,
                justifyContent: 'center',
                opacity: locked ? 0.4 : 1,
                backgroundColor: palette.bg.raised,
                borderRadius: radius.md,
                paddingVertical: space.md,
                paddingHorizontal: space.sm,
                borderWidth: on ? 2 : 1,
                // Selection is a RING and a TICK, never a different fill: the
                // interest's own colour is its identity (006/G1), and
                // recolouring it to mean "chosen" would make two selected
                // interests look like the same interest.
                borderColor: on
                  ? interestColour({ interestId: interest.interestId }, palette)
                  : palette.line.hairline,
              }}
            >
              {/*
                Deliberately WITHOUT onPress: an interactive word inside an
                interactive wrapper is two tap targets stacked, and the inner
                one wins on some platforms and not others.
              */}
              <InterestWord interest={interest} />
              {on ? (
                <View style={{ position: 'absolute', top: 6, right: 6 }}>
                  <Icon
                    name="check"
                    size="state"
                    color={interestColour({ interestId: interest.interestId }, palette)}
                  />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text testID="pick-count" style={{ ...textStyle.caption, color: palette.text.muted }}>
        {picked.length} picked
      </Text>

      <Button
        testID="pick-continue"
        /*
          "Continue with 3", per the artboard — the count is ON the control that
          uses it rather than in a caption beside it, so a person reads one
          thing instead of relating two. `pick-count` stays for the flows that
          assert it.
        */
        label={saving ? 'Saving…' : picked.length > 0 ? `Continue with ${picked.length}` : 'Continue'}
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
