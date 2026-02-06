import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'

const inputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
})

export const config: EventConfig = {
  name: 'ProcessRegistration',
  type: 'event',
  description: 'Process user registration in the background',
  subscribes: ['user.registration.process'],
  emits: ['user.registration.completed', 'user.registration.failed'],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['ProcessRegistration'] = async (input, { emit, logger }) => {
  const { email, password, name } = input

  logger.info('Processing user registration', { email, name })

  try {
    // Use Better Auth to create user
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    })

    if (result.error) {
      const errorMessage = result.error.message || 'Registration failed'

      logger.error('User registration failed', {
        error: errorMessage,
        email,
      })

      // Emit failure event
      await emit({
        topic: 'user.registration.failed',
        data: {
          email,
          name,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })

      return
    }

    const { user, session } = result

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
    })

    // Emit success event with user data
    await emit({
      topic: 'user.registration.completed',
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        token: session?.token || null,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('User registration error', {
      error: message,
      email,
    })

    // Emit failure event
    await emit({
      topic: 'user.registration.failed',
      data: {
        email,
        name,
        error: message,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
