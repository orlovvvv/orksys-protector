import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Simple flexible schema for API key failed events
const inputSchema = z.object({
  userId: z.string(),
  name: z.string().optional(),
  apiKeyId: z.string().optional(),
  error: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogApiKeyFailed',
  type: 'event',
  description: 'Log failed API key operations',
  subscribes: ['api-key.creation.failed', 'api-key.deletion.failed'],
  emits: [],
  input: inputSchema,
  flows: ['api-key-management'],
}

export const handler: Handlers['LogApiKeyFailed'] = async (input, { logger, state }) => {
  const { timestamp, userId, error } = input

  if (input.apiKeyId) {
    // Deletion failure
    const { apiKeyId } = input
    logger.warn('API key deletion workflow failed', {
      apiKeyId,
      userId,
      error,
      failedAt: timestamp,
      workflowFailed: true,
    })

    await state.set('api-key-deletion-failures', `${apiKeyId}-${Date.now()}`, {
      userId,
      apiKeyId,
      error,
      failedAt: timestamp,
    })
  } else {
    // Creation failure
    const { name } = input
    logger.warn('API key creation workflow failed', {
      userId,
      name,
      error,
      failedAt: timestamp,
      workflowFailed: true,
    })

    await state.set('api-key-creation-failures', `${userId}-${Date.now()}`, {
      userId,
      name,
      error,
      failedAt: timestamp,
    })
  }
}
