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
  name: 'ProcessAdminDeleteUser',
  type: 'event',
  description: 'Process deleting user in the background',
  subscribes: ['admin.user.delete.requested'],
  emits: ['admin.user.deleted', 'admin.user.delete.failed'],
  input: inputSchema,
  flows: ['admin-management'],
}

export const handler: Handlers['ProcessAdminDeleteUser'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, targetUserId, authorization, adminUserId, adminUserEmail } =
    input

  logger.info('Processing admin delete user', {
    requestId,
    adminUserId,
    targetUserId,
  })

  try {
    // Call Better Auth's admin removeUser endpoint
    await auth.api.removeUser({
      body: {
        userId: targetUserId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    })

    logger.info('Admin deleted user successfully', {
      requestId,
      adminUserId,
      targetUserId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('admin-requests', requestId, {
      status: 'completed',
      data: {
        success: true,
        message: 'User deleted successfully',
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'admin.user.deleted',
      data: {
        __topic: 'admin.user.deleted',
        userId: targetUserId,
        deletedByUserId: adminUserId,
        deletedByUserEmail: adminUserEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to delete user', {
      requestId,
      targetUserId,
      error: errorMessage,
    })

    // Store error in state for the API gateway to retrieve
    await state.set('admin-requests', requestId, {
      status: 'failed',
      error: errorMessage,
      statusCode: 400,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'admin.user.delete.failed',
      data: {
        __topic: 'admin.user.delete.failed',
        requestId,
        targetUserId,
        adminUserId,
        adminUserEmail,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
