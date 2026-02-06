import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  apiKeyId: z.string(),
  key: z.string(),
  userId: z.string(),
  name: z.string().nullable(),
  prefix: z.string().nullable(),
  expiresAt: z.string().nullable(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogApiKeyCreated',
  type: 'event',
  description: 'Log successful API key creation',
  subscribes: ['api-key.creation.completed'],
  emits: [],
  input: inputSchema,
  flows: ['api-key-management'],
}

export const handler: Handlers['LogApiKeyCreated'] = async (input, { logger, state }) => {
  const { apiKeyId, userId, name, prefix, expiresAt, timestamp } = input

  logger.info('API key creation workflow completed', {
    apiKeyId,
    userId,
    name,
    prefix,
    expiresAt,
    createdAt: timestamp,
    workflowComplete: true,
  })

  // Store API key creation in state for audit
  await state.set('api-key-creations', apiKeyId, {
    userId,
    name,
    prefix,
    expiresAt,
    createdAt: timestamp,
  })
}
