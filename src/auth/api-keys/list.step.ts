import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { authMiddleware } from '../middleware/auth.middleware'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'

export const config: ApiRouteConfig = {
  name: 'ListApiKeys',
  type: 'api',
  path: '/auth/api-keys',
  method: 'GET',
  description: 'List all API keys for the authenticated user',
  emits: [],
  flows: ['api-key-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  responseSchema: {
    200: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        prefix: z.string(),
        expiresAt: z.string().optional(),
        createdAt: z.string(),
        lastRequest: z.string().optional(),
      })
    ),
    401: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['ListApiKeys'] = async (req, { logger }) => {
  try {
    const session = req.session

    logger.info('API key list request', { userId: session.user.id })

    // List API keys using Better Auth
    const result = await auth.api.listApiKeys({
      headers: req.headers as any,
    })

    if (result.error) {
      logger.error('Failed to list API keys', {
        userId: session.user.id,
        error: result.error.message,
      })

      return {
        status: 500,
        body: { error: 'Failed to list API keys' },
      }
    }

    // Better Auth returns array directly
    const apiKeys = result as unknown as Array<{
      id: string
      name: string | null
      prefix: string | null
      expiresAt: Date | null
      createdAt: Date
      lastRequest: Date | null
    }>

    logger.info('API keys retrieved', {
      userId: session.user.id,
      count: apiKeys.length,
    })

    // Map to response format (keys are NOT included - only metadata)
    return {
      status: 200,
      body: apiKeys.map((key) => ({
        id: key.id,
        name: key.name || '',
        prefix: key.prefix || '',
        expiresAt: key.expiresAt?.toISOString() || null,
        createdAt: key.createdAt.toISOString(),
        lastRequest: key.lastRequest?.toISOString() || null,
      })),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to list API keys', {
      error: message,
      userId: req.session?.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to list API keys' },
    }
  }
}
