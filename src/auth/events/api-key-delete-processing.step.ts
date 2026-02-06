import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'

const inputSchema = z.object({
  userId: z.string(),
  apiKeyId: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessDeleteApiKey',
  type: 'event',
  description: 'Process API key deletion in the background',
  subscribes: ['api-key.deletion.process'],
  emits: ['api-key.deletion.completed', 'api-key.deletion.failed'],
  input: inputSchema,
  flows: ['api-key-management'],
}

export const handler: Handlers['ProcessDeleteApiKey'] = async (input, { emit, logger }) => {
  const { userId, apiKeyId } = input

  logger.info('Processing API key deletion', {
    userId,
    apiKeyId,
  })

  try {
    // Delete API key using Better Auth
    const result = await auth.api.deleteApiKey({
      body: { keyId: apiKeyId },
    })

    if (result.error) {
      const errorMessage = result.error.message || 'Failed to delete API key'

      logger.error('API key deletion failed', {
        userId,
        apiKeyId,
        error: errorMessage,
      })

      // Emit failure event
      await emit({
        topic: 'api-key.deletion.failed',
        data: {
          userId,
          apiKeyId,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })

      return
    }

    logger.info('API key deleted successfully', {
      apiKeyId,
      userId,
    })

    // Emit success event
    await emit({
      topic: 'api-key.deletion.completed',
      data: {
        apiKeyId,
        userId,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('API key deletion error', {
      error: message,
      apiKeyId,
      userId,
    })

    // Emit failure event
    await emit({
      topic: 'api-key.deletion.failed',
      data: {
        userId,
        apiKeyId,
        error: message,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
