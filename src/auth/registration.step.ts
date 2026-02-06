import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../lib/better-auth/auth'
import { errorHandlerMiddleware } from './middleware/error-handler.middleware'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
})

export const config: ApiRouteConfig = {
  name: 'UserRegistration',
  type: 'api',
  path: '/auth/register',
  method: 'POST',
  description: 'Register a new user with email and password',
  emits: ['user.registration.process'],
  virtualSubscribes: ['user.registration.completed'],
  flows: ['authentication'],
  middleware: [errorHandlerMiddleware],
  bodySchema,
  responseSchema: {
    201: z.object({
      user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
      }),
      token: z.string().optional().describe('Bearer token for API authentication'),
    }),
    400: z.object({
      error: z.string(),
    }),
    409: z.object({
      error: z.string(),
    }),
  },
}

/**
 * Extract client IP address from request headers.
 */
function extractClientIp(headers: Record<string, string | string[] | undefined>): string | null {
  const xff = headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  const xri = headers['x-real-ip']
  if (typeof xri === 'string' && xri.trim()) {
    return xri.trim()
  }
  return null
}

export const handler: Handlers['UserRegistration'] = async (req, { emit, logger }) => {
  try {
    const { email, password, name } = bodySchema.parse(req.body)

    logger.info('User registration request received', { email, name })

    // Validate password format before emitting
    if (password.length < 8) {
      return {
        status: 400,
        body: { error: 'Password must be at least 8 characters' },
      }
    }

    // Validate email format before emitting
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return {
        status: 400,
        body: { error: 'Invalid email format' },
      }
    }

    // Emit event for background processing
    await emit({
      topic: 'user.registration.process',
      data: {
        email,
        password,
        name,
      },
    })

    // For auth flows, we still need to do the actual registration synchronously
    // to return the user data and token to the client
    // In a pure async system, this would return a "processing" status
    // and the client would poll or receive a webhook

    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    })

    if (result.error) {
      logger.error('User registration failed', {
        error: result.error.message,
        email,
      })

      const errorMessage = result.error.message?.toLowerCase() || ''
      if (errorMessage.includes('email') || errorMessage.includes('exists') || errorMessage.includes('duplicate')) {
        return {
          status: 409,
          body: { error: 'User with this email already exists' },
        }
      }

      return {
        status: 400,
        body: { error: 'Registration failed' },
      }
    }

    const { user, session } = result

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
    })

    return {
      status: 201,
      body: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name || '',
        },
        token: session?.token,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('User registration error', {
      error: message,
      email: req.body?.email,
    })

    return {
      status: 500,
      body: { error: 'Registration failed' },
    }
  }
}
