import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  sentAt: z.string(),
})

export const config: EventConfig = {
  name: 'LogWelcomeEmailSent',
  type: 'event',
  description: 'Log welcome email sent completion',
  subscribes: ['user.welcome-email.sent'],
  emits: [],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['LogWelcomeEmailSent'] = async (input, { logger }) => {
  const { userId, email, name, sentAt } = input

  logger.info('Welcome email workflow completed', {
    userId,
    email,
    name,
    sentAt,
    workflowComplete: true,
  })

  // Final log entry - registration + welcome email flow is complete
  logger.info('User registration flow complete', {
    userId,
    email,
    steps: ['registration', 'welcome-email'],
    status: 'completed',
  })
}
