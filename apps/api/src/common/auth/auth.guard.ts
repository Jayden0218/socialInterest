import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../../ports';
import type { AppRequest } from '../http/request';

export const IS_PUBLIC = 'auth:public';
/** Marks a route readable while signed out (e.g. a public post's share link). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const OPERATOR_ONLY = 'auth:operator';
/** FR-021 top-level interests, FR-045 moderation. */
export const OperatorOnly = () => SetMetadata(OPERATOR_ONLY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const handler = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, handler) ?? false;
    const operatorOnly = this.reflector.getAllAndOverride<boolean>(OPERATOR_ONLY, handler) ?? false;

    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    req.viewer = token ? await this.identity.verify(token) : null;

    // A public route still resolves the viewer: visibility depends on who is
    // asking even when signing in is not required.
    if (req.viewer === null && !isPublic) throw new UnauthorizedException('Authentication required');
    if (operatorOnly && req.viewer?.isOperator !== true) {
      throw new UnauthorizedException('Operator authority required');
    }
    return true;
  }
}
