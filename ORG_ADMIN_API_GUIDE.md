# Organization and Admin API Quick Reference

## Authentication

All API endpoints require Bearer token authentication:

```typescript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
}
```

## Organization Endpoints

### Create Organization
```http
POST /organizations
Content-Type: application/json

{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "logo": "https://example.com/logo.png" // optional
}
```

### List User's Organizations
```http
GET /organizations
```

### Get Organization Details
```http
GET /organizations/{orgId}
```

### Update Organization (admin/owner only)
```http
PATCH /organizations/{orgId}
Content-Type: application/json

{
  "name": "New Name", // optional
  "slug": "new-slug", // optional
  "logo": "https://..." // optional
}
```

### Delete Organization (owner only)
```http
DELETE /organizations/{orgId}
```

### Set Active Organization
```http
POST /organizations/active
Content-Type: application/json

{
  "organizationId": "org-id-here"
}
```

### Leave Organization
```http
POST /organizations/{orgId}/leave
```

## Member Management

### Add Member (by email)
```http
POST /organizations/{orgId}/members
Content-Type: application/json

{
  "email": "user@example.com",
  "role": "admin" // "owner" | "admin" | "member"
}
```

### Remove Member
```http
DELETE /organizations/{orgId}/members/{memberId}
```

### Update Member Role (owner only)
```http
PATCH /organizations/{orgId}/members/{memberId}/role
Content-Type: application/json

{
  "role": "admin" // "owner" | "admin" | "member"
}
```

## Invitations

### Create Invitation
```http
POST /organizations/{orgId}/invitations
Content-Type: application/json

{
  "email": "newuser@example.com",
  "role": "member",
  "expiresIn": 604800 // optional, seconds (default: 7 days)
}
```

### List Invitations
```http
GET /organizations/{orgId}/invitations
```

### Cancel Invitation
```http
POST /organizations/{orgId}/invitations/cancel
Content-Type: application/json

{
  "invitationId": "invitation-id"
}
```

### Accept Invitation
```http
POST /organizations/invitations/accept
Content-Type: application/json

{
  "invitationId": "invitation-id"
}
```

## Admin Endpoints

### List All Users
```http
GET /admin/users?limit=10&offset=0&sortBy=createdAt&sortDirection=desc
```

Query parameters:
- `limit` - number of results (optional)
- `offset` - pagination offset (optional)
- `searchValue` - search term (optional)
- `searchField` - "name" | "email" (optional)
- `sortBy` - field to sort by (optional)
- `sortDirection` - "asc" | "desc" (optional)

### Get User Details
```http
GET /admin/users/{userId}
```

### Set User Role
```http
POST /admin/users/set-role
Content-Type: application/json

{
  "userId": "user-id",
  "role": "admin" // "user" | "admin"
}
```

### Ban User
```http
POST /admin/users/ban
Content-Type: application/json

{
  "userId": "user-id",
  "banReason": "Violation of terms", // optional
  "banExpiresIn": 604800 // optional, seconds
}
```

### Unban User
```http
POST /admin/users/unban
Content-Type: application/json

{
  "userId": "user-id"
}
```

### Delete User
```http
POST /admin/users/delete
Content-Type: application/json

{
  "userId": "user-id"
}
```

## Response Format

### Success Response
```json
{
  "status": 200,
  "body": {
    "data": "response data"
  }
}
```

### Error Response
```json
{
  "status": 400,
  "body": {
    "error": "Error message"
  }
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error, invalid input)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

## Common Errors

### Not a member of organization
```json
{
  "status": 403,
  "body": {
    "error": "Forbidden - Not a member of this organization"
  }
}
```

### Insufficient permissions
```json
{
  "status": 403,
  "body": {
    "error": "Forbidden - Insufficient permissions"
  }
}
```

### Organization already exists
```json
{
  "status": 409,
  "body": {
    "error": "Organization with this slug already exists"
  }
}
```
