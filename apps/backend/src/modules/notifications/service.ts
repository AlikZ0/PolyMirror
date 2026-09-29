import type {
  NotificationItem,
  NotificationType,
  WsEventName,
  WsPayloads,
} from '@polymirror/shared';
import type { Notification as DbNotification } from '@prisma/client';
import type { Db } from '../../database/prisma';
import type { WsHub } from '../../websocket/hub';
import type { CopyEventsPort } from '../copy/types';

export const toNotification = (n: DbNotification): NotificationItem => ({
  id: n.id,
  type: n.type as NotificationType,
  title: n.title,
  message: n.message,
  traderAddress: n.traderAddress,
  copyOrderId: n.copyOrderId,
  read: n.read,
  createdAt: n.createdAt.getTime(),
});

export class NotificationService implements CopyEventsPort {
  constructor(
    private readonly db: Db,
    private readonly hub: WsHub,
  ) {}

  emit<E extends WsEventName>(userId: string, event: E, data: WsPayloads[E]): void {
    this.hub.emit(userId, event, data);
  }

  async notify(
    userId: string,
    n: {
      type: NotificationType;
      title: string;
      message: string;
      traderAddress?: string | null;
      copyOrderId?: string | null;
    },
  ): Promise<void> {
    const row = await this.db.notification.create({
      data: {
        userId,
        type: n.type,
        title: n.title,
        message: n.message,
        traderAddress: n.traderAddress ?? null,
        copyOrderId: n.copyOrderId ?? null,
      },
    });
    this.hub.emit(userId, 'notification', toNotification(row));
  }

  async list(userId: string, limit = 50) {
    const [rows, unread] = await Promise.all([
      this.db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.db.notification.count({ where: { userId, read: false } }),
    ]);
    return { items: rows.map(toNotification), unread };
  }

  async markRead(userId: string, ids?: string[]) {
    await this.db.notification.updateMany({
      where: { userId, read: false, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { read: true },
    });
  }
}
