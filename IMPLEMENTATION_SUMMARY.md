# Better Auth Organization and Admin Plugin Implementation Summary

## Overview

This implementation adds the Better Auth organization and admin plugins to the Motia project, providing comprehensive multi-tenancy and administration capabilities.

## Database Schema Changes

### New Tables

1. **organization** - Stores organization data
   - `id` (text, primary key)
   - `name` (text, required)
   - `slug` (text, unique, required)
   - `logo` (text, optional)
   - `createdAt` (timestamp, required)
   - `updatedAt` (timestamp, optional)

2. **member** - Links users to organizations
   - `id` (text, primary key)
   - `organizationId` (text, foreign key to organization, cascade delete)
   - `userId` (text, foreign key to user, cascade delete)
   - `role` (text, default: 'member')
   - `createdAt` (timestamp, required)

3. **invitation** - Stores pending invitations
   - `id` (text, primary key)
   - `organizationId` (text, foreign key to organization, cascade delete)
   - `email` (text, required)
   - `role` (text, required)
   - `status` (text, default: 'pending')
   - `expiresAt` (timestamp, optional)
   - `createdAt` (timestamp, required)
   - `inviterId` (text, foreign key to user)

### Modified Tables

1. **user** - Added admin plugin fields
   - `role` (text, optional)
   - `banned` (boolean, default: false)
   - `banReason` (text, optional)
   - `banExpires` (timestamp, optional)

2. **session** - Added plugin fields
   - `impersonatedBy` (text, optional) - for admin impersonation
   - `activeOrganizationId` (text, optional) - currently active organization

## Migration Commands

```bash
# Generate migrations (already done)
pnpm drizzle-kit generate

# Push schema to database
pnpm drizzle-kit push

# Or run migrations
pnpm drizzle-kit migrate
```

## Better Auth Configuration

Updated `/src/lib/better-auth/auth.ts` to include:
- `organization()` plugin with role-based permissions (owner, admin, member)
- `admin()` plugin with default role 'user' and admin roles ['admin']

## API Endpoints Created

### Organization Management (`/organizations/*`)

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/organizations` | Create organization | auth, error-handler |
| GET | `/organizations` | List user's organizations | auth, error-handler |
| GET | `/organizations/:orgId` | Get organization details | auth, org-member, error-handler |
| PATCH | `/organizations/:orgId` | Update organization | auth, org-member, org-admin, error-handler |
| DELETE | `/organizations/:orgId` | Delete organization | auth, org-member, org-owner, error-handler |
| POST | `/organizations/active` | Set active organization | auth, error-handler |
| POST | `/organizations/:orgId/leave` | Leave organization | auth, org-member, error-handler |

### Member Management (`/organizations/:orgId/members/*`)

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/organizations/:orgId/members` | Add member by email | auth, org-member, org-admin, error-handler |
| DELETE | `/organizations/:orgId/members/:memberId` | Remove member | auth, org-member, org-admin, error-handler |
| PATCH | `/organizations/:orgId/members/:memberId/role` | Update member role | auth, org-member, org-owner, error-handler |

### Invitation Management (`/organizations/:orgId/invitations/*`)

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| POST | `/organizations/:orgId/invitations` | Create invitation | auth, org-member, org-admin, error-handler |
| GET | `/organizations/:orgId/invitations` | List invitations | auth, org-member, error-handler |
| POST | `/organizations/:orgId/invitations/cancel` | Cancel invitation | auth, org-member, org-admin, error-handler |
| POST | `/organizations/invitations/accept` | Accept invitation | auth, error-handler |

### Admin Management (`/admin/*`)

| Method | Path | Description | Middleware |
|--------|------|-------------|------------|
| GET | `/admin/users` | List all users | auth, admin, error-handler |
| GET | `/admin/users/:userId` | Get user details | auth, admin, error-handler |
| POST | `/admin/users/set-role` | Set user role | auth, admin, error-handler |
| POST | `/admin/users/ban` | Ban user | auth, admin, error-handler |
| POST | `/admin/users/unban` | Unban user | auth, admin, error-handler |
| POST | `/admin/users/delete` | Delete user | auth, admin, error-handler |

## Middleware Created

### Organization Middleware (`/src/auth/middleware/organization.middleware.ts`)

- `organizationMiddleware` - Verifies user is a member of the organization
- `organizationRoleMiddleware(allowedRoles)` - Checks user has required role
- `organizationOwnerMiddleware` - Only allows owners
- `organizationAdminMiddleware` - Allows owners and admins

### Admin Middleware (`/src/auth/middleware/admin.middleware.ts`)

- `adminMiddleware` - Verifies user has admin role
- `checkBannedMiddleware` - Checks if user is banned

## Event Handlers (Audit Logging)

### Organization Audit Logger (`/src/auth/events/organization-audit.step.ts`)

Listens to:
- `organization.created`
- `organization.updated`
- `organization.deleted`
- `organization.member.added`
- `organization.member.removed`
- `organization.member.roleUpdated`
- `organization.member.left`
- `organization.active.changed`

### Admin Audit Logger (`/src/auth/events/admin-audit.step.ts`)

Listens to:
- `admin.user.roleChanged`
- `admin.user.banned`
- `admin.user.unbanned`
- `admin.user.deleted`

## Environment Variables

Added to `.env.example`:

```bash
# Admin Configuration
# Comma-separated list of user IDs that should have admin access
ADMIN_USER_IDS=""
```

## Files Created

### Database Schema
- `/src/lib/db/schema/organization.ts` - Organization tables

### Middleware
- `/src/auth/middleware/organization.middleware.ts` - Organization authorization
- `/src/auth/middleware/admin.middleware.ts` - Admin authorization

### Organization API Steps
- `/src/auth/organizations/create.step.ts`
- `/src/auth/organizations/list.step.ts`
- `/src/auth/organizations/get.step.ts`
- `/src/auth/organizations/update.step.ts`
- `/src/auth/organizations/delete.step.ts`
- `/src/auth/organizations/set-active.step.ts`
- `/src/auth/organizations/leave.step.ts`

### Member Management API Steps
- `/src/auth/organizations/members/add.step.ts`
- `/src/auth/organizations/members/remove.step.ts`
- `/src/auth/organizations/members/update-role.step.ts`

### Invitation API Steps
- `/src/auth/organizations/invitations/create.step.ts`
- `/src/auth/organizations/invitations/list.step.ts`
- `/src/auth/organizations/invitations/cancel.step.ts`
- `/src/auth/organizations/invitations/accept.step.ts`

### Admin API Steps
- `/src/auth/admin/list-users.step.ts`
- `/src/auth/admin/get-user.step.ts`
- `/src/auth/admin/set-role.step.ts`
- `/src/auth/admin/ban-user.step.ts`
- `/src/auth/admin/unban-user.step.ts`
- `/src/auth/admin/delete-user.step.ts`

### Event Handlers
- `/src/auth/events/organization-audit.step.ts`
- `/src/auth/events/admin-audit.step.ts`

### Types
- `/src/types/auth.ts` - Extended request types

## Usage Examples

### Creating an Organization

```typescript
const response = await fetch('/organizations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Acme Corp',
    slug: 'acme-corp',
  }),
});
```

### Adding a Member

```typescript
const response = await fetch(`/organizations/${orgId}/members`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    role: 'admin',
  }),
});
```

### Banning a User (Admin)

```typescript
const response = await fetch('/admin/users/ban', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-id-here',
    banReason: 'Violation of terms',
    banExpiresIn: 604800, // 7 days in seconds
  }),
});
```

## Role Hierarchy

### Organization Roles
1. **owner** - Full control, can delete org, transfer ownership
2. **admin** - Can manage members, invitations, update org
3. **member** - Read-only access to organization

### Global Roles
1. **admin** - Can manage all users, ban/unban, set roles
2. **user** - Standard user access

## Notes

- All sensitive operations emit audit events for logging
- Organization slug must be unique across the system
- Better Auth handles the actual permission checks via its plugin endpoints
- Motia steps provide a thin wrapper around Better Auth's API for event-driven architecture
- To set up admin users, either use the ADMIN_USER_IDS env var or manually set a user's role to 'admin' in the database
