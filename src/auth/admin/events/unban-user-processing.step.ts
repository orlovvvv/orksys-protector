import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  targetUserId: z.string(),
  authorization: z.string(),
  adminUserId: z.string(),
  adminUserEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessAdminUnbanUser',
  type: 'event',
  description: 'Process unbanning user in the background',
  subscribes: ['admin.user.unban.requested'],
  emits: ['admin.user.unbanned', 'admin.user.unban.failed'],
  input: inputSchema,
  flows: ['admin-management'],
}

export const handler: Handlers['ProcessAdminUnbanUser'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, targetUserId, authorization, adminUserId, adminUserEmail } =
    input

  logger.info('Processing admin unban user', {
    requestId,
    adminUserId,
    targetUserId,
  })

  try {
    // Call Better Auth's admin unbanUser endpoint
    const result = await auth.api.unbanUser({
      body: {
        userId: targetUserId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as { user: { id: string; name: string | null; email: string; banned: boolean } }

    const userData = result.user

    logger.info('Admin unbanned user successfully', {
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
        },
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'admin.user.unbanned',
      data: {
        __topic: 'admin.user.unbanned',
        userId: targetUserId,
        unbannedByUserId: adminUserId,
        unbannedByUserEmail: adminUserEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to unban user', {
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
    }

    // Store error in state for the API gateway to retrieve
    await state.set('admin-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'admin.user.unban.failed',
      data: {
        __topic: 'admin.user.unban.failed',
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
