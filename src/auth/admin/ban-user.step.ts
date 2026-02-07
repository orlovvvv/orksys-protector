import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../lib/state-request'

const bodySchema = z.object({
  userId: z.string(),
  banReason: z.string().optional(),
  banExpiresIn: z.number().optional(), // seconds until ban expires
})

export const config: ApiRouteConfig = {
  name: 'AdminBanUser',
  type: 'api',
  path: '/admin/users/ban',
  method: 'POST',
  description: 'Ban a user (admin only)',
  emits: ['admin.user.ban.requested'],
  flows: ['admin-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, adminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      user: z.object({
        id: z.string(),
        name: z.string().nullish(),
        email: z.string(),
        banned: z.boolean(),
        banReason: z.string().nullish(),
        banExpires: z.string().nullish(),
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

export const handler: Handlers['AdminBanUser'] = async (req, { emit, logger, state }) => {
  try {
    const { userId, banReason, banExpiresIn } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Admin ban user request received', {
      adminUserId: req.user.id,
      targetUserId: userId,
      banReason,
      banExpiresIn,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'admin-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'admin.user.ban.requested',
      data: {
        requestId,
        targetUserId: userId,
        banReason: banReason ?? null,
        banExpiresIn,
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
      body: (result as { status: 'completed'; data: { user: { id: string; name: string | null; email: string; banned: boolean; banReason: string | null; banExpires: string | null } } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Admin ban user error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to ban user' },
    }
  }
}
