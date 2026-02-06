import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'

// Default API key expiration: 30 days in seconds
const DEFAULT_API_KEY_EXPIRATION = 60 * 60 * 24 * 30

const inputSchema = z.object({
  userId: z.string(),
  name: z.string().min(1).max(100),
  expiresIn: z.number().optional(),
})

export const config: EventConfig = {
  name: 'ProcessCreateApiKey',
  type: 'event',
  description: 'Process API key creation in the background',
  subscribes: ['api-key.creation.process'],
  emits: ['api-key.creation.completed', 'api-key.creation.failed'],
  input: inputSchema,
  flows: ['api-key-management'],
}

export const handler: Handlers['ProcessCreateApiKey'] = async (input, { emit, logger }) => {
  const { userId, name, expiresIn } = input

  logger.info('Processing API key creation', {
    userId,
    name,
  })

  try {
    // Create API key using Better Auth
    const result = await auth.api.createApiKey({
      body: {
        userId,
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
      const errorMessage = apiKey.error.message || 'Failed to create API key'

      logger.error('API key creation failed', {
        userId,
        error: errorMessage,
      })

      // Emit failure event
      await emit({
        topic: 'api-key.creation.failed',
        data: {
          userId,
          name,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })

      return
    }

    logger.info('API key created successfully', {
      apiKeyId: apiKey.id,
      userId,
    })

    // Emit success event with API key data
    await emit({
      topic: 'api-key.creation.completed',
      data: {
        apiKeyId: apiKey.id,
        key: apiKey.key,
        userId,
        name: apiKey.name,
        prefix: apiKey.prefix,
        expiresAt: apiKey.expiresAt?.toISOString() || null,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('API key creation error', {
      error: message,
      userId,
    })

    // Emit failure event
    await emit({
      topic: 'api-key.creation.failed',
      data: {
        userId,
        name,
        error: message,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
