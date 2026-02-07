import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../../middleware/organization.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../../lib/state-request'

const bodySchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member'], {
    message: 'Role must be one of: owner, admin, member',
  }),
  expiresIn: z.number().optional().default(7 * 24 * 60 * 60), // 7 days default
})

export const config: ApiRouteConfig = {
  name: 'CreateInvitation',
  type: 'api',
  path: '/organizations/:orgId/invitations',
  method: 'POST',
  description: 'Create an invitation to join an organization',
  emits: ['organization.invitation.create.requested'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      invitation: z.object({
        id: z.string(),
        organizationId: z.string(),
        email: z.string(),
        role: z.string(),
        status: z.string(),
        expiresAt: z.string(),
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
  },
}

export const handler: Handlers['CreateInvitation'] = async (req, { emit, logger, state }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const { email, role, expiresIn } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Create invitation request received', {
      userId: req.user.id,
      organizationId: orgId,
      email,
      role,
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'org-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'organization.invitation.create.requested',
      data: {
        requestId,
        organizationId: orgId,
        email,
        role,
        expiresIn,
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
        status: statusCode as 400,
        body: { error: result.error },
      }
    }

    // Return the successful result
    return {
      status: 200,
      body: (result as { status: 'completed'; data: { invitation: { id: string; organizationId: string; email: string; role: string; status: string; expiresAt: string; createdAt: string } } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Create invitation error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to create invitation' },
    }
  }
}
