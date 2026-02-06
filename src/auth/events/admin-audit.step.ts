import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Union type for all possible admin event inputs
type AdminAuditInput =
  | { __topic: 'admin.user.roleChanged'; userId: string; newRole: string; changedByUserId: string; changedByUserEmail: string }
  | { __topic: 'admin.user.banned'; userId: string; banReason: string | null; banExpires: string | null; bannedByUserId: string; bannedByUserEmail: string }
  | { __topic: 'admin.user.unbanned'; userId: string; unbannedByUserId: string; unbannedByUserEmail: string }
  | { __topic: 'admin.user.deleted'; userId: string; deletedByUserId: string; deletedByUserEmail: string }

export const config: EventConfig = {
  name: 'AdminAuditLogger',
  type: 'event',
  description: 'Audit logger for admin operations',
  subscribes: [
    'admin.user.roleChanged',
    'admin.user.banned',
    'admin.user.unbanned',
    'admin.user.deleted',
  ],
  emits: [],
  flows: ['admin-management'],
}

export const handler: Handlers['AdminAuditLogger'] = async (input: AdminAuditInput, { logger }) => {
  try {
    const topic = input.__topic as string

    logger.info('Admin audit log', {
      topic,
      data: input,
      timestamp: new Date().toISOString(),
    })

    // Here you would typically write to an audit log table or external service
    // For now, we just log the event
    switch (topic) {
      case 'admin.user.roleChanged':
        logger.info('AUDIT: User role changed by admin', {
          userId: (input as any).userId,
          newRole: (input as any).newRole,
          changedByUserId: (input as any).changedByUserId,
          changedByUserEmail: (input as any).changedByUserEmail,
        })
        break

      case 'admin.user.banned':
        logger.info('AUDIT: User banned by admin', {
          userId: (input as any).userId,
          banReason: (input as any).banReason,
          banExpires: (input as any).banExpires,
          bannedByUserId: (input as any).bannedByUserId,
          bannedByUserEmail: (input as any).bannedByUserEmail,
        })
        break

      case 'admin.user.unbanned':
        logger.info('AUDIT: User unbanned by admin', {
          userId: (input as any).userId,
          unbannedByUserId: (input as any).unbannedByUserId,
          unbannedByUserEmail: (input as any).unbannedByUserEmail,
        })
        break

      case 'admin.user.deleted':
        logger.info('AUDIT: User deleted by admin', {
          userId: (input as any).userId,
          deletedByUserId: (input as any).deletedByUserId,
          deletedByUserEmail: (input as any).deletedByUserEmail,
        })
        break
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Admin audit logger error', {
      error: message,
      input,
    })
  }
}
