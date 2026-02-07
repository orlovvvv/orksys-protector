import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../lib/state-request'

const bodySchema = z.object({
  userId: z.string(),
})

export const config: ApiRouteConfig = {
  name: 'AdminDeleteUser',
  type: 'api',
  path: '/admin/users/delete',
  method: 'POST',
  description: 'Delete a user (admin only)',
  emits: ['admin.user.delete.requested'],
  flows: ['admin-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, adminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    400: z.object({
      error: z.string(),
    }),
    401: z.object({
      error: z.string(),
    }),
    403: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['AdminDeleteUser'] = async (req, { emit, logger, state }) => {
  try {
    const { userId } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    // Prevent deleting yourself
    if (userId === req.user.id) {
      logger.warn('Admin attempted to delete themselves', {
        adminUserId: req.user.id,
      })

      return {
        status: 400,
        body: { error: 'Cannot delete your own account' },
      }
    }

    logger.info('Admin delete user request received', {
      adminUserId: req.user.id,
      targetUserId: userId,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'admin-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'admin.user.delete.requested',
      data: {
        requestId,
        targetUserId: userId,
        authorization: authorization ?? '',
        adminUserId: req.user.id,
        adminUserEmail: req.user.email,
      },
    })

    // Wait for the result from the event handler
    const result = await waitForRequestResult(state, 'admin-requests', requestId)

    if (result.status === 'failed') {
      const statusCode = result.statusCode ?? 400
      return {
        status: statusCode as 400 | 404,
        body: { error: result.error },
      }
    }

    // Return the successful result
    return {
      status: 200,
      body: (result as { status: 'completed'; data: { success: boolean; message: string } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Admin delete user error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to delete user' },
    }
  }
}
