import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  email: z.string().email(),
  error: z.string(),
  ipAddress: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogLoginFailed',
  type: 'event',
  description: 'Log failed user login attempt',
  subscribes: ['user.login.failed'],
  emits: [],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['LogLoginFailed'] = async (input, { logger, state }) => {
  const { email, error, ipAddress, timestamp } = input

  logger.warn('User login workflow failed', {
    email,
    error,
    ipAddress,
    failedAt: timestamp,
    workflowFailed: true,
  })

  // Store failed login attempt in state for security monitoring
  await state.set('login-failures', `${email}-${Date.now()}`, {
    email,
    error,
    ipAddress,
    failedAt: timestamp,
  })
}
