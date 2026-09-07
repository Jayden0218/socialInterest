import { Pressable, Text, TextInput, View } from 'react-native';
import type { Interest } from '@sih/shared';
import { touchTarget, theme } from '../../ui/theme';
import { Banner, Button, Screen } from '../../ui/primitives';

export interface SimilarCandidate {
  interest: Interest;
  similarity: number;
}

/**
 * FR-023. The near-duplicate warning appears WHILE typing, via
 * GET /interests/similar, so the person can join the existing interest instead
 * of discovering the clash only when their submission is rejected.
 *
 * SC-008 measures whether this works: fewer than 10% of new sub-interests should
 * later be merged away as duplicates.
 */
export const SIMILARITY_CHECK_DEBOUNCE_MS = 300;

export type CreateState =
  | { kind: 'editing' }
  | { kind: 'similar_found'; candidates: SimilarCandidate[] }
  | { kind: 'blocked'; candidates: SimilarCandidate[] }
  | { kind: 'submitting' }
  | { kind: 'rejected'; title: string; detail?: string };

/** Mirrors InterestSearch.BLOCKING_SIMILARITY on the server. */
export const BLOCKING_SIMILARITY = 0.85;

export function stateForCandidates(candidates: SimilarCandidate[]): CreateState {
  if (candidates.length === 0) return { kind: 'editing' };
  return candidates.some((c) => c.similarity >= BLOCKING_SIMILARITY)
    ? { kind: 'blocked', candidates }
    : { kind: 'similar_found', candidates };
}

export function canSubmit(state: CreateState, name: string): boolean {
  return name.trim().length >= 2 && state.kind !== 'blocked' && state.kind !== 'submitting';
}

export function CreateInterestScreen({
  name,
  parentName,
  state,
  onNameChange,
  onJoinExisting,
  onSubmit,
}: {
  name: string;
  parentName: string;
  state: CreateState;
  onNameChange: (next: string) => void;
  onJoinExisting: (interestId: string) => void;
  onSubmit: () => void;
}) {
  const candidates = state.kind === 'similar_found' || state.kind === 'blocked' ? state.candidates : [];

  return (
    <Screen testID="create-interest-screen">
      <Text style={{ fontSize: theme.font.xl, fontWeight: '700', color: theme.color.text }}>
        New interest in {parentName}
      </Text>

      <TextInput
        testID="interest-name-input"
        accessibilityLabel="Interest name"
        placeholder="e.g. film photography"
        value={name}
        onChangeText={onNameChange}
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: state.kind === 'blocked' ? theme.color.danger : theme.color.border,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
          fontSize: theme.font.md,
          color: theme.color.text,
        }}
      />

      {candidates.length > 0 ? (
        <View testID="similar-candidates" style={{ gap: theme.space.sm }}>
          <Banner tone={state.kind === 'blocked' ? 'danger' : 'warning'} testID="similar-warning">
            {state.kind === 'blocked'
              ? 'An interest with almost this name already exists. Join it instead.'
              : 'These look similar — joining one keeps posts together.'}
          </Banner>
          {candidates.map((c, i) => (
            <Pressable
              key={c.interest.interestId}
              testID={`join-existing-${i}`}
              accessibilityRole="button"
              onPress={() => onJoinExisting(c.interest.interestId)}
              style={{
        ...touchTarget,
                padding: theme.space.md,
                borderWidth: 1,
                borderColor: theme.color.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text style={{ fontSize: theme.font.md, color: theme.color.text }}>{c.interest.name}</Text>
              <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
                {c.interest.postCount} posts
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {state.kind === 'rejected' ? (
        <Banner tone="danger" testID="create-rejected">
          {state.detail ?? state.title}
        </Banner>
      ) : null}

      <Button
        testID="create-interest-submit"
        label={state.kind === 'submitting' ? 'Creating…' : 'Create'}
        disabled={!canSubmit(state, name)}
        onPress={onSubmit}
      />
    </Screen>
  );
}
