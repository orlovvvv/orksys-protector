import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  error: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogRegistrationFailed',
  type: 'event',
  description: 'Log failed user registration',
  subscribes: ['user.registration.failed'],
  emits: [],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['LogRegistrationFailed'] = async (input, { logger, state }) => {
  const { email, name, error, timestamp } = input

  logger.warn('User registration workflow failed', {
    email,
    name,
    error,
    failedAt: timestamp,
    workflowFailed: true,
  })

  // Store registration failure in state for monitoring
  await state.set('registration-failures', `${email}-${Date.now()}`, {
    email,
    name,
    error,
    failedAt: timestamp,
  })
}
