-- Better Auth Organization and Admin Schema
-- This migration creates the tables for the organization and admin plugins

-- Organization tables
CREATE TABLE IF NOT EXISTS "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"logo" text,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp
);

CREATE TABLE IF NOT EXISTS "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
	"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"role" text NOT NULL DEFAULT 'member',
	"createdAt" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"expiresAt" timestamp,
	"createdAt" timestamp NOT NULL,
	"inviterId" text NOT NULL REFERENCES "user"("id")
);

-- Admin plugin fields for user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" timestamp;

-- Admin plugin fields for session table
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonatedBy" text;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "activeOrganizationId" text;
