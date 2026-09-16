import { z } from "zod";
import { IdentifierSchema, RelativePathSchema } from "./manifest.js";

export const BLUEPRINT_MANIFEST_VERSION = 1 as const;

export const ProjectNameSchema = z.string().min(1).max(80).regex(
  /^[A-Za-z0-9](?:[A-Za-z0-9 .,'&()_-]{0,78}[A-Za-z0-9])?$/,
  "Project names must start and end with a letter or number and contain only ordinary display characters",
);
export const BlueprintVersionSchema = z.string().min(1).max(32).regex(/^[1-9][0-9]*\.[0-9]+\.[0-9]+$/);
export const BlueprintReferenceSchema = z.strictObject({
  id: IdentifierSchema,
  version: BlueprintVersionSchema,
});
export type BlueprintReference = z.infer<typeof BlueprintReferenceSchema>;

export const DesignSystemReferenceSchema = z.strictObject({
  id: IdentifierSchema,
  version: BlueprintVersionSchema,
});
export type DesignSystemReference = z.infer<typeof DesignSystemReferenceSchema>;

export const CapabilitiesSchema = z.strictObject({
  styleEdits: z.boolean(), tokenEdits: z.boolean(), htmlEditing: z.literal(false),
  arbitraryAstroImport: z.literal(false), clientAuthorization: z.literal(false),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

const reviewedFile = z.strictObject({
  path: RelativePathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  executable: z.boolean(),
});

export const BlueprintManifestSchema = z.strictObject({
  schemaVersion: z.literal(BLUEPRINT_MANIFEST_VERSION),
  blueprint: BlueprintReferenceSchema,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(240),
  renderer: z.literal("astro"),
  designSystem: DesignSystemReferenceSchema,
  capabilities: CapabilitiesSchema,
  pageCount: z.int().positive().max(100),
  projectManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedFiles: z.array(reviewedFile).min(1).max(256),
}).superRefine((manifest, ctx) => {
  const paths = manifest.reviewedFiles.map((file) => file.path);
  if (new Set(paths).size !== paths.length) {
    ctx.addIssue({ code: "custom", path: ["reviewedFiles"], message: "Reviewed file paths must be unique" });
  }
  const projectManifest = manifest.reviewedFiles.find((file) => file.path === ".stellar/project.json");
  if (!projectManifest || projectManifest.sha256 !== manifest.projectManifestSha256) {
    ctx.addIssue({ code: "custom", path: ["projectManifestSha256"], message: "Project manifest digest must match the reviewed file" });
  }
});
export type BlueprintManifest = z.infer<typeof BlueprintManifestSchema>;

export const BlueprintCatalogEntrySchema = z.strictObject({
  blueprint: BlueprintReferenceSchema,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(240),
  renderer: z.literal("astro"),
  designSystem: DesignSystemReferenceSchema,
  capabilities: CapabilitiesSchema,
  pageCount: z.int().positive().max(100),
});
export type BlueprintCatalogEntry = z.infer<typeof BlueprintCatalogEntrySchema>;
