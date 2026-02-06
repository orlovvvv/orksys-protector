import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { authMiddleware } from './middleware/auth.middleware'
import { errorHandlerMiddleware } from './middleware/error-handler.middleware'

export const config: ApiRouteConfig = {
  name: 'GetMe',
  type: 'api',
  path: '/auth/me',
  method: 'GET',
  description: 'Get current authenticated user',
  emits: [],
  flows: ['authentication'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  responseSchema: {
    200: z.object({
      user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
        emailVerified: z.boolean().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    }),
    401: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['GetMe'] = async (req, { logger }) => {
  // Session is guaranteed by authMiddleware, but validate for safety
  if (!req.session?.user) {
    logger.warn('Invalid session in me endpoint')
    return {
      status: 401,
      body: { error: 'Invalid session' },
    }
  }

  const { user } = req.session

  logger.info('Get current user', {
    userId: user.id,
  })

  return {
    status: 200,
    body: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        emailVerified: user.emailVerified,
        createdAt: user.createdAt?.toISOString(),
        updatedAt: user.updatedAt?.toISOString(),
      },
    },
  }
}
