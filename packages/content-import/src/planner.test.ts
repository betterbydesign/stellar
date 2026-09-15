import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  InvalidInputError,
  MappingSchema,
  compileDryRun,
  computeTargetSchemaDigest,
  type DryRunPlan,
} from "./index.js";

const fixture = (name: "mapping" | "source" | "target") =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));

const clone = <T>(value: T): T => structuredClone(value);

const mappingFixture = fixture("mapping");
const sourceFixture = fixture("source");
const targetFixture = fixture("target");

const refreshEvidence = (mapping: any, source: any, target: any): void => {
  mapping.targetSchema.schemaDigest = computeTargetSchemaDigest(MappingSchema.parse(mapping).targetSchema);
  target.schema = {
    schemaId: mapping.targetSchema.schemaId,
    schemaVersion: mapping.targetSchema.schemaVersion,
    schemaDigest: mapping.targetSchema.schemaDigest,
  };
  target.approval = {
    status: "approved_for_planning",
    mappingId: mapping.mappingId,
    mappingVersion: mapping.mappingVersion,
    mappingDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    targetId: target.targetId,
    environment: target.environment,
    schemaDigest: mapping.targetSchema.schemaDigest,
  };
  const blocked = compileDryRun({ mapping, source, target });
  target.approval.mappingDigest = blocked.inputDigests.mapping;
};

const prepare = (change?: (mapping: any, source: any, target: any) => void) => {
  const mapping = clone(mappingFixture);
  const source = clone(sourceFixture);
  const target = clone(targetFixture);
  change?.(mapping, source, target);
  refreshEvidence(mapping, source, target);
  return { mapping, source, target };
};

const operation = (plan: DryRunPlan, kind: DryRunPlan["operations"][number]["kind"], recordId: string) => {
  const found = plan.operations.find((item) => item.kind === kind && item.identity.includes(recordId));
  assert.ok(found, `missing ${kind} operation for ${recordId}`);
  return found;
};

const identity = (tableId: string, recordId: string) => ({
  system: "airtable",
  baseId: "base_fixture",
  tableId,
  recordId,
});

const rerunTarget = (plan: DryRunPlan) => {
  const target = clone(targetFixture);
  const shared = operation(plan, "post", "rec_shared");
  const page = operation(plan, "post", "rec_page");
  const parent = operation(plan, "term", "rec_term_parent");
  const child = operation(plan, "term", "rec_term_child");
  const media = operation(plan, "media", "att_shared");
  const assignment = operation(plan, "taxonomy_assignment", "rec_page");
  target.posts = [
    {
      targetId: "wp_shared",
      postType: "shared_post",
      sourceIdentity: identity("tbl_shared", "rec_shared"),
      revision: "revision_shared",
      status: "draft",
      fields: (shared.desired as any).fields.map((field: any) => ({ ...field, ownership: "managed" })),
    },
    {
      targetId: "wp_page",
      postType: "page",
      sourceIdentity: identity("tbl_pages", "rec_page"),
      revision: "revision_page",
      status: "draft",
      fields: (page.desired as any).fields.map((field: any) => ({ ...field, ownership: "managed" })),
    },
  ];
  target.terms = [
    {
      targetId: "wp_term_parent",
      taxonomyKey: "industry",
      sourceIdentity: identity("tbl_terms", "rec_term_parent"),
      revision: "revision_term_parent",
      ownership: "managed",
      ...(parent.desired as object),
    },
    {
      targetId: "wp_term_child",
      taxonomyKey: "industry",
      sourceIdentity: identity("tbl_terms", "rec_term_child"),
      revision: "revision_term_child",
      ownership: "managed",
      ...(child.desired as object),
    },
  ];
  target.media = [{
    targetId: "wp_media",
    sourceIdentity: {
      ...identity("tbl_shared", "rec_shared"),
      fieldId: "fld_image",
      attachmentId: "att_shared",
    },
    revision: "revision_media",
    ownership: "managed",
    ...(media.desired as object),
  }];
  target.taxonomyAssignments = [{
    postSourceIdentity: identity("tbl_pages", "rec_page"),
    taxonomyKey: "industry",
    bindingId: "page_industry",
    ownership: "managed",
    revision: "revision_assignment",
    ...(assignment.desired as object),
  }];
  return target;
};

test("synthetic fixture plans only selected roots and forward dependencies in stable order", () => {
  const inputs = prepare();
  const before = clone(inputs);
  const plan = compileDryRun(inputs);
  assert.equal(plan.readiness, "ready");
  assert.deepEqual(plan.counts, { create: 6, update: 0, noop: 0, blocked: 0 });
  assert.equal(plan.writesAttempted, 0);
  assert.deepEqual(plan.operations.map((item) => item.kind), ["media", "term", "term", "post", "post", "taxonomy_assignment"]);
  assert.ok(plan.operations.every((item, index) => item.order === index && item.intentDigest.startsWith("sha256:")));
  assert.equal(operation(plan, "post", "rec_page").action, "create");
  assert.equal((operation(plan, "post", "rec_page").desired as any).status, "draft");
  assert.ok(!JSON.stringify(plan).includes("rec_excluded"));
  assert.ok(!JSON.stringify(plan).includes("rec_unrelated"));
  assert.deepEqual(inputs, before);
});

test("declaration and snapshot ordering is canonical while declared relationship order is preserved", () => {
  const original = prepare();
  const reordered = prepare((mapping, source) => {
    mapping.targetSchema.postTypes.reverse();
    mapping.targetSchema.acfGroups.reverse();
    mapping.entities.reverse();
    mapping.exclusions.reverse();
    source.tables.reverse();
    source.tables.forEach((table: any) => table.records.reverse());
  });
  assert.deepEqual(compileDryRun(reordered), compileDryRun(original));

  const changedOrder = prepare((mapping, source) => {
    const relationship = mapping.entities.find((item: any) => item.id === "page_entity").bindings.find((item: any) => item.id === "page_related");
    relationship.cardinality.max = 2;
    source.tables.find((table: any) => table.tableId === "tbl_pages").records[0].fields.fld_related.recordIds = ["rec_shared", "rec_unrelated"];
    mapping.exclusions = mapping.exclusions.filter((item: any) => item.recordId !== "rec_unrelated");
  });
  const reversed = clone(changedOrder);
  reversed.source.tables.find((table: any) => table.tableId === "tbl_pages").records[0].fields.fld_related.recordIds.reverse();
  refreshEvidence(reversed.mapping, reversed.source, reversed.target);
  assert.notEqual(compileDryRun(changedOrder).inputDigests.source, compileDryRun(reversed).inputDigests.source);
});

test("strict schemas reject versions, unknown keys, transforms, duplicates and unknown targets without leaking values", () => {
  const cases = [
    (mapping: any) => { mapping.contractVersion = "stellar.content-import.v2"; },
    (mapping: any) => { mapping.secret = "do-not-echo"; },
    (mapping: any) => { mapping.entities[0].bindings[0].transform = "eval"; },
    (mapping: any) => { mapping.entities[0].bindings.push(clone(mapping.entities[0].bindings[0])); },
    (mapping: any) => { mapping.entities[0].bindings[0].target.field = "unknown"; },
  ];
  for (const mutate of cases) {
    const mapping = clone(mappingFixture);
    mutate(mapping);
    assert.throws(() => compileDryRun({ mapping, source: sourceFixture, target: targetFixture }), InvalidInputError);
  }

  const source = clone(sourceFixture);
  source.tables[0].records[0].fields["$credential-secret-raw"] = { type: "text", value: "SOURCE_VALUE_MUST_NOT_LEAK" };
  try {
    compileDryRun({ mapping: mappingFixture, source, target: targetFixture });
    assert.fail("expected invalid input");
  } catch (error) {
    assert.ok(error instanceof InvalidInputError);
    const serialized = JSON.stringify(error.issues);
    assert.ok(!serialized.includes("credential-secret-raw"));
    assert.ok(!serialized.includes("SOURCE_VALUE_MUST_NOT_LEAK"));
    assert.ok(serialized.includes("*"));
  }

  const sourceWithUrl = clone(sourceFixture);
  sourceWithUrl.attachments[0].temporaryUrl = "https://example.test/temporary";
  assert.throws(() => compileDryRun({ mapping: mappingFixture, source: sourceWithUrl, target: targetFixture }), InvalidInputError);
});

test("non-view root links, missing links, duplicate links and cardinality violations block safely", () => {
  const outside = prepare((mapping, source) => {
    const relationship = mapping.entities[0].bindings.find((item: any) => item.id === "page_related");
    relationship.relatedTableId = "tbl_pages";
    relationship.relatedPostType = "page";
    source.tables[0].records[0].fields.fld_related.recordIds = ["rec_excluded"];
  });
  const outsidePlan = compileDryRun(outside);
  assert.equal(outsidePlan.readiness, "blocked");
  assert.ok(outsidePlan.diagnostics.some((item) => item.code === "DEPENDENCY_EXCLUDED"));
  assert.equal(outsidePlan.operations.filter((item) => item.kind === "post").length, 1);

  const missing = prepare((_mapping, source) => {
    source.tables[0].records[0].fields.fld_related.recordIds = ["rec_missing"];
  });
  assert.ok(compileDryRun(missing).diagnostics.some((item) => item.code === "MISSING_DEPENDENCY"));

  const duplicate = prepare((_mapping, source) => {
    source.tables[0].records[0].fields.fld_related.recordIds = ["rec_shared", "rec_shared"];
  });
  assert.ok(compileDryRun(duplicate).diagnostics.some((item) => item.code === "DUPLICATE_LINK"));

  const empty = prepare((_mapping, source) => { source.tables[0].records[0].fields.fld_related.recordIds = []; });
  assert.ok(compileDryRun(empty).diagnostics.some((item) => item.code === "INVALID_CARDINALITY"));
});

test("term cycles and missing parents are distinct blocked diagnostics", () => {
  const cycle = prepare((_mapping, source) => {
    source.tables.find((table: any) => table.tableId === "tbl_terms").records[0].fields.fld_parent.recordIds = ["rec_term_child"];
  });
  assert.ok(compileDryRun(cycle).diagnostics.some((item) => item.code === "TERM_HIERARCHY_CYCLE"));

  const missing = prepare((_mapping, source) => {
    source.tables.find((table: any) => table.tableId === "tbl_terms").records[1].fields.fld_parent.recordIds = ["rec_term_missing"];
  });
  const plan = compileDryRun(missing);
  assert.ok(plan.diagnostics.some((item) => item.code === "MISSING_DEPENDENCY"));
  assert.ok(!plan.diagnostics.some((item) => item.code === "TERM_HIERARCHY_CYCLE"));
});

test("blocked media or shared records propagate through noop and create dependents", () => {
  const invalid = prepare((_mapping, source) => {
    source.tables.find((table: any) => table.tableId === "tbl_shared").records[0].fields.fld_summary.value = " ";
  });
  const plan = compileDryRun(invalid);
  assert.equal(operation(plan, "post", "rec_shared").action, "blocked");
  assert.equal(operation(plan, "post", "rec_page").action, "blocked");
  assert.ok(operation(plan, "post", "rec_page").diagnosticCodes.includes("DEPENDENCY_BLOCKED"));
});

test("production blocks non-draftable work and prevents dependent post readiness", () => {
  const inputs = prepare((mapping, _source, target) => {
    mapping.policy.allowedEnvironments = ["production"];
    target.environment = "production";
  });
  const plan = compileDryRun(inputs);
  assert.equal(plan.readiness, "blocked");
  assert.ok(plan.operations.filter((item) => ["media", "term", "taxonomy_assignment"].includes(item.kind)).every((item) => item.action === "blocked"));
  assert.equal(operation(plan, "post", "rec_page").action, "blocked");
});

test("a complete managed rerun is noop; drift is revision-guarded and ownership-safe", () => {
  const first = prepare();
  const createPlan = compileDryRun(first);
  const target = rerunTarget(createPlan);
  refreshEvidence(first.mapping, first.source, target);
  const noop = compileDryRun({ mapping: first.mapping, source: first.source, target });
  assert.equal(noop.readiness, "ready");
  assert.deepEqual(noop.counts, { create: 0, update: 0, noop: 6, blocked: 0 });

  const changed = clone(target);
  changed.posts.find((item: any) => item.targetId === "wp_page").fields.find((field: any) => field.bindingId === "page_title").value = "Old title";
  refreshEvidence(first.mapping, first.source, changed);
  const updatePlan = compileDryRun({ mapping: first.mapping, source: first.source, target: changed });
  const pageUpdate = operation(updatePlan, "post", "rec_page");
  assert.equal(pageUpdate.action, "update");
  assert.equal(pageUpdate.expectedRevision, "revision_page");
  assert.equal("status" in (pageUpdate.desired as object), false);

  const owned = clone(target);
  owned.posts.find((item: any) => item.targetId === "wp_page").fields.find((field: any) => field.bindingId === "page_title").ownership = "wordpress";
  refreshEvidence(first.mapping, first.source, owned);
  const ownedOperation = operation(compileDryRun({ mapping: first.mapping, source: first.source, target: owned }), "post", "rec_page");
  assert.equal(ownedOperation.action, "blocked");
  assert.ok(JSON.stringify(ownedOperation.desired).includes("page_title"));

  const published = clone(changed);
  published.posts.find((item: any) => item.targetId === "wp_page").status = "publish";
  refreshEvidence(first.mapping, first.source, published);
  assert.equal(operation(compileDryRun({ mapping: first.mapping, source: first.source, target: published }), "post", "rec_page").action, "blocked");
});

test("unordered multi-media values remain noop when target member order differs", () => {
  const inputs = prepare((mapping, source) => {
    const binding = mapping.entities.find((item: any) => item.id === "shared_entity").bindings.find((item: any) => item.id === "shared_image");
    binding.cardinality.max = 2;
    binding.ordered = false;
    const shared = source.tables.find((table: any) => table.tableId === "tbl_shared").records.find((record: any) => record.recordId === "rec_shared");
    shared.fields.fld_image.attachmentIds.push("att_second");
    source.attachments.push({
      identity: { ...identity("tbl_shared", "rec_shared"), fieldId: "fld_image", attachmentId: "att_second" },
      digest: `sha256:${"0".repeat(64)}`,
      fileName: "second.png",
      mimeType: "image/png",
      byteSize: 64,
    });
  });
  const createPlan = compileDryRun(inputs);
  const target = rerunTarget(createPlan);
  const sharedTarget = target.posts.find((item: any) => item.targetId === "wp_shared");
  sharedTarget.fields.find((field: any) => field.bindingId === "shared_image").value.reverse();
  refreshEvidence(inputs.mapping, inputs.source, target);
  const rerun = compileDryRun({ mapping: inputs.mapping, source: inputs.source, target });
  assert.equal(operation(rerun, "post", "rec_shared").action, "noop");
});

test("identity collisions block without choosing an ambiguous target precondition", () => {
  const inputs = prepare();
  const created = compileDryRun(inputs);
  const target = rerunTarget(created);
  const page = target.posts.find((item: any) => item.targetId === "wp_page");
  target.posts.push({ ...clone(page), targetId: "wp_page_duplicate", revision: "revision_duplicate" });
  refreshEvidence(inputs.mapping, inputs.source, target);
  const one = compileDryRun({ mapping: inputs.mapping, source: inputs.source, target });
  const collision = operation(one, "post", "rec_page");
  assert.equal(collision.action, "blocked");
  assert.equal(collision.targetId, null);
  assert.equal(collision.expectedRevision, null);
  target.posts.reverse();
  const two = compileDryRun({ mapping: inputs.mapping, source: inputs.source, target });
  assert.deepEqual(two, one);
});

test("unapproved, mismatched schema and incomplete snapshots return blocked plans", () => {
  const unapproved = prepare();
  unapproved.target.approval.status = "unapproved";
  assert.ok(compileDryRun(unapproved).diagnostics.some((item) => item.code === "APPROVAL_MISMATCH"));

  const schema = prepare();
  schema.target.schema.schemaDigest = `sha256:${"f".repeat(64)}`;
  assert.ok(compileDryRun(schema).diagnostics.some((item) => item.code === "SCHEMA_MISMATCH"));

  const incomplete = prepare();
  incomplete.source.root.complete = false;
  incomplete.target.snapshotComplete = false;
  const plan = compileDryRun(incomplete);
  assert.ok(plan.diagnostics.some((item) => item.code === "INCOMPLETE_SOURCE_SNAPSHOT"));
  assert.ok(plan.diagnostics.some((item) => item.code === "INCOMPLETE_TARGET_INVENTORY"));
});

test("plan-level blockers propagate from newly blocked updates to noop dependents", () => {
  const inputs = prepare();
  const target = rerunTarget(compileDryRun(inputs));
  target.posts.find((item: any) => item.targetId === "wp_shared").fields.find((field: any) => field.bindingId === "shared_title").value = "Old shared title";
  refreshEvidence(inputs.mapping, inputs.source, target);
  target.approval.status = "unapproved";
  const plan = compileDryRun({ mapping: inputs.mapping, source: inputs.source, target });
  assert.equal(operation(plan, "post", "rec_shared").action, "blocked");
  const page = operation(plan, "post", "rec_page");
  assert.equal(page.action, "blocked");
  assert.ok(page.diagnosticCodes.includes("DEPENDENCY_BLOCKED"));
});

test("wordpress-owned bindings do not broaden source scope or emit desired values", () => {
  const inputs = prepare((mapping) => {
    const page = mapping.entities.find((item: any) => item.id === "page_entity");
    page.bindings.find((item: any) => item.id === "page_related").ownership = "wordpress";
    page.taxonomyAssignments[0].ownership = "wordpress";
  });
  const plan = compileDryRun(inputs);
  assert.equal(plan.operations.filter((item) => item.kind === "post").length, 1);
  assert.equal(plan.operations.filter((item) => item.kind === "term").length, 0);
  assert.equal(plan.operations.filter((item) => item.kind === "taxonomy_assignment").length, 0);
  assert.ok(!JSON.stringify(plan).includes("rec_shared"));
  assert.ok(!JSON.stringify(operation(plan, "post", "rec_page").desired).includes("page_related"));
});

test("multiple selected roots may reuse one mapping-level taxonomy binding without identity ambiguity", () => {
  const inputs = prepare((_mapping, source) => {
    const pages = source.tables.find((table: any) => table.tableId === "tbl_pages");
    const second = clone(pages.records.find((record: any) => record.recordId === "rec_page"));
    second.recordId = "rec_page_two";
    second.fields.fld_title.value = "Second selected page";
    second.fields.fld_slug.value = "second-selected-page";
    pages.records.push(second);
    source.root.recordIds.push("rec_page_two");
  });
  const plan = compileDryRun(inputs);
  assert.equal(plan.readiness, "ready");
  assert.equal(plan.operations.filter((item) => item.kind === "post").length, 3);
  assert.equal(plan.operations.filter((item) => item.kind === "taxonomy_assignment").length, 2);
});
