import { forbidden, notFound, unauthorized, type MemberRole } from '@finance-os/shared';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { resolveSession, type ResolvedSession } from '../auth/session.js';
import { hasPermission, type Permission } from '../rbac/permissions.js';

export interface OrgMembership {
  memberId: string;
  organizationId: string;
  role: MemberRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set when a valid bearer session token was presented. */
    auth: ResolvedSession | null;
    /** Set by requireOrgPermission for org-scoped routes. */
    membership: OrgMembership | null;
  }
}

/** Bearer tokens only; the OpenAPI doc advertises this as `bearerAuth`. */
function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
  app.decorateRequest('membership', null);
  app.addHook('onRequest', async (req) => {
    const token = bearerToken(req);
    if (token) req.auth = await resolveSession(app.prisma, token);
  });
}

/** Narrowing helper for handlers behind requireAuth. */
export function authOf(req: FastifyRequest): ResolvedSession {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Narrowing helper for handlers behind requireOrgPermission. */
export function membershipOf(req: FastifyRequest): OrgMembership {
  if (!req.membership) throw forbidden();
  return req.membership;
}

export const requireAuth: preHandlerAsyncHookHandler = async (req) => {
  if (!req.auth) throw unauthorized('Missing or invalid session token');
};

/**
 * Guard for `/orgs/:orgId/...` routes. A caller who is not a member gets 404
 * — the same answer as for a nonexistent org — so org ids can't be probed.
 * A member whose role lacks `permission` gets 403.
 */
export function requireOrgPermission(permission: Permission): preHandlerAsyncHookHandler {
  return async (req) => {
    const auth = req.auth;
    if (!auth) throw unauthorized('Missing or invalid session token');
    const { orgId } = req.params as { orgId?: string };
    if (!orgId) throw new Error('requireOrgPermission used on a route without :orgId');

    const member = await req.server.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: auth.userId } },
      select: { id: true, organizationId: true, role: true },
    });
    if (!member) throw notFound('Organization');
    if (!hasPermission(member.role, permission)) {
      throw forbidden(`Your role (${member.role}) does not allow ${permission}`);
    }
    req.membership = {
      memberId: member.id,
      organizationId: member.organizationId,
      role: member.role,
    };
  };
}
