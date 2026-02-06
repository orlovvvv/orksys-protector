import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  apiKeyId: z.string(),
  userId: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogApiKeyDeleted',
  type: 'event',
  description: 'Log successful API key deletion',
  subscribes: ['api-key.deletion.completed'],
  emits: [],
  input: inputSchema,
  flows: ['api-key-management'],
}

export const handler: Handlers['LogApiKeyDeleted'] = async (input, { logger, state }) => {
  const { apiKeyId, userId, timestamp } = input

  logger.info('API key deletion workflow completed', {
    apiKeyId,
    userId,
    deletedAt: timestamp,
    workflowComplete: true,
  })

  // Store API key deletion in state for audit
  await state.set('api-key-deletions', `${apiKeyId}-${Date.now()}`, {
    apiKeyId,
    userId,
    deletedAt: timestamp,
  })
}
