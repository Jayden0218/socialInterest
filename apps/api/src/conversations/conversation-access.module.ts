import { Global, Module } from '@nestjs/common';
import { ConversationAccess } from './conversation-access';

/**
 * Global, like VisibilityModule, so no feature module can be assembled without
 * the boundary in reach. The friction of importing it is exactly the friction
 * that produces a local copy of the check.
 */
@Global()
@Module({
  providers: [ConversationAccess],
  exports: [ConversationAccess],
})
export class ConversationAccessModule {}
