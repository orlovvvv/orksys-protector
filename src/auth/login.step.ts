import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../lib/better-auth/auth'
import { errorHandlerMiddleware } from './middleware/error-handler.middleware'

/**
 * Extract client IP address from request headers.
 * Priority: x-forwarded-for (first IP) > x-real-ip > null
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

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
})

export const config: ApiRouteConfig = {
  name: 'UserLogin',
  type: 'api',
  path: '/auth/login',
  method: 'POST',
  description: 'Login with email and password',
  emits: ['user.login.process'],
  virtualSubscribes: ['user.login.completed'],
  flows: ['authentication'],
  middleware: [errorHandlerMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
      }),
      token: z.string().optional().describe('Bearer token for API authentication'),
    }),
    401: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['UserLogin'] = async (req, { emit, logger }) => {
  try {
    const { email, password } = bodySchema.parse(req.body)
    const ipAddress = extractClientIp(req.headers)

    logger.info('User login request received', { email, ipAddress })

    // Emit event for background processing
    await emit({
      topic: 'user.login.process',
      data: {
        email,
        password,
        ipAddress,
      },
    })

    // For auth flows, we still need to do the actual login synchronously
    // to return the user data and token to the client
    const result = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    })

    if (result.error) {
      logger.warn('User login failed', {
        email,
        error: result.error.message,
      })

      return {
        status: 401,
        body: { error: 'Invalid email or password' },
      }
    }

    const { user, session } = result

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
    })

    return {
      status: 200,
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
    logger.error('User login error', {
      error: message,
      email: req.body?.email,
    })

    return {
      status: 500,
      body: { error: 'Login failed' },
    }
  }
}
