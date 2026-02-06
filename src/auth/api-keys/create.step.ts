import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { authMiddleware } from '../middleware/auth.middleware'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'

// Default API key expiration: 30 days in seconds
const DEFAULT_API_KEY_EXPIRATION = 60 * 60 * 24 * 30

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  expiresIn: z.number().optional(),
})

export const config: ApiRouteConfig = {
  name: 'CreateApiKey',
  type: 'api',
  path: '/auth/api-keys',
  method: 'POST',
  description: 'Create a new API key for the authenticated user',
  emits: ['api-key.creation.process'],
  virtualSubscribes: ['api-key.creation.completed'],
  flows: ['api-key-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  bodySchema,
  responseSchema: {
    201: z.object({
      id: z.string(),
      key: z.string().describe('The API key - show this once only'),
      name: z.string(),
      prefix: z.string(),
      expiresAt: z.string().optional(),
    }),
    401: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['CreateApiKey'] = async (req, { emit, logger }) => {
  try {
    const session = req.session
    const { name, expiresIn } = bodySchema.parse(req.body)

    logger.info('API key creation request', {
      userId: session.user.id,
      name,
    })

    // Emit event for background processing
    await emit({
      topic: 'api-key.creation.process',
      data: {
        userId: session.user.id,
        name,
        expiresIn,
      },
    })

    // Create API key using Better Auth synchronously
    const result = await auth.api.createApiKey({
      body: {
        userId: session.user.id,
        name,
        expiresIn: expiresIn ?? DEFAULT_API_KEY_EXPIRATION,
      },
    })

    // Better Auth returns the key directly or an error
    const apiKey = result as unknown as {
      id: string
      key: string
      name: string | null
      prefix: string | null
      expiresAt: Date | null
    } | { error: { message: string } }

    if ('error' in apiKey) {
      logger.error('API key creation failed', {
        userId: session.user.id,
        error: apiKey.error.message,
      })

      return {
        status: 500,
        body: { error: 'Failed to create API key' },
      }
    }

    logger.info('API key created successfully', {
      apiKeyId: apiKey.id,
      userId: session.user.id,
    })

    // Return the full key (only time it's shown)
    return {
      status: 201,
      body: {
        id: apiKey.id,
        key: apiKey.key, // SHOW ONCE
        name: apiKey.name,
        prefix: apiKey.prefix,
        expiresAt: apiKey.expiresAt?.toISOString() || null,
        warning: 'Save this key now. You will not be able to see it again.',
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('API key creation error', {
      error: message,
      userId: req.session?.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to create API key' },
    }
  }
}
