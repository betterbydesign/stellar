import { z } from "zod";

export const CONTENT_IMPORT_CONTRACT_VERSION = "stellar.content-import.v1" as const;

const MAX_ENTITIES = 64;
const MAX_BINDINGS = 512;
const MAX_RECORDS_PER_TABLE = 10_000;
const MAX_ATTACHMENTS = 10_000;
const MAX_TARGET_ITEMS = 20_000;

const SafeIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const SourceIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const RevisionSchema = z.string().min(1).max(256);
const ContractVersionSchema = z.literal(CONTENT_IMPORT_CONTRACT_VERSION);

export const SourceIdentitySchema = z.strictObject({
  system: z.literal("airtable"),
  baseId: SourceIdSchema,
  tableId: SourceIdSchema,
  recordId: SourceIdSchema,
});

export const AttachmentIdentitySchema = z.strictObject({
  system: z.literal("airtable"),
  baseId: SourceIdSchema,
  tableId: SourceIdSchema,
  recordId: SourceIdSchema,
  fieldId: SourceIdSchema,
  attachmentId: SourceIdSchema,
});

const NullValueSchema = z.strictObject({ type: z.literal("null") });
const TextValueSchema = z.strictObject({ type: z.literal("text"), value: z.string().max(200_000) });
const MarkdownValueSchema = z.strictObject({ type: z.literal("markdown"), value: z.string().max(500_000) });
const UrlValueSchema = z.strictObject({ type: z.literal("url"), value: z.string().url().max(8_192) });
const StringListValueSchema = z.strictObject({
  type: z.literal("string_list"),
  values: z.array(z.string().max(20_000)).max(1_000),
});
const RecordLinksValueSchema = z.strictObject({
  type: z.literal("record_links"),
  recordIds: z.array(SourceIdSchema).max(1_000),
});
const AttachmentsValueSchema = z.strictObject({
  type: z.literal("attachments"),
  attachmentIds: z.array(SourceIdSchema).max(1_000),
});

export const SourceFieldValueSchema = z.discriminatedUnion("type", [
  NullValueSchema,
  TextValueSchema,
  MarkdownValueSchema,
  UrlValueSchema,
  StringListValueSchema,
  RecordLinksValueSchema,
  AttachmentsValueSchema,
]);

const CoreTargetSchema = z.strictObject({
  kind: z.literal("core"),
  field: z.enum(["title", "slug", "excerpt"]),
});

const AcfTargetSchema = z.strictObject({
  kind: z.literal("acf"),
  groupKey: SafeIdSchema,
  fieldKey: SafeIdSchema,
});

export const FieldTargetSchema = z.discriminatedUnion("kind", [CoreTargetSchema, AcfTargetSchema]);

const OwnershipSchema = z.enum(["managed", "wordpress"]);

const ScalarBindingSchema = z.strictObject({
  kind: z.literal("field"),
  id: SafeIdSchema,
  sourceFieldId: SourceIdSchema,
  target: FieldTargetSchema,
  transform: z.enum(["text", "markdown", "url", "string_list"]),
  ownership: OwnershipSchema,
  required: z.boolean(),
});

const RelationshipBindingSchema = z.strictObject({
  kind: z.literal("relationship"),
  id: SafeIdSchema,
  sourceFieldId: SourceIdSchema,
  target: AcfTargetSchema,
  relatedTableId: SourceIdSchema,
  relatedPostType: SafeIdSchema,
  cardinality: z.strictObject({ min: z.number().int().min(0).max(1_000), max: z.number().int().min(1).max(1_000) }),
  ordered: z.boolean(),
  ownership: OwnershipSchema,
  required: z.boolean(),
}).refine((value) => value.cardinality.min <= value.cardinality.max, {
  message: "cardinality min must be at most max",
  path: ["cardinality"],
});

const MediaBindingSchema = z.strictObject({
  kind: z.literal("media"),
  id: SafeIdSchema,
  sourceFieldId: SourceIdSchema,
  target: AcfTargetSchema,
  cardinality: z.strictObject({ min: z.number().int().min(0).max(1_000), max: z.number().int().min(1).max(1_000) }),
  ordered: z.boolean(),
  ownership: OwnershipSchema,
  required: z.boolean(),
}).refine((value) => value.cardinality.min <= value.cardinality.max, {
  message: "cardinality min must be at most max",
  path: ["cardinality"],
});

export const EntityBindingSchema = z.discriminatedUnion("kind", [
  ScalarBindingSchema,
  RelationshipBindingSchema,
  MediaBindingSchema,
]);

const TaxonomyAssignmentBindingSchema = z.strictObject({
  id: SafeIdSchema,
  sourceFieldId: SourceIdSchema,
  taxonomyKey: SafeIdSchema,
  cardinality: z.strictObject({ min: z.number().int().min(0).max(1_000), max: z.number().int().min(1).max(1_000) }),
  ordered: z.boolean(),
  ownership: OwnershipSchema,
  required: z.boolean(),
}).refine((value) => value.cardinality.min <= value.cardinality.max, {
  message: "cardinality min must be at most max",
  path: ["cardinality"],
});

const EntityMappingSchema = z.strictObject({
  id: SafeIdSchema,
  sourceTableId: SourceIdSchema,
  targetPostType: SafeIdSchema,
  bindings: z.array(EntityBindingSchema).max(MAX_BINDINGS),
  taxonomyAssignments: z.array(TaxonomyAssignmentBindingSchema).max(MAX_BINDINGS),
});

const PostTypeDeclarationSchema = z.strictObject({
  key: SafeIdSchema,
  coreFields: z.array(z.enum(["title", "slug", "excerpt"])).max(3),
});

const AcfFieldDeclarationSchema = z.strictObject({
  key: SafeIdSchema,
  type: z.enum(["text", "markdown", "url", "string_list", "relationship", "media"]),
});

const AcfGroupDeclarationSchema = z.strictObject({
  key: SafeIdSchema,
  postTypes: z.array(SafeIdSchema).min(1).max(MAX_ENTITIES),
  fields: z.array(AcfFieldDeclarationSchema).min(1).max(MAX_BINDINGS),
});

const TaxonomyDeclarationSchema = z.strictObject({
  key: SafeIdSchema,
  postTypes: z.array(SafeIdSchema).min(1).max(MAX_ENTITIES),
  hierarchical: z.boolean(),
});

const TaxonomyMappingSchema = z.strictObject({
  taxonomyKey: SafeIdSchema,
  sourceTableId: SourceIdSchema,
  nameFieldId: SourceIdSchema,
  slugFieldId: SourceIdSchema,
  parentFieldId: SourceIdSchema.nullable(),
  termOwnership: OwnershipSchema,
});

const duplicateIndexes = <T>(values: readonly T[], key: (value: T) => string): number[] => {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  values.forEach((value, index) => {
    const identity = key(value);
    if (seen.has(identity)) duplicates.push(index);
    seen.add(identity);
  });
  return duplicates;
};

const addDuplicateIssues = <T>(
  values: readonly T[],
  key: (value: T) => string,
  path: (index: number) => PropertyKey[],
  ctx: z.RefinementCtx,
): void => {
  for (const index of duplicateIndexes(values, key)) {
    ctx.addIssue({ code: "custom", message: "duplicate identity", path: path(index) });
  }
};

export const MappingSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  mappingId: SafeIdSchema,
  mappingVersion: z.string().min(1).max(64).regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(["approved_for_planning", "draft_not_executable"]),
  source: z.strictObject({
    system: z.literal("airtable"),
    baseId: SourceIdSchema,
    rootTableId: SourceIdSchema,
    rootViewId: SourceIdSchema,
  }),
  targetSchema: z.strictObject({
    schemaId: SafeIdSchema,
    schemaVersion: z.string().min(1).max(64),
    schemaDigest: DigestSchema,
    postTypes: z.array(PostTypeDeclarationSchema).min(1).max(MAX_ENTITIES),
    acfGroups: z.array(AcfGroupDeclarationSchema).max(MAX_ENTITIES),
    taxonomies: z.array(TaxonomyDeclarationSchema).max(MAX_ENTITIES),
  }),
  policy: z.strictObject({
    allowedEnvironments: z.array(z.enum(["disposable", "staging", "production"])).min(1).max(3),
    nonDraftableWrites: z.enum(["forbid", "allow_disposable", "allow_disposable_and_staging"]),
  }),
  entities: z.array(EntityMappingSchema).min(1).max(MAX_ENTITIES),
  taxonomies: z.strictObject({
    complete: z.boolean(),
    mappings: z.array(TaxonomyMappingSchema).max(MAX_ENTITIES),
  }),
  exclusions: z.array(SourceIdentitySchema).max(MAX_TARGET_ITEMS),
}).superRefine((mapping, ctx) => {
  addDuplicateIssues(mapping.targetSchema.postTypes, (item) => item.key, (index) => ["targetSchema", "postTypes", index, "key"], ctx);
  addDuplicateIssues(mapping.targetSchema.acfGroups, (item) => item.key, (index) => ["targetSchema", "acfGroups", index, "key"], ctx);
  addDuplicateIssues(mapping.targetSchema.taxonomies, (item) => item.key, (index) => ["targetSchema", "taxonomies", index, "key"], ctx);
  addDuplicateIssues(mapping.entities, (item) => item.id, (index) => ["entities", index, "id"], ctx);
  addDuplicateIssues(mapping.entities, (item) => item.sourceTableId, (index) => ["entities", index, "sourceTableId"], ctx);
  addDuplicateIssues(
    mapping.entities.flatMap((entity) => [
      ...entity.bindings.map((binding) => ({ id: binding.id })),
      ...entity.taxonomyAssignments.map((binding) => ({ id: binding.id })),
    ]),
    (item) => item.id,
    () => ["entities"],
    ctx,
  );
  addDuplicateIssues(mapping.taxonomies.mappings, (item) => item.taxonomyKey, (index) => ["taxonomies", "mappings", index, "taxonomyKey"], ctx);
  addDuplicateIssues(mapping.exclusions, (item) => `${item.baseId}:${item.tableId}:${item.recordId}`, (index) => ["exclusions", index], ctx);

  const postTypes = new Map(mapping.targetSchema.postTypes.map((item) => [item.key, item]));
  const groups = new Map(mapping.targetSchema.acfGroups.map((item) => [item.key, item]));
  const taxonomies = new Map(mapping.targetSchema.taxonomies.map((item) => [item.key, item]));
  const entitiesByTable = new Map(mapping.entities.map((item) => [item.sourceTableId, item]));

  addDuplicateIssues(
    mapping.targetSchema.acfGroups.flatMap((group) => group.fields.map((field) => ({ groupKey: group.key, fieldKey: field.key }))),
    (item) => item.fieldKey,
    () => ["targetSchema", "acfGroups"],
    ctx,
  );

  mapping.targetSchema.postTypes.forEach((postType, index) => {
    addDuplicateIssues(postType.coreFields, String, (fieldIndex) => ["targetSchema", "postTypes", index, "coreFields", fieldIndex], ctx);
  });
  mapping.targetSchema.acfGroups.forEach((group, index) => {
    addDuplicateIssues(group.postTypes, String, (itemIndex) => ["targetSchema", "acfGroups", index, "postTypes", itemIndex], ctx);
    addDuplicateIssues(group.fields, (field) => field.key, (fieldIndex) => ["targetSchema", "acfGroups", index, "fields", fieldIndex, "key"], ctx);
    group.postTypes.forEach((postType, itemIndex) => {
      if (!postTypes.has(postType)) ctx.addIssue({ code: "custom", message: "unknown post type", path: ["targetSchema", "acfGroups", index, "postTypes", itemIndex] });
    });
  });
  mapping.targetSchema.taxonomies.forEach((taxonomy, index) => {
    addDuplicateIssues(taxonomy.postTypes, String, (itemIndex) => ["targetSchema", "taxonomies", index, "postTypes", itemIndex], ctx);
    taxonomy.postTypes.forEach((postType, itemIndex) => {
      if (!postTypes.has(postType)) ctx.addIssue({ code: "custom", message: "unknown post type", path: ["targetSchema", "taxonomies", index, "postTypes", itemIndex] });
    });
  });

  const validateTarget = (target: z.infer<typeof FieldTargetSchema>, postType: string, path: PropertyKey[], expectedType?: string): void => {
    if (target.kind === "core") {
      if (!postTypes.get(postType)?.coreFields.includes(target.field)) ctx.addIssue({ code: "custom", message: "unknown core target", path });
      return;
    }
    const group = groups.get(target.groupKey);
    const field = group?.fields.find((item) => item.key === target.fieldKey);
    if (!group || !group.postTypes.includes(postType) || !field) {
      ctx.addIssue({ code: "custom", message: "unknown ACF target", path });
    } else if (expectedType && field.type !== expectedType) {
      ctx.addIssue({ code: "custom", message: "incompatible ACF target", path });
    }
  };

  mapping.entities.forEach((entity, entityIndex) => {
    if (!postTypes.has(entity.targetPostType)) ctx.addIssue({ code: "custom", message: "unknown post type", path: ["entities", entityIndex, "targetPostType"] });
    addDuplicateIssues(entity.bindings, (binding) => binding.id, (index) => ["entities", entityIndex, "bindings", index, "id"], ctx);
    addDuplicateIssues(entity.bindings, (binding) => `${binding.target.kind}:${binding.target.kind === "core" ? binding.target.field : `${binding.target.groupKey}:${binding.target.fieldKey}`}`, (index) => ["entities", entityIndex, "bindings", index, "target"], ctx);
    addDuplicateIssues(entity.taxonomyAssignments, (binding) => binding.id, (index) => ["entities", entityIndex, "taxonomyAssignments", index, "id"], ctx);
    addDuplicateIssues(entity.taxonomyAssignments, (binding) => binding.taxonomyKey, (index) => ["entities", entityIndex, "taxonomyAssignments", index, "taxonomyKey"], ctx);
    entity.bindings.forEach((binding, bindingIndex) => {
      const expectedType = binding.kind === "relationship" ? "relationship" : binding.kind === "media" ? "media" : binding.transform;
      validateTarget(binding.target, entity.targetPostType, ["entities", entityIndex, "bindings", bindingIndex, "target"], expectedType);
      if (binding.kind === "field" && binding.target.kind === "core" && binding.transform !== "text") {
        ctx.addIssue({ code: "custom", message: "incompatible core target", path: ["entities", entityIndex, "bindings", bindingIndex, "target"] });
      }
      if (binding.kind === "relationship") {
        const related = entitiesByTable.get(binding.relatedTableId);
        if (!related || related.targetPostType !== binding.relatedPostType) ctx.addIssue({ code: "custom", message: "unknown relationship target", path: ["entities", entityIndex, "bindings", bindingIndex, "relatedTableId"] });
      }
    });
    entity.taxonomyAssignments.forEach((binding, bindingIndex) => {
      const taxonomy = taxonomies.get(binding.taxonomyKey);
      if (!taxonomy || !taxonomy.postTypes.includes(entity.targetPostType)) ctx.addIssue({ code: "custom", message: "unknown taxonomy target", path: ["entities", entityIndex, "taxonomyAssignments", bindingIndex, "taxonomyKey"] });
    });
  });

  mapping.taxonomies.mappings.forEach((taxonomy, index) => {
    const declaration = taxonomies.get(taxonomy.taxonomyKey);
    if (!declaration) ctx.addIssue({ code: "custom", message: "unknown taxonomy target", path: ["taxonomies", "mappings", index, "taxonomyKey"] });
    else if (!declaration.hierarchical && taxonomy.parentFieldId !== null) ctx.addIssue({ code: "custom", message: "non-hierarchical taxonomy cannot declare a parent field", path: ["taxonomies", "mappings", index, "parentFieldId"] });
  });
  mapping.exclusions.forEach((identity, index) => {
    if (identity.baseId !== mapping.source.baseId) ctx.addIssue({ code: "custom", message: "exclusion outside source base", path: ["exclusions", index, "baseId"] });
  });
  if (!entitiesByTable.has(mapping.source.rootTableId)) ctx.addIssue({ code: "custom", message: "missing root entity mapping", path: ["source", "rootTableId"] });
});

const SourceRecordSchema = z.strictObject({
  recordId: SourceIdSchema,
  fields: z.record(SourceIdSchema, SourceFieldValueSchema),
});

const SourceTableSchema = z.strictObject({
  tableId: SourceIdSchema,
  records: z.array(SourceRecordSchema).max(MAX_RECORDS_PER_TABLE),
});

const SourceAttachmentSchema = z.strictObject({
  identity: AttachmentIdentitySchema,
  digest: DigestSchema,
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(256),
  byteSize: z.number().int().min(0).max(1_000_000_000),
});

export const SourceSnapshotSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  source: z.strictObject({ system: z.literal("airtable"), baseId: SourceIdSchema }),
  root: z.strictObject({
    tableId: SourceIdSchema,
    viewId: SourceIdSchema,
    complete: z.boolean(),
    recordIds: z.array(SourceIdSchema).max(MAX_RECORDS_PER_TABLE),
  }),
  tables: z.array(SourceTableSchema).min(1).max(MAX_ENTITIES * 2),
  attachments: z.array(SourceAttachmentSchema).max(MAX_ATTACHMENTS),
}).superRefine((snapshot, ctx) => {
  addDuplicateIssues(snapshot.root.recordIds, String, (index) => ["root", "recordIds", index], ctx);
  addDuplicateIssues(snapshot.tables, (table) => table.tableId, (index) => ["tables", index, "tableId"], ctx);
  snapshot.tables.forEach((table, tableIndex) => {
    addDuplicateIssues(table.records, (record) => record.recordId, (index) => ["tables", tableIndex, "records", index, "recordId"], ctx);
  });
  addDuplicateIssues(snapshot.attachments, (attachment) => {
    const value = attachment.identity;
    return `${value.baseId}:${value.tableId}:${value.recordId}:${value.fieldId}:${value.attachmentId}`;
  }, (index) => ["attachments", index, "identity"], ctx);
});

const TargetFieldStateSchema = z.strictObject({
  target: FieldTargetSchema,
  bindingId: SafeIdSchema,
  ownership: OwnershipSchema,
  value: z.json(),
});

const TargetPostSchema = z.strictObject({
  targetId: SourceIdSchema,
  postType: SafeIdSchema,
  sourceIdentity: SourceIdentitySchema,
  revision: RevisionSchema,
  status: z.enum(["draft", "pending", "publish", "private", "future"]),
  fields: z.array(TargetFieldStateSchema).max(MAX_BINDINGS),
});

const TargetTermSchema = z.strictObject({
  targetId: SourceIdSchema,
  taxonomyKey: SafeIdSchema,
  sourceIdentity: SourceIdentitySchema,
  revision: RevisionSchema,
  name: z.string().max(20_000),
  slug: z.string().max(512),
  parentSourceIdentity: SourceIdentitySchema.nullable(),
  ownership: OwnershipSchema,
});

const TargetMediaSchema = z.strictObject({
  targetId: SourceIdSchema,
  sourceIdentity: AttachmentIdentitySchema,
  revision: RevisionSchema,
  digest: DigestSchema,
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(256),
  byteSize: z.number().int().min(0).max(1_000_000_000),
  ownership: OwnershipSchema,
});

const TargetTaxonomyAssignmentSchema = z.strictObject({
  postSourceIdentity: SourceIdentitySchema,
  taxonomyKey: SafeIdSchema,
  bindingId: SafeIdSchema,
  ownership: OwnershipSchema,
  termSourceIdentities: z.array(SourceIdentitySchema).max(1_000),
  revision: RevisionSchema,
});

export const TargetInventorySchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  targetId: SafeIdSchema,
  environment: z.enum(["disposable", "staging", "production"]),
  snapshotComplete: z.boolean(),
  schema: z.strictObject({ schemaId: SafeIdSchema, schemaVersion: z.string().min(1).max(64), schemaDigest: DigestSchema }),
  approval: z.strictObject({
    status: z.enum(["approved_for_planning", "unapproved"]),
    mappingId: SafeIdSchema,
    mappingVersion: z.string().min(1).max(64),
    mappingDigest: DigestSchema,
    targetId: SafeIdSchema,
    environment: z.enum(["disposable", "staging", "production"]),
    schemaDigest: DigestSchema,
  }),
  posts: z.array(TargetPostSchema).max(MAX_TARGET_ITEMS),
  terms: z.array(TargetTermSchema).max(MAX_TARGET_ITEMS),
  media: z.array(TargetMediaSchema).max(MAX_TARGET_ITEMS),
  taxonomyAssignments: z.array(TargetTaxonomyAssignmentSchema).max(MAX_TARGET_ITEMS),
}).superRefine((inventory, ctx) => {
  addDuplicateIssues(inventory.posts, (item) => item.targetId, (index) => ["posts", index, "targetId"], ctx);
  addDuplicateIssues(inventory.terms, (item) => item.targetId, (index) => ["terms", index, "targetId"], ctx);
  addDuplicateIssues(inventory.media, (item) => item.targetId, (index) => ["media", index, "targetId"], ctx);
  inventory.posts.forEach((post, postIndex) => {
    addDuplicateIssues(post.fields, (field) => `${field.target.kind}:${field.target.kind === "core" ? field.target.field : `${field.target.groupKey}:${field.target.fieldKey}`}`, (index) => ["posts", postIndex, "fields", index, "target"], ctx);
    addDuplicateIssues(post.fields, (field) => field.bindingId, (index) => ["posts", postIndex, "fields", index, "bindingId"], ctx);
  });
  addDuplicateIssues(inventory.taxonomyAssignments, (item) => `${item.postSourceIdentity.baseId}:${item.postSourceIdentity.tableId}:${item.postSourceIdentity.recordId}:${item.taxonomyKey}`, (index) => ["taxonomyAssignments", index], ctx);
});

export const DiagnosticSchema = z.strictObject({
  code: SafeIdSchema,
  severity: z.enum(["error", "warning"]),
  scope: z.strictObject({ kind: z.enum(["plan", "operation"]), operationId: z.string().nullable() }),
  message: z.string().min(1).max(512),
});

export const DryRunOperationSchema = z.strictObject({
  operationId: z.string().regex(/^op_[a-f0-9]{24}$/),
  intentDigest: DigestSchema,
  order: z.number().int().min(0),
  kind: z.enum(["media", "term", "post", "taxonomy_assignment"]),
  action: z.enum(["create", "update", "noop", "blocked"]),
  identity: z.string().min(1).max(1_024),
  targetType: SafeIdSchema,
  targetId: SourceIdSchema.nullable(),
  expectedRevision: RevisionSchema.nullable(),
  dependsOn: z.array(z.string().regex(/^op_[a-f0-9]{24}$/)).max(2_000),
  desired: z.json().nullable(),
  diagnosticCodes: z.array(SafeIdSchema).max(100),
});

export const DryRunPlanSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  planDigest: DigestSchema,
  inputDigests: z.strictObject({ mapping: DigestSchema, source: DigestSchema, target: DigestSchema }),
  readiness: z.enum(["ready", "blocked"]),
  writesAttempted: z.literal(0),
  counts: z.strictObject({
    create: z.number().int().min(0),
    update: z.number().int().min(0),
    noop: z.number().int().min(0),
    blocked: z.number().int().min(0),
  }),
  diagnostics: z.array(DiagnosticSchema).max(20_000),
  operations: z.array(DryRunOperationSchema).max(MAX_TARGET_ITEMS * 4),
});

export type Mapping = z.infer<typeof MappingSchema>;
export type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>;
export type TargetInventory = z.infer<typeof TargetInventorySchema>;
export type SourceIdentity = z.infer<typeof SourceIdentitySchema>;
export type AttachmentIdentity = z.infer<typeof AttachmentIdentitySchema>;
export type FieldTarget = z.infer<typeof FieldTargetSchema>;
export type EntityBinding = z.infer<typeof EntityBindingSchema>;
export type DryRunOperation = z.infer<typeof DryRunOperationSchema>;
export type DryRunPlan = z.infer<typeof DryRunPlanSchema>;
