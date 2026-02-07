import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  memberId: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessUpdateMemberRole',
  type: 'event',
  description: 'Process updating member role in organization in the background',
  subscribes: ['organization.member.roleUpdate.requested'],
  emits: ['organization.member.roleUpdated', 'organization.member.roleUpdate.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessUpdateMemberRole'] = async (
  input,
  { emit, logger, state },
) => {
  const {
    requestId,
    organizationId,
    memberId,
    role,
    authorization,
    userId,
    userEmail,
  } = input

  logger.info('Processing update member role', {
    requestId,
    organizationId,
    memberId,
    newRole: role,
  })

  try {
    // Call Better Auth's updateMemberRole endpoint
    const memberData = await auth.api.updateMemberRole({
      body: {
        organizationId,
        memberId,
        role,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as { id: string; organizationId: string; userId: string; role: string; createdAt: Date } | null

    if (!memberData) {
      throw new Error('Failed to update member role: No data returned')
    }

    logger.info('Member role updated successfully', {
      requestId,
      organizationId,
      memberId,
      newRole: role,
      userId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        member: {
          id: memberData.id,
          organizationId: memberData.organizationId,
          userId: memberData.userId,
          role: memberData.role,
          createdAt: new Date(memberData.createdAt).toISOString(),
        },
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.member.roleUpdated',
      data: {
        __topic: 'organization.member.roleUpdated',
        organizationId,
        memberId,
        newRole: role,
        updatedByUserId: userId,
        updatedByUserEmail: userEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to update member role', {
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
    } else if (errorMsgLower.includes('owner') || errorMsgLower.includes('last owner')) {
      userMessage = 'Cannot change the owner role or there must be at least one owner'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.member.roleUpdate.failed',
      data: {
        __topic: 'organization.member.roleUpdate.failed',
        requestId,
        organizationId,
        memberId,
        role,
        userId,
        userEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
