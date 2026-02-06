import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'

// Type for Better Auth listOrganizations response
type OrganizationItem = {
  id: string
  name: string
  slug: string
  logo: string | null
  createdAt: string | Date
}

type ListOrganizationsResult = OrganizationItem[]

export const config: ApiRouteConfig = {
  name: 'ListOrganizations',
  type: 'api',
  path: '/organizations',
  method: 'GET',
  description: 'List organizations for the authenticated user',
  emits: [],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  responseSchema: {
    200: z.object({
      organizations: z.array(z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        logo: z.string().nullish(),
        createdAt: z.string(),
      })),
      activeOrganizationId: z.string().nullish(),
    }),
    400: z.object({
      error: z.string(),
    }),
    401: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['ListOrganizations'] = async (req, { logger }) => {
  try {
    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Listing organizations for user', {
      userId: req.user.id,
    })

    // Call Better Auth's listOrganizations endpoint
    // Better Auth returns an array directly, or throws an error
    let organizations: ListOrganizationsResult
    try {
      organizations = await auth.api.listOrganizations({
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as ListOrganizationsResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to list organizations', {
        error: error.message || 'Unknown error',
      })

      return {
        status: 400,
        body: { error: error.message || 'Failed to list organizations' },
      }
    }

    logger.info('Organizations listed successfully', {
      userId: req.user.id,
      count: organizations.length,
    })

    // Get active organization ID from session if available
    const session = req.session as { activeOrganizationId?: string } | undefined
    const activeOrganizationId = session?.activeOrganizationId || null

    return {
      status: 200,
      body: {
        organizations: organizations.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          logo: org.logo ?? null,
          createdAt: new Date(org.createdAt).toISOString(),
        })),
        activeOrganizationId,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Organization listing error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to list organizations' },
    }
  }
}
