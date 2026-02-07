import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { authMiddleware } from '../middleware/auth.middleware'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'

export const config: ApiRouteConfig = {
  name: 'DeleteApiKey',
  type: 'api',
  path: '/auth/api-keys/:id',
  method: 'DELETE',
  description: 'Delete an API key owned by the authenticated user',
  emits: ['api-key.deletion.process', 'api-key.deletion.completed', 'api-key.deletion.failed'],
  flows: ['api-key-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  responseSchema: {
    200: z.object({
      success: z.boolean(),
    }),
    401: z.object({
      error: z.string(),
    }),
    403: z.object({
      error: z.string(),
    }),
    404: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['DeleteApiKey'] = async (req, { emit, logger }) => {
  const session = req.session
  const apiKeyId = req.pathParams?.id

  // Validate the API key ID
  if (!apiKeyId) {
    await emit({
      topic: 'api-key.deletion.failed',
      data: {
        userId: session.user.id,
        apiKeyId: '',
        error: 'API key ID is required',
        timestamp: new Date().toISOString(),
      },
    })
    return {
      status: 400,
      body: { error: 'API key ID is required' },
    }
  }

  logger.info('API key deletion request', {
    userId: session.user.id,
    apiKeyId,
  })

  try {
    // First, verify the user owns this API key by listing their keys
    const listResult = await auth.api.listApiKeys({
      headers: req.headers as any,
    })

    if (listResult.error) {
      const errorMessage = listResult.error.message || 'Failed to verify API key ownership'

      logger.error('Failed to verify API key ownership', {
        userId: session.user.id,
        apiKeyId,
        error: errorMessage,
      })

      // Emit failure event
      await emit({
        topic: 'api-key.deletion.failed',
        data: {
          userId: session.user.id,
          apiKeyId,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })

      return {
        status: 500,
        body: { error: 'Failed to verify API key ownership' },
      }
    }

    // Better Auth returns array directly
    const apiKeys = listResult as unknown as Array<{ id: string; userId: string }>
    const ownsKey = apiKeys.some((key) => key.id === apiKeyId && key.userId === session.user.id)

    if (!ownsKey) {
      const error = 'You do not have permission to delete this API key'

      logger.warn('Attempted to delete API key not owned by user', {
        userId: session.user.id,
        apiKeyId,
      })

      // Emit failure event
      await emit({
        topic: 'api-key.deletion.failed',
        data: {
          userId: session.user.id,
          apiKeyId,
          error,
          timestamp: new Date().toISOString(),
        },
      })

      return {
        status: 403,
        body: { error },
      }
    }

    // Emit event for background processing
    await emit({
      topic: 'api-key.deletion.process',
      data: {
        userId: session.user.id,
        apiKeyId,
      },
    })

    // Delete API key using Better Auth synchronously
    const result = await auth.api.deleteApiKey({
      body: { keyId: apiKeyId },
    })

    if (result.error) {
      const errorMessage = result.error.message || 'Failed to delete API key'

      logger.error('Failed to delete API key', {
        userId: session.user.id,
        apiKeyId,
        error: errorMessage,
      })

      // Emit failure event
      await emit({
        topic: 'api-key.deletion.failed',
        data: {
          userId: session.user.id,
          apiKeyId,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })

      // Check if it's a "not found" error
      const errorLower = errorMessage.toLowerCase()
      if (errorLower.includes('not found') || errorLower.includes('does not exist')) {
        return {
          status: 404,
          body: { error: 'API key not found' },
        }
      }

      return {
        status: 500,
        body: { error: 'Failed to delete API key' },
      }
    }

    logger.info('API key deleted successfully', {
      apiKeyId,
      userId: session.user.id,
    })

    // Emit success event
    await emit({
      topic: 'api-key.deletion.completed',
      data: {
        apiKeyId,
        userId: session.user.id,
        timestamp: new Date().toISOString(),
      },
    })

    return {
      status: 200,
      body: { success: true },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error('API key deletion error', {
      error: message,
      apiKeyId,
      userId: session.user.id,
    })

    // Emit failure event
    await emit({
      topic: 'api-key.deletion.failed',
      data: {
        userId: session.user.id,
        apiKeyId,
        error: message,
        timestamp: new Date().toISOString(),
      },
    })

    return {
      status: 500,
      body: { error: 'Failed to delete API key' },
    }
  }
}
