import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/request';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { zodBody } from '../../common/http/validation';
import { DomainError } from '../../common/errors/problem.filter';
import { ConversationService } from './conversation.service';
import { MessagePollService, MAX_WAIT_SECONDS } from './message-poll.service';
import { MessagePresenter } from './message-presenter';
import { ConversationAccess } from '../../conversations/conversation-access';

const sendSchema = z
  .object({
    body: z.string().min(1).max(2000).optional(),
    sharedPostId: z.string().min(1).optional(),
  })
  .refine((v) => v.body !== undefined || v.sharedPostId !== undefined, {
    message: 'A message needs a body, a shared post, or both',
  });

const readSchema = z.object({ upToMessageId: z.string().min(1) });

const clamp = (value: string | undefined, max: number, fallback: number): number =>
  value ? Math.min(max, Math.max(1, Number(value) || fallback)) : fallback;

const groupCreateSchema = z.object({
  // 1 is allowed and is not an error: FR-027 routes a "group" of two to the
  // existing pair conversation. 19 others plus the creator is the cap.
  participantHandles: z.array(z.string().min(1)).min(1).max(19),
  name: z.string().max(60).nullable().optional(),
});

const addParticipantSchema = z.object({ handle: z.string().min(1) });

@Controller('conversations')
export class ConversationController {
  constructor(
    @Inject(ConversationService) private readonly conversations: ConversationService,
    @Inject(MessagePollService) private readonly poll: MessagePollService,
    @Inject(MessagePresenter) private readonly presenter: MessagePresenter,
    @Inject(ConversationAccess) private readonly access: ConversationAccess,
  ) {}

  /** FR-003. Two inboxes, one query each - not one list and a filter. */
  @Get()
  async inbox(
    @Req() req: AppRequest,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const wanted = state === 'requested' ? 'requested' : 'accepted';
    return this.conversations.listInbox(req.viewer!.userId, wanted, {
      limit: clamp(limit, 50, 20),
      cursor: cursor ?? null,
    });
  }

  /** FR-001. Idempotent; 404 rather than 403 when blocked, so nothing is disclosed. */
  @Put('with/:handle')
  @RateLimit({ capacity: 20, refillPerSecond: 0.2 })
  async open(@Req() req: AppRequest, @Param('handle') handle: string) {
    const item = await this.conversations.open(req.viewer!.userId, handle);
    return this.conversations.get(req.viewer!.userId, item.conversationId);
  }

  @Get(':conversationId')
  async get(@Req() req: AppRequest, @Param('conversationId') conversationId: string) {
    return this.conversations.get(req.viewer!.userId, conversationId);
  }

  /**
   * FR-011. `wait` holds the request open; 0 returns immediately.
   *
   * Read access is checked BEFORE the wait is armed. Holding a connection open
   * for somebody who may not read the conversation would leak its existence
   * through timing alone.
   */
  @Get(':conversationId/messages')
  async messages(
    @Req() req: AppRequest,
    @Param('conversationId') conversationId: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
    @Query('wait') wait?: string,
  ) {
    const viewerId = req.viewer!.userId;
    await this.conversations.get(viewerId, conversationId);

    const page = await this.poll.read(conversationId, {
      after: after ?? null,
      limit: clamp(limit, 100, 50),
      waitSeconds: wait ? Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(wait) || 0)) : 0,
    });

    return {
      items: await this.presenter.present({ userId: viewerId }, page.items),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * FR-001, FR-005, FR-008.
   *
   * 202 with no body when the conversation was declined: accepted and discarded,
   * because a sender who learns they were declined has a reason to come back
   * with another account. That is the ONE place this API refuses quietly.
   */
  @Post(':conversationId/messages')
  @RateLimit({ capacity: 30, refillPerSecond: 0.5 })
  async send(
    @Req() req: AppRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
  ) {
    const input = zodBody(sendSchema, body);
    const viewerId = req.viewer!.userId;
    const message = await this.conversations.send(viewerId, conversationId, input);
    if (!message) return null;
    const [presented] = await this.presenter.present({ userId: viewerId }, [message]);
    return presented;
  }

  @Post(':conversationId/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  async accept(@Req() req: AppRequest, @Param('conversationId') conversationId: string) {
    await this.conversations.respondToRequest(req.viewer!.userId, conversationId, 'accepted');
  }

  @Post(':conversationId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  async decline(@Req() req: AppRequest, @Param('conversationId') conversationId: string) {
    await this.conversations.respondToRequest(req.viewer!.userId, conversationId, 'declined');
  }

  /** FR-010. */
  @Put(':conversationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @Req() req: AppRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
  ) {
    const { upToMessageId } = zodBody(readSchema, body);
    await this.conversations.markRead(req.viewer!.userId, conversationId, upToMessageId);
  }

  // ------------------------------------------------------------- feature 005
  //
  // APPENDED. Inserting above an existing route moves its decorators onto the
  // new method - the @Public() displacement that happened twice in 004. None of
  // these is public, and auth-surface.spec.ts checks that in both directions.

  /**
   * 005/FR-018. 200 rather than 201, and the contract says why: FR-027 means
   * this can resolve to an EXISTING pair conversation, and reporting "created"
   * for something already there makes a client's cache wrong.
   */
  @Post('groups')
  @RateLimit({ capacity: 5, refillPerSecond: 0.05 })
  async createGroup(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(groupCreateSchema, body);
    const conversation = await this.conversations.createGroup(
      req.viewer!.userId,
      input.participantHandles,
      input.name ?? null,
    );
    return this.conversations.get(req.viewer!.userId, conversation.conversationId);
  }

  /** 005/FR-020. */
  @Post(':conversationId/participants')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ capacity: 10, refillPerSecond: 0.1 })
  async addParticipant(
    @Req() req: AppRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
  ) {
    const { handle } = zodBody(addParticipantSchema, body);
    await this.conversations.addParticipant(req.viewer!.userId, conversationId, handle);
  }

  /** 005/FR-021. */
  @Post(':conversationId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@Req() req: AppRequest, @Param('conversationId') conversationId: string) {
    await this.conversations.leave(req.viewer!.userId, conversationId);
  }
}
