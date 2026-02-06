import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const bodySchema = z.object({
  userId: z.string(),
  banReason: z.string().optional(),
  banExpiresIn: z.number().optional(), // seconds until ban expires
})

// Type for Better Auth banUser response
type BannedUser = {
  id: string
  name: string | null
  email: string
  banned: boolean
  banReason: string | null
  banExpires: string | Date | null
}

type BanUserResult = {
  user: BannedUser
}

// Type for emit data
type UserBannedEmitData = {
  userId: string
  banReason: string | null
  banExpires: string | null
  bannedByUserId: string
  bannedByUserEmail: string
}

export const config: ApiRouteConfig = {
  name: 'AdminBanUser',
  type: 'api',
  path: '/admin/users/ban',
  method: 'POST',
  description: 'Ban a user (admin only)',
  emits: ['admin.user.banned'],
  flows: ['admin-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, adminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      user: z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string(),
        banned: z.boolean(),
        banReason: z.string().nullable(),
        banExpires: z.string().nullable(),
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

export const handler: Handlers['AdminBanUser'] = async (req, { emit, logger }) => {
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

    // Call Better Auth's admin banUser endpoint
    // Better Auth returns the banned user data directly, or throws an error
    let result: BanUserResult
    try {
      result = await auth.api.banUser({
        body: {
          userId,
          banReason,
          banExpiresIn,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as BanUserResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to ban user', {
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
      if (errorMessage.includes('yourself')) {
        return {
          status: 400,
          body: { error: 'Cannot ban yourself' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to ban user' },
      }
    }

    const userData = result.user

    logger.info('Admin banned user successfully', {
      adminUserId: req.user.id,
      targetUserId: userId,
    })

    // Emit event for audit logging
    await emit({
      topic: 'admin.user.banned',
      data: {
        userId,
        banReason: userData.banReason,
        banExpires: userData.banExpires ? new Date(userData.banExpires).toISOString() : null,
        bannedByUserId: req.user.id,
        bannedByUserEmail: req.user.email,
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
          banReason: userData.banReason,
          banExpires: userData.banExpires ? new Date(userData.banExpires).toISOString() : null,
        },
      },
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
