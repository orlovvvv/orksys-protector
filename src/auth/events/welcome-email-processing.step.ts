import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

const inputSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  timestamp: z.string(),
})

export const config: EventConfig = {
  name: 'SendWelcomeEmail',
  type: 'event',
  description: 'Send welcome email to newly registered user',
  subscribes: ['user.welcome-email.process'],
  emits: ['user.welcome-email.sent'],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['SendWelcomeEmail'] = async (input, { logger, state, emit }) => {
  const { userId, email, name, timestamp } = input

  logger.info('Welcome email triggered', {
    userId,
    email,
    name,
    timestamp,
  })

  // Store welcome email status in state
  await state.set('welcome-email', userId, {
    sent: true,
    sentAt: new Date().toISOString(),
    email,
    name,
  })

  // TODO: Integrate with email service (Resend, SendGrid, AWS SES, etc.)
  // For now, we're just logging and storing state

  logger.info('Welcome email processed', {
    to: email,
    name,
    userId,
  })

  // Emit completion event
  await emit({
    topic: 'user.welcome-email.sent',
    data: {
      userId,
      email,
      name,
      sentAt: new Date().toISOString(),
    },
  })
}
