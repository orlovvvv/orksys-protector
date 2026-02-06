import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const createFailedSchema = z.object({
  userId: z.string(),
  name: z.string(),
  error: z.string(),
  timestamp: z.string(),
})

const deleteFailedSchema = z.object({
  userId: z.string(),
  apiKeyId: z.string(),
  error: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogApiKeyFailed',
  type: 'event',
  description: 'Log failed API key operations',
  subscribes: ['api-key.creation.failed', 'api-key.deletion.failed'],
  emits: [],
  input: z.union([createFailedSchema, deleteFailedSchema]),
  flows: ['api-key-management'],
}

export const handler: Handlers['LogApiKeyFailed'] = async (input, { logger, state }) => {
  const { timestamp } = input

  if ('apiKeyId' in input) {
    // Deletion failure
    const { userId, apiKeyId, error } = input
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
    const { userId, name, error } = input
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
