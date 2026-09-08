import { FlatList, Text, View } from 'react-native';
import type { Review } from '@sih/shared';
import { activePalette as palette, space } from '../../ui/theme';
import { Button, EmptyState, Row } from '../../ui/primitives';

/**
 * 005/US2. The reviews on a place page.
 *
 * `author` is rendered from the hydrated profile the API sends. If this ever has
 * to fall back to an id, the responder has regressed to returning candidate rows -
 * which is the defect six surfaces in this codebase shipped with.
 */
export function ReviewList({
  reviews,
  onReport,
}: {
  reviews: Review[];
  onReport: (placeId: string, authorId: string) => void;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        testID="review-list-empty"
        title="No reviews yet"
        body="Be the first to say something about this place."
      />
    );
  }

  return (
    <FlatList
      testID="review-list"
      data={reviews}
      keyExtractor={(r) => `${r.placeId}:${r.author.userId}`}
      renderItem={({ item }) => (
        <View
          testID={`review-${item.author.userId}`}
          style={{
            padding: space.sm,
            borderBottomWidth: 1,
            borderBottomColor: palette.line.hairline,
            gap: space.xs,
          }}
        >
          <Row style={{ alignItems: 'center', gap: space.sm }}>
            <Text style={{ color: palette.text.primary, fontWeight: '600' }}>
              {item.author.displayName}
            </Text>
            <Text testID={`review-score-${item.author.userId}`} style={{ color: palette.text.muted }}>
              {'\u2605'.repeat(item.score)}
              {'\u2606'.repeat(5 - item.score)}
            </Text>
            <View style={{ flex: 1 }} />
            {/* FR-014. Reportable, on the same path as any other content. */}
            <Button
              testID={`report-review-${item.author.userId}`}
              label="Report"
              variant="secondary"
              onPress={() => onReport(item.placeId, item.author.userId)}
            />
          </Row>
          {item.body ? (
            <Text style={{ color: palette.text.primary }}>{item.body}</Text>
          ) : null}
        </View>
      )}
    />
  );
}
