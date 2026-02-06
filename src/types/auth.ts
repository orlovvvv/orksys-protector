import type { ApiRequest } from 'motia'
import type { Member } from '../lib/db/schema'

/**
 * Extended request interface with organization and member data
 */
export interface OrganizationApiRequest extends Omit<ApiRequest, 'user'> {
  user: ApiRequest['user'] & {
    role?: string
    banned?: boolean | null
    banReason?: string | null
    banExpires?: Date | null
  }
  member?: Member
  organizationId?: string
}

/**
 * Extended request interface with admin impersonation data
 */
export interface AdminApiRequest extends ApiRequest {
  user: ApiRequest['user'] & {
    role?: string
    banned?: boolean | null
    banReason?: string | null
    banExpires?: Date | null
  }
  isAdmin?: boolean
}
