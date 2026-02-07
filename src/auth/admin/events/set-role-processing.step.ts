import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  targetUserId: z.string(),
  role: z.enum(['user', 'admin']),
  authorization: z.string(),
  adminUserId: z.string(),
  adminUserEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessAdminSetRole',
  type: 'event',
  description: 'Process setting user role in the background',
  subscribes: ['admin.user.setRole.requested'],
  emits: ['admin.user.roleChanged', 'admin.user.setRole.failed'],
  input: inputSchema,
  flows: ['admin-management'],
}

export const handler: Handlers['ProcessAdminSetRole'] = async (
  input,
  { emit, logger, state },
) => {
  const {
    requestId,
    targetUserId,
    role,
    authorization,
    adminUserId,
    adminUserEmail,
  } = input

  logger.info('Processing admin set role', {
    requestId,
    adminUserId,
    targetUserId,
    newRole: role,
  })

  try {
    // Call Better Auth's admin setRole endpoint
    const result = await auth.api.setRole({
      body: {
        userId: targetUserId,
        role,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as { user: { id: string; name: string | null; email: string; role: string } }

    const userData = result.user

    logger.info('Admin set user role successfully', {
      requestId,
      adminUserId,
      targetUserId,
      newRole: userData.role,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('admin-requests', requestId, {
      status: 'completed',
      data: {
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          role: userData.role,
        },
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'admin.user.roleChanged',
      data: {
        __topic: 'admin.user.roleChanged',
        userId: targetUserId,
        newRole: userData.role,
        changedByUserId: adminUserId,
        changedByUserEmail: adminUserEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to set user role', {
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
    } else if (errorMsgLower.includes('yourself') || errorMsgLower.includes('own')) {
      userMessage = 'Cannot change your own role'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('admin-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'admin.user.setRole.failed',
      data: {
        __topic: 'admin.user.setRole.failed',
        requestId,
        targetUserId,
        role,
        adminUserId,
        adminUserEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
