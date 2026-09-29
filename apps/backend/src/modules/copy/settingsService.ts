import { copySettingsInputSchema, enforceSafetyCeilings } from '@polymirror/shared';
import type { CopySettings } from '@polymirror/shared';
import type { Db } from '../../database/prisma';
import { toCopySettings } from '../../database/mappers';

export class CopySettingsService {
  constructor(private readonly db: Db) {}

  async get(userId: string): Promise<CopySettings> {
    return toCopySettings(await this.db.copySettings.findUnique({ where: { userId } }));
  }

  async update(userId: string, input: unknown): Promise<CopySettings> {
    const parsed = enforceSafetyCeilings(copySettingsInputSchema.parse(input));
    const data = { ...parsed, walletAddress: parsed.walletAddress };
    const row = await this.db.copySettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    await this.db.auditLog.create({
      data: {
        userId,
        action: 'copy.settings.update',
        entityType: 'CopySettings',
        entityId: row.id,
        payload: JSON.parse(JSON.stringify(parsed)),
      },
    });
    return toCopySettings(row);
  }
}
