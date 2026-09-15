import type { ZodError, ZodIssue } from "zod";

export type InvalidInputName = "mapping" | "source" | "target";

export type SanitizedInputIssue = Readonly<{
  input: InvalidInputName;
  path: string;
  code: string;
}>;

const SAFE_SEGMENTS = new Set([
  "contractVersion", "mappingId", "mappingVersion", "status", "source", "system", "baseId", "rootTableId", "rootViewId",
  "targetSchema", "schemaId", "schemaVersion", "schemaDigest", "postTypes", "coreFields", "acfGroups", "taxonomies", "key",
  "fields", "type", "policy", "allowedEnvironments", "nonDraftableWrites", "entities", "sourceTableId", "targetPostType", "bindings",
  "kind", "id", "sourceFieldId", "target", "field", "groupKey", "fieldKey", "transform", "ownership", "required", "relatedTableId",
  "relatedPostType", "cardinality", "min", "max", "ordered", "taxonomyAssignments", "taxonomyKey", "complete", "mappings", "nameFieldId",
  "slugFieldId", "parentFieldId", "termOwnership", "exclusions", "root", "viewId", "recordIds", "tables", "tableId", "records", "recordId",
  "attachments", "attachmentIds", "identity", "fieldId", "attachmentId", "digest", "fileName", "mimeType", "byteSize", "environment",
  "targetId", "snapshotComplete", "schema", "approval", "mappingDigest", "posts", "revision", "terms", "name", "slug",
  "parentSourceIdentity", "media", "postSourceIdentity", "termSourceIdentities", "bindingId", "value", "values",
]);

const safePath = (issue: ZodIssue): string =>
  issue.path.length === 0
    ? "$"
    : `$.${issue.path.map((segment) => typeof segment === "number" ? "[]" : SAFE_SEGMENTS.has(String(segment)) ? String(segment) : "*").join(".")}`;

export class InvalidInputError extends Error {
  readonly code = "INVALID_INPUT" as const;
  readonly issues: readonly SanitizedInputIssue[];

  constructor(issues: readonly SanitizedInputIssue[]) {
    super("Content import input failed validation");
    this.name = "InvalidInputError";
    this.issues = [...issues].sort((left, right) => {
      const leftKey = `${left.input}:${left.path}:${left.code}`;
      const rightKey = `${right.input}:${right.path}:${right.code}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  }
}

export const invalidInputFromZod = (input: InvalidInputName, error: ZodError): InvalidInputError =>
  new InvalidInputError(error.issues.map((issue) => ({ input, path: safePath(issue), code: issue.code })));

export const semanticInputError = (
  input: InvalidInputName,
  path: string,
  code: string,
): InvalidInputError => new InvalidInputError([{ input, path, code }]);
