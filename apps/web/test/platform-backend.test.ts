import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const CLIENT_ID = "client_test_stellar";
const GLOBAL_ISSUER = "https://api.workos.com/";
const MODULES = import.meta.glob("../convex/**/*.*s");
const firstPage = { numItems: 20, cursor: null };

function identity(subject: string, organizationId?: string) {
  return {
    subject,
    issuer: GLOBAL_ISSUER,
    ...(organizationId === undefined ? {} : { org_id: organizationId }),
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

describe("platform backend authorization", () => {
  beforeEach(() => {
    process.env.WORKOS_CLIENT_ID = CLIENT_ID;
  });

  afterEach(() => {
    delete process.env.WORKOS_CLIENT_ID;
  });

  it("fails closed for anonymous, missing configuration, and wrong issuer calls", async () => {
    const t = convexTest(schema, MODULES);
    await expectCode(t.mutation(api.platform.bootstrapWorkspace, {}), "UNAUTHENTICATED");

    delete process.env.WORKOS_CLIENT_ID;
    await expectCode(
      t.withIdentity(identity("user-a")).mutation(api.platform.bootstrapWorkspace, {}),
      "AUTH_CONFIG_MISSING",
    );

    process.env.WORKOS_CLIENT_ID = CLIENT_ID;
    await expectCode(
      t
        .withIdentity({ subject: "user-a", issuer: "https://attacker.example/" })
        .mutation(api.platform.bootstrapWorkspace, {}),
      "UNAUTHENTICATED",
    );
  });

  it("accepts the client-specific WorkOS issuer and bootstraps a personal tenant once", async () => {
    const t = convexTest(schema, MODULES);
    const actor = t.withIdentity({
      subject: "user-a",
      issuer: `https://api.workos.com/user_management/${CLIENT_ID}`,
    });

    const first = await actor.mutation(api.platform.bootstrapWorkspace, {});
    const second = await actor.mutation(api.platform.bootstrapWorkspace, {});

    expect(second).toEqual(first);
    expect(first.tenant).toMatchObject({ kind: "personal", role: "owner" });
    const counts = await t.run(async (ctx) => ({
      tenants: (await ctx.db.query("tenants").collect()).length,
      memberships: (await ctx.db.query("tenantMemberships").collect()).length,
      audits: (await ctx.db.query("auditEvents").collect()).length,
    }));
    expect(counts).toEqual({ tenants: 1, memberships: 1, audits: 1 });
  });

  it("never restores a revoked personal owner through bootstrap", async () => {
    const t = convexTest(schema, MODULES);
    const actor = t.withIdentity(identity("user-a"));
    await actor.mutation(api.platform.bootstrapWorkspace, {});
    await t.run(async (ctx) => {
      const membership = (await ctx.db.query("tenantMemberships").collect())[0];
      await ctx.db.patch(membership._id, { state: "revoked", updatedAt: Date.now() });
    });

    await expectCode(
      actor.mutation(api.platform.bootstrapWorkspace, {}),
      "TENANT_ACCESS_DENIED",
    );
    const counts = await t.run(async (ctx) => ({
      tenants: (await ctx.db.query("tenants").collect()).length,
      memberships: (await ctx.db.query("tenantMemberships").collect()).length,
      audits: (await ctx.db.query("auditEvents").collect()).length,
    }));
    expect(counts).toEqual({ tenants: 1, memberships: 1, audits: 1 });
  });

  it("does not let an org claim provision or select another organization", async () => {
    const t = convexTest(schema, MODULES);
    const personal = t.withIdentity(identity("org-owner"));
    await personal.mutation(api.platform.bootstrapWorkspace, {});

    await expectCode(
      t
        .withIdentity(identity("org-owner", "org-a"))
        .mutation(api.platform.bootstrapWorkspace, {}),
      "WORKSPACE_NOT_PROVISIONED",
    );

    await t.mutation(internal.platform.provisionOrganization, {
      organizationId: "org-a",
      name: "Acme",
      ownerSubject: "org-owner",
    });
    const orgViewer = await t
      .withIdentity(identity("org-owner", "org-a"))
      .query(api.platform.viewer, {});
    expect(orgViewer.tenant).toMatchObject({ kind: "organization", name: "Acme", role: "owner" });

    await expectCode(
      t.withIdentity(identity("outsider", "org-a")).query(api.platform.viewer, {}),
      "TENANT_ACCESS_DENIED",
    );

    await expectCode(
      t
        .withIdentity(identity("org-owner", "org-b"))
        .query(api.platform.viewer, {}),
      "WORKSPACE_NOT_PROVISIONED",
    );
  });

  it("creates a project atomically and scopes idempotency to tenant and actor", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});

    const created = await owner.mutation(api.platform.createProject, {
      name: "Marketing Site",
      requestId: "request:create-1",
    });
    const retried = await owner.mutation(api.platform.createProject, {
      name: "Marketing Site",
      requestId: "request:create-1",
    });
    expect(retried).toEqual(created);

    await expectCode(
      owner.mutation(api.platform.createProject, {
        name: "Different Site",
        requestId: "request:create-1",
      }),
      "IDEMPOTENCY_CONFLICT",
    );

    const rows = await t.run(async (ctx) => ({
      projects: await ctx.db.query("projects").collect(),
      grants: await ctx.db.query("projectMemberships").collect(),
      requests: await ctx.db.query("projectCreateRequests").collect(),
      audits: await ctx.db.query("auditEvents").collect(),
    }));
    expect(rows.projects).toHaveLength(1);
    expect(rows.grants).toHaveLength(1);
    expect(rows.requests).toHaveLength(1);
    expect(rows.audits.filter((event) => event.action === "project_created")).toHaveLength(1);
    expect(rows.grants[0]).toMatchObject({ projectId: created._id, role: "editor", state: "active" });
    expect(rows.audits.find((event) => event.action === "project_created")).toMatchObject({
      projectId: created._id,
      requestId: "request:create-1",
    });
  });

  it("leaves no creation cohort or audit record after invalid and read-only creates", async () => {
    const t = convexTest(schema, MODULES);
    await t.mutation(internal.platform.provisionOrganization, {
      organizationId: "org-readonly",
      name: "Readonly Organization",
      ownerSubject: "owner",
    });
    const owner = t.withIdentity(identity("owner", "org-readonly"));
    const viewer = t.withIdentity(identity("viewer", "org-readonly"));
    await owner.mutation(api.platform.setTenantMembership, {
      subject: "viewer",
      role: "viewer",
    });

    await expectCode(
      owner.mutation(api.platform.createProject, { name: " invalid", requestId: "valid-request" }),
      "INVALID_REQUEST",
    );
    await expectCode(
      viewer.mutation(api.platform.createProject, { name: "Valid", requestId: "viewer-request" }),
      "READ_ONLY",
    );

    const rows = await t.run(async (ctx) => ({
      projects: (await ctx.db.query("projects").collect()).length,
      grants: (await ctx.db.query("projectMemberships").collect()).length,
      requests: (await ctx.db.query("projectCreateRequests").collect()).length,
      projectAudits: (await ctx.db.query("auditEvents").collect()).filter(
        (event) => event.action === "project_created",
      ).length,
    }));
    expect(rows).toEqual({ projects: 0, grants: 0, requests: 0, projectAudits: 0 });
  });

  it("isolates project IDs across personal tenants", async () => {
    const t = convexTest(schema, MODULES);
    const ownerA = t.withIdentity(identity("owner-a"));
    const ownerB = t.withIdentity(identity("owner-b"));
    await ownerA.mutation(api.platform.bootstrapWorkspace, {});
    await ownerB.mutation(api.platform.bootstrapWorkspace, {});
    const project = await ownerA.mutation(api.platform.createProject, {
      name: "Tenant A",
      requestId: "tenant-a-request",
    });

    await expectCode(
      ownerB.query(api.platform.getProject, { projectId: project._id }),
      "PROJECT_ACCESS_DENIED",
    );
    await expectCode(
      ownerB.mutation(api.platform.requestRunnerCommand, { projectId: project._id }),
      "PROJECT_ACCESS_DENIED",
    );
  });

  it("denies another project in the same tenant when only one project is granted", async () => {
    const t = convexTest(schema, MODULES);
    await t.mutation(internal.platform.provisionOrganization, {
      organizationId: "org-project-scope", name: "Project Scope", ownerSubject: "owner",
    });
    const owner = t.withIdentity(identity("owner", "org-project-scope"));
    const viewer = t.withIdentity(identity("viewer", "org-project-scope"));
    await owner.mutation(api.platform.setTenantMembership, { subject: "viewer", role: "viewer" });
    const projectA = await owner.mutation(api.platform.createProject, { name: "Allowed Project", requestId: "scope-a" });
    const projectB = await owner.mutation(api.platform.createProject, { name: "Private Project", requestId: "scope-b" });
    await owner.mutation(api.platform.setProjectMembership, { projectId: projectA._id, subject: "viewer", role: "viewer" });
    expect(await viewer.query(api.platform.getProject, { projectId: projectA._id })).toEqual(projectA);
    expect((await viewer.query(api.platform.listProjects, { paginationOpts: firstPage })).page).toEqual([projectA]);
    await expectCode(viewer.query(api.platform.getProject, { projectId: projectB._id }), "PROJECT_ACCESS_DENIED");
    await expectCode(viewer.mutation(api.platform.requestRunnerCommand, { projectId: projectB._id }), "PROJECT_ACCESS_DENIED");
    await expectCode(viewer.mutation(api.platform.setProjectMembership, { projectId: projectB._id, subject: "viewer", role: "editor" }), "TENANT_ACCESS_DENIED");
  });

  it("checks tenant and project revocation on every editor call, including retries", async () => {
    const t = convexTest(schema, MODULES);
    await t.mutation(internal.platform.provisionOrganization, {
      organizationId: "org-revocation",
      name: "Revocation Organization",
      ownerSubject: "owner",
    });
    const owner = t.withIdentity(identity("owner", "org-revocation"));
    const editor = t.withIdentity(identity("editor", "org-revocation"));
    await owner.mutation(api.platform.setTenantMembership, {
      subject: "editor",
      role: "editor",
    });
    const project = await editor.mutation(api.platform.createProject, {
      name: "Editor Project",
      requestId: "editor-request",
    });

    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id,
      subject: "editor",
      role: null,
    });
    await expectCode(
      editor.mutation(api.platform.createProject, {
        name: "Editor Project",
        requestId: "editor-request",
      }),
      "PROJECT_ACCESS_DENIED",
    );
    await expectCode(
      editor.query(api.platform.getProject, { projectId: project._id }),
      "PROJECT_ACCESS_DENIED",
    );

    await owner.mutation(api.platform.setTenantMembership, {
      subject: "editor",
      role: null,
    });
    await expectCode(
      editor.query(api.platform.listProjects, { paginationOpts: firstPage }),
      "TENANT_ACCESS_DENIED",
    );
  });

  it("lists and authorizes only the same-org projects granted to a non-owner", async () => {
    const t = convexTest(schema, MODULES);
    await t.mutation(internal.platform.provisionOrganization, {
      organizationId: "org-list",
      name: "Listing Organization",
      ownerSubject: "owner",
    });
    const owner = t.withIdentity(identity("owner", "org-list"));
    const viewer = t.withIdentity(identity("viewer", "org-list"));
    await owner.mutation(api.platform.setTenantMembership, {
      subject: "viewer",
      role: "viewer",
    });
    const first = await owner.mutation(api.platform.createProject, {
      name: "First",
      requestId: "first-request",
    });
    const second = await owner.mutation(api.platform.createProject, {
      name: "Second",
      requestId: "second-request",
    });
    await owner.mutation(api.platform.setProjectMembership, {
      projectId: first._id,
      subject: "viewer",
      role: "viewer",
    });

    const granted = await viewer.query(api.platform.listProjects, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(granted.page.map((project) => project._id)).toEqual([first._id]);
    expect(granted.isDone).toBe(true);
    await expect(viewer.query(api.platform.getProject, { projectId: first._id })).resolves.toEqual(
      first,
    );
    await expectCode(
      viewer.query(api.platform.getProject, { projectId: second._id }),
      "PROJECT_ACCESS_DENIED",
    );
    await expectCode(
      viewer.mutation(api.platform.requestRunnerCommand, { projectId: second._id }),
      "PROJECT_ACCESS_DENIED",
    );

    await owner.mutation(api.platform.setProjectMembership, {
      projectId: first._id,
      subject: "viewer",
      role: null,
    });
    const revoked = await viewer.query(api.platform.listProjects, {
      paginationOpts: firstPage,
    });
    expect(revoked.page).toEqual([]);
  });

  it("bounds pagination requested directly from Convex", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});

    for (const numItems of [0, 1.5, 51]) {
      await expectCode(
        owner.query(api.platform.listProjects, {
          paginationOpts: { numItems, cursor: null },
        }),
        "INVALID_REQUEST",
      );
    }
    await expectCode(
      owner.query(api.platform.listProjects, {
        paginationOpts: {
          numItems: 20,
          cursor: null,
          maximumRowsRead: 10_000,
        },
      }),
      "INVALID_REQUEST",
    );
  });

  it("requires an active tenant membership before granting project access", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await owner.mutation(api.platform.createProject, {
      name: "Membership Gate",
      requestId: "membership-gate",
    });

    await expectCode(
      owner.mutation(api.platform.setProjectMembership, {
        projectId: project._id,
        subject: "outsider",
        role: "viewer",
      }),
      "TENANT_ACCESS_DENIED",
    );
    const grants = await t.run(async (ctx) =>
      (await ctx.db.query("projectMemberships").collect()).filter(
        (grant) => grant.subject === "outsider",
      ),
    );
    expect(grants).toEqual([]);
  });

  it("protects the last owner and returns a typed disconnected runner result after auth", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await owner.mutation(api.platform.createProject, {
      name: "Disconnected",
      requestId: "disconnected-request",
    });

    await expectCode(
      owner.mutation(api.platform.setTenantMembership, { subject: "owner", role: null }),
      "INVALID_REQUEST",
    );
    await expectCode(
      owner.mutation(api.platform.setTenantMembership, {
        subject: "unselectable-owner",
        role: "owner",
      }),
      "INVALID_REQUEST",
    );
    await expect(
      owner.mutation(api.platform.requestRunnerCommand, { projectId: project._id }),
    ).resolves.toEqual({ status: "disconnected", code: "RUNNER_DISCONNECTED" });
    await expectCode(
      t.mutation(api.platform.requestRunnerCommand, { projectId: project._id }),
      "UNAUTHENTICATED",
    );
  });
});
