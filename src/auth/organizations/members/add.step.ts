import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { db } from '../../../lib/db/drizzle'
import { user } from '../../../lib/db/drizzle'
import { eq } from 'drizzle-orm'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../../middleware/organization.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../../lib/state-request'

const bodySchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member'], {
    message: 'Role must be one of: owner, admin, member',
  }),
})

export const config: ApiRouteConfig = {
  name: 'AddOrganizationMember',
  type: 'api',
  path: '/organizations/:orgId/members',
  method: 'POST',
  description: 'Add a member to an organization',
  emits: ['organization.member.add.requested'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
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
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['AddOrganizationMember'] = async (req, { emit, logger, state }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const { email, role } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Add member request received', {
      userId: req.user.id,
      organizationId: orgId,
      email,
      role,
    })

    // Find the user by email
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1)

    if (!users || users.length === 0) {
      logger.warn('User not found for adding to organization', {
        email,
        organizationId: orgId,
      })

      return {
        status: 404,
        body: { error: 'User not found. User must register first before being added to an organization.' },
      }
    }

    const targetUser = users[0]

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'org-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'organization.member.add.requested',
      data: {
        requestId,
        organizationId: orgId,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
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
    logger.error('Add member error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to add member' },
    }
  }
}
