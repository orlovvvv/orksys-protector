/**
 * Type extensions for Motia framework
 *
 * Extends Motia's ApiRequest interface to include session and user
 * that are injected by the authentication middleware.
 */

declare module 'motia' {
  interface ApiRequest<T = unknown> {
    /**
     * Session object injected by authMiddleware
     * Matches Better Auth's getSession response structure
     */
    session?: {
      session: {
        id: string
        userId: string
        token: string
        expiresAt: Date
        ipAddress?: string | null
        userAgent?: string | null
        activeOrganizationId?: string | null
        impersonatedBy?: string | null
        [key: string]: unknown
      }
      user: {
        id: string
        email: string
        name: string | null
        emailVerified: boolean
        createdAt: Date
        updatedAt: Date
        image?: string | null
        role?: string | null
        banned?: boolean | null
        banReason?: string | null
        banExpires?: Date | null
        [key: string]: unknown
      }
    }

    /**
     * Current authenticated user
     * Convenience property extracted from session
     */
    user?: {
      id: string
      email: string
      name: string | null
      emailVerified: boolean
      createdAt: Date
      updatedAt: Date
      image?: string | null
      role?: string | null
      banned?: boolean | null
      banReason?: string | null
      banExpires?: Date | null
      [key: string]: unknown
    }
  }
}

export {}
