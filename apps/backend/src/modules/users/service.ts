import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from '../../database/prisma';
import { TtlCache } from '../../lib/async';

export const hashToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Anonymous installation accounts. The extension registers once and receives a random bearer
 * token; only its SHA-256 hash is stored. No wallet secrets are ever involved.
 */
export class UserService {
  private readonly cache = new TtlCache<string | null>(60_000, 10_000);

  constructor(private readonly db: Db) {}

  async register(): Promise<{ userId: string; apiToken: string }> {
    const apiToken = `pm_${randomBytes(32).toString('base64url')}`;
    const user = await this.db.user.create({ data: { apiTokenHash: hashToken(apiToken) } });
    await this.db.auditLog.create({
      data: { userId: user.id, action: 'user.register', entityType: 'User', entityId: user.id },
    });
    return { userId: user.id, apiToken };
  }

  /** Resolves a bearer token to a user id (null if unknown). */
  async authenticate(token: string | undefined | null): Promise<string | null> {
    if (!token || !/^pm_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
    const hash = hashToken(token);
    return this.cache.getOrLoad(hash, async () => {
      const user = await this.db.user.findUnique({
        where: { apiTokenHash: hash },
        select: { id: true, apiTokenHash: true },
      });
      if (!user) return null;
      // Constant-time comparison as defense in depth.
      const ok = timingSafeEqual(Buffer.from(user.apiTokenHash), Buffer.from(hash));
      if (ok)
        void this.db.user
          .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined);
      return ok ? user.id : null;
    });
  }
}
