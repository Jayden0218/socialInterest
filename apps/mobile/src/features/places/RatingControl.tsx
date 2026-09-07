import { Pressable, Text, TextInput, View } from 'react-native';
import type { PlaceRatingSummary } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Button, Row } from '../../ui/primitives';

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * 005/US1 and US2. Rate a place, optionally with a review.
 *
 * The summary and the control are one component because they are one thought:
 * what everyone thinks, and what you think. Splitting them would let a screen
 * render the average without ever offering the way to change it.
 */
export function RatingControl({
  summary,
  viewerRating,
  signedIn,
  body,
  saving,
  onRate,
  onWithdraw,
  onChangeBody,
}: {
  summary: PlaceRatingSummary;
  viewerRating: number | null;
  signedIn: boolean;
  body: string;
  saving?: boolean;
  onRate: (score: number) => void;
  onWithdraw: () => void;
  onChangeBody: (body: string) => void;
}) {
  return (
    <View testID="rating-control" style={{ gap: theme.space.xs, padding: theme.space.sm }}>
      {/*
        FR-005. "Not yet rated" is a DIFFERENT STATEMENT from a low score, and
        the API sends `average: null` rather than 0 to keep them different. A
        component that rendered `average ?? 0` would put "0.0" on every new place
        and undo that at the last possible moment.
      */}
      <Text
        testID="rating-summary"
        style={{ fontSize: theme.font.md, color: theme.color.text }}
      >
        {summary.average === null
          ? 'Not yet rated'
          : `${summary.average.toFixed(1)} · ${summary.count} ${summary.count === 1 ? 'rating' : 'ratings'}`}
      </Text>

      {signedIn ? (
        <>
          <Row style={{ gap: theme.space.xs, alignItems: 'center' }}>
            {STARS.map((n) => (
              <Pressable
                key={n}
                testID={`rating-star-${n}`}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n} out of 5`}
                accessibilityState={{ selected: viewerRating === n }}
                disabled={saving === true}
                onPress={() => onRate(n)}
                style={{ padding: theme.space.xs }}
              >
                <Text
                  style={{
                    fontSize: theme.font.lg,
                    // The viewer's own rating fills up to the star they chose,
                    // so the control opens in the state they left it (FR-002) -
                    // rather than empty, which invites a second rating that
                    // silently replaces the first.
                    color:
                      viewerRating !== null && n <= viewerRating
                        ? theme.color.text
                        : theme.color.muted,
                  }}
                >
                  {viewerRating !== null && n <= viewerRating ? '★' : '☆'}
                </Text>
              </Pressable>
            ))}
            {viewerRating !== null ? (
              <Button
                testID="withdraw-rating"
                label="Remove"
                variant="secondary"
                onPress={onWithdraw}
              />
            ) : null}
          </Row>

          {/*
            FR-009. The text is OPTIONAL and secondary: a rating alone is a
            complete contribution, so this never blocks the stars.
          */}
          <TextInput
            testID="review-body-input"
            accessibilityLabel="Your review"
            placeholder="Say more (optional)"
            placeholderTextColor={theme.color.muted}
            value={body}
            onChangeText={onChangeBody}
            multiline
            maxLength={2000}
            style={{
              borderWidth: 1,
              borderColor: theme.color.border,
              borderRadius: theme.radius.md,
              padding: theme.space.sm,
              minHeight: 56,
              fontSize: theme.font.md,
              color: theme.color.text,
            }}
          />
          <Button
            testID="save-review"
            label={saving === true ? 'Saving…' : 'Save review'}
            // FR-001: the score is what is being saved, so there is nothing to
            // save until one is chosen. The text alone cannot be submitted.
            disabled={viewerRating === null || saving === true}
            onPress={() => onRate(viewerRating ?? 0)}
          />
        </>
      ) : (
        <Text testID="rating-signed-out" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
          Sign in to rate this place.
        </Text>
      )}
    </View>
  );
}
