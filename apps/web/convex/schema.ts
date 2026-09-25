import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const tenantKind = v.union(v.literal("personal"), v.literal("organization"));
const tenantRole = v.union(
  v.literal("owner"),
  v.literal("editor"),
  v.literal("viewer"),
);
const projectRole = v.union(v.literal("editor"), v.literal("viewer"));
const grantState = v.union(v.literal("active"), v.literal("revoked"));

export default defineSchema({
  tenants: defineTable({
    identityNamespace: v.string(),
    kind: tenantKind,
    name: v.string(),
    personalSubject: v.optional(v.string()),
    workosOrganizationId: v.optional(v.string()),
    provisionedOwnerSubject: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_identity_namespace_and_personal_subject", [
      "identityNamespace",
      "personalSubject",
    ])
    .index("by_identity_namespace_and_workos_organization_id", [
      "identityNamespace",
      "workosOrganizationId",
    ]),

  tenantMemberships: defineTable({
    tenantId: v.id("tenants"),
    identityNamespace: v.string(),
    subject: v.string(),
    role: tenantRole,
    state: grantState,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant_and_identity_namespace_and_subject", [
      "tenantId",
      "identityNamespace",
      "subject",
    ])
    .index("by_tenant_and_role_and_state", ["tenantId", "role", "state"]),

  projects: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    createdAt: v.number(),
    createdBySubject: v.string(),
    sourceState: v.literal("unlinked"),
    registryReference: v.optional(
      v.object({
        runnerInstallationId: v.string(),
        registryProjectId: v.string(),
      }),
    ),
  }).index("by_tenant", ["tenantId"]),

  projectMemberships: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    identityNamespace: v.string(),
    subject: v.string(),
    role: projectRole,
    state: grantState,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_and_identity_namespace_and_subject", [
      "projectId",
      "identityNamespace",
      "subject",
    ])
    .index("by_tenant_and_identity_namespace_and_subject_and_state", [
      "tenantId",
      "identityNamespace",
      "subject",
      "state",
    ]),

  projectCreateRequests: defineTable({
    tenantId: v.id("tenants"),
    identityNamespace: v.string(),
    actorSubject: v.string(),
    requestId: v.string(),
    projectName: v.string(),
    projectId: v.id("projects"),
    createdAt: v.number(),
  }).index("by_tenant_namespace_actor_request", [
    "tenantId",
    "identityNamespace",
    "actorSubject",
    "requestId",
  ]),

  proposalJobs: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    identityNamespace: v.string(),
    initiatingSubject: v.string(),
    requestId: v.string(),
    sourceRevision: v.string(),
    commandDigest: v.string(),
    adapter: v.union(v.literal("runner-prepare"), v.literal("offline-test")),
    adapterVersion: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("cancelled"),
    ),
  })
    .index("by_project", ["projectId"])
    .index("by_tenant_and_project_and_actor_and_request", [
      "tenantId", "projectId", "initiatingSubject", "requestId",
    ]),

  proposals: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    jobId: v.id("proposalJobs"),
    digest: v.string(),
    prepareJson: v.string(),
    sourceProposalJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_job", ["jobId"]),

  proposalDecisions: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    proposalId: v.id("proposals"),
    identityNamespace: v.string(),
    actorSubject: v.string(),
    requestId: v.string(),
    action: v.union(v.literal("approve"), v.literal("reject"), v.literal("cancel")),
    expectedDigest: v.string(),
    expectedRevision: v.string(),
    decidedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_tenant_and_project_and_actor_and_request", [
      "tenantId", "projectId", "actorSubject", "requestId",
    ]),

  auditEvents: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    actorSubject: v.string(),
    action: v.union(
      v.literal("personal_workspace_bootstrapped"),
      v.literal("organization_provisioned"),
      v.literal("project_created"),
      v.literal("tenant_membership_set"),
      v.literal("project_membership_set"),
      v.literal("proposal_approved"),
      v.literal("proposal_rejected"),
      v.literal("proposal_cancelled"),
    ),
    targetSubject: v.optional(v.string()),
    resultingRole: v.optional(
      v.union(
        v.literal("owner"),
        v.literal("editor"),
        v.literal("viewer"),
        v.literal("revoked"),
      ),
    ),
    requestId: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"]),
});
