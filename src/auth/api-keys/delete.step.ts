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
  emits: ['api-key.deletion.process'],
  virtualSubscribes: ['api-key.deletion.completed'],
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
  try {
    const session = req.session
    const apiKeyId = req.pathParams?.id

    // Validate the API key ID
    if (!apiKeyId) {
      return {
        status: 400,
        body: { error: 'API key ID is required' },
      }
    }

    logger.info('API key deletion request', {
      userId: session.user.id,
      apiKeyId,
    })

    // First, verify the user owns this API key by listing their keys
    const listResult = await auth.api.listApiKeys({
      headers: req.headers as any,
    })

    if (listResult.error) {
      logger.error('Failed to verify API key ownership', {
        userId: session.user.id,
        apiKeyId,
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
      logger.warn('Attempted to delete API key not owned by user', {
        userId: session.user.id,
        apiKeyId,
      })
      return {
        status: 403,
        body: { error: 'You do not have permission to delete this API key' },
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
      logger.error('Failed to delete API key', {
        userId: session.user.id,
        apiKeyId,
        error: result.error.message,
      })

      // Check if it's a "not found" error
      const errorMessage = result.error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
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

    return {
      status: 200,
      body: { success: true },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('API key deletion error', {
      error: message,
      apiKeyId: req.pathParams?.id,
      userId: req.session?.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to delete API key' },
    }
  }
}
