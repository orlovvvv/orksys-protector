import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  apiKeyId: z.string(),
  userId: z.string(),
  deletedAt: z.string(),
})

export const config: EventConfig = {
  name: 'AuditApiKeyDeletion',
  type: 'event',
  description: 'Log API key deletion to audit log',
  subscribes: ['api-key.deleted'],
  emits: [],
  input: inputSchema,
  flows: ['api-key-management'],
}

export const handler: Handlers['AuditApiKeyDeletion'] = async (input, { logger, state }) => {
  const { apiKeyId, userId, deletedAt } = input

  logger.info('API key deleted', {
    apiKeyId,
    userId,
    deletedAt,
    event: 'audit-log',
  })

  // Store deletion audit record in state
  await state.set('api-key-audit', `${apiKeyId}:deleted`, {
    action: 'deleted',
    userId,
    deletedAt,
    auditLoggedAt: new Date().toISOString(),
  })

  // TODO: Write to persistent audit log database/table
}
