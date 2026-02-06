import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

// Type for Better Auth listUsers response
type UserWithRole = {
  id: string
  name: string | null
  email: string
  emailVerified: boolean
  role: string | null
  banned: boolean | null
  banReason: string | null
  banExpires: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
}

type ListUsersResult = {
  users: UserWithRole[]
  total: number
  limit?: number
  offset?: number
}

export const config: ApiRouteConfig = {
  name: 'AdminListUsers',
  type: 'api',
  path: '/admin/users',
  method: 'GET',
  description: 'List all users (admin only)',
  emits: [],
  flows: ['admin-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, adminMiddleware],
  responseSchema: {
    200: z.object({
      users: z.array(z.object({
        id: z.string(),
        name: z.string().nullish(),
        email: z.string(),
        emailVerified: z.boolean(),
        role: z.string().nullish(),
        banned: z.boolean().nullish(),
        banReason: z.string().nullish(),
        banExpires: z.string().nullish(),
        createdAt: z.string(),
      })),
      total: z.number(),
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

export const handler: Handlers['AdminListUsers'] = async (req, { logger }) => {
  try {
    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    const limit = req.queryParams?.limit as string | undefined
    const offset = req.queryParams?.offset as string | undefined
    const searchValue = req.queryParams?.searchValue as string | undefined
    const searchField = req.queryParams?.searchField as string | undefined
    const sortBy = req.queryParams?.sortBy as string | undefined
    const sortDirection = req.queryParams?.sortDirection as string | undefined

    logger.info('Admin list users request received', {
      userId: req.user.id,
      limit,
      offset,
    })

    // Call Better Auth's admin listUsers endpoint
    // Better Auth returns the users list directly, or throws an error
    let data: ListUsersResult
    try {
      data = await auth.api.listUsers({
        query: {
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
          searchValue,
          searchField: searchField as 'name' | 'email' | undefined,
          sortBy,
          sortDirection: sortDirection as 'asc' | 'desc' | undefined,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as ListUsersResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to list users', {
        error: error.message || 'Unknown error',
      })

      return {
        status: 400,
        body: { error: error.message || 'Failed to list users' },
      }
    }

    logger.info('Admin listed users successfully', {
      userId: req.user.id,
      count: data.users?.length || 0,
    })

    return {
      status: 200,
      body: {
        users: (data.users || []).map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.role || null,
          banned: user.banned || false,
          banReason: user.banReason || null,
          banExpires: user.banExpires ? new Date(user.banExpires).toISOString() : null,
          createdAt: new Date(user.createdAt).toISOString(),
        })),
        total: data.total || 0,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Admin list users error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to list users' },
    }
  }
}
