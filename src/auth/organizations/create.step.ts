import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'

const bodySchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  slug: z.string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  logo: z.string().url().optional(),
})

// Type for Better Auth createOrganization response
// Better Auth returns the organization data directly on success, throws on error
type CreateOrganizationResult = {
  id: string
  name: string
  slug: string
  logo: string | null
  createdAt: string | Date
  member?: {
    id: string
    organizationId: string
    userId: string
    role: string
    createdAt: string | Date
  }
}

export const config: ApiRouteConfig = {
  name: 'CreateOrganization',
  type: 'api',
  path: '/organizations',
  method: 'POST',
  description: 'Create a new organization',
  emits: ['organization.created'],
  virtualSubscribes: ['organization.creation.completed'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  bodySchema,
  responseSchema: {
    201: z.object({
      organization: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        logo: z.string().nullable().optional(),
        createdAt: z.string(),
      }),
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
    409: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['CreateOrganization'] = async (req, { emit, logger }) => {
  try {
    const { name, slug, logo } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Organization creation request received', {
      userId: req.user.id,
      name,
      slug,
    })

    // Call Better Auth's createOrganization endpoint
    // Better Auth returns the organization data directly, or throws an error
    // We use try-catch to handle errors as Better Auth doesn't return { error, data }
    let orgData: CreateOrganizationResult
    try {
      orgData = await auth.api.createOrganization({
        body: {
          name,
          slug,
          logo,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as CreateOrganizationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string; statusCode?: number; status?: number }
      logger.error('Organization creation failed', {
        error: error.message || 'Unknown error',
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('slug') || errorMessage.includes('exists') || errorMessage.includes('duplicate')) {
        return {
          status: 409,
          body: { error: 'Organization with this slug already exists' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Organization creation failed' },
      }
    }

    logger.info('Organization created successfully', {
      organizationId: orgData.id,
      userId: req.user.id,
    })

    // Emit event for background processing
    await emit({
      topic: 'organization.created',
      data: {
        organizationId: orgData.id,
        organizationName: orgData.name,
        userId: req.user.id,
        userEmail: req.user.email,
      },
    })

    return {
      status: 201,
      body: {
        organization: {
          id: orgData.id,
          name: orgData.name,
          slug: orgData.slug,
          logo: orgData.logo ?? null,
          createdAt: new Date(orgData.createdAt).toISOString(),
        },
        member: orgData.member ? {
          id: orgData.member.id,
          organizationId: orgData.member.organizationId,
          userId: orgData.member.userId,
          role: orgData.member.role,
          createdAt: new Date(orgData.member.createdAt).toISOString(),
        } : null,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Organization creation error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Organization creation failed' },
    }
  }
}
