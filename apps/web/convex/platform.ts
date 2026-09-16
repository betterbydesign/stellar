import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const tenantKindValidator = v.union(
  v.literal("personal"),
  v.literal("organization"),
);
const tenantRoleValidator = v.union(
  v.literal("owner"),
  v.literal("editor"),
  v.literal("viewer"),
);
const projectRoleValidator = v.union(v.literal("editor"), v.literal("viewer"));
const nullableTenantRoleValidator = v.union(tenantRoleValidator, v.null());
const nullableProjectRoleValidator = v.union(projectRoleValidator, v.null());

const tenantSummaryValidator = v.object({
  _id: v.id("tenants"),
  kind: tenantKindValidator,
  name: v.string(),
  role: tenantRoleValidator,
});
const projectSummaryValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  createdAt: v.number(),
  sourceState: v.literal("unlinked"),
});

type DatabaseCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type AuthenticatedCtx = QueryCtx | MutationCtx;
type TenantRole = "owner" | "editor" | "viewer";
type ProjectRole = "editor" | "viewer";

const PROJECT_NAME_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9 .,'&()_-]{0,78}[A-Za-z0-9])?$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SUBJECT_PATTERN = /^\S{1,512}$/;
const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function fail(code: string): never {
  throw new ConvexError({ code });
}

function configuredNamespace(): string {
  const clientId = process.env.WORKOS_CLIENT_ID?.trim();
  if (!clientId) {
    fail("AUTH_CONFIG_MISSING");
  }
  return clientId;
}

function validateSubject(subject: string): string {
  if (!SUBJECT_PATTERN.test(subject)) {
    fail("INVALID_REQUEST");
  }
  return subject;
}

function validateOrganizationId(organizationId: string): string {
  if (!ORGANIZATION_ID_PATTERN.test(organizationId)) {
    fail("INVALID_REQUEST");
  }
  return organizationId;
}

function validateProjectName(name: string): string {
  // Mirrors @stellar/contracts ProjectNameSchema without pulling Zod into the
  // Convex bundle.
  if (!PROJECT_NAME_PATTERN.test(name)) {
    fail("INVALID_REQUEST");
  }
  return name;
}

function validateRequestId(requestId: string): string {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    fail("INVALID_REQUEST");
  }
  return requestId;
}

async function requireActor(ctx: AuthenticatedCtx) {
  const identityNamespace = configuredNamespace();
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || !SUBJECT_PATTERN.test(identity.subject)) {
    fail("UNAUTHENTICATED");
  }

  const allowedIssuers = new Set([
    "https://api.workos.com/",
    `https://api.workos.com/user_management/${identityNamespace}`,
  ]);
  if (!allowedIssuers.has(identity.issuer)) {
    fail("UNAUTHENTICATED");
  }

  const organizationClaim = identity.org_id;
  if (
    organizationClaim !== undefined &&
    (typeof organizationClaim !== "string" ||
      !ORGANIZATION_ID_PATTERN.test(organizationClaim))
  ) {
    fail("UNAUTHENTICATED");
  }

  return {
    identityNamespace,
    subject: identity.subject,
    organizationId: organizationClaim as string | undefined,
  };
}

async function personalTenant(
  ctx: DatabaseCtx,
  identityNamespace: string,
  subject: string,
) {
  return await ctx.db
    .query("tenants")
    .withIndex("by_identity_namespace_and_personal_subject", (q) =>
      q.eq("identityNamespace", identityNamespace).eq("personalSubject", subject),
    )
    .unique();
}

async function organizationTenant(
  ctx: DatabaseCtx,
  identityNamespace: string,
  organizationId: string,
) {
  return await ctx.db
    .query("tenants")
    .withIndex("by_identity_namespace_and_workos_organization_id", (q) =>
      q
        .eq("identityNamespace", identityNamespace)
        .eq("workosOrganizationId", organizationId),
    )
    .unique();
}

async function tenantMembership(
  ctx: DatabaseCtx,
  tenantId: Id<"tenants">,
  identityNamespace: string,
  subject: string,
) {
  return await ctx.db
    .query("tenantMemberships")
    .withIndex("by_tenant_and_identity_namespace_and_subject", (q) =>
      q
        .eq("tenantId", tenantId)
        .eq("identityNamespace", identityNamespace)
        .eq("subject", subject),
    )
    .unique();
}

async function requireWorkspace(ctx: AuthenticatedCtx) {
  const actor = await requireActor(ctx);
  const tenant = actor.organizationId
    ? await organizationTenant(
        ctx,
        actor.identityNamespace,
        actor.organizationId,
      )
    : await personalTenant(ctx, actor.identityNamespace, actor.subject);
  if (tenant === null) {
    fail("WORKSPACE_NOT_PROVISIONED");
  }

  const membership = await tenantMembership(
    ctx,
    tenant._id,
    actor.identityNamespace,
    actor.subject,
  );
  if (membership === null || membership.state !== "active") {
    fail("TENANT_ACCESS_DENIED");
  }

  return { actor, tenant, membership };
}

function tenantSummary(
  tenant: Doc<"tenants">,
  role: TenantRole,
) {
  return {
    _id: tenant._id,
    kind: tenant.kind,
    name: tenant.name,
    role,
  };
}

function projectSummary(project: Doc<"projects">) {
  return {
    _id: project._id,
    name: project.name,
    createdAt: project.createdAt,
    sourceState: project.sourceState,
  };
}

async function activeProjectMembership(
  ctx: DatabaseCtx,
  projectId: Id<"projects">,
  identityNamespace: string,
  subject: string,
) {
  const membership = await ctx.db
    .query("projectMemberships")
    .withIndex("by_project_and_identity_namespace_and_subject", (q) =>
      q
        .eq("projectId", projectId)
        .eq("identityNamespace", identityNamespace)
        .eq("subject", subject),
    )
    .unique();
  return membership?.state === "active" ? membership : null;
}

async function requireProject(
  ctx: AuthenticatedCtx,
  projectId: Id<"projects">,
) {
  const workspace = await requireWorkspace(ctx);
  const project = await ctx.db.get(projectId);
  if (project === null || project.tenantId !== workspace.tenant._id) {
    fail("PROJECT_ACCESS_DENIED");
  }
  if (workspace.membership.role !== "owner") {
    const membership = await activeProjectMembership(
      ctx,
      projectId,
      workspace.actor.identityNamespace,
      workspace.actor.subject,
    );
    if (membership === null || membership.tenantId !== workspace.tenant._id) {
      fail("PROJECT_ACCESS_DENIED");
    }
  }
  return { ...workspace, project };
}

export const bootstrapWorkspace = mutation({
  args: {},
  returns: v.object({ tenant: tenantSummaryValidator }),
  handler: async (ctx) => {
    const actor = await requireActor(ctx);

    if (actor.organizationId) {
      const tenant = await organizationTenant(
        ctx,
        actor.identityNamespace,
        actor.organizationId,
      );
      if (tenant === null) {
        fail("WORKSPACE_NOT_PROVISIONED");
      }
      const membership = await tenantMembership(
        ctx,
        tenant._id,
        actor.identityNamespace,
        actor.subject,
      );
      if (membership === null || membership.state !== "active") {
        fail("TENANT_ACCESS_DENIED");
      }
      return { tenant: tenantSummary(tenant, membership.role) };
    }

    const existingTenant = await personalTenant(
      ctx,
      actor.identityNamespace,
      actor.subject,
    );
    if (existingTenant !== null) {
      const membership = await tenantMembership(
        ctx,
        existingTenant._id,
        actor.identityNamespace,
        actor.subject,
      );
      // Bootstrap is deliberately unable to recreate or restore a revoked
      // ownership grant.
      if (membership === null || membership.state !== "active") {
        fail("TENANT_ACCESS_DENIED");
      }
      return { tenant: tenantSummary(existingTenant, membership.role) };
    }

    const now = Date.now();
    const tenantId = await ctx.db.insert("tenants", {
      identityNamespace: actor.identityNamespace,
      kind: "personal",
      name: "Personal workspace",
      personalSubject: actor.subject,
      createdAt: now,
    });
    await ctx.db.insert("tenantMemberships", {
      tenantId,
      identityNamespace: actor.identityNamespace,
      subject: actor.subject,
      role: "owner",
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      tenantId,
      actorSubject: actor.subject,
      action: "personal_workspace_bootstrapped",
      targetSubject: actor.subject,
      resultingRole: "owner",
      occurredAt: now,
    });
    const tenant = await ctx.db.get(tenantId);
    if (tenant === null) {
      throw new Error("New tenant was not readable in its creation transaction");
    }
    return { tenant: tenantSummary(tenant, "owner") };
  },
});

export const viewer = query({
  args: {},
  returns: v.object({
    actor: v.object({ subject: v.string() }),
    tenant: tenantSummaryValidator,
  }),
  handler: async (ctx) => {
    const workspace = await requireWorkspace(ctx);
    return {
      actor: { subject: workspace.actor.subject },
      tenant: tenantSummary(workspace.tenant, workspace.membership.role),
    };
  },
});

export const listProjects = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(projectSummaryValidator),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 50 ||
      args.paginationOpts.maximumRowsRead !== undefined ||
      args.paginationOpts.maximumBytesRead !== undefined
    ) {
      fail("INVALID_REQUEST");
    }
    const workspace = await requireWorkspace(ctx);
    if (workspace.membership.role === "owner") {
      const result = await ctx.db
        .query("projects")
        .withIndex("by_tenant", (q) => q.eq("tenantId", workspace.tenant._id))
        .order("desc")
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.map(projectSummary) };
    }

    const grants = await ctx.db
      .query("projectMemberships")
      .withIndex(
        "by_tenant_and_identity_namespace_and_subject_and_state",
        (q) =>
          q
            .eq("tenantId", workspace.tenant._id)
            .eq("identityNamespace", workspace.actor.identityNamespace)
            .eq("subject", workspace.actor.subject)
            .eq("state", "active"),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      grants.page.map(async (grant) => {
        const project = await ctx.db.get(grant.projectId);
        if (project === null || project.tenantId !== workspace.tenant._id) {
          fail("PROJECT_ACCESS_DENIED");
        }
        return projectSummary(project);
      }),
    );
    return { ...grants, page };
  },
});

export const createProject = mutation({
  args: { name: v.string(), requestId: v.string() },
  returns: projectSummaryValidator,
  handler: async (ctx, args) => {
    const workspace = await requireWorkspace(ctx);
    if (workspace.membership.role === "viewer") {
      fail("READ_ONLY");
    }
    const name = validateProjectName(args.name);
    const requestId = validateRequestId(args.requestId);

    const previous = await ctx.db
      .query("projectCreateRequests")
      .withIndex(
        "by_tenant_and_identity_namespace_and_actor_subject_and_request_id",
        (q) =>
          q
            .eq("tenantId", workspace.tenant._id)
            .eq("identityNamespace", workspace.actor.identityNamespace)
            .eq("actorSubject", workspace.actor.subject)
            .eq("requestId", requestId),
      )
      .unique();
    if (previous !== null) {
      if (previous.projectName !== name) {
        fail("IDEMPOTENCY_CONFLICT");
      }
      const previousProject = await ctx.db.get(previous.projectId);
      if (
        previousProject === null ||
        previousProject.tenantId !== workspace.tenant._id
      ) {
        fail("PROJECT_ACCESS_DENIED");
      }
      // Retry authorization is live: an editor whose project grant was
      // revoked cannot use an old request record to recover the project.
      await requireProject(ctx, previous.projectId);
      return projectSummary(previousProject);
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      tenantId: workspace.tenant._id,
      name,
      createdAt: now,
      createdBySubject: workspace.actor.subject,
      sourceState: "unlinked",
    });
    await ctx.db.insert("projectMemberships", {
      tenantId: workspace.tenant._id,
      projectId,
      identityNamespace: workspace.actor.identityNamespace,
      subject: workspace.actor.subject,
      role: "editor",
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("projectCreateRequests", {
      tenantId: workspace.tenant._id,
      identityNamespace: workspace.actor.identityNamespace,
      actorSubject: workspace.actor.subject,
      requestId,
      projectName: name,
      projectId,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      tenantId: workspace.tenant._id,
      projectId,
      actorSubject: workspace.actor.subject,
      action: "project_created",
      targetSubject: workspace.actor.subject,
      resultingRole: "editor",
      requestId,
      occurredAt: now,
    });
    const project = await ctx.db.get(projectId);
    if (project === null) {
      throw new Error("New project was not readable in its creation transaction");
    }
    return projectSummary(project);
  },
});

export const getProject = query({
  args: { projectId: v.id("projects") },
  returns: projectSummaryValidator,
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.projectId);
    return projectSummary(project);
  },
});

export const requestRunnerCommand = mutation({
  args: { projectId: v.id("projects") },
  returns: v.object({
    status: v.literal("disconnected"),
    code: v.literal("RUNNER_DISCONNECTED"),
  }),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    return { status: "disconnected" as const, code: "RUNNER_DISCONNECTED" as const };
  },
});

export const setTenantMembership = mutation({
  args: {
    subject: v.string(),
    role: nullableTenantRoleValidator,
  },
  returns: v.object({
    subject: v.string(),
    role: nullableTenantRoleValidator,
  }),
  handler: async (ctx, args) => {
    const workspace = await requireWorkspace(ctx);
    if (workspace.membership.role !== "owner") {
      fail("TENANT_ACCESS_DENIED");
    }
    const subject = validateSubject(args.subject);
    if (
      workspace.tenant.kind === "personal" &&
      subject !== workspace.tenant.personalSubject
    ) {
      // Personal workspaces are selected by their verified subject. Granting
      // another owner would create authority that the recipient cannot select
      // and could orphan the tenant if the original owner left.
      fail("INVALID_REQUEST");
    }
    const existing = await tenantMembership(
      ctx,
      workspace.tenant._id,
      workspace.actor.identityNamespace,
      subject,
    );

    if (
      existing?.state === "active" &&
      existing.role === "owner" &&
      args.role !== "owner"
    ) {
      const owners = await ctx.db
        .query("tenantMemberships")
        .withIndex("by_tenant_and_role_and_state", (q) =>
          q
            .eq("tenantId", workspace.tenant._id)
            .eq("role", "owner")
            .eq("state", "active"),
        )
        .take(2);
      if (owners.length < 2) {
        fail("INVALID_REQUEST");
      }
    }

    const now = Date.now();
    if (args.role === null) {
      if (existing === null || existing.state === "revoked") {
        return { subject, role: null };
      }
      await ctx.db.patch(existing._id, { state: "revoked", updatedAt: now });
    } else if (existing === null) {
      await ctx.db.insert("tenantMemberships", {
        tenantId: workspace.tenant._id,
        identityNamespace: workspace.actor.identityNamespace,
        subject,
        role: args.role,
        state: "active",
        createdAt: now,
        updatedAt: now,
      });
    } else if (existing.state !== "active" || existing.role !== args.role) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        state: "active",
        updatedAt: now,
      });
    } else {
      return { subject, role: args.role };
    }

    await ctx.db.insert("auditEvents", {
      tenantId: workspace.tenant._id,
      actorSubject: workspace.actor.subject,
      action: "tenant_membership_set",
      targetSubject: subject,
      resultingRole: args.role ?? "revoked",
      occurredAt: now,
    });
    return { subject, role: args.role };
  },
});

export const setProjectMembership = mutation({
  args: {
    projectId: v.id("projects"),
    subject: v.string(),
    role: nullableProjectRoleValidator,
  },
  returns: v.object({
    subject: v.string(),
    role: nullableProjectRoleValidator,
  }),
  handler: async (ctx, args) => {
    const workspace = await requireWorkspace(ctx);
    if (workspace.membership.role !== "owner") {
      fail("TENANT_ACCESS_DENIED");
    }
    const project = await ctx.db.get(args.projectId);
    if (project === null || project.tenantId !== workspace.tenant._id) {
      fail("PROJECT_ACCESS_DENIED");
    }
    const subject = validateSubject(args.subject);
    const targetTenantMembership = await tenantMembership(
      ctx,
      workspace.tenant._id,
      workspace.actor.identityNamespace,
      subject,
    );
    if (
      args.role !== null &&
      (targetTenantMembership === null || targetTenantMembership.state !== "active")
    ) {
      fail("TENANT_ACCESS_DENIED");
    }

    const existing = await ctx.db
      .query("projectMemberships")
      .withIndex("by_project_and_identity_namespace_and_subject", (q) =>
        q
          .eq("projectId", project._id)
          .eq("identityNamespace", workspace.actor.identityNamespace)
          .eq("subject", subject),
      )
      .unique();
    const now = Date.now();
    if (args.role === null) {
      if (existing === null || existing.state === "revoked") {
        return { subject, role: null };
      }
      await ctx.db.patch(existing._id, { state: "revoked", updatedAt: now });
    } else if (existing === null) {
      await ctx.db.insert("projectMemberships", {
        tenantId: workspace.tenant._id,
        projectId: project._id,
        identityNamespace: workspace.actor.identityNamespace,
        subject,
        role: args.role,
        state: "active",
        createdAt: now,
        updatedAt: now,
      });
    } else if (existing.state !== "active" || existing.role !== args.role) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        state: "active",
        updatedAt: now,
      });
    } else {
      return { subject, role: args.role };
    }

    await ctx.db.insert("auditEvents", {
      tenantId: workspace.tenant._id,
      projectId: project._id,
      actorSubject: workspace.actor.subject,
      action: "project_membership_set",
      targetSubject: subject,
      resultingRole: args.role ?? "revoked",
      occurredAt: now,
    });
    return { subject, role: args.role };
  },
});

export const provisionOrganization = internalMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    ownerSubject: v.string(),
  },
  returns: v.object({ tenant: tenantSummaryValidator }),
  handler: async (ctx, args) => {
    const identityNamespace = configuredNamespace();
    const organizationId = validateOrganizationId(args.organizationId);
    const ownerSubject = validateSubject(args.ownerSubject);
    if (!PROJECT_NAME_PATTERN.test(args.name)) {
      fail("INVALID_REQUEST");
    }

    const existing = await organizationTenant(
      ctx,
      identityNamespace,
      organizationId,
    );
    if (existing !== null) {
      if (
        existing.name !== args.name ||
        existing.provisionedOwnerSubject !== ownerSubject
      ) {
        fail("IDEMPOTENCY_CONFLICT");
      }
      const membership = await tenantMembership(
        ctx,
        existing._id,
        identityNamespace,
        ownerSubject,
      );
      if (
        membership === null ||
        membership.state !== "active" ||
        membership.role !== "owner"
      ) {
        fail("TENANT_ACCESS_DENIED");
      }
      return { tenant: tenantSummary(existing, "owner") };
    }

    const now = Date.now();
    const tenantId = await ctx.db.insert("tenants", {
      identityNamespace,
      kind: "organization",
      name: args.name,
      workosOrganizationId: organizationId,
      provisionedOwnerSubject: ownerSubject,
      createdAt: now,
    });
    await ctx.db.insert("tenantMemberships", {
      tenantId,
      identityNamespace,
      subject: ownerSubject,
      role: "owner",
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      tenantId,
      actorSubject: "internal:provisionOrganization",
      action: "organization_provisioned",
      targetSubject: ownerSubject,
      resultingRole: "owner",
      occurredAt: now,
    });
    const tenant = await ctx.db.get(tenantId);
    if (tenant === null) {
      throw new Error("New organization was not readable in its creation transaction");
    }
    return { tenant: tenantSummary(tenant, "owner") };
  },
});

export type { ProjectRole, TenantRole };
