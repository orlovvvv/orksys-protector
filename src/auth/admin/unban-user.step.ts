import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const bodySchema = z.object({
  userId: z.string(),
})

// Type for Better Auth unbanUser response
type UnbannedUser = {
  id: string
  name: string | null
  email: string
  banned: boolean
}

type UnbanUserResult = {
  user: UnbannedUser
}

// Type for emit data
type UserUnbannedEmitData = {
  userId: string
  unbannedByUserId: string
  unbannedByUserEmail: string
}

export const config: ApiRouteConfig = {
  name: 'AdminUnbanUser',
  type: 'api',
  path: '/admin/users/unban',
  method: 'POST',
  description: 'Unban a user (admin only)',
  emits: ['admin.user.unbanned'],
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

export const handler: Handlers['AdminUnbanUser'] = async (req, { emit, logger }) => {
  try {
    const { userId } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Admin unban user request received', {
      adminUserId: req.user.id,
      targetUserId: userId,
    })

    // Call Better Auth's admin unbanUser endpoint
    // Better Auth returns the unbanned user data directly, or throws an error
    let result: UnbanUserResult
    try {
      result = await auth.api.unbanUser({
        body: {
          userId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as UnbanUserResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to unban user', {
        error: error.message || 'Unknown error',
        targetUserId: userId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return {
          status: 404,
          body: { error: 'User not found' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to unban user' },
      }
    }

    const userData = result.user

    logger.info('Admin unbanned user successfully', {
      adminUserId: req.user.id,
      targetUserId: userId,
    })

    // Emit event for audit logging
    await emit({
      topic: 'admin.user.unbanned',
      data: {
        __topic: 'admin.user.unbanned',
        userId,
        unbannedByUserId: req.user.id,
        unbannedByUserEmail: req.user.email,
      },
    })

    return {
      status: 200,
      body: {
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          banned: userData.banned,
        },
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Admin unban user error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to unban user' },
    }
  }
}
