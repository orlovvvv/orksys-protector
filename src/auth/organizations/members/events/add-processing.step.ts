import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  targetUserId: z.string(),
  targetUserEmail: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessAddOrganizationMember',
  type: 'event',
  description: 'Process adding a member to organization in the background',
  subscribes: ['organization.member.add.requested'],
  emits: ['organization.member.added', 'organization.member.add.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessAddOrganizationMember'] = async (
  input,
  { emit, logger, state },
) => {
  const {
    requestId,
    organizationId,
    targetUserId,
    targetUserEmail,
    role,
    authorization,
    userId,
    userEmail,
  } = input

  logger.info('Processing add member to organization', {
    requestId,
    organizationId,
    targetUserId,
    role,
  })

  try {
    // Call Better Auth's addMember endpoint
    const memberData = await auth.api.addMember({
      body: {
        organizationId,
        userId: targetUserId,
        role,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as { id: string; organizationId: string; userId: string; role: string; createdAt: Date } | null

    if (!memberData) {
      throw new Error('Failed to add member: No data returned')
    }

    logger.info('Member added successfully', {
      requestId,
      organizationId,
      memberId: memberData.id,
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
      topic: 'organization.member.added',
      data: {
        __topic: 'organization.member.added',
        organizationId,
        memberId: memberData.id,
        addedUserId: targetUserId,
        addedUserEmail: targetUserEmail,
        role,
        addedByUserId: userId,
        addedByUserEmail: userEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to add member', {
      requestId,
      organizationId,
      targetUserId,
      error: errorMessage,
    })

    // Determine status code from error
    let statusCode = 400
    let userMessage = errorMessage
    const errorMsgLower = errorMessage.toLowerCase()
    if (errorMsgLower.includes('not found') || errorMsgLower.includes('does not exist')) {
      statusCode = 404
      userMessage = 'Organization or user not found'
    } else if (errorMsgLower.includes('already') || errorMsgLower.includes('exists')) {
      userMessage = 'User is already a member of this organization'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.member.add.failed',
      data: {
        __topic: 'organization.member.add.failed',
        requestId,
        organizationId,
        targetUserId,
        targetUserEmail,
        role,
        userId,
        userEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
