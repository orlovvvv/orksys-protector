import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  memberId: z.string(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessRemoveOrganizationMember',
  type: 'event',
  description: 'Process removing a member from organization in the background',
  subscribes: ['organization.member.remove.requested'],
  emits: ['organization.member.removed', 'organization.member.remove.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessRemoveOrganizationMember'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, organizationId, memberId, authorization, userId, userEmail } =
    input

  logger.info('Processing remove member from organization', {
    requestId,
    organizationId,
    memberId,
  })

  try {
    // Call Better Auth's removeMember endpoint
    await auth.api.removeMember({
      body: {
        organizationId,
        memberId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    } as unknown)

    logger.info('Member removed successfully', {
      requestId,
      organizationId,
      memberId,
      userId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        success: true,
        message: 'Member removed successfully',
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.member.removed',
      data: {
        __topic: 'organization.member.removed',
        organizationId,
        memberId,
        removedByUserId: userId,
        removedByUserEmail: userEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to remove member', {
      requestId,
      organizationId,
      memberId,
      error: errorMessage,
    })

    // Determine status code from error
    let statusCode = 400
    let userMessage = errorMessage
    const errorMsgLower = errorMessage.toLowerCase()
    if (errorMsgLower.includes('not found') || errorMsgLower.includes('does not exist')) {
      statusCode = 404
      userMessage = 'Member not found'
    } else if (errorMsgLower.includes('owner') || errorMsgLower.includes('last')) {
      userMessage = 'Cannot remove the owner or last member'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.member.remove.failed',
      data: {
        __topic: 'organization.member.remove.failed',
        requestId,
        organizationId,
        memberId,
        userId,
        userEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
