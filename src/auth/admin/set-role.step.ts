import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const bodySchema = z.object({
  userId: z.string(),
  role: z.enum(['user', 'admin'], {
    message: 'Role must be one of: user, admin',
  }),
})

// Type for Better Auth setRole response
type UserWithRole = {
  id: string
  name: string | null
  email: string
  role: string
}

type SetRoleResult = {
  user: UserWithRole
}

// Type for emit data
type RoleChangedEmitData = {
  userId: string
  newRole: string
  changedByUserId: string
  changedByUserEmail: string
}

export const config: ApiRouteConfig = {
  name: 'AdminSetRole',
  type: 'api',
  path: '/admin/users/set-role',
  method: 'POST',
  description: 'Set user role (admin only)',
  emits: ['admin.user.roleChanged'],
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

export const handler: Handlers['AdminSetRole'] = async (req, { emit, logger }) => {
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

    // Call Better Auth's admin setRole endpoint
    // Better Auth returns the updated user data directly, or throws an error
    let result: SetRoleResult
    try {
      result = await auth.api.setRole({
        body: {
          userId,
          role,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as SetRoleResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to set user role', {
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
      if (errorMessage.includes('yourself') || errorMessage.includes('own')) {
        return {
          status: 400,
          body: { error: 'Cannot change your own role' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to set user role' },
      }
    }

    const userData = result.user

    logger.info('Admin set user role successfully', {
      adminUserId: req.user.id,
      targetUserId: userId,
      newRole: userData.role,
    })

    // Emit event for audit logging
    await emit({
      topic: 'admin.user.roleChanged',
      data: {
        __topic: 'admin.user.roleChanged',
        userId,
        newRole: userData.role,
        changedByUserId: req.user.id,
        changedByUserEmail: req.user.email,
      },
    })

    return {
      status: 200,
      body: {
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          role: userData.role,
        },
      },
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
