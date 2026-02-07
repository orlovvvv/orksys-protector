import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessSetActiveOrganization',
  type: 'event',
  description: 'Process setting active organization in the background',
  subscribes: ['organization.setActive.requested'],
  emits: ['organization.active.changed', 'organization.setActive.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessSetActiveOrganization'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, organizationId, authorization, userId, userEmail } = input

  logger.info('Processing set active organization', {
    requestId,
    organizationId,
    userId,
  })

  try {
    // Call Better Auth's setActiveOrganization endpoint
    const response = await auth.api.setActiveOrganization({
      body: {
        organizationId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    })

    // Better Auth returns the organization object with members array
    // We need to extract the organizationId from the response
    const activeOrgId = response?.id || organizationId

    logger.info('Active organization set successfully', {
      requestId,
      userId,
      organizationId: activeOrgId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        success: true,
        activeOrganizationId: activeOrgId,
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.active.changed',
      data: {
        __topic: 'organization.active.changed',
        userId,
        userEmail,
        organizationId: activeOrgId,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to set active organization', {
      requestId,
      organizationId,
      error: errorMessage,
      userId,
    })

    // Determine status code from error
    let statusCode = 400
    const errorMsgLower = errorMessage.toLowerCase()
    if (
      errorMsgLower.includes('not found') ||
      errorMsgLower.includes('does not exist') ||
      errorMsgLower.includes('not a member')
    ) {
      statusCode = 403
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: errorMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.setActive.failed',
      data: {
        __topic: 'organization.setActive.failed',
        requestId,
        organizationId,
        userId,
        userEmail,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
