import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditCompanyMapping } from "../scripts/audit-company-content-map.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(root, "scripts/audit-company-content-map.mjs");
const originalMap = JSON.parse(readFileSync(join(root, "docs/contracts/company-airtable-acf-map.v0.1.json"), "utf8"));
const originalSchema = JSON.parse(readFileSync(join(root, "docs/research/airtable-schema-snapshot.json"), "utf8"));
const copy = (value) => JSON.parse(JSON.stringify(value));
const codes = (findings) => findings.map((item) => item.code);

test("committed company mapping is structurally sound but explicitly blocked", () => {
  const report = auditCompanyMapping(originalMap, originalSchema);
  assert.equal(report.status, "blocked");
  assert.equal(report.writesAttempted, 0);
  assert.deepEqual(report.summary, {
    bindings: 71,
    bodySections: 7,
    fields: 176,
    globalSections: 1,
    selectedRoots: 1,
    tables: 16,
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(codes(report.blockers), [
    "GLOBAL_OPTIONS_NOT_DRAFTABLE",
    "LEGACY_DRAFT_NOT_EXECUTABLE",
    "MEDIA_EVIDENCE_MISSING",
    "RECORD_SNAPSHOT_MISSING",
    "TARGET_FIELD_KEYS_UNRESOLVED",
    "TARGET_INVENTORY_MISSING",
    "TARGET_SCHEMA_UNAPPROVED",
    "TAXONOMY_MAPPING_UNRESOLVED",
  ]);
  assert.deepEqual(report, auditCompanyMapping(originalMap, originalSchema));
});

test("legacy evidence cannot be promoted to executable by injecting approval-shaped fields", () => {
  const map = copy(originalMap);
  const schema = copy(originalSchema);
  schema.records = [{}];
  map.schema.targetSchemaVerified = true;
  map.schema.targetFieldKeys = [{ key: "field_claimed" }];
  map.taxonomies.status = "resolved";
  map.taxonomies.definitions = [{}];
  map.taxonomies.terms = [{}];
  map.taxonomies.assignments = [{}];
  map.globals.target = "claimed_draft_target";
  const report = auditCompanyMapping(map, schema);
  assert.equal(report.status, "blocked");
  assert.deepEqual(codes(report.blockers), codes(auditCompanyMapping(originalMap, originalSchema).blockers));
});

test("legacy status and required collection shapes cannot be removed or promoted", () => {
  const promoted = copy(originalMap);
  promoted.status = "approved";
  assert.deepEqual(codes(auditCompanyMapping(promoted, originalSchema).errors), ["INVALID_RESEARCH_STATUS"]);

  const missing = copy(originalMap);
  delete missing.root.bindings;
  delete missing.template.sections;
  assert.ok(codes(auditCompanyMapping(missing, originalSchema).errors).includes("INVALID_MAPPING_SHAPE"));
});

test("untrusted layout keys never appear in sanitized report paths", () => {
  const map = copy(originalMap);
  map.template.layoutBindings["secret-marker-do-not-echo"] = map.template.layoutBindings.hero;
  delete map.template.layoutBindings.hero;
  const serialized = JSON.stringify(auditCompanyMapping(map, originalSchema));
  assert.doesNotMatch(serialized, /secret-marker-do-not-echo/);
});

test("unknown field references and unsupported versions are invalid without leaking input", () => {
  const map = copy(originalMap);
  map.contractVersion = "future-secret-version";
  map.root.bindings[0].source.fieldId = "credential-shaped-input-must-not-be-echoed";
  const report = auditCompanyMapping(map, originalSchema);
  assert.equal(report.status, "invalid");
  assert.deepEqual(codes(report.errors), ["UNKNOWN_FIELD_ID", "UNSUPPORTED_CONTRACT_VERSION"]);
  assert.doesNotMatch(JSON.stringify(report), /credential-shaped|future-secret/);
});

test("duplicate bindings and source type mismatches are rejected", () => {
  const map = copy(originalMap);
  map.root.bindings.push(copy(map.root.bindings[0]));
  map.root.bindings[1].transform = "url";
  const report = auditCompanyMapping(map, originalSchema);
  assert.equal(report.status, "invalid");
  assert.deepEqual(codes(report.errors), ["DUPLICATE_SOURCE_REFERENCE", "SOURCE_TYPE_MISMATCH"]);
  assert.equal(report.summary.bindings, 72);
});

test("via fields must be linked-record fields aimed at the referenced child table", () => {
  const schema = copy(originalSchema);
  const pages = schema.tables.find((table) => table.id === originalMap.source.rootTableId);
  const via = pages.fields.find((field) => field.id === "fldaMEP6BOKW1d7yb");
  via.linkedTableId = originalMap.globals.logoSourceTableId;
  const report = auditCompanyMapping(originalMap, schema);
  assert.equal(report.status, "invalid");
  assert.deepEqual(codes(report.errors), Array(7).fill("VIA_LINK_TARGET_MISMATCH"));
});

test("entity tables and stable source identity are validated independently of bindings", () => {
  const map = copy(originalMap);
  map.source.identity = ["uid"];
  map.entities[0].sourceTableId = "unknown-table";
  const report = auditCompanyMapping(map, originalSchema);
  assert.equal(report.status, "invalid");
  const errors = codes(report.errors);
  assert.ok(errors.includes("UNKNOWN_ENTITY_TABLE_ID"));
  assert.ok(errors.includes("UNSAFE_SOURCE_IDENTITY"));
  assert.ok(errors.includes("UNDECLARED_RELATION_TARGET"));
});

test("entity and global bindings cannot escape their declared owner tables", () => {
  const map = copy(originalMap);
  map.entities[0].bindings[0].source = copy(map.root.bindings[0].source);
  map.globals.logoBindings[0].source = copy(map.entities[1].bindings[1].source);
  const report = auditCompanyMapping(map, originalSchema);
  assert.equal(report.status, "invalid");
  assert.equal(codes(report.errors).filter((code) => code === "BINDING_OWNER_TABLE_MISMATCH").length, 2);
});

test("root exclusions and section ordering preserve the bounded view scope", () => {
  const map = copy(originalMap);
  map.excludedFromSeed.rootRecordIds.push(map.root.sourceRecordId);
  map.template.bodySectionOrder.reverse();
  map.dependencyPolicy.followInverseRelations = true;
  const report = auditCompanyMapping(map, originalSchema);
  assert.equal(report.status, "invalid");
  assert.deepEqual(codes(report.errors), ["BODY_SECTION_ORDER_MISMATCH", "ROOT_SCOPE_OVERLAP", "UNSAFE_DEPENDENCY_POLICY"]);
});

test("standalone CLI defaults to the committed evidence and exits two when blocked", () => {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "blocked");
  assert.equal(report.summary.bindings, 71);
  assert.equal(report.writesAttempted, 0);
});

test("standalone CLI exits one for invalid usage", () => {
  const result = spawnSync(process.execPath, [script, "one-path-only"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "invalid");
  assert.deepEqual(codes(report.errors), ["INVALID_USAGE"]);
});
