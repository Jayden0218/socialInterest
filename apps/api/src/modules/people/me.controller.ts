import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Patch, Req } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { zodBody } from '../../common/http/validation';
import { PersonRepository } from '../../persistence/person.repository';

const profileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(50),
    bio: z.string().max(300),
    notificationPrefs: z
      .object({ reaction: z.boolean(), comment: z.boolean(), follow: z.boolean() })
      .partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to change' });

@Controller('me')
export class MeController {
  constructor(@Inject(PersonRepository) private readonly people: PersonRepository) {}

  /** FR-002, FR-049. */
  @Get()
  async me(@Req() req: AppRequest) {
    const person = await this.people.findById(req.viewer!.userId);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    return {
      userId: person.userId,
      handle: person.handle,
      displayName: person.displayName,
      bio: person.bio ?? null,
      followerCount: person.followerCount,
      followingCount: person.followingCount,
      interestFollowCount: person.interestFollowCount,
      notificationPrefs: person.notificationPrefs,
    };
  }

  @Patch()
  async update(@Req() req: AppRequest, @Body() body: unknown) {
    const patch = zodBody(profileUpdateSchema, body);
    const person = await this.people.findById(req.viewer!.userId);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');

    await this.people.updateProfile(person.userId, {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      // Merged, not replaced: a client sending one toggle must not silently
      // reset the categories it did not mention.
      ...(patch.notificationPrefs
        ? { notificationPrefs: { ...person.notificationPrefs, ...patch.notificationPrefs } }
        : {}),
    });
    return this.me(req);
  }

  /**
   * FR-003. Returns immediately with the retention outcome; removal and
   * anonymisation proceed asynchronously. Followers-only content becomes
   * inaccessible as soon as this returns, because the visibility filter treats
   * a non-active author as having no followers.
   */
  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  async deleteAccount(@Req() req: AppRequest) {
    const person = await this.people.findById(req.viewer!.userId);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    await this.people.setStatus(person.userId, 'deleting');
    return {
      status: 'deleting',
      purgeCompletesBy: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    };
  }
}
