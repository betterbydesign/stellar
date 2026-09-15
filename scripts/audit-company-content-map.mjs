#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const AUDIT_VERSION = 1;
const LEGACY_CONTRACT_VERSION = "0.1.0";
const DEFAULT_MAP = fileURLToPath(new URL("../docs/contracts/company-airtable-acf-map.v0.1.json", import.meta.url));
const DEFAULT_SCHEMA = fileURLToPath(new URL("../docs/research/airtable-schema-snapshot.json", import.meta.url));
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

const TRANSFORM_SOURCE_TYPES = new Map([
  ["markdown", new Set(["multilineText", "richText"])],
  ["ordered_wp_media_references", new Set(["multipleRecordLinks"])],
  ["status_map", new Set(["singleSelect"])],
  ["template_lookup", new Set(["multipleRecordLinks"])],
  ["text", new Set(["singleLineText", "multilineText"])],
  ["url", new Set(["url"])],
  ["validated_discriminator", new Set(["singleSelect"])],
  ["wp_attachment_reference", new Set(["multipleAttachments"])],
  ["wp_record_reference", new Set(["multipleRecordLinks"])],
]);

const REQUIRED_DEPENDENCY_POLICY = {
  allowlistedGlobalSettings: true,
  excludeNonViewRootPages: true,
  followInverseRelations: false,
  followOnlyDeclaredRelations: true,
  importEmptyRecords: false,
  sourceAbsenceCausesUnpublishInSeedMode: false,
  writeBackToAirtable: false,
};

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const asArray = (value) => Array.isArray(value) ? value : [];
const unique = (values) => new Set(values).size === values.length;
const sameArray = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
const sameSet = (left, right) => left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
const compareFinding = (left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path);

function finding(code, path, message) {
  return { code, path, message };
}

function collectBindings(map) {
  const bindings = [];
  const append = (items, prefix, scope, ownerTableId) => {
    asArray(items).forEach((binding, index) => bindings.push({ binding, path: `${prefix}[${index}]`, scope, ownerTableId }));
  };

  append(map?.root?.bindings, "root.bindings", "root", map?.source?.rootTableId);
  if (isObject(map?.template?.layoutBindings)) {
    Object.keys(map.template.layoutBindings).sort().forEach((key, index) =>
      append(map.template.layoutBindings[key], `template.layoutBindings[${index}]`, "layout"));
  }
  asArray(map?.entities).forEach((entity, index) => append(entity?.bindings, `entities[${index}].bindings`, "entity", entity?.sourceTableId));
  append(map?.globals?.bindings, "globals.bindings", "global", map?.globals?.sourceTableId);
  append(map?.globals?.logoBindings, "globals.logoBindings", "global-logo", map?.globals?.logoSourceTableId);
  return bindings;
}

/**
 * Audits the committed research mapping against its schema-only Airtable snapshot.
 * It never reads records or a runtime target and cannot authorize writes.
 */
export function auditCompanyMapping(map, schema) {
  const errors = [];
  const blockers = [];
  const mapObject = isObject(map) ? map : {};
  const schemaObject = isObject(schema) ? schema : {};

  if (!isObject(map)) errors.push(finding("INVALID_MAPPING_DOCUMENT", "$", "Mapping document must be an object."));
  if (!isObject(schema)) errors.push(finding("INVALID_SCHEMA_SNAPSHOT", "$", "Schema snapshot must be an object."));
  if (mapObject.contractVersion !== LEGACY_CONTRACT_VERSION) {
    errors.push(finding("UNSUPPORTED_CONTRACT_VERSION", "contractVersion", "Expected the committed 0.1.0 research contract."));
  }
  if (mapObject.status !== "draft_not_executable") {
    errors.push(finding("INVALID_RESEARCH_STATUS", "status", "The legacy research contract must remain explicitly non-executable."));
  }
  if (!isObject(mapObject.source) || !isNonEmptyString(mapObject.source.baseId) || !isNonEmptyString(mapObject.source.rootTableId) ||
      !isNonEmptyString(mapObject.source.viewId) || !Array.isArray(mapObject.source.observedRootRecordIds) ||
      !isObject(mapObject.schema) ||
      !isObject(mapObject.root) || !isObject(mapObject.template) || !Array.isArray(mapObject.entities) ||
      !isObject(mapObject.globals) || !isObject(mapObject.taxonomies) || !isObject(mapObject.dependencyPolicy) ||
      !isObject(mapObject.excludedFromSeed) || !Array.isArray(mapObject.root?.bindings) ||
      !Array.isArray(mapObject.template?.sections) || !Array.isArray(mapObject.template?.bodySectionOrder) ||
      !Array.isArray(mapObject.template?.globalSections) || !isObject(mapObject.template?.layoutBindings) ||
      !Object.values(mapObject.template?.layoutBindings ?? {}).every(Array.isArray) ||
      !mapObject.entities?.every((entity) => isObject(entity) && Array.isArray(entity.bindings) && Array.isArray(entity.sourceRecordIds)) ||
      !Array.isArray(mapObject.globals?.bindings) || !Array.isArray(mapObject.globals?.logoBindings) ||
      !Array.isArray(mapObject.taxonomies?.observedTaxonomyTables) || !Array.isArray(mapObject.taxonomies?.definitions) ||
      !Array.isArray(mapObject.taxonomies?.assignments) || !Array.isArray(mapObject.excludedFromSeed?.rootRecordIds) ||
      !Array.isArray(mapObject.excludedFromSeed?.tables) || !Array.isArray(mapObject.excludedFromSeed?.additionalRelations) ||
      !Array.isArray(mapObject.excludedFromSeed?.fields)) {
    errors.push(finding("INVALID_MAPPING_SHAPE", "$", "Mapping document is missing a required research-contract section."));
  }

  const schemaTables = asArray(schemaObject.tables);
  const tableById = new Map();
  const fieldByRef = new Map();
  const fieldIdPaths = new Map();
  let fieldCount = 0;

  if (!isNonEmptyString(schemaObject.baseId) || !Array.isArray(schemaObject.tables)) {
    errors.push(finding("INVALID_SCHEMA_SHAPE", "$", "Schema snapshot requires a base ID and tables array."));
  }
  schemaTables.forEach((table, tableIndex) => {
    const tablePath = `tables[${tableIndex}]`;
    if (!isObject(table) || !isNonEmptyString(table.id) || !isNonEmptyString(table.name) || !Array.isArray(table.fields)) {
      errors.push(finding("INVALID_TABLE_SHAPE", tablePath, "Source table requires an ID, name and fields array."));
      return;
    }
    if (tableById.has(table.id)) errors.push(finding("DUPLICATE_TABLE_ID", `${tablePath}.id`, "Source table ID must be unique."));
    else tableById.set(table.id, table);
    table.fields.forEach((field, fieldIndex) => {
      fieldCount += 1;
      const fieldPath = `${tablePath}.fields[${fieldIndex}]`;
      if (!isObject(field) || !isNonEmptyString(field.id) || !isNonEmptyString(field.name) || !isNonEmptyString(field.type)) {
        errors.push(finding("INVALID_FIELD_SHAPE", fieldPath, "Source field requires an ID, name and type."));
        return;
      }
      const ref = `${table.id}:${field.id}`;
      if (fieldByRef.has(ref)) errors.push(finding("DUPLICATE_FIELD_REFERENCE", `${fieldPath}.id`, "Source field reference must be unique."));
      else fieldByRef.set(ref, { field, table });
      if (fieldIdPaths.has(field.id)) errors.push(finding("DUPLICATE_FIELD_ID", `${fieldPath}.id`, "Source field ID must be globally unique."));
      else fieldIdPaths.set(field.id, fieldPath);
    });
  });
  for (const [ref, observed] of fieldByRef) {
    if (observed.field.type === "multipleRecordLinks" && !tableById.has(observed.field.linkedTableId)) {
      errors.push(finding("UNKNOWN_LINKED_TABLE_ID", fieldIdPaths.get(observed.field.id) ?? ref, "Linked-record field points to an unknown source table."));
    }
  }

  if (isNonEmptyString(mapObject.source?.baseId) && isNonEmptyString(schemaObject.baseId) && mapObject.source.baseId !== schemaObject.baseId) {
    errors.push(finding("SOURCE_BASE_MISMATCH", "source.baseId", "Mapping and schema snapshot identify different source bases."));
  }
  if (!sameArray(asArray(mapObject.source?.identity), ["baseId", "tableId", "recordId"])) {
    errors.push(finding("UNSAFE_SOURCE_IDENTITY", "source.identity", "Source identity must use the base, table and record IDs."));
  }
  if (mapObject.source?.initialMode !== "draft_seed") {
    errors.push(finding("UNSAFE_INITIAL_MODE", "source.initialMode", "The representative import must remain draft-first."));
  }
  const rootTable = tableById.get(mapObject.source?.rootTableId);
  if (!rootTable) errors.push(finding("UNKNOWN_ROOT_TABLE", "source.rootTableId", "Root table is absent from the source schema snapshot."));

  asArray(mapObject.entities).forEach((entity, index) => {
    const path = `entities[${index}]`;
    const table = tableById.get(entity?.sourceTableId);
    if (!table) errors.push(finding("UNKNOWN_ENTITY_TABLE_ID", `${path}.sourceTableId`, "Entity references an unknown source table."));
    else if (entity.sourceTableName !== table.name) errors.push(finding("ENTITY_TABLE_LABEL_MISMATCH", `${path}.sourceTableName`, "Entity table label does not match its source ID."));
    const recordIds = asArray(entity?.sourceRecordIds);
    if (recordIds.length === 0 || !recordIds.every(isNonEmptyString) || !unique(recordIds)) {
      errors.push(finding("INVALID_ENTITY_RECORD_IDS", `${path}.sourceRecordIds`, "Entity record IDs must be non-empty and unique."));
    }
  });
  for (const [key, path] of [["sourceTableId", "globals.sourceTableId"], ["logoSourceTableId", "globals.logoSourceTableId"]]) {
    if (!tableById.has(mapObject.globals?.[key])) {
      errors.push(finding("UNKNOWN_GLOBAL_TABLE_ID", path, "Global mapping references an unknown source table."));
    }
  }

  const bindings = collectBindings(mapObject);
  const bindingRefs = new Map();
  const entityTableIds = new Set(asArray(mapObject.entities).map((entity) => entity?.sourceTableId).filter(isNonEmptyString));
  bindings.forEach(({ binding, path, scope, ownerTableId }) => {
    if (!isObject(binding) || !isObject(binding.source) || !isNonEmptyString(binding.target) || !isNonEmptyString(binding.transform)) {
      errors.push(finding("INVALID_BINDING_SHAPE", path, "Binding requires a typed source, target and transform."));
      return;
    }
    const source = binding.source;
    if (!isNonEmptyString(source.tableId) || !isNonEmptyString(source.fieldId) ||
        !isNonEmptyString(source.tableName) || !isNonEmptyString(source.fieldName)) {
      errors.push(finding("INVALID_SOURCE_REFERENCE", `${path}.source`, "Source reference requires table and field IDs and labels."));
      return;
    }
    const table = tableById.get(source.tableId);
    if (!table) {
      errors.push(finding("UNKNOWN_TABLE_ID", `${path}.source.tableId`, "Binding references an unknown source table."));
      return;
    }
    const observed = fieldByRef.get(`${source.tableId}:${source.fieldId}`);
    if (!observed) {
      errors.push(finding("UNKNOWN_FIELD_ID", `${path}.source.fieldId`, "Binding references an unknown source field."));
      return;
    }
    if (ownerTableId !== undefined && source.tableId !== ownerTableId) {
      errors.push(finding("BINDING_OWNER_TABLE_MISMATCH", `${path}.source.tableId`, "Binding source table differs from its declared owner table."));
    }
    if (source.tableName !== observed.table.name || source.fieldName !== observed.field.name) {
      errors.push(finding("SOURCE_LABEL_MISMATCH", `${path}.source`, "Source labels do not match the referenced IDs."));
    }
    const allowedTypes = TRANSFORM_SOURCE_TYPES.get(binding.transform);
    if (!allowedTypes) errors.push(finding("UNKNOWN_TRANSFORM", `${path}.transform`, "Binding transform is not allowlisted."));
    else if (!allowedTypes.has(observed.field.type)) {
      errors.push(finding("SOURCE_TYPE_MISMATCH", `${path}.transform`, "Binding transform is incompatible with the source field type."));
    }
    const ref = `${source.tableId}:${source.fieldId}`;
    if (bindingRefs.has(ref)) errors.push(finding("DUPLICATE_SOURCE_REFERENCE", `${path}.source`, "A source field may be bound only once."));
    else bindingRefs.set(ref, path);

    if (source.viaPageFieldId !== undefined) {
      const via = rootTable && fieldByRef.get(`${rootTable.id}:${source.viaPageFieldId}`)?.field;
      if (!via) errors.push(finding("UNKNOWN_VIA_FIELD_ID", `${path}.source.viaPageFieldId`, "Relationship path references an unknown root field."));
      else if (via.type !== "multipleRecordLinks") {
        errors.push(finding("VIA_FIELD_TYPE_MISMATCH", `${path}.source.viaPageFieldId`, "Relationship path must use a linked-record field."));
      } else if (via.linkedTableId !== source.tableId) {
        errors.push(finding("VIA_LINK_TARGET_MISMATCH", `${path}.source.viaPageFieldId`, "Relationship path points to a different source table."));
      }
    } else if (scope === "layout" && source.tableId !== mapObject.source?.rootTableId) {
      errors.push(finding("MISSING_VIA_FIELD_ID", `${path}.source`, "Child-table layout bindings require an explicit root relationship path."));
    }

    if (binding.transform === "wp_record_reference") {
      if (!observed.field.linkedTableId || !entityTableIds.has(observed.field.linkedTableId)) {
        errors.push(finding("UNDECLARED_RELATION_TARGET", `${path}.source.fieldId`, "Record relationship does not resolve to a declared entity table."));
      }
      if (binding.expectedCardinality !== 1) {
        errors.push(finding("INVALID_RELATION_CARDINALITY", `${path}.expectedCardinality`, "POC record relationships must declare singleton cardinality."));
      }
    }
    if (binding.transform === "template_lookup" && binding.expectedCardinality !== 1) {
      errors.push(finding("INVALID_RELATION_CARDINALITY", `${path}.expectedCardinality`, "Template relationship must declare singleton cardinality."));
    }
    if (binding.transform === "ordered_wp_media_references" && observed.field.linkedTableId !== mapObject.globals?.logoSourceTableId) {
      errors.push(finding("MEDIA_LINK_TARGET_MISMATCH", `${path}.source.fieldId`, "Global media relationship does not resolve to the declared logo table."));
    }
  });

  const observedRoots = asArray(mapObject.source?.observedRootRecordIds);
  const excludedRoots = asArray(mapObject.excludedFromSeed?.rootRecordIds);
  if (!observedRoots.every(isNonEmptyString) || !unique(observedRoots)) {
    errors.push(finding("INVALID_ROOT_SCOPE", "source.observedRootRecordIds", "Observed root IDs must be non-empty and unique."));
  }
  if (!isNonEmptyString(mapObject.root?.sourceRecordId) || !sameArray(observedRoots, [mapObject.root?.sourceRecordId])) {
    errors.push(finding("ROOT_SCOPE_MISMATCH", "root.sourceRecordId", "The single mapped root must exactly match view-scoped root evidence."));
  }
  if (!excludedRoots.every(isNonEmptyString) || !unique(excludedRoots)) {
    errors.push(finding("INVALID_EXCLUDED_ROOTS", "excludedFromSeed.rootRecordIds", "Excluded root IDs must be non-empty and unique."));
  }
  if (excludedRoots.some((recordId) => observedRoots.includes(recordId))) {
    errors.push(finding("ROOT_SCOPE_OVERLAP", "excludedFromSeed.rootRecordIds", "A root cannot be both selected and excluded."));
  }
  for (const [key, expected] of Object.entries(REQUIRED_DEPENDENCY_POLICY)) {
    if (mapObject.dependencyPolicy?.[key] !== expected) {
      errors.push(finding("UNSAFE_DEPENDENCY_POLICY", `dependencyPolicy.${key}`, "Dependency policy does not preserve the bounded seed scope."));
    }
  }

  const sections = asArray(mapObject.template?.sections);
  const sectionKeys = sections.map((section) => section?.key);
  const sectionRecordIds = sections.map((section) => section?.sourceRecordId);
  if (!sections.every((section) => isObject(section) && isNonEmptyString(section.key) && isNonEmptyString(section.sourceRecordId) && ["body", "global"].includes(section.role)) ||
      !unique(sectionKeys) || !unique(sectionRecordIds)) {
    errors.push(finding("INVALID_SECTION_DEFINITIONS", "template.sections", "Template sections require unique keys, source IDs and supported roles."));
  }
  const bodyOrder = asArray(mapObject.template?.bodySectionOrder);
  const globalOrder = asArray(mapObject.template?.globalSections);
  const observedBodyOrder = sections.filter((section) => section?.role === "body").map((section) => section.key);
  const observedGlobalOrder = sections.filter((section) => section?.role === "global").map((section) => section.key);
  if (!unique(bodyOrder) || !sameArray(bodyOrder, observedBodyOrder)) {
    errors.push(finding("BODY_SECTION_ORDER_MISMATCH", "template.bodySectionOrder", "Body order must match the declared section sequence exactly."));
  }
  if (!unique(globalOrder) || !sameArray(globalOrder, observedGlobalOrder)) {
    errors.push(finding("GLOBAL_SECTION_ORDER_MISMATCH", "template.globalSections", "Global order must match the declared section sequence exactly."));
  }
  const layoutKeys = isObject(mapObject.template?.layoutBindings) ? Object.keys(mapObject.template.layoutBindings) : [];
  if (!sameSet(layoutKeys, bodyOrder)) {
    errors.push(finding("LAYOUT_BINDING_SCOPE_MISMATCH", "template.layoutBindings", "Layout bindings must cover exactly the body sections."));
  }

  blockers.push(finding("GLOBAL_OPTIONS_NOT_DRAFTABLE", "globals.target", "The legacy global-options proposal has no verified draft boundary."));
  blockers.push(finding("LEGACY_DRAFT_NOT_EXECUTABLE", "contractVersion", "The 0.1.0 research mapping cannot authorize or produce an import plan."));
  blockers.push(finding("MEDIA_EVIDENCE_MISSING", "source", "Attachment identities and content digests are absent from the research evidence."));
  blockers.push(finding("RECORD_SNAPSHOT_MISSING", "source", "No source record-value snapshot is available for a deterministic content plan."));
  blockers.push(finding("TARGET_FIELD_KEYS_UNRESOLVED", "schema.targetFieldKeys", "Actual versioned ACF field keys and types are absent."));
  blockers.push(finding("TARGET_INVENTORY_MISSING", "schema", "No target object, identity or revision inventory is available for comparison."));
  blockers.push(finding("TARGET_SCHEMA_UNAPPROVED", "schema.targetSchemaVerified", "The proposed WordPress schema has not been approved or verified."));
  blockers.push(finding("TAXONOMY_MAPPING_UNRESOLVED", "taxonomies", "Taxonomy definitions, terms and assignments are unresolved."));

  errors.sort(compareFinding);
  blockers.sort(compareFinding);
  return {
    auditVersion: AUDIT_VERSION,
    status: errors.length > 0 ? "invalid" : "blocked",
    writesAttempted: 0,
    summary: {
      bindings: bindings.length,
      bodySections: bodyOrder.length,
      fields: fieldCount,
      globalSections: globalOrder.length,
      selectedRoots: observedRoots.length,
      tables: schemaTables.length,
    },
    errors,
    blockers,
  };
}

async function readJson(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_INPUT_BYTES) throw new Error("Unsupported input");
  return JSON.parse(await readFile(path, "utf8"));
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 0 && argv.length !== 2) {
    const report = {
      auditVersion: AUDIT_VERSION,
      status: "invalid",
      writesAttempted: 0,
      summary: { bindings: 0, bodySections: 0, fields: 0, globalSections: 0, selectedRoots: 0, tables: 0 },
      errors: [finding("INVALID_USAGE", "$", "Pass no arguments or mapping and schema JSON paths.")],
      blockers: [],
    };
    console.log(JSON.stringify(report, null, 2));
    return 1;
  }
  try {
    const mapPath = argv[0] ? resolve(argv[0]) : DEFAULT_MAP;
    const schemaPath = argv[1] ? resolve(argv[1]) : DEFAULT_SCHEMA;
    const report = auditCompanyMapping(await readJson(mapPath), await readJson(schemaPath));
    console.log(JSON.stringify(report, null, 2));
    return report.status === "blocked" ? 2 : 1;
  } catch {
    const report = {
      auditVersion: AUDIT_VERSION,
      status: "invalid",
      writesAttempted: 0,
      summary: { bindings: 0, bodySections: 0, fields: 0, globalSections: 0, selectedRoots: 0, tables: 0 },
      errors: [finding("INPUT_READ_FAILED", "$", "Mapping or schema input could not be read as JSON.")],
      blockers: [],
    };
    console.log(JSON.stringify(report, null, 2));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
