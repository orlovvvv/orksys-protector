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
  name: 'ProcessLeaveOrganization',
  type: 'event',
  description: 'Process leaving organization in the background',
  subscribes: ['organization.leave.requested'],
  emits: ['organization.member.left', 'organization.leave.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessLeaveOrganization'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, organizationId, authorization, userId, userEmail } = input

  logger.info('Processing leave organization', {
    requestId,
    organizationId,
    userId,
  })

  try {
    // Call Better Auth's leaveOrganization endpoint
    await auth.api.leaveOrganization({
      body: {
        organizationId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    })

    logger.info('Left organization successfully', {
      requestId,
      organizationId,
      userId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        success: true,
        message: 'Left organization successfully',
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.member.left',
      data: {
        __topic: 'organization.member.left',
        organizationId,
        userId,
        userEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to leave organization', {
      requestId,
      organizationId,
      error: errorMessage,
      userId,
    })

    // Determine appropriate error message
    let userMessage = errorMessage
    const errorMsgLower = errorMessage.toLowerCase()
    if (errorMsgLower.includes('owner') || errorMsgLower.includes('cannot')) {
      userMessage = 'Cannot leave organization as owner. Transfer ownership first.'
    } else if (
      errorMsgLower.includes('not found') ||
      errorMsgLower.includes('does not exist') ||
      errorMsgLower.includes('not a member')
    ) {
      userMessage = 'You are not a member of this organization'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode: 400,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.leave.failed',
      data: {
        __topic: 'organization.leave.failed',
        requestId,
        organizationId,
        userId,
        userEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
