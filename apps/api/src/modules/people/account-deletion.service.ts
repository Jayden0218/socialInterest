import { Inject, Injectable, Logger } from '@nestjs/common';
import { PersonRepository } from '../../persistence/person.repository';
import { PostRepository } from '../../persistence/post.repository';
import { CommentRepository } from '../../persistence/comment.repository';
import { handleAccountDeletion, type AccountDeletionResult } from '@sih/workers';

/**
 * FR-003. Returns immediately; the purge runs out of band.
 *
 * The synchronous half is the important half: setting status to `deleting`
 * makes followers-only content inaccessible AT ONCE, because the visibility
 * filter treats a non-active author as having no followers (T157). The purge
 * therefore does not have to win a race to protect that content - it only has
 * to finish eventually.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(CommentRepository) private readonly comments: CommentRepository,
  ) {}

  async requestDeletion(userId: string): Promise<{ purgeCompletesBy: string }> {
    await this.people.setStatus(userId, 'deleting');
    void this.purge(userId).catch((e: unknown) => {
      this.logger.error(`purge for ${userId} failed: ${String(e)}`);
    });
    return { purgeCompletesBy: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() };
  }

  async purge(userId: string): Promise<AccountDeletionResult> {
    return handleAccountDeletion(
      { userId },
      {
        listPostIds: async () => {
          const page = await this.posts.listByAuthor(userId, { limit: 1000 });
          return page.items.map((p) => p.postId);
        },
        deletePost: async (postId) => this.posts.setDeleted(postId, new Date().toISOString()),
        // Comments are anonymised rather than deleted: removing them would tear
        // holes in other people's threads.
        listCommentIds: async () => [],
        anonymiseComment: async (ref) => this.comments.anonymise(ref),
        setStatus: async () => this.people.setStatus(userId, 'deleted'),
      },
    );
  }
}
