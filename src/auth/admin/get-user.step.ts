import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

// Type for Better Auth getUser response
// Better Auth returns UserWithRole directly, not wrapped in { data: { user: ... } }
type UserWithRole = {
  id: string
  name: string | null
  email: string
  emailVerified: boolean
  image: string | null
  role: string | null
  banned: boolean | null
  banReason: string | null
  banExpires: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
}

export const config: ApiRouteConfig = {
  name: 'AdminGetUser',
  type: 'api',
  path: '/admin/users/:userId',
  method: 'GET',
  description: 'Get user details (admin only)',
  emits: [],
  flows: ['admin-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, adminMiddleware],
  responseSchema: {
    200: z.object({
      user: z.object({
        id: z.string(),
        name: z.string().nullish(),
        email: z.string(),
        emailVerified: z.boolean(),
        image: z.string().nullish(),
        role: z.string().nullish(),
        banned: z.boolean().nullish(),
        banReason: z.string().nullish(),
        banExpires: z.string().nullish(),
        createdAt: z.string(),
        updatedAt: z.string(),
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

export const handler: Handlers['AdminGetUser'] = async (req, { logger }) => {
  try {
    const userId = req.pathParams?.userId as string

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Admin get user request received', {
      adminUserId: req.user.id,
      targetUserId: userId,
    })

    // Call Better Auth's admin getUser endpoint
    // Better Auth returns the user data directly, or throws an error
    let userData: UserWithRole
    try {
      userData = await auth.api.getUser({
        query: {
          id: userId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as UserWithRole
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to get user', {
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
        body: { error: error.message || 'Failed to get user' },
      }
    }

    logger.info('Admin got user successfully', {
      adminUserId: req.user.id,
      targetUserId: userId,
    })

    return {
      status: 200,
      body: {
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          emailVerified: userData.emailVerified,
          image: userData.image,
          role: userData.role || null,
          banned: userData.banned || false,
          banReason: userData.banReason || null,
          banExpires: userData.banExpires ? new Date(userData.banExpires).toISOString() : null,
          createdAt: new Date(userData.createdAt).toISOString(),
          updatedAt: new Date(userData.updatedAt).toISOString(),
        },
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Admin get user error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to get user' },
    }
  }
}
