import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  email: z.string(),
  ipAddress: z.string().nullish(),
  timestamp: z.string().optional(),
})

export const config: EventConfig = {
  name: 'AuditUserLogin',
  type: 'event',
  description: 'Log user login to audit log',
  subscribes: ['user.login.process'],
  emits: [],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['AuditUserLogin'] = async (input, { logger, state }) => {
  const { email, ipAddress, timestamp } = input

  logger.info('User login audit', {
    email,
    ipAddress,
    loggedInAt: timestamp || new Date().toISOString(),
    event: 'audit-log',
  })

  // Store audit record in state
  await state.set('user-login-audit', `${email}-${Date.now()}`, {
    action: 'login',
    email,
    ipAddress,
    loggedInAt: timestamp || new Date().toISOString(),
    auditLoggedAt: new Date().toISOString(),
  })

  // TODO: Write to persistent audit log database/table
}
