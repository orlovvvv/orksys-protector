import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Input schema for all admin failed events
const inputSchema = z.object({
  __topic: z.string(),
  requestId: z.string(),
  error: z.string(),
  timestamp: z.string(),
  // For setRole.failed
  targetUserId: z.string().optional(),
  role: z.string().optional(),
  // For delete.failed and ban/unban.failed
  adminUserId: z.string().optional(),
  adminUserEmail: z.string().optional(),
})

export const config: EventConfig = {
  name: 'AdminFailedLogger',
  type: 'event',
  description: 'Logs failed admin operations for audit',
  subscribes: [
    'admin.user.setRole.failed',
    'admin.user.delete.failed',
    'admin.user.unban.failed',
    'admin.user.ban.failed',
  ],
  emits: [],
  input: inputSchema,
  flows: ['admin-management'],
}

export const handler: Handlers['AdminFailedLogger'] = async (input, { logger }) => {
  const { __topic, requestId, error, timestamp, adminUserId, adminUserEmail, targetUserId } =
    input

  logger.warn('Admin operation failed', {
    topic: __topic,
    requestId,
    error,
    adminUserId,
    adminUserEmail,
    targetUserId,
    timestamp,
  })

  // Determine operation type from topic and log specific message
  switch (__topic) {
    case 'admin.user.setRole.failed':
      logger.warn('AUDIT: Failed to set user role', {
        requestId,
        targetUserId,
        role: input.role,
        adminUserId,
        adminUserEmail,
        error,
        timestamp,
      })
      break

    case 'admin.user.delete.failed':
      logger.warn('AUDIT: Failed to delete user', {
        requestId,
        targetUserId,
        adminUserId,
        adminUserEmail,
        error,
        timestamp,
      })
      break

    case 'admin.user.unban.failed':
      logger.warn('AUDIT: Failed to unban user', {
        requestId,
        targetUserId,
        adminUserId,
        adminUserEmail,
        error,
        timestamp,
      })
      break

    case 'admin.user.ban.failed':
      logger.warn('AUDIT: Failed to ban user', {
        requestId,
        targetUserId,
        adminUserId,
        adminUserEmail,
        error,
        timestamp,
      })
      break
  }
}
