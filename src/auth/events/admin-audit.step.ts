import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Simple flexible schema for all admin audit events
// Using a single object schema with optional fields for Motia compatibility
const inputSchema = z.object({
  __topic: z.string(),
  userId: z.string(),
  newRole: z.string().optional(),
  banReason: z.string().nullish().optional(),
  banExpires: z.string().nullish().optional(),
  bannedByUserId: z.string().optional(),
  bannedByUserEmail: z.string().optional(),
  unbannedByUserId: z.string().optional(),
  unbannedByUserEmail: z.string().optional(),
  deletedByUserId: z.string().optional(),
  deletedByUserEmail: z.string().optional(),
  changedByUserId: z.string().optional(),
  changedByUserEmail: z.string().optional(),
})

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
  input: inputSchema,
  flows: ['admin-management'],
}

export const handler: Handlers['AdminAuditLogger'] = async (input, { logger }) => {
  try {
    const { __topic } = input

    logger.info('Admin audit log', {
      topic: __topic,
      data: input,
      timestamp: new Date().toISOString(),
    })

    // Log specific event based on topic
    switch (__topic) {
      case 'admin.user.roleChanged':
        logger.info('AUDIT: User role changed by admin', {
          userId: input.userId,
          newRole: input.newRole,
          changedByUserId: input.changedByUserId,
          changedByUserEmail: input.changedByUserEmail,
        })
        break

      case 'admin.user.banned':
        logger.info('AUDIT: User banned by admin', {
          userId: input.userId,
          banReason: input.banReason,
          banExpires: input.banExpires,
          bannedByUserId: input.bannedByUserId,
          bannedByUserEmail: input.bannedByUserEmail,
        })
        break

      case 'admin.user.unbanned':
        logger.info('AUDIT: User unbanned by admin', {
          userId: input.userId,
          unbannedByUserId: input.unbannedByUserId,
          unbannedByUserEmail: input.unbannedByUserEmail,
        })
        break

      case 'admin.user.deleted':
        logger.info('AUDIT: User deleted by admin', {
          userId: input.userId,
          deletedByUserId: input.deletedByUserId,
          deletedByUserEmail: input.deletedByUserEmail,
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
