import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  email: z.string(),
  name: z.string(),
  timestamp: z.string().optional(),
})

export const config: EventConfig = {
  name: 'AuditUserRegistration',
  type: 'event',
  description: 'Log user registration to audit log',
  subscribes: ['user.registration.process'],
  emits: [],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['AuditUserRegistration'] = async (input, { logger, state }) => {
  const { email, name, timestamp } = input

  logger.info('User registration audit', {
    email,
    name,
    registeredAt: timestamp || new Date().toISOString(),
    event: 'audit-log',
  })

  // Store audit record in state
  await state.set('user-registration-audit', email, {
    action: 'registration',
    email,
    name,
    registeredAt: timestamp || new Date().toISOString(),
    auditLoggedAt: new Date().toISOString(),
  })

  // TODO: Write to persistent audit log database/table
}
