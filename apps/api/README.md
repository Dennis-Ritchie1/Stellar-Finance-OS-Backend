# @finance-os/api

Fastify HTTP API. Docs at `/docs`, contract at `/openapi.json`, liveness at `/health`.

```bash
pnpm --filter @finance-os/api dev
```

## Auth

- `POST /v1/auth/register` / `POST /v1/auth/login` return `{ user, token, expiresAt }`.
  Send the token as `Authorization: Bearer <token>`.
- Tokens are opaque random values. Only their SHA-256 is stored (`sessions.tokenHash`),
  so a DB leak doesn't leak live sessions. Sessions last 30 days and can be revoked
  with `POST /v1/auth/logout`.
- Passwords are hashed with argon2id. Login does the same work for unknown emails,
  so response timing doesn't reveal which accounts exist.
- Emails are trimmed and lowercased before storage and lookup.

## RBAC

Org-scoped routes (`/v1/orgs/:orgId/...`) use `requireOrgPermission(permission)`
(`src/plugins/auth.ts`). It loads the caller's `Member` row for that org and:

- returns **404** if the caller is not a member, the same response as for an org
  that doesn't exist, so org ids can't be probed;
- returns **403** if the member's role lacks the permission;
- otherwise sets `req.membership`. Handlers must scope every query with
  `membership.organizationId` (AGENTS.md #3).

Guards check permissions, never role names. The matrix lives in `src/rbac/permissions.ts`:

| Permission                                      | owner | admin | approver | accountant | viewer |
| ----------------------------------------------- | :---: | :---: | :------: | :--------: | :----: |
| `org:read`, `members:read`                      |   ✓   |   ✓   |    ✓     |     ✓      |   ✓    |
| `org:update`, `members:manage`                  |   ✓   |   ✓   |          |            |        |
| `treasury:manage`, `approval_policies:manage`   |   ✓   |   ✓   |          |            |        |
| `payment_requests:approve` / `:submit`          |   ✓   |   ✓   |    ✓     |            |        |
| `clients:` / `invoices:` / `vendors:write`      |   ✓   |   ✓   |          |     ✓      |        |
| `payment_requests:create`, `transactions:match` |   ✓   |   ✓   |          |     ✓      |        |
| `exports:create`                                |   ✓   |   ✓   |          |     ✓      |        |

Member management rules (`src/rbac/member-rules.ts`):

- Only owners can add, promote to, demote from, or remove the `owner` role.
- An org always keeps at least one owner. Owner rows are locked (`FOR UPDATE`) while a
  change is checked, so two owners stepping down at once can't both succeed.
- Members can only be added if they already have an account (no invites yet).
- A member referenced by payment requests, approvals or exports can't be deleted.
  Change their role to `viewer` instead.

## Tests

```bash
pnpm --filter @finance-os/api test
```

`test/` holds integration tests that run the real server against a throwaway Postgres
via Testcontainers (Docker required). `test/cross-org.test.ts` checks that every org
route refuses callers from another org. Add new org routes to it (AGENTS.md #3).
