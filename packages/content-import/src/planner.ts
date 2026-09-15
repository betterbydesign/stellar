import {
  CONTENT_IMPORT_CONTRACT_VERSION,
  DryRunPlanSchema,
  MappingSchema,
  SourceSnapshotSchema,
  TargetInventorySchema,
  type AttachmentIdentity,
  type DryRunOperation,
  type FieldTarget,
  type Mapping,
  type SourceIdentity,
  type SourceSnapshot,
  type TargetInventory,
} from "./contracts.js";
import { canonicalDigest, canonicalize, compareCodePoints, type JsonValue } from "./canonical.js";
import { InvalidInputError, invalidInputFromZod } from "./errors.js";

export type CompileDryRunInput = Readonly<{ mapping: unknown; source: unknown; target: unknown }>;

type SourceRecord = SourceSnapshot["tables"][number]["records"][number];
type Entity = Mapping["entities"][number];
type Binding = Entity["bindings"][number];
type Diagnostic = ReturnType<typeof diagnostic>;
type MutableOperation = Omit<DryRunOperation, "order"> & { order: number };

const messages = {
  APPROVAL_MISMATCH: "Planning approval evidence does not match this mapping, schema, and environment.",
  BINDING_ID_MISMATCH: "The observed target value belongs to a different mapping binding.",
  DEPENDENCY_BLOCKED: "A declared forward dependency is blocked.",
  DEPENDENCY_CYCLE: "Declared forward dependencies contain a cycle.",
  DEPENDENCY_EXCLUDED: "A declared forward dependency is explicitly excluded.",
  IDENTITY_COLLISION: "More than one target item claims the same durable source identity.",
  INCOMPLETE_SOURCE_SNAPSHOT: "The source snapshot does not declare complete root-view membership.",
  INCOMPLETE_TARGET_INVENTORY: "The target inventory is incomplete.",
  DUPLICATE_LINK: "A source link list repeats the same durable identity.",
  INVALID_CARDINALITY: "A source link count violates its declared cardinality.",
  INVALID_FIELD_TYPE: "A source field value does not match its allowlisted transform.",
  MAPPING_NOT_EXECUTABLE: "The mapping is retained as a non-executable draft.",
  MISSING_ATTACHMENT: "A declared attachment identity is absent from the source snapshot.",
  MISSING_DEPENDENCY: "A declared forward link points to a missing source record.",
  MISSING_REQUIRED_VALUE: "A required mapped source value is absent.",
  NONDRAFTABLE_SIDE_EFFECT_BLOCKED: "The environment policy blocks this term, media, or taxonomy side effect.",
  OWNERSHIP_CONFLICT: "The intended managed value differs from a WordPress-owned target value.",
  SCHEMA_MISMATCH: "The target inventory does not match the mapping's declared schema.",
  SOURCE_SCOPE_MISMATCH: "The source snapshot does not match the mapping's base, root table, and view.",
  TAXONOMY_INCOMPLETE: "The mapping does not declare a complete taxonomy decision.",
  TERM_HIERARCHY_CYCLE: "The declared taxonomy term hierarchy contains a cycle.",
  UNMAPPED_TAXONOMY: "A taxonomy assignment has no complete term mapping.",
} as const;

type DiagnosticCode = keyof typeof messages;

const diagnostic = (code: DiagnosticCode, operationId: string | null = null) => ({
  code,
  severity: "error" as const,
  scope: { kind: operationId === null ? "plan" as const : "operation" as const, operationId },
  message: messages[code],
});

const sourceIdentityKey = (identity: SourceIdentity): string =>
  `${identity.system}:${identity.baseId}:${identity.tableId}:${identity.recordId}`;

const attachmentIdentityKey = (identity: AttachmentIdentity): string =>
  `${sourceIdentityKey(identity)}:${identity.fieldId}:${identity.attachmentId}`;

const recordKey = (tableId: string, recordId: string): string => `${tableId}:${recordId}`;

const fieldTargetKey = (target: FieldTarget): string =>
  target.kind === "core" ? `core:${target.field}` : `acf:${target.groupKey}:${target.fieldKey}`;

const identityFor = (baseId: string, tableId: string, recordId: string): SourceIdentity => ({
  system: "airtable",
  baseId,
  tableId,
  recordId,
});

const compareJson = (left: JsonValue, right: JsonValue): boolean => canonicalize(left) === canonicalize(right);

const json = (value: unknown): JsonValue => value as JsonValue;

const sortBy = <T>(values: readonly T[], key: (value: T) => string): T[] =>
  [...values].sort((left, right) => compareCodePoints(key(left), key(right)));

const normalizeMapping = (mapping: Mapping): JsonValue => ({
  ...mapping,
  source: { ...mapping.source },
  policy: { ...mapping.policy, allowedEnvironments: [...mapping.policy.allowedEnvironments].sort(compareCodePoints) },
  targetSchema: {
    ...mapping.targetSchema,
    postTypes: sortBy(mapping.targetSchema.postTypes, (item) => item.key).map((item) => ({ ...item, coreFields: [...item.coreFields].sort(compareCodePoints) })),
    acfGroups: sortBy(mapping.targetSchema.acfGroups, (item) => item.key).map((item) => ({
      ...item,
      postTypes: [...item.postTypes].sort(compareCodePoints),
      fields: sortBy(item.fields, (field) => field.key),
    })),
    taxonomies: sortBy(mapping.targetSchema.taxonomies, (item) => item.key).map((item) => ({ ...item, postTypes: [...item.postTypes].sort(compareCodePoints) })),
  },
  entities: sortBy(mapping.entities, (item) => item.id).map((item) => ({
    ...item,
    bindings: sortBy(item.bindings, (binding) => binding.id),
    taxonomyAssignments: sortBy(item.taxonomyAssignments, (binding) => binding.id),
  })),
  taxonomies: { ...mapping.taxonomies, mappings: sortBy(mapping.taxonomies.mappings, (item) => item.taxonomyKey) },
  exclusions: sortBy(mapping.exclusions, sourceIdentityKey),
});

const unorderedBindingIds = (mapping: Mapping): Set<string> => new Set(mapping.entities.flatMap((entity) => [
  ...entity.bindings.filter((binding) => binding.kind !== "field" && !binding.ordered).map((binding) => binding.id),
  ...entity.taxonomyAssignments.filter((binding) => !binding.ordered).map((binding) => binding.id),
]));

const normalizeBindingJson = (value: JsonValue, ordered: boolean): JsonValue =>
  !ordered && Array.isArray(value) ? [...value].sort((left, right) => compareCodePoints(canonicalize(left), canonicalize(right))) : value;

const normalizeSource = (source: SourceSnapshot, mapping: Mapping): JsonValue => {
  const unorderedSourceFields = new Set(mapping.entities.flatMap((entity) => [
    ...entity.bindings.filter((binding) => binding.kind !== "field" && !binding.ordered).map((binding) => `${entity.sourceTableId}:${binding.sourceFieldId}`),
    ...entity.taxonomyAssignments.filter((binding) => !binding.ordered).map((binding) => `${entity.sourceTableId}:${binding.sourceFieldId}`),
  ]));
  return {
    ...source,
    root: { ...source.root, recordIds: [...source.root.recordIds].sort(compareCodePoints) },
    tables: sortBy(source.tables, (table) => table.tableId).map((table) => ({
      ...table,
      records: sortBy(table.records, (record) => record.recordId).map((record) => ({
        ...record,
        fields: Object.fromEntries(Object.entries(record.fields).map(([fieldId, value]) => {
          if (!unorderedSourceFields.has(`${table.tableId}:${fieldId}`)) return [fieldId, value];
          if (value.type === "record_links") return [fieldId, { ...value, recordIds: [...value.recordIds].sort(compareCodePoints) }];
          if (value.type === "attachments") return [fieldId, { ...value, attachmentIds: [...value.attachmentIds].sort(compareCodePoints) }];
          return [fieldId, value];
        })),
      })),
    })),
    attachments: sortBy(source.attachments, (attachment) => attachmentIdentityKey(attachment.identity)),
  };
};

const normalizeTarget = (target: TargetInventory, mapping: Mapping): JsonValue => {
  const unordered = unorderedBindingIds(mapping);
  return ({
  ...target,
  posts: sortBy(target.posts, (item) => item.targetId).map((item) => ({
    ...item,
    fields: sortBy(item.fields, (field) => fieldTargetKey(field.target)).map((field) => ({
      ...field,
      value: normalizeBindingJson(json(field.value), !unordered.has(field.bindingId)),
    })),
  })),
  terms: sortBy(target.terms, (item) => item.targetId),
  media: sortBy(target.media, (item) => item.targetId),
  taxonomyAssignments: sortBy(target.taxonomyAssignments, (item) =>
    `${sourceIdentityKey(item.postSourceIdentity)}:${item.taxonomyKey}`).map((item) => ({
      ...item,
      termSourceIdentities: unordered.has(item.bindingId) ? sortBy(item.termSourceIdentities, sourceIdentityKey) : item.termSourceIdentities,
    })),
  });
};

const normalizeTargetSchema = (schema: Mapping["targetSchema"]): JsonValue => ({
  schemaId: schema.schemaId,
  schemaVersion: schema.schemaVersion,
  postTypes: sortBy(schema.postTypes, (item) => item.key).map((item) => ({ ...item, coreFields: [...item.coreFields].sort(compareCodePoints) })),
  acfGroups: sortBy(schema.acfGroups, (item) => item.key).map((item) => ({
    ...item,
    postTypes: [...item.postTypes].sort(compareCodePoints),
    fields: sortBy(item.fields, (field) => field.key),
  })),
  taxonomies: sortBy(schema.taxonomies, (item) => item.key).map((item) => ({ ...item, postTypes: [...item.postTypes].sort(compareCodePoints) })),
});

export const computeTargetSchemaDigest = (schema: Mapping["targetSchema"]): `sha256:${string}` =>
  canonicalDigest(normalizeTargetSchema(schema));

const parseInputs = (input: CompileDryRunInput): { mapping: Mapping; source: SourceSnapshot; target: TargetInventory } => {
  const mapping = MappingSchema.safeParse(input.mapping);
  const source = SourceSnapshotSchema.safeParse(input.source);
  const target = TargetInventorySchema.safeParse(input.target);
  const issues = [
    ...(mapping.success ? [] : invalidInputFromZod("mapping", mapping.error).issues),
    ...(source.success ? [] : invalidInputFromZod("source", source.error).issues),
    ...(target.success ? [] : invalidInputFromZod("target", target.error).issues),
  ];
  if (issues.length > 0) throw new InvalidInputError(issues);
  if (!mapping.success || !source.success || !target.success) throw new InvalidInputError([]);
  return { mapping: mapping.data, source: source.data, target: target.data };
};

const operationId = (mappingDigest: string, targetId: string, kind: DryRunOperation["kind"], identity: string): string =>
  `op_${canonicalDigest(json({ mappingDigest, targetId, kind, identity })).slice("sha256:".length, "sha256:".length + 24)}`;

const findFieldValue = (record: SourceRecord | undefined, fieldId: string) => record?.fields[fieldId];

const links = (record: SourceRecord | undefined, fieldId: string): string[] | null => {
  const value = findFieldValue(record, fieldId);
  if (value === undefined || value.type === "null") return [];
  return value.type === "record_links" ? [...value.recordIds] : null;
};

const attachments = (record: SourceRecord | undefined, fieldId: string): string[] | null => {
  const value = findFieldValue(record, fieldId);
  if (value === undefined || value.type === "null") return [];
  return value.type === "attachments" ? [...value.attachmentIds] : null;
};

const scalarValue = (record: SourceRecord | undefined, binding: Extract<Binding, { kind: "field" }>): JsonValue | undefined => {
  const value = findFieldValue(record, binding.sourceFieldId);
  if (value === undefined || value.type === "null") return undefined;
  if (binding.transform === "text" && value.type === "text") return value.value;
  if (binding.transform === "markdown" && value.type === "markdown") return value.value;
  if (binding.transform === "url" && value.type === "url") return value.value;
  if (binding.transform === "string_list" && value.type === "string_list") return [...value.values];
  return undefined;
};

const hasCompatibleScalarType = (record: SourceRecord | undefined, binding: Extract<Binding, { kind: "field" }>): boolean => {
  const value = findFieldValue(record, binding.sourceFieldId);
  if (value === undefined || value.type === "null") return true;
  return value.type === binding.transform;
};

const cardinalityProblem = (count: number, cardinality: { min: number; max: number }): boolean =>
  count < cardinality.min || count > cardinality.max;

const uniqueValues = (values: readonly string[]): string[] => [...new Set(values)];

const hasDuplicates = (values: readonly string[]): boolean => uniqueValues(values).length !== values.length;

const bindingOrder = (mapping: Mapping, bindingId: string): boolean => {
  const binding = mapping.entities.flatMap((entity) => entity.bindings).find((item) => item.id === bindingId);
  return binding?.kind === "field" || binding === undefined ? true : binding.ordered;
};

const meaningful = (value: JsonValue | undefined): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const nondraftableAllowed = (mapping: Mapping, target: TargetInventory): boolean => {
  if (target.environment === "production") return false;
  if (target.environment === "disposable") return mapping.policy.nonDraftableWrites !== "forbid";
  return mapping.policy.nonDraftableWrites === "allow_disposable_and_staging";
};

const groupByIdentity = <T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> => {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const identity = key(item);
    result.set(identity, [...(result.get(identity) ?? []), item]);
  }
  return result;
};

const sortedCodes = (codes: Iterable<DiagnosticCode>): DiagnosticCode[] => [...new Set(codes)].sort(compareCodePoints);

export const compileDryRun = (input: CompileDryRunInput) => {
  const { mapping, source, target } = parseInputs(input);
  const inputDigests = {
    mapping: canonicalDigest(normalizeMapping(mapping)),
    source: canonicalDigest(normalizeSource(source, mapping)),
    target: canonicalDigest(normalizeTarget(target, mapping)),
  };

  const globalCodes = new Set<DiagnosticCode>();
  if (mapping.status !== "approved_for_planning") globalCodes.add("MAPPING_NOT_EXECUTABLE");
  if (!source.root.complete) globalCodes.add("INCOMPLETE_SOURCE_SNAPSHOT");
  if (!target.snapshotComplete) globalCodes.add("INCOMPLETE_TARGET_INVENTORY");
  if (!mapping.taxonomies.complete) globalCodes.add("TAXONOMY_INCOMPLETE");
  if (source.source.baseId !== mapping.source.baseId || source.root.tableId !== mapping.source.rootTableId || source.root.viewId !== mapping.source.rootViewId) {
    globalCodes.add("SOURCE_SCOPE_MISMATCH");
  }
  if (target.schema.schemaId !== mapping.targetSchema.schemaId || target.schema.schemaVersion !== mapping.targetSchema.schemaVersion || target.schema.schemaDigest !== mapping.targetSchema.schemaDigest) {
    globalCodes.add("SCHEMA_MISMATCH");
  }
  if (computeTargetSchemaDigest(mapping.targetSchema) !== mapping.targetSchema.schemaDigest) globalCodes.add("SCHEMA_MISMATCH");
  if (target.approval.status !== "approved_for_planning"
    || target.approval.mappingId !== mapping.mappingId
    || target.approval.mappingVersion !== mapping.mappingVersion
    || target.approval.mappingDigest !== inputDigests.mapping
    || target.approval.targetId !== target.targetId
    || target.approval.environment !== target.environment
    || target.approval.schemaDigest !== mapping.targetSchema.schemaDigest
    || !mapping.policy.allowedEnvironments.includes(target.environment)) {
    globalCodes.add("APPROVAL_MISMATCH");
  }

  const tables = new Map(source.tables.map((table) => [table.tableId, new Map(table.records.map((record) => [record.recordId, record]))]));
  const entities = new Map(mapping.entities.map((entity) => [entity.sourceTableId, entity]));
  const excluded = new Set(mapping.exclusions.map(sourceIdentityKey));
  const nodeProblems = new Map<string, Set<DiagnosticCode>>();
  const dependencies = new Map<string, Set<string>>();
  const included = new Set<string>();
  const queue = source.root.recordIds.slice().sort(compareCodePoints).map((recordId) => recordKey(source.root.tableId, recordId));

  const problem = (key: string, code: DiagnosticCode): void => {
    const codes = nodeProblems.get(key) ?? new Set<DiagnosticCode>();
    codes.add(code);
    nodeProblems.set(key, codes);
  };

  while (queue.length > 0) {
    const key = queue.shift();
    if (!key || included.has(key)) continue;
    included.add(key);
    const separator = key.indexOf(":");
    const tableId = key.slice(0, separator);
    const recordId = key.slice(separator + 1);
    const record = tables.get(tableId)?.get(recordId);
    const entity = entities.get(tableId);
    if (!record || !entity) {
      problem(key, "MISSING_DEPENDENCY");
      continue;
    }
    const identity = identityFor(source.source.baseId, tableId, recordId);
    if (excluded.has(sourceIdentityKey(identity))) problem(key, "DEPENDENCY_EXCLUDED");

    for (const binding of sortBy(entity.bindings, (item) => item.id)) {
      if (binding.ownership === "wordpress") continue;
      if (binding.kind === "field") {
        if (!hasCompatibleScalarType(record, binding)) problem(key, "INVALID_FIELD_TYPE");
        if (binding.required && !meaningful(scalarValue(record, binding))) problem(key, "MISSING_REQUIRED_VALUE");
        continue;
      }
      if (binding.kind === "media") {
        const ids = attachments(record, binding.sourceFieldId);
        if (ids === null) problem(key, "INVALID_FIELD_TYPE");
        else {
          if (hasDuplicates(ids)) problem(key, "DUPLICATE_LINK");
          if (cardinalityProblem(uniqueValues(ids).length, binding.cardinality)) problem(key, "INVALID_CARDINALITY");
          if (binding.required && ids.length === 0) problem(key, "MISSING_REQUIRED_VALUE");
        }
        continue;
      }
      const recordIds = links(record, binding.sourceFieldId);
      if (recordIds === null) {
        problem(key, "INVALID_FIELD_TYPE");
        continue;
      }
      if (hasDuplicates(recordIds)) problem(key, "DUPLICATE_LINK");
      const uniqueRecordIds = uniqueValues(recordIds);
      if (cardinalityProblem(uniqueRecordIds.length, binding.cardinality)) problem(key, "INVALID_CARDINALITY");
      if (binding.required && recordIds.length === 0) problem(key, "MISSING_REQUIRED_VALUE");
      const edgeSet = dependencies.get(key) ?? new Set<string>();
      for (const relatedRecordId of uniqueRecordIds) {
        const relatedKey = recordKey(binding.relatedTableId, relatedRecordId);
        const relatedIdentity = identityFor(source.source.baseId, binding.relatedTableId, relatedRecordId);
        edgeSet.add(relatedKey);
        if (excluded.has(sourceIdentityKey(relatedIdentity))) {
          problem(key, "DEPENDENCY_EXCLUDED");
          continue;
        }
        if (binding.relatedTableId === source.root.tableId && !source.root.recordIds.includes(relatedRecordId)) {
          problem(key, "DEPENDENCY_EXCLUDED");
          continue;
        }
        if (!tables.get(binding.relatedTableId)?.has(relatedRecordId)) {
          problem(key, "MISSING_DEPENDENCY");
          continue;
        }
        queue.push(relatedKey);
      }
      dependencies.set(key, edgeSet);
    }
  }

  const attachmentByKey = new Map(source.attachments.map((item) => [attachmentIdentityKey(item.identity), item]));
  const includedAttachments = new Map<string, SourceSnapshot["attachments"][number]>();
  for (const key of [...included].sort(compareCodePoints)) {
    const separator = key.indexOf(":");
    const tableId = key.slice(0, separator);
    const recordId = key.slice(separator + 1);
    const record = tables.get(tableId)?.get(recordId);
    const entity = entities.get(tableId);
    if (!record || !entity) continue;
    for (const binding of entity.bindings.filter((item): item is Extract<Binding, { kind: "media" }> => item.kind === "media")) {
      if (binding.ownership === "wordpress") continue;
      const ids = attachments(record, binding.sourceFieldId);
      if (!ids) continue;
      for (const attachmentId of uniqueValues(ids)) {
        const identity: AttachmentIdentity = { ...identityFor(source.source.baseId, tableId, recordId), fieldId: binding.sourceFieldId, attachmentId };
        const item = attachmentByKey.get(attachmentIdentityKey(identity));
        if (!item) problem(key, "MISSING_ATTACHMENT");
        else includedAttachments.set(attachmentIdentityKey(identity), item);
      }
    }
  }

  const taxonomyMappings = new Map(mapping.taxonomies.mappings.map((item) => [item.taxonomyKey, item]));
  const includedTerms = new Map<string, { taxonomyKey: string; identity: SourceIdentity; record: SourceRecord; parentKey: string | null }>();
  const assignmentTerms = new Map<string, SourceIdentity[]>();
  const visitTerm = (taxonomyKey: string, termRecordId: string, assignmentNode: string): void => {
    const taxonomy = taxonomyMappings.get(taxonomyKey);
    if (!taxonomy) {
      problem(assignmentNode, "UNMAPPED_TAXONOMY");
      return;
    }
    const record = tables.get(taxonomy.sourceTableId)?.get(termRecordId);
    if (!record) {
      problem(assignmentNode, "MISSING_DEPENDENCY");
      return;
    }
    const identity = identityFor(source.source.baseId, taxonomy.sourceTableId, termRecordId);
    if (excluded.has(sourceIdentityKey(identity))) {
      problem(assignmentNode, "DEPENDENCY_EXCLUDED");
      return;
    }
    const key = `${taxonomyKey}:${sourceIdentityKey(identity)}`;
    if (includedTerms.has(key)) return;
    let parentKey: string | null = null;
    if (taxonomy.termOwnership === "managed" && taxonomy.parentFieldId !== null) {
      const parentIds = links(record, taxonomy.parentFieldId);
      if (parentIds === null || parentIds.length > 1 || (parentIds && hasDuplicates(parentIds))) {
        problem(assignmentNode, parentIds === null ? "INVALID_FIELD_TYPE" : parentIds.length > 1 ? "INVALID_CARDINALITY" : "DUPLICATE_LINK");
      }
      if (parentIds?.[0]) {
        if (!tables.get(taxonomy.sourceTableId)?.has(parentIds[0])) problem(assignmentNode, "MISSING_DEPENDENCY");
        else {
          const parentIdentity = identityFor(source.source.baseId, taxonomy.sourceTableId, parentIds[0]);
          if (excluded.has(sourceIdentityKey(parentIdentity))) problem(assignmentNode, "DEPENDENCY_EXCLUDED");
          else parentKey = `${taxonomyKey}:${sourceIdentityKey(parentIdentity)}`;
        }
      }
    }
    includedTerms.set(key, { taxonomyKey, identity, record, parentKey });
    if (parentKey) {
      const parentRecordId = parentKey.slice(parentKey.lastIndexOf(":") + 1);
      visitTerm(taxonomyKey, parentRecordId, assignmentNode);
    }
  };

  for (const nodeKey of [...included].sort(compareCodePoints)) {
    const separator = nodeKey.indexOf(":");
    const tableId = nodeKey.slice(0, separator);
    const recordId = nodeKey.slice(separator + 1);
    const record = tables.get(tableId)?.get(recordId);
    const entity = entities.get(tableId);
    if (!record || !entity) continue;
    for (const binding of sortBy(entity.taxonomyAssignments, (item) => item.id)) {
      if (binding.ownership === "wordpress") continue;
      const termIds = links(record, binding.sourceFieldId);
      if (termIds === null) {
        problem(nodeKey, "INVALID_FIELD_TYPE");
        continue;
      }
      if (hasDuplicates(termIds)) problem(nodeKey, "DUPLICATE_LINK");
      const uniqueTermIds = uniqueValues(termIds);
      if (cardinalityProblem(uniqueTermIds.length, binding.cardinality)) problem(nodeKey, "INVALID_CARDINALITY");
      if (binding.required && termIds.length === 0) problem(nodeKey, "MISSING_REQUIRED_VALUE");
      const identities = uniqueTermIds.map((termId) => {
        const taxonomy = taxonomyMappings.get(binding.taxonomyKey);
        return identityFor(source.source.baseId, taxonomy?.sourceTableId ?? "missing", termId);
      });
      assignmentTerms.set(`${nodeKey}:${binding.id}`, binding.ordered ? identities : sortBy(identities, sourceIdentityKey));
      for (const termId of uniqueTermIds) visitTerm(binding.taxonomyKey, termId, nodeKey);
    }
  }

  const termVisit = new Map<string, "visiting" | "done">();
  const termCycleKeys = new Set<string>();
  const orderedTermKeys: string[] = [];
  const orderTerm = (key: string, stack: string[]): void => {
    if (termVisit.get(key) === "done") return;
    if (termVisit.get(key) === "visiting") {
      const start = stack.indexOf(key);
      for (const cycleKey of stack.slice(Math.max(0, start))) termCycleKeys.add(cycleKey);
      termCycleKeys.add(key);
      return;
    }
    termVisit.set(key, "visiting");
    const parentKey = includedTerms.get(key)?.parentKey;
    if (parentKey && includedTerms.has(parentKey)) orderTerm(parentKey, [...stack, key]);
    termVisit.set(key, "done");
    orderedTermKeys.push(key);
  };
  for (const key of [...includedTerms.keys()].sort(compareCodePoints)) orderTerm(key, []);

  const postVisit = new Map<string, "visiting" | "done">();
  const postCycleKeys = new Set<string>();
  const orderedPostKeys: string[] = [];
  const orderPost = (key: string, stack: string[]): void => {
    if (postVisit.get(key) === "done") return;
    if (postVisit.get(key) === "visiting") {
      const start = stack.indexOf(key);
      for (const cycleKey of stack.slice(Math.max(0, start))) postCycleKeys.add(cycleKey);
      postCycleKeys.add(key);
      return;
    }
    postVisit.set(key, "visiting");
    for (const dependency of [...(dependencies.get(key) ?? [])].sort(compareCodePoints)) {
      if (included.has(dependency)) orderPost(dependency, [...stack, key]);
    }
    postVisit.set(key, "done");
    orderedPostKeys.push(key);
  };
  for (const key of [...included].sort(compareCodePoints)) orderPost(key, []);
  for (const key of postCycleKeys) problem(key, "DEPENDENCY_CYCLE");

  const targetPosts = groupByIdentity(target.posts, (item) => sourceIdentityKey(item.sourceIdentity));
  const targetTerms = groupByIdentity(target.terms, (item) => `${item.taxonomyKey}:${sourceIdentityKey(item.sourceIdentity)}`);
  const targetMedia = groupByIdentity(target.media, (item) => attachmentIdentityKey(item.sourceIdentity));
  const operations: MutableOperation[] = [];

  const makeOperation = (operation: Omit<MutableOperation, "order" | "intentDigest">): MutableOperation => ({
    ...operation,
    order: 0,
    intentDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  });
  const operationByNode = new Map<string, MutableOperation>();
  const mediaOperationByIdentity = new Map<string, MutableOperation>();
  const termOperationByIdentity = new Map<string, MutableOperation>();

  for (const [key, item] of [...includedAttachments.entries()].sort(([left], [right]) => compareCodePoints(left, right))) {
    const id = operationId(inputDigests.mapping, target.targetId, "media", key);
    const matches = targetMedia.get(key) ?? [];
    const desired = { digest: item.digest, fileName: item.fileName, mimeType: item.mimeType, byteSize: item.byteSize };
    let action: DryRunOperation["action"] = "create";
    const codes = new Set<DiagnosticCode>();
    const existing = matches.length === 1 ? matches[0] : undefined;
    if (matches.length > 1) {
      action = "blocked";
      codes.add("IDENTITY_COLLISION");
    } else if (existing) {
      const equal = compareJson(json(desired), json({ digest: existing.digest, fileName: existing.fileName, mimeType: existing.mimeType, byteSize: existing.byteSize }));
      if (existing.ownership === "wordpress") {
        action = "blocked";
        codes.add("OWNERSHIP_CONFLICT");
      } else if (equal) action = "noop";
      else action = "update";
    }
    if ((action === "create" || action === "update") && !nondraftableAllowed(mapping, target)) {
      action = "blocked";
      codes.add("NONDRAFTABLE_SIDE_EFFECT_BLOCKED");
    }
    const operation = makeOperation({
      operationId: id, kind: "media", action, identity: key, targetType: "attachment",
      targetId: existing?.targetId ?? null, expectedRevision: existing?.revision ?? null,
      dependsOn: [], desired: action === "noop" ? null : json(desired), diagnosticCodes: sortedCodes(codes),
    });
    operations.push(operation);
    mediaOperationByIdentity.set(key, operation);
  }

  for (const key of orderedTermKeys) {
    const item = includedTerms.get(key);
    if (!item) continue;
    const taxonomy = taxonomyMappings.get(item.taxonomyKey);
    if (!taxonomy) continue;
    const id = operationId(inputDigests.mapping, target.targetId, "term", key);
    const matches = targetTerms.get(key) ?? [];
    const codes = new Set<DiagnosticCode>();
    if (termCycleKeys.has(key)) codes.add("TERM_HIERARCHY_CYCLE");
    const nameValue = findFieldValue(item.record, taxonomy.nameFieldId);
    const slugValue = findFieldValue(item.record, taxonomy.slugFieldId);
    const name = nameValue?.type === "text" ? nameValue.value : null;
    const slug = slugValue?.type === "text" ? slugValue.value : null;
    if (name === null || slug === null) codes.add("INVALID_FIELD_TYPE");
    else if (name.trim().length === 0 || slug.trim().length === 0) codes.add("MISSING_REQUIRED_VALUE");
    const desired = { name, slug, parentSourceIdentity: item.parentKey ? includedTerms.get(item.parentKey)?.identity ?? null : null };
    const existing = matches.length === 1 ? matches[0] : undefined;
    let action: DryRunOperation["action"] = "create";
    if (taxonomy.termOwnership === "wordpress") {
      if (matches.length === 1 && existing?.ownership === "wordpress") action = "noop";
      else {
        action = "blocked";
        codes.add(matches.length > 1 ? "IDENTITY_COLLISION" : matches.length === 0 ? "MISSING_DEPENDENCY" : "OWNERSHIP_CONFLICT");
      }
    }
    else if (matches.length > 1) {
      action = "blocked";
      codes.add("IDENTITY_COLLISION");
    } else if (existing) {
      const equal = compareJson(json(desired), json({ name: existing.name, slug: existing.slug, parentSourceIdentity: existing.parentSourceIdentity }));
      if (existing.ownership === "wordpress") {
        action = "blocked";
        codes.add("OWNERSHIP_CONFLICT");
      } else if (equal) action = "noop";
      else action = "update";
    }
    if (codes.size > 0) action = "blocked";
    if ((action === "create" || action === "update") && !nondraftableAllowed(mapping, target)) {
      action = "blocked";
      codes.add("NONDRAFTABLE_SIDE_EFFECT_BLOCKED");
    }
    const parentOperation = item.parentKey ? termOperationByIdentity.get(item.parentKey) : undefined;
    const operation = makeOperation({
      operationId: id, kind: "term", action, identity: key, targetType: item.taxonomyKey,
      targetId: existing?.targetId ?? null, expectedRevision: existing?.revision ?? null,
      dependsOn: parentOperation ? [parentOperation.operationId] : [], desired: action === "noop" ? null : json(desired), diagnosticCodes: sortedCodes(codes),
    });
    operations.push(operation);
    termOperationByIdentity.set(key, operation);
  }

  for (const key of orderedPostKeys) {
    const separator = key.indexOf(":");
    const tableId = key.slice(0, separator);
    const recordId = key.slice(separator + 1);
    const entity = entities.get(tableId);
    const record = tables.get(tableId)?.get(recordId);
    if (!entity) continue;
    const identity = identityFor(source.source.baseId, tableId, recordId);
    const identityKey = sourceIdentityKey(identity);
    const id = operationId(inputDigests.mapping, target.targetId, "post", identityKey);
    const codes = new Set(nodeProblems.get(key) ?? []);
    const desiredFields: { target: FieldTarget; bindingId: string; value: JsonValue }[] = [];
    const dependencyIds: string[] = [];

    for (const binding of sortBy(entity.bindings, (item) => item.id)) {
      if (binding.ownership === "wordpress") continue;
      if (binding.kind === "field") {
        const value = scalarValue(record, binding);
        if (value !== undefined) desiredFields.push({ target: binding.target, bindingId: binding.id, value });
        continue;
      }
      if (binding.kind === "relationship") {
        const relatedIds = links(record, binding.sourceFieldId) ?? [];
        const refs = relatedIds.map((relatedId) => identityFor(source.source.baseId, binding.relatedTableId, relatedId));
        const value = binding.cardinality.max === 1 ? refs[0] ?? null : binding.ordered ? refs : sortBy(refs, sourceIdentityKey);
        desiredFields.push({ target: binding.target, bindingId: binding.id, value: json(value) });
        for (const relatedId of relatedIds) {
          const dependency = operationByNode.get(recordKey(binding.relatedTableId, relatedId));
          if (dependency) dependencyIds.push(dependency.operationId);
        }
        continue;
      }
      const attachmentIds = attachments(record, binding.sourceFieldId) ?? [];
      const refs = attachmentIds.flatMap((attachmentId) => {
        const attachmentIdentity: AttachmentIdentity = { ...identity, fieldId: binding.sourceFieldId, attachmentId };
        const attachment = includedAttachments.get(attachmentIdentityKey(attachmentIdentity));
        if (!attachment) return [];
        const mediaOperation = mediaOperationByIdentity.get(attachmentIdentityKey(attachmentIdentity));
        if (mediaOperation) dependencyIds.push(mediaOperation.operationId);
        return [{ sourceIdentity: attachmentIdentity, digest: attachment.digest }];
      });
      const value = binding.cardinality.max === 1 ? refs[0] ?? null : binding.ordered ? refs : sortBy(refs, (ref) => attachmentIdentityKey(ref.sourceIdentity));
      desiredFields.push({ target: binding.target, bindingId: binding.id, value: json(value) });
    }
    desiredFields.sort((left, right) => compareCodePoints(fieldTargetKey(left.target), fieldTargetKey(right.target)));

    const matches = targetPosts.get(identityKey) ?? [];
    const existing = matches.length === 1 ? matches[0] : undefined;
    let action: DryRunOperation["action"] = "create";
    const changedFields: typeof desiredFields = [];
    if (matches.length > 1) {
      action = "blocked";
      codes.add("IDENTITY_COLLISION");
    } else if (existing) {
      for (const desiredField of desiredFields) {
        const state = existing.fields.find((field) => fieldTargetKey(field.target) === fieldTargetKey(desiredField.target));
        if (state && state.bindingId !== desiredField.bindingId) {
          codes.add("BINDING_ID_MISMATCH");
          changedFields.push(desiredField);
          continue;
        }
        if (state?.ownership === "wordpress") {
          codes.add("OWNERSHIP_CONFLICT");
          changedFields.push(desiredField);
          continue;
        }
        const ordered = bindingOrder(mapping, desiredField.bindingId);
        if (state && compareJson(normalizeBindingJson(json(state.value), ordered), normalizeBindingJson(desiredField.value, ordered))) continue;
        else changedFields.push(desiredField);
      }
      action = codes.has("OWNERSHIP_CONFLICT") || codes.has("BINDING_ID_MISMATCH") ? "blocked" : changedFields.length === 0 ? "noop" : "update";
      if (existing.postType !== entity.targetPostType) {
        action = "blocked";
        codes.add("IDENTITY_COLLISION");
      }
      if (action === "update" && existing.status !== "draft") {
        action = "blocked";
        codes.add("NONDRAFTABLE_SIDE_EFFECT_BLOCKED");
      }
    }
    if (codes.size > 0) action = "blocked";
    const desired = action === "noop" ? null : action === "create" || existing === undefined
      ? { status: "draft", fields: desiredFields }
      : { fields: changedFields };
    const operation = makeOperation({
      operationId: id, kind: "post", action, identity: identityKey, targetType: entity.targetPostType,
      targetId: existing?.targetId ?? null, expectedRevision: existing?.revision ?? null,
      dependsOn: [...new Set(dependencyIds)].sort(compareCodePoints), desired: json(desired), diagnosticCodes: sortedCodes(codes),
    });
    operations.push(operation);
    operationByNode.set(key, operation);
  }

  const postOrder = new Map(orderedPostKeys.map((key, index) => [key, index]));
  for (const nodeKey of [...included].sort((left, right) => (postOrder.get(left) ?? 0) - (postOrder.get(right) ?? 0))) {
    const separator = nodeKey.indexOf(":");
    const tableId = nodeKey.slice(0, separator);
    const recordId = nodeKey.slice(separator + 1);
    const entity = entities.get(tableId);
    const postOperation = operationByNode.get(nodeKey);
    if (!entity || !postOperation) continue;
    const identity = identityFor(source.source.baseId, tableId, recordId);
    for (const binding of sortBy(entity.taxonomyAssignments, (item) => item.id)) {
      if (binding.ownership === "wordpress") continue;
      const assignmentIdentity = `${sourceIdentityKey(identity)}:${binding.taxonomyKey}:${binding.id}`;
      const id = operationId(inputDigests.mapping, target.targetId, "taxonomy_assignment", assignmentIdentity);
      const termIdentities = assignmentTerms.get(`${nodeKey}:${binding.id}`) ?? [];
      const termOperations = termIdentities.flatMap((termIdentity) => {
        const key = `${binding.taxonomyKey}:${sourceIdentityKey(termIdentity)}`;
        const operation = termOperationByIdentity.get(key);
        return operation ? [operation] : [];
      });
      const matches = target.taxonomyAssignments.filter((item) =>
        sourceIdentityKey(item.postSourceIdentity) === sourceIdentityKey(identity) && item.taxonomyKey === binding.taxonomyKey);
      const existing = matches.length === 1 ? matches[0] : undefined;
      const codes = new Set<DiagnosticCode>();
      let action: DryRunOperation["action"] = "create";
      if (matches.length > 1) {
        action = "blocked";
        codes.add("IDENTITY_COLLISION");
      } else if (existing) {
        if (existing.bindingId !== binding.id) {
          action = "blocked";
          codes.add("BINDING_ID_MISMATCH");
        }
        const currentTermIdentities = binding.ordered ? existing.termSourceIdentities : sortBy(existing.termSourceIdentities, sourceIdentityKey);
        const equal = compareJson(json(termIdentities), json(currentTermIdentities));
        if (codes.has("BINDING_ID_MISMATCH")) action = "blocked";
        else if (existing.ownership === "wordpress") {
          action = "blocked";
          codes.add("OWNERSHIP_CONFLICT");
        } else if (equal) action = "noop";
        else action = "update";
      }
      if (postOperation.action === "blocked" || termOperations.some((operation) => operation.action === "blocked")) {
        action = "blocked";
        codes.add("DEPENDENCY_BLOCKED");
      }
      if ((action === "create" || action === "update") && !nondraftableAllowed(mapping, target)) {
        action = "blocked";
        codes.add("NONDRAFTABLE_SIDE_EFFECT_BLOCKED");
      }
      operations.push(makeOperation({
        operationId: id, kind: "taxonomy_assignment", action, identity: assignmentIdentity, targetType: binding.taxonomyKey,
        targetId: null, expectedRevision: existing?.revision ?? null,
        dependsOn: [postOperation.operationId, ...termOperations.map((operation) => operation.operationId)].sort(compareCodePoints),
        desired: action === "noop" ? null : json({ termSourceIdentities: termIdentities }), diagnosticCodes: sortedCodes(codes),
      }));
    }
  }

  if (globalCodes.size > 0) {
    for (const operation of operations) {
      if (operation.action === "create" || operation.action === "update") operation.action = "blocked";
    }
  }

  const operationsById = new Map(operations.map((operation) => [operation.operationId, operation]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const operation of operations) {
      if (operation.action === "blocked") continue;
      if (operation.dependsOn.some((dependencyId) => operationsById.get(dependencyId)?.action === "blocked")) {
        operation.action = "blocked";
        operation.diagnosticCodes = sortedCodes([...operation.diagnosticCodes as DiagnosticCode[], "DEPENDENCY_BLOCKED"]);
        changed = true;
      }
    }
  }

  for (const operation of operations) {
    operation.intentDigest = canonicalDigest(json({
      operationId: operation.operationId,
      kind: operation.kind,
      action: operation.action,
      identity: operation.identity,
      targetType: operation.targetType,
      targetId: operation.targetId,
      expectedRevision: operation.expectedRevision,
      dependsOn: operation.dependsOn,
      desired: operation.desired,
      diagnosticCodes: operation.diagnosticCodes,
    }));
  }

  operations.forEach((operation, index) => { operation.order = index; });
  const diagnostics: Diagnostic[] = [
    ...sortedCodes(globalCodes).map((code) => diagnostic(code)),
    ...operations.flatMap((operation) => operation.diagnosticCodes.map((code) => diagnostic(code as DiagnosticCode, operation.operationId))),
  ].sort((left, right) => compareCodePoints(`${left.scope.operationId ?? ""}:${left.code}`, `${right.scope.operationId ?? ""}:${right.code}`));

  const counts = { create: 0, update: 0, noop: 0, blocked: 0 };
  for (const operation of operations) counts[operation.action] += 1;
  const readiness = globalCodes.size > 0 || counts.blocked > 0 ? "blocked" as const : "ready" as const;
  const planWithoutDigest = {
    contractVersion: CONTENT_IMPORT_CONTRACT_VERSION,
    inputDigests,
    readiness,
    writesAttempted: 0 as const,
    counts,
    diagnostics,
    operations,
  };
  const plan = { ...planWithoutDigest, planDigest: canonicalDigest(json(planWithoutDigest)) };
  return DryRunPlanSchema.parse(plan);
};
