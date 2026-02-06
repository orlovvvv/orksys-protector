import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'

const inputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  ipAddress: z.string().optional(),
})

export const config: EventConfig = {
  name: 'ProcessLogin',
  type: 'event',
  description: 'Process user login in the background',
  subscribes: ['user.login.process'],
  emits: ['user.login.completed', 'user.login.failed'],
  input: inputSchema,
  flows: ['authentication'],
}

export const handler: Handlers['ProcessLogin'] = async (input, { emit, logger }) => {
  const { email, password, ipAddress = 'unknown' } = input

  logger.info('Processing user login', { email, ipAddress })

  try {
    // Use Better Auth to sign in
    const result = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    })

    if (result.error) {
      const errorMessage = result.error.message || 'Login failed'

      logger.warn('User login failed', {
        email,
        error: errorMessage,
      })

      // Emit failure event
      await emit({
        topic: 'user.login.failed',
        data: {
          email,
          error: errorMessage,
          ipAddress,
          timestamp: new Date().toISOString(),
        },
      })

      return
    }

    const { user, session } = result

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
    })

    // Emit success event with user data
    await emit({
      topic: 'user.login.completed',
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        token: session?.token || null,
        ipAddress,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('User login error', {
      error: message,
      email,
    })

    // Emit failure event
    await emit({
      topic: 'user.login.failed',
      data: {
        email,
        error: message,
        ipAddress,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
