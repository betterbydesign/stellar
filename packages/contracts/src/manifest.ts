import { z } from "zod";

export const MANIFEST_VERSION = 1 as const;
export const MOBILE_MEDIA_QUERY = "(max-width: 767px)" as const;
export const SUPPORTED_PROPERTIES = [
  "color", "background-color", "padding-inline", "padding-block", "gap", "border-radius",
] as const;

export const IdentifierSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const TokenNameSchema = z.string().regex(/^--[a-z][a-z0-9-]{0,78}$/);
export const RelativePathSchema = z.string().min(1).max(240).refine((value) =>
  !value.startsWith("/") && !value.includes("\\") && !value.includes(":") &&
  !value.includes("%") && !value.includes("?") && !value.includes("#") &&
  value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".." && /^[A-Za-z0-9_.-]+$/.test(part)),
  "Expected a safe project-relative path",
);

export const StyleScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ id: z.literal("base"), kind: z.literal("base") }),
  z.strictObject({ id: z.literal("mobile"), kind: z.literal("media"), query: z.literal(MOBILE_MEDIA_QUERY), maxWidthPx: z.literal(767) }),
]);
export const CssDeclarationRefSchema = z.strictObject({
  file: RelativePathSchema,
  selector: z.string().min(1).max(160).regex(/^(?::root|[.#][A-Za-z][A-Za-z0-9_-]*)$/),
  scopeId: z.enum(["base", "mobile"]),
  atRule: z.union([z.null(), z.literal(MOBILE_MEDIA_QUERY)]),
  theme: z.null(),
  property: z.union([z.enum(SUPPORTED_PROPERTIES), TokenNameSchema]),
});
export type CssDeclarationRef = z.infer<typeof CssDeclarationRefSchema>;

export const ManifestTargetSchema = z.strictObject({
  anchor: IdentifierSchema,
  pageId: IdentifierSchema,
  source: z.strictObject({
    file: RelativePathSchema,
    locator: z.string().min(1).max(160),
    componentDefinitionFile: RelativePathSchema.nullable(),
    componentCallSiteFile: RelativePathSchema.nullable(),
  }),
  editable: z.boolean(),
  readOnlyReason: z.enum(["repeated-component", "dynamic-source", "ambiguous-owner", "unsupported-source"]).nullable(),
}).refine((target) => target.editable === (target.readOnlyReason === null), "Editable targets cannot have a read-only reason");

export const ImpactSchema = z.strictObject({
  pageIds: z.array(IdentifierSchema).min(1).max(16),
  anchors: z.array(IdentifierSchema).min(1).max(64),
  coverage: z.literal("declared"),
}).refine((impact) => new Set(impact.pageIds).size === impact.pageIds.length && new Set(impact.anchors).size === impact.anchors.length, "Impact IDs must be unique");
export const TokenEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("definition"), id: IdentifierSchema, name: TokenNameSchema,
    valueType: z.enum(["color", "length"]), source: CssDeclarationRefSchema,
    allowedUnits: z.array(z.enum(["px", "rem"])).max(2),
    min: z.number().finite().nullable(), max: z.number().finite().nullable(),
    impact: ImpactSchema,
  }),
  z.strictObject({
    kind: z.literal("alias"), id: IdentifierSchema, name: TokenNameSchema,
    valueType: z.enum(["color", "length"]), reference: TokenNameSchema,
    source: CssDeclarationRefSchema,
  }),
]);
export type TokenEntry = z.infer<typeof TokenEntrySchema>;

export const StyleRuleSchema = z.strictObject({
  anchor: IdentifierSchema,
  property: z.enum(SUPPORTED_PROPERTIES),
  scopeId: z.enum(["base", "mobile"]),
  valueType: z.enum(["color", "length"]),
  allowedUnits: z.array(z.enum(["px", "rem"])).max(2),
  min: z.number().finite().nullable(),
  max: z.number().finite().nullable(),
  allowedTokenNames: z.array(TokenNameSchema).max(32),
  fallback: CssDeclarationRefSchema,
  override: CssDeclarationRefSchema,
});
export type StyleRule = z.infer<typeof StyleRuleSchema>;

const ManifestShapeSchema = z.strictObject({
  manifestVersion: z.literal(MANIFEST_VERSION),
  renderer: z.literal("astro"),
  project: z.strictObject({ slug: IdentifierSchema, name: z.string().min(1).max(100) }),
  capabilities: z.strictObject({
    styleEdits: z.literal(true), tokenEdits: z.literal(true), htmlEditing: z.literal(false),
    arbitraryAstroImport: z.literal(false), clientAuthorization: z.literal(false),
  }),
  pages: z.array(z.strictObject({
    id: IdentifierSchema, route: z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/),
    label: z.string().min(1).max(100), sourceFile: RelativePathSchema,
  })).min(1).max(16),
  styleScopes: z.array(StyleScopeSchema).length(2),
  allowedCssFiles: z.array(RelativePathSchema).min(1).max(16),
  targets: z.array(ManifestTargetSchema).min(1).max(128),
  tokens: z.array(TokenEntrySchema).min(1).max(64),
  styleRules: z.array(StyleRuleSchema).min(1).max(256),
});

export const ProjectManifestSchema = ManifestShapeSchema.superRefine((manifest, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const unique = (values: readonly string[], path: (string | number)[], label: string) => {
    if (new Set(values).size !== values.length) issue(path, `Duplicate ${label}`);
  };
  unique(manifest.pages.map((item) => item.id), ["pages"], "page ID");
  unique(manifest.pages.map((item) => item.route), ["pages"], "route");
  unique(manifest.targets.map((item) => item.anchor), ["targets"], "anchor");
  unique(manifest.tokens.map((item) => item.id), ["tokens"], "token ID");
  unique(manifest.tokens.map((item) => item.name), ["tokens"], "token name");
  unique(manifest.allowedCssFiles, ["allowedCssFiles"], "CSS file");
  unique(manifest.styleRules.map((item) => `${item.anchor}|${item.property}|${item.scopeId}`), ["styleRules"], "style rule");
  if (manifest.styleScopes[0]?.id !== "base" || manifest.styleScopes[1]?.id !== "mobile") {
    issue(["styleScopes"], "Exactly base then mobile scope is required");
  }
  const pages = new Set(manifest.pages.map((item) => item.id));
  const targets = new Map(manifest.targets.map((item) => [item.anchor, item]));
  const tokens = new Map(manifest.tokens.map((item) => [item.name, item]));
  const files = new Set(manifest.allowedCssFiles);
  const checkRef = (ref: CssDeclarationRef, path: (string | number)[], property: string) => {
    if (!files.has(ref.file)) issue([...path, "file"], "CSS file is not allowlisted");
    if (ref.property !== property) issue([...path, "property"], "Declaration property does not match owner");
    if (ref.atRule !== (ref.scopeId === "base" ? null : MOBILE_MEDIA_QUERY)) issue([...path, "atRule"], "At-rule does not match scope");
  };
  manifest.targets.forEach((target, i) => {
    if (!pages.has(target.pageId)) issue(["targets", i, "pageId"], "Unknown page");
  });
  manifest.tokens.forEach((token, i) => {
    checkRef(token.source, ["tokens", i, "source"], token.name);
    if (token.source.scopeId !== "base" || token.source.theme !== null) issue(["tokens", i, "source"], "M1 tokens must be base-only");
    if (token.kind === "definition") {
      if (token.valueType === "color") {
        if (token.allowedUnits.length || token.min !== null || token.max !== null) issue(["tokens", i], "Color definitions cannot have length bounds");
      } else if (!token.allowedUnits.length || token.min === null || token.max === null || token.min > token.max) {
        issue(["tokens", i], "Length definitions require units and ordered bounds");
      }
      unique(token.allowedUnits, ["tokens", i, "allowedUnits"], "unit");
      token.impact.pageIds.forEach((id) => { if (!pages.has(id)) issue(["tokens", i, "impact", "pageIds"], "Unknown impacted page"); });
      token.impact.anchors.forEach((id) => {
        const target = targets.get(id);
        if (!target || !token.impact.pageIds.includes(target.pageId)) issue(["tokens", i, "impact", "anchors"], "Unknown anchor or impacted page mismatch");
      });
    }
  });
  for (const token of manifest.tokens) {
    const seen = new Set<string>();
    let current: TokenEntry | undefined = token;
    while (current?.kind === "alias") {
      if (seen.has(current.name)) { issue(["tokens"], `Alias cycle at ${current.name}`); break; }
      seen.add(current.name);
      const next: TokenEntry | undefined = tokens.get(current.reference);
      if (!next) { issue(["tokens"], `Unknown alias reference ${current.reference}`); break; }
      if (next.valueType !== current.valueType) { issue(["tokens"], "Alias type mismatch"); break; }
      current = next;
    }
  }
  manifest.styleRules.forEach((rule, i) => {
    const owner = targets.get(rule.anchor);
    if (!owner || !owner.editable) issue(["styleRules", i, "anchor"], "Rule owner must be an editable target");
    const expectedType = rule.property === "color" || rule.property === "background-color" ? "color" : "length";
    if (rule.valueType !== expectedType) issue(["styleRules", i, "valueType"], "Property value type mismatch");
    if (rule.valueType === "color") {
      if (rule.allowedUnits.length || rule.min !== null || rule.max !== null) issue(["styleRules", i], "Color rules cannot have length bounds");
    } else if (!rule.allowedUnits.length || rule.min === null || rule.max === null || rule.min > rule.max) {
      issue(["styleRules", i], "Length rules require units and ordered bounds");
    }
    unique(rule.allowedUnits, ["styleRules", i, "allowedUnits"], "unit");
    unique(rule.allowedTokenNames, ["styleRules", i, "allowedTokenNames"], "token name");
    rule.allowedTokenNames.forEach((name) => {
      const token = tokens.get(name);
      if (!token || token.valueType !== rule.valueType) issue(["styleRules", i, "allowedTokenNames"], "Unknown or wrong-type token");
    });
    checkRef(rule.fallback, ["styleRules", i, "fallback"], rule.property);
    checkRef(rule.override, ["styleRules", i, "override"], rule.property);
    if (rule.override.scopeId !== rule.scopeId || (rule.fallback.scopeId !== rule.scopeId && !(rule.scopeId === "mobile" && rule.fallback.scopeId === "base"))) issue(["styleRules", i], "CSS reference scope mismatch");
    if (rule.fallback.file === rule.override.file && rule.fallback.selector === rule.override.selector) issue(["styleRules", i], "Fallback and override must be separate authored rules");
  });
});
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
export const parseProjectManifest = (input: unknown): ProjectManifest => ProjectManifestSchema.parse(input);

export function resolveTokenLeaf(manifest: ProjectManifest, name: string): Extract<TokenEntry, { kind: "definition" }> | null {
  const tokens = new Map(manifest.tokens.map((token) => [token.name, token]));
  const seen = new Set<string>();
  let token = tokens.get(name);
  while (token?.kind === "alias") {
    if (seen.has(token.name)) return null;
    seen.add(token.name);
    token = tokens.get(token.reference);
  }
  return token?.kind === "definition" ? token : null;
}
