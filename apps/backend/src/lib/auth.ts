import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserService } from '../modules/users/service';
import { unauthorized } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

export function requireAuth(users: UserService) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const userId = await users.authenticate(bearerToken(req));
    if (!userId) throw unauthorized('Missing or invalid session token');
    req.userId = userId;
  };
}
