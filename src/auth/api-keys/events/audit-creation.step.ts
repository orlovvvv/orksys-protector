import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  apiKeyId: z.string(),
  userId: z.string(),
  name: z.string(),
  prefix: z.string(),
  expiresAt: z.string().nullish(),
  createdAt: z.string(),
})

export const config: EventConfig = {
  name: 'AuditApiKeyCreation',
  type: 'event',
  description: 'Log API key creation to audit log',
  subscribes: ['api-key.created'],
  emits: [],
  input: inputSchema,
  flows: ['api-key-management'],
}

export const handler: Handlers['AuditApiKeyCreation'] = async (input, { logger, state }) => {
  const { apiKeyId, userId, name, prefix, expiresAt, createdAt } = input

  logger.info('API key created', {
    apiKeyId,
    userId,
    name,
    prefix,
    expiresAt,
    createdAt,
    event: 'audit-log',
  })

  // Store audit record in state
  await state.set('api-key-audit', apiKeyId, {
    action: 'created',
    userId,
    name,
    prefix,
    expiresAt,
    createdAt,
    auditLoggedAt: new Date().toISOString(),
  })

  // TODO: Write to persistent audit log database/table
}
