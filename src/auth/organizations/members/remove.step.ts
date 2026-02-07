import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../../middleware/organization.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../../lib/state-request'

export const config: ApiRouteConfig = {
  name: 'RemoveOrganizationMember',
  type: 'api',
  path: '/organizations/:orgId/members/:memberId',
  method: 'DELETE',
  description: 'Remove a member from an organization',
  emits: ['organization.member.remove.requested'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
  responseSchema: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
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

export const handler: Handlers['RemoveOrganizationMember'] = async (req, { emit, logger, state }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const memberId = req.pathParams?.memberId as string

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Remove member request received', {
      userId: req.user.id,
      organizationId: orgId,
      memberId,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'org-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'organization.member.remove.requested',
      data: {
        requestId,
        organizationId: orgId,
        memberId,
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
        status: statusCode as 400 | 404,
        body: { error: result.error },
      }
    }

    // Return the successful result
    return {
      status: 200,
      body: (result as { status: 'completed'; data: { success: boolean; message: string } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Remove member error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to remove member' },
    }
  }
}
