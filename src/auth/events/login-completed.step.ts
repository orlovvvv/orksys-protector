import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  token: z.string().nullable(),
  ipAddress: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogLoginCompleted',
  type: 'event',
  description: 'Log successful user login',
  subscribes: ['user.login.completed'],
  emits: [],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['LogLoginCompleted'] = async (input, { logger, state }) => {
  const { userId, email, name, token, ipAddress, timestamp } = input

  logger.info('User login workflow completed', {
    userId,
    email,
    name,
    ipAddress,
    hasToken: !!token,
    loggedInAt: timestamp,
    workflowComplete: true,
  })

  // Store login in state for audit trail
  await state.set('logins', `${userId}-${Date.now()}`, {
    userId,
    email,
    ipAddress,
    loggedInAt: timestamp,
  })
}
