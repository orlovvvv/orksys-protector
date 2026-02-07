import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  targetUserId: z.string(),
  banReason: z.string().nullish(),
  banExpiresIn: z.number().optional(),
  authorization: z.string(),
  adminUserId: z.string(),
  adminUserEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessAdminBanUser',
  type: 'event',
  description: 'Process banning user in the background',
  subscribes: ['admin.user.ban.requested'],
  emits: ['admin.user.banned', 'admin.user.ban.failed'],
  input: inputSchema,
  flows: ['admin-management'],
}

export const handler: Handlers['ProcessAdminBanUser'] = async (
  input,
  { emit, logger, state },
) => {
  const {
    requestId,
    targetUserId,
    banReason,
    banExpiresIn,
    authorization,
    adminUserId,
    adminUserEmail,
  } = input

  logger.info('Processing admin ban user', {
    requestId,
    adminUserId,
    targetUserId,
    banReason,
    banExpiresIn,
  })

  try {
    // Call Better Auth's admin banUser endpoint
    // Better Auth admin operations require making an HTTP-like call with proper headers
    const body: { userId: string; banReason?: string; banExpiresIn?: number } = {
      userId: targetUserId,
      banExpiresIn,
    }
    if (banReason) {
      body.banReason = banReason
    }

    const result = await auth.api.banUser({
      body,
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as { user: { id: string; name: string | null; email: string; banned: boolean; banReason: string | null; banExpires: Date | null } }

    const userData = result.user

    logger.info('Admin banned user successfully', {
      requestId,
      adminUserId,
      targetUserId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('admin-requests', requestId, {
      status: 'completed',
      data: {
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          banned: userData.banned,
          banReason: userData.banReason,
          banExpires: userData.banExpires
            ? new Date(userData.banExpires).toISOString()
            : null,
        },
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'admin.user.banned',
      data: {
        __topic: 'admin.user.banned',
        userId: targetUserId,
        banReason: userData.banReason,
        banExpires: userData.banExpires
          ? new Date(userData.banExpires).toISOString()
          : null,
        bannedByUserId: adminUserId,
        bannedByUserEmail: adminUserEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to ban user', {
      requestId,
      targetUserId,
      error: errorMessage,
    })

    // Determine status code from error
    let statusCode = 400
    let userMessage = errorMessage
    const errorMsgLower = errorMessage.toLowerCase()
    if (errorMsgLower.includes('not found') || errorMsgLower.includes('does not exist')) {
      statusCode = 404
      userMessage = 'User not found'
    } else if (errorMsgLower.includes('yourself')) {
      userMessage = 'Cannot ban yourself'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('admin-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'admin.user.ban.failed',
      data: {
        __topic: 'admin.user.ban.failed',
        requestId,
        targetUserId,
        adminUserId,
        adminUserEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
