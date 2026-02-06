import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  token: z.string().nullable(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'LogRegistrationCompleted',
  type: 'event',
  description: 'Log successful user registration and send welcome email',
  subscribes: ['user.registration.completed'],
  emits: ['user.welcome-email.process'],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['LogRegistrationCompleted'] = async (input, { emit, logger, state }) => {
  const { userId, email, name, token, timestamp } = input

  logger.info('User registration workflow completed', {
    userId,
    email,
    name,
    hasToken: !!token,
    registeredAt: timestamp,
    workflowComplete: true,
  })

  // Store registration completion in state
  await state.set('registrations', userId, {
    email,
    name,
    completedAt: new Date().toISOString(),
    status: 'completed',
  })

  // Emit event for welcome email processing
  await emit({
    topic: 'user.welcome-email.process',
    data: {
      userId,
      email,
      name,
      timestamp,
    },
  })
}
