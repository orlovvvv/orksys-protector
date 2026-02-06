import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import { apiKey } from 'better-auth/plugins'
import { db } from '../db/drizzle'
import * as schema from '../db/schema/index'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apiKey: schema.apiKey,
    },
    usePlural: false,
  }),

  plugins: [
    bearer(),
    apiKey({
      requireName: true,
      rateLimit: {
        enabled: true,
        timeWindow: 1000 * 60 * 60 * 24, // 1 day
        maxRequests: 1000, // 1000 requests per day
      },
      enableMetadata: true,
      enableSessionForAPIKeys: true,
    }),
  ],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookiePrefix: 'orksys',
    crossSubDomainCookies: {
      enabled: false,
    },
  },
})

// Export auth handler for direct mounting if needed
export const authHandler = auth.handler
