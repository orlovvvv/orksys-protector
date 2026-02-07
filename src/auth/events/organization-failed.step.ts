import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Input schema for all organization failed events
const inputSchema = z.object({
  __topic: z.string(),
  requestId: z.string(),
  error: z.string(),
  timestamp: z.string(),
  // Common fields
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  // Organization-specific fields
  organizationId: z.string().optional(),
  name: z.string().optional(),
  slug: z.string().optional(),
  // Member-specific fields
  memberId: z.string().optional(),
  targetUserId: z.string().optional(),
  targetUserEmail: z.string().optional(),
  role: z.string().optional(),
})

export const config: EventConfig = {
  name: 'OrganizationFailedLogger',
  type: 'event',
  description: 'Logs failed organization operations for audit',
  subscribes: [
    'organization.create.failed',
    'organization.update.failed',
    'organization.delete.failed',
    'organization.setActive.failed',
    'organization.leave.failed',
    'organization.member.add.failed',
    'organization.member.remove.failed',
    'organization.member.roleUpdate.failed',
  ],
  emits: [],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['OrganizationFailedLogger'] = async (
  input,
  { logger },
) => {
  const { __topic, requestId, error, timestamp, userId, userEmail, organizationId } = input

  logger.warn('Organization operation failed', {
    topic: __topic,
    requestId,
    error,
    userId,
    userEmail,
    organizationId,
    timestamp,
  })

  // Log specific event based on topic
  switch (__topic) {
    case 'organization.create.failed':
      logger.warn('AUDIT: Failed to create organization', {
        requestId,
        name: input.name,
        slug: input.slug,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.update.failed':
      logger.warn('AUDIT: Failed to update organization', {
        requestId,
        organizationId,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.delete.failed':
      logger.warn('AUDIT: Failed to delete organization', {
        requestId,
        organizationId,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.setActive.failed':
      logger.warn('AUDIT: Failed to set active organization', {
        requestId,
        organizationId,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.leave.failed':
      logger.warn('AUDIT: Failed to leave organization', {
        requestId,
        organizationId,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.member.add.failed':
      logger.warn('AUDIT: Failed to add member to organization', {
        requestId,
        organizationId,
        targetUserId: input.targetUserId,
        targetUserEmail: input.targetUserEmail,
        role: input.role,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.member.remove.failed':
      logger.warn('AUDIT: Failed to remove member from organization', {
        requestId,
        organizationId,
        memberId: input.memberId,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.member.roleUpdate.failed':
      logger.warn('AUDIT: Failed to update member role', {
        requestId,
        organizationId,
        memberId: input.memberId,
        role: input.role,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break
  }
}
