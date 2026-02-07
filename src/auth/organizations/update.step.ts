import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../middleware/organization.middleware'
import { generateRequestId, initRequest, waitForRequestResult } from '../lib/state-request'

const bodySchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').optional(),
  slug: z.string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  logo: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const config: ApiRouteConfig = {
  name: 'UpdateOrganization',
  type: 'api',
  path: '/organizations/:orgId',
  method: 'PATCH',
  description: 'Update organization details',
  emits: ['organization.update.requested'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      organization: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        logo: z.string().nullish(),
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
    409: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['UpdateOrganization'] = async (req, { emit, logger, state }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const body = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Organization update request received', {
      userId: req.user.id,
      organizationId: orgId,
      updates: Object.keys(body),
    })

    // Generate a unique request ID
    const requestId = generateRequestId()

    // Initialize the request in state
    await initRequest(state, 'org-requests', requestId, {})

    // Get the authorization header
    const authorization = req.headers['authorization'] as string | undefined

    // Emit the request event
    await emit({
      topic: 'organization.update.requested',
      data: {
        requestId,
        organizationId: orgId,
        ...body,
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
        status: statusCode as 400 | 404 | 409 | 500,
        body: { error: result.error },
      }
    }

    // Return the successful result
    return {
      status: 200,
      body: (result as { status: 'completed'; data: { organization: { id: string; name: string; slug: string; logo: string | null; createdAt: string } } }).data,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Organization update error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Organization update failed' },
    }
  }
}
