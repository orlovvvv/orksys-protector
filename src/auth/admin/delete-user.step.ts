import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const bodySchema = z.object({
  userId: z.string(),
})

// Type for Better Auth removeUser response
type RemoveUserResult = {
  success: boolean
}

// Type for emit data
type UserDeletedEmitData = {
  userId: string
  deletedByUserId: string
  deletedByUserEmail: string
}

export const config: ApiRouteConfig = {
  name: 'AdminDeleteUser',
  type: 'api',
  path: '/admin/users/delete',
  method: 'POST',
  description: 'Delete a user (admin only)',
  emits: ['admin.user.deleted'],
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

export const handler: Handlers['AdminDeleteUser'] = async (req, { emit, logger }) => {
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

    // Call Better Auth's admin removeUser endpoint
    // Better Auth returns success/failure directly, or throws an error
    try {
      await auth.api.removeUser({
        body: {
          userId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as RemoveUserResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to delete user', {
        error: error.message || 'Unknown error',
        targetUserId: userId,
      })

      return {
        status: 400,
        body: { error: error.message || 'Failed to delete user' },
      }
    }

    logger.info('Admin deleted user successfully', {
      adminUserId: req.user.id,
      targetUserId: userId,
    })

    // Emit event for audit logging
    await emit({
      topic: 'admin.user.deleted',
      data: {
        __topic: 'admin.user.deleted',
        userId,
        deletedByUserId: req.user.id,
        deletedByUserEmail: req.user.email,
      },
    })

    return {
      status: 200,
      body: {
        success: true,
        message: 'User deleted successfully',
      },
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
