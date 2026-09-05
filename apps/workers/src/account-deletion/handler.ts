export interface AccountDeletionInput {
  userId: string;
}

export interface AccountDeletionDeps {
  listPostIds(userId: string): Promise<string[]>;
  deletePost(postId: string): Promise<void>;
  listCommentIds(userId: string): Promise<{ postId: string; commentId: string; createdAt: string }[]>;
  anonymiseComment(ref: { postId: string; commentId: string; createdAt: string }): Promise<void>;
  setStatus(userId: string, status: 'deleted'): Promise<void>;
}

export interface AccountDeletionResult {
  postsRemoved: number;
  commentsAnonymised: number;
}

/**
 * FR-003.
 *
 * Posts are removed; comments are ANONYMISED rather than deleted. Deleting them
 * would tear holes in other people's conversations - a thread that no longer
 * makes sense punishes the people who stayed. Anonymising keeps the thread
 * readable while removing the association.
 *
 * The account is marked `deleting` synchronously before this runs, which is what
 * makes followers-only content inaccessible immediately: the visibility filter
 * treats a non-active author as having no followers, so the purge does not need
 * to win a race to protect that content.
 */
export async function handleAccountDeletion(
  input: AccountDeletionInput,
  deps: AccountDeletionDeps,
): Promise<AccountDeletionResult> {
  let postsRemoved = 0;
  for (const postId of await deps.listPostIds(input.userId)) {
    await deps.deletePost(postId);
    postsRemoved++;
  }

  let commentsAnonymised = 0;
  for (const ref of await deps.listCommentIds(input.userId)) {
    await deps.anonymiseComment(ref);
    commentsAnonymised++;
  }

  await deps.setStatus(input.userId, 'deleted');
  return { postsRemoved, commentsAnonymised };
}
