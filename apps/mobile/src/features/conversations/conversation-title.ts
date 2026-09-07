import type { Conversation, ConversationParticipant, ConversationSummary } from '@sih/shared';

/**
 * What to call a conversation, in ONE place.
 *
 * `other` became nullable in 005 because a group has no single other person, and
 * the compiler found five sites that had assumed it. Each of them could have been
 * fixed with `?.displayName ?? 'Group'` on the spot, and that is exactly how this
 * codebase ended up with two notification-category lists and two post responders:
 * the duplicate is not a risk of drift, it IS the drift.
 *
 * The ordering matters and is the requirement, not a preference. 005/FR-024 gives
 * a group an optional name, and a named group is called by its name. An unnamed
 * one is called by who is in it. **Never by the last message** - that is mutable
 * by definition, and 004's flow-ordering defect was a test asserting on exactly
 * that preview and passing only because of incidental ordering.
 */
export function conversationTitle(c: ConversationSummary | Conversation): string {
  if (c.name) return c.name;
  if (c.other) return c.other.displayName;

  const participants: ConversationParticipant[] = 'participants' in c ? (c.participants ?? []) : [];
  const names = participants
    .filter((p) => p.state !== 'left')
    .map((p) => p.person.displayName);

  // A group whose participants have not been loaded yet is still a group, and
  // saying so beats rendering an empty string that reads as a broken row.
  if (names.length === 0) return 'Group';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

/**
 * Whether this conversation is a group.
 *
 * Reads `kind` rather than counting participants: the two kinds derive their ids
 * differently (research R1), so a length check would be a second way to answer a
 * question the id scheme already answers - and the two could disagree on a
 * conversation whose participants have not been loaded.
 */
export function isGroup(c: ConversationSummary | Conversation): boolean {
  return c.kind === 'group';
}
