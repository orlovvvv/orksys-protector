import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../lib/state-request'

const bodySchema = z.object({
  organizationId: z.string(),
})

export const config: ApiRouteConfig = {
  name: 'SetActiveOrganization',
  type: 'api',
  path: '/organizations/active',
  method: 'POST',
  description: 'Set the active organization for the current session',
  emits: ['organization.setActive.requested'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      success: z.boolean(),
      activeOrganizationId: z.string(),
    }),
    400: z.object({
      error: z.string(),
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

export const handler: Handlers['SetActiveOrganization'] = async (req, { emit, logger, state }) => {
  try {
    const { organizationId } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Set active organization request received', {
      userId: req.user.id,
      organizationId,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'org-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'organization.setActive.requested',
      data: {
        requestId,
        organizationId,
        authorization: authorization ?? '',
        userId: req.user.id,
        userEmail: req.user.email,
      },
    })

    // Wait for the result from the event handler
    const result = await waitForRequestResult(state, 'org-requests', requestId)

    if (result.status === 'failed') {
      const statusCode = result.statusCode ?? 400
      return {
        status: statusCode as 400 | 403 | 404 | 500,
        body: { error: result.error },
      }
    }

    // Return the successful result
    return {
      status: 200,
      body: (result as { status: 'completed'; data: { success: boolean; activeOrganizationId: string } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Set active organization error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to set active organization' },
    }
  }
}
