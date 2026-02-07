import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../lib/state-request'

const bodySchema = z.object({
  userId: z.string(),
  role: z.enum(['user', 'admin'], {
    message: 'Role must be one of: user, admin',
  }),
})

export const config: ApiRouteConfig = {
  name: 'AdminSetRole',
  type: 'api',
  path: '/admin/users/set-role',
  method: 'POST',
  description: 'Set user role (admin only)',
  emits: ['admin.user.setRole.requested'],
  flows: ['admin-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, adminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      user: z.object({
        id: z.string(),
        name: z.string().nullish(),
        email: z.string(),
        role: z.string().nullish(),
      }),
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
    404: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['AdminSetRole'] = async (req, { emit, logger, state }) => {
  try {
    const { userId, role } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Admin set role request received', {
      adminUserId: req.user.id,
      targetUserId: userId,
      newRole: role,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'admin-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'admin.user.setRole.requested',
      data: {
        requestId,
        targetUserId: userId,
        role,
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
      body: (result as { status: 'completed'; data: { user: { id: string; name: string | null; email: string; role: string } } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Admin set role error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to set user role' },
    }
  }
}
