import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  expiresIn: z.number(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessCreateInvitation',
  type: 'event',
  description: 'Process creating organization invitation in the background',
  subscribes: ['organization.invitation.create.requested'],
  emits: ['organization.invitation.created', 'organization.invitation.create.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessCreateInvitation'] = async (
  input,
  { emit, logger, state },
) => {
  const {
    requestId,
    organizationId,
    email,
    role,
    expiresIn,
    authorization,
    userId,
    userEmail,
  } = input

  logger.info('Processing create invitation', {
    requestId,
    organizationId,
    email,
    role,
  })

  try {
    // Calculate expiresAt
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // Call Better Auth's createInvitation endpoint
    const invitationData = await auth.api.createInvitation({
      body: {
        organizationId,
        email,
        role,
        expiresAt: expiresAt.toISOString(),
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as {
      id: string
      organizationId: string
      email: string
      role: string
      status: string
      expiresAt: Date
      createdAt: Date
    }

    logger.info('Invitation created successfully', {
      requestId,
      organizationId,
      invitationId: invitationData.id,
      email,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        invitation: {
          id: invitationData.id,
          organizationId: invitationData.organizationId,
          email: invitationData.email,
          role: invitationData.role,
          status: invitationData.status,
          expiresAt: new Date(invitationData.expiresAt).toISOString(),
          createdAt: new Date(invitationData.createdAt).toISOString(),
        },
      },
    })

    // Emit success event for sending invitation email
    await emit({
      topic: 'organization.invitation.created',
      data: {
        __topic: 'organization.invitation.created',
        organizationId,
        invitationId: invitationData.id,
        email,
        role,
        createdAt: new Date(invitationData.createdAt).toISOString(),
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to create invitation', {
      requestId,
      organizationId,
      email,
      error: errorMessage,
    })

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: errorMessage,
      statusCode: 400,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.invitation.create.failed',
      data: {
        __topic: 'organization.invitation.create.failed',
        requestId,
        organizationId,
        email,
        role,
        userId,
        userEmail,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
