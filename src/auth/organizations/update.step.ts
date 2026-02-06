import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../middleware/organization.middleware'

const bodySchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').optional(),
  slug: z.string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  logo: z.string().url().optional(),
  // metadata: Record<string, any> for arbitrary metadata
  metadata: z.optional(z.lazy(() => z.record(z.string()))),
})

// Type for Better Auth updateOrganization response
type UpdatedOrganizationResult = {
  id: string
  name: string
  slug: string
  logo: string | null
  createdAt: string | Date
}

export const config: ApiRouteConfig = {
  name: 'UpdateOrganization',
  type: 'api',
  path: '/organizations/:orgId',
  method: 'PATCH',
  description: 'Update organization details',
  emits: ['organization.updated'],
  virtualSubscribes: ['organization.update.completed'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      organization: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        logo: z.string().nullable().optional(),
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

export const handler: Handlers['UpdateOrganization'] = async (req, { emit, logger }) => {
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

    // Call Better Auth's updateOrganization endpoint
    // Better Auth returns the updated organization data directly, or throws an error
    let orgData: UpdatedOrganizationResult
    try {
      orgData = await auth.api.updateOrganization({
        body: {
          organizationId: orgId,
          ...body,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as UpdatedOrganizationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Organization update failed', {
        error: error.message || 'Unknown error',
        organizationId: orgId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return {
          status: 404,
          body: { error: 'Organization not found' },
        }
      }
      if (errorMessage.includes('slug') || errorMessage.includes('exists') || errorMessage.includes('duplicate')) {
        return {
          status: 409,
          body: { error: 'Organization with this slug already exists' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Organization update failed' },
      }
    }

    logger.info('Organization updated successfully', {
      organizationId: orgId,
      userId: req.user.id,
    })

    // Emit event for background processing/audit logging
    await emit({
      topic: 'organization.updated',
      data: {
        organizationId: orgId,
        organizationName: orgData.name,
        userId: req.user.id,
        userEmail: req.user.email,
        updatedFields: Object.keys(body),
      },
    })

    return {
      status: 200,
      body: {
        organization: {
          id: orgData.id,
          name: orgData.name,
          slug: orgData.slug,
          logo: orgData.logo ?? null,
          createdAt: new Date(orgData.createdAt).toISOString(),
        },
      },
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
