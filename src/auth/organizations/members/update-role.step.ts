import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationOwnerMiddleware } from '../../middleware/organization.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../../lib/state-request'

const bodySchema = z.object({
  role: z.enum(['owner', 'admin', 'member'], {
    message: 'Role must be one of: owner, admin, member',
  }),
})

export const config: ApiRouteConfig = {
  name: 'UpdateMemberRole',
  type: 'api',
  path: '/organizations/:orgId/members/:memberId/role',
  method: 'PATCH',
  description: 'Update a member role in an organization (owner only)',
  emits: ['organization.member.roleUpdate.requested'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationOwnerMiddleware],
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
  },
}

export const handler: Handlers['UpdateMemberRole'] = async (req, { emit, logger, state }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const memberId = req.pathParams?.memberId as string
    const { role } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Update member role request received', {
      userId: req.user.id,
      organizationId: orgId,
      memberId,
      newRole: role,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'org-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'organization.member.roleUpdate.requested',
      data: {
        requestId,
        organizationId: orgId,
        memberId,
        role,
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
      body: (result as { status: 'completed'; data: { member: { id: string; organizationId: string; userId: string; role: string; createdAt: string } } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Update member role error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to update member role' },
    }
  }
}
