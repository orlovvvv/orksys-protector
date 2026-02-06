import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { organizationMiddleware } from '../middleware/organization.middleware'

// Type for Better Auth getFullOrganization response
type OrganizationMember = {
  id: string
  userId: string
  role: string
  createdAt: string | Date
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
}

type FullOrganizationResult = {
  id: string
  name: string
  slug: string
  logo: string | null
  createdAt: string | Date
  members: OrganizationMember[]
}

export const config: ApiRouteConfig = {
  name: 'GetOrganization',
  type: 'api',
  path: '/organizations/:orgId',
  method: 'GET',
  description: 'Get organization details',
  emits: [],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware],
  responseSchema: {
    200: z.object({
      organization: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        logo: z.string().nullish(),
        createdAt: z.string(),
      }),
      members: z.array(z.object({
        id: z.string(),
        userId: z.string(),
        role: z.string(),
        createdAt: z.string(),
        user: z.object({
          id: z.string(),
          name: z.string().nullish(),
          email: z.string(),
          image: z.string().nullish(),
        }),
      })),
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

export const handler: Handlers['GetOrganization'] = async (req, { logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Getting organization details', {
      userId: req.user.id,
      organizationId: orgId,
    })

    // Call Better Auth's getFullOrganization endpoint
    // Better Auth returns the organization data directly, or throws an error
    let orgData: FullOrganizationResult
    try {
      orgData = await auth.api.getFullOrganization({
        query: {
          organizationId: orgId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as FullOrganizationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to get organization', {
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

      return {
        status: 400,
        body: { error: error.message || 'Failed to get organization' },
      }
    }

    logger.info('Organization retrieved successfully', {
      organizationId: orgId,
      userId: req.user.id,
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
        members: (orgData.members || []).map((member) => ({
          id: member.id,
          userId: member.userId,
          role: member.role,
          createdAt: new Date(member.createdAt).toISOString(),
          user: {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            image: member.user.image,
          },
        })),
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Organization retrieval error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to get organization' },
    }
  }
}
