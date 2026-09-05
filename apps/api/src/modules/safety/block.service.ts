import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DomainError } from '../../common/errors/problem.filter';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { DOC_CLIENT } from '../../persistence/dynamo-client';
import { keys } from '../../persistence/keys';
import { BlockRepository } from '../../persistence/block.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';

/**
 * FR-044: a block hides content in BOTH directions, severs any follow either
 * way, and prevents further interaction.
 *
 * The block item and both follow deletions go in one transaction. Doing them
 * separately would leave a window in which the block exists but the follow does
 * not - and during that window the blocked person still counts as a follower,
 * so followers-only content stays visible to exactly the person just blocked.
 */
@Injectable()
export class BlockService {
  constructor(
    @Inject(DOC_CLIENT) private readonly doc: DynamoDBDocumentClient,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(BlockRepository) private readonly blocks: BlockRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(PersonFollowRepository) private readonly follows: PersonFollowRepository,
  ) {}

  async block(blockerId: string, blockedHandle: string): Promise<void> {
    const blocked = await this.people.findByHandle(blockedHandle);
    if (!blocked) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    if (blocked.userId === blockerId) {
      throw new DomainError(HttpStatus.CONFLICT, 'You cannot block yourself');
    }
    if (await this.blocks.existsBetween(blockerId, blocked.userId)) return;

    const table = this.config.dynamo.tableName;
    const [blockerFollows, blockedFollows] = await Promise.all([
      this.follows.isFollowing(blockerId, blocked.userId),
      this.follows.isFollowing(blocked.userId, blockerId),
    ]);

    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: {
                ...keys.block(blockerId, blocked.userId),
                ...keys.blockInverted(blocked.userId, blockerId),
                type: 'Block',
                blockerId,
                blockedId: blocked.userId,
                createdAt: new Date().toISOString(),
              },
            },
          },
          ...(blockerFollows
            ? [{ Delete: { TableName: table, Key: keys.personFollow(blockerId, blocked.userId) } }]
            : []),
          ...(blockedFollows
            ? [{ Delete: { TableName: table, Key: keys.personFollow(blocked.userId, blockerId) } }]
            : []),
        ],
      }),
    );

    await Promise.all([
      blockerFollows ? this.people.incrementCounter(blocked.userId, 'followerCount', -1) : null,
      blockerFollows ? this.people.incrementCounter(blockerId, 'followingCount', -1) : null,
      blockedFollows ? this.people.incrementCounter(blockerId, 'followerCount', -1) : null,
      blockedFollows ? this.people.incrementCounter(blocked.userId, 'followingCount', -1) : null,
    ]);
  }

  async unblock(blockerId: string, blockedHandle: string): Promise<void> {
    const blocked = await this.people.findByHandle(blockedHandle);
    if (!blocked) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    // Unblocking does NOT restore the severed follows - re-following is a
    // deliberate act, not something a block silently undoes and redoes.
    await this.blocks.unblock(blockerId, blocked.userId);
  }
}
