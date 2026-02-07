import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../../lib/state-request'

const bodySchema = z.object({
  invitationId: z.string(),
})

export const config: ApiRouteConfig = {
  name: 'AcceptInvitation',
  type: 'api',
  path: '/organizations/invitations/accept',
  method: 'POST',
  description: 'Accept an invitation to join an organization',
  emits: ['organization.invitation.accept.requested'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      member: z.object({
        id: z.string(),
        organizationId: z.string(),
        userId: z.string(),
        role: z.string(),
        createdAt: z.string(),
      }),
      organization: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
      }),
    }),
    400: z.object({
      error: z.string(),
    }),
    401: z.object({
      error: z.string(),
    }),
    404: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['AcceptInvitation'] = async (req, { emit, logger, state }) => {
  try {
    const { invitationId } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Accept invitation request received', {
      userId: req.user.id,
      invitationId,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'org-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'organization.invitation.accept.requested',
      data: {
        requestId,
        invitationId,
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
      body: (result as { status: 'completed'; data: { member: { id: string; organizationId: string; userId: string; role: string; createdAt: string }; organization: { id: string; name: string; slug: string } } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Accept invitation error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to accept invitation' },
    }
  }
}
