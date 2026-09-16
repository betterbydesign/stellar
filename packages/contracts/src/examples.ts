import { parseProjectManifest } from "./manifest.js";
import {
  ApplyChangeResponseSchema, ChangeProposalSchema, ChangeReceiptSchema, EditStateSchema,
  HistoryResponseSchema, ListPagesResponseSchema, ListProjectsResponseSchema,
  PageSchema, PrepareChangeResponseSchema, PrepareChangeSchema, PreviewEnvelopeSchema,
  ProjectSchema, RegisteredWorkspaceSchema, SessionResponseSchema, SessionSchema, SourceTargetSchema, PROTOCOL_VERSION,
} from "./protocol.js";

const css = (file: string, selector: string, property: string) => ({ file, selector, property, scopeId: "base" as const, atRule: null, theme: null });
const colorImpact = { pageIds: ["home", "contact"], anchors: ["home-primary-cta", "contact-primary-cta"], coverage: "declared" as const };
const localCtaImpact = { pageIds: ["home"], anchors: ["home-primary-cta"], coverage: "declared" as const };
export const exampleManifest = parseProjectManifest({
  manifestVersion: 1, renderer: "astro", project: { slug: "astro-style-lab", name: "Astro Style Lab" },
  capabilities: { styleEdits: true, tokenEdits: true, htmlEditing: false, arbitraryAstroImport: false, clientAuthorization: false },
  pages: [
    { id: "home", route: "/", label: "Home", sourceFile: "src/pages/index.astro" },
    { id: "contact", route: "/contact/", label: "Contact", sourceFile: "src/pages/contact.astro" },
  ],
  styleScopes: [{ id: "base", kind: "base" }, { id: "mobile", kind: "media", query: "(max-width: 767px)", maxWidthPx: 767 }],
  allowedCssFiles: ["src/styles/tokens.css", "src/styles/site.css"],
  targets: [
    { anchor: "home-primary-cta", pageId: "home", source: { file: "src/pages/index.astro", locator: "#home-primary-cta", componentDefinitionFile: null, componentCallSiteFile: null }, editable: true, readOnlyReason: null },
    { anchor: "contact-primary-cta", pageId: "contact", source: { file: "src/pages/contact.astro", locator: "#contact-primary-cta", componentDefinitionFile: null, componentCallSiteFile: null }, editable: true, readOnlyReason: null },
    { anchor: "home-feature-clarity", pageId: "home", source: { file: "src/components/FeatureCard.astro", locator: ".feature-card", componentDefinitionFile: "src/components/FeatureCard.astro", componentCallSiteFile: "src/pages/index.astro" }, editable: false, readOnlyReason: "repeated-component" },
  ],
  tokens: [
    { kind: "definition", id: "action-color-base", name: "--lab-color-action-base", valueType: "color", source: css("src/styles/tokens.css", ":root", "--lab-color-action-base"), allowedUnits: [], min: null, max: null, impact: colorImpact },
    { kind: "alias", id: "action-color", name: "--lab-color-action", valueType: "color", reference: "--lab-color-action-base", source: css("src/styles/tokens.css", ":root", "--lab-color-action") },
    { kind: "definition", id: "action-space-base", name: "--lab-space-action", valueType: "length", source: css("src/styles/tokens.css", ":root", "--lab-space-action"), allowedUnits: ["px", "rem"], min: 0, max: 3, impact: colorImpact },
    { kind: "alias", id: "action-space", name: "--lab-space-button", valueType: "length", reference: "--lab-space-action", source: css("src/styles/tokens.css", ":root", "--lab-space-button") },
  ],
  styleRules: [
    { anchor: "home-primary-cta", property: "background-color", scopeId: "base", valueType: "color", allowedUnits: [], min: null, max: null, allowedTokenNames: ["--lab-color-action"], fallback: css("src/styles/site.css", ".button--primary", "background-color"), override: css("src/styles/site.css", "#home-primary-cta", "background-color") },
    { anchor: "contact-primary-cta", property: "background-color", scopeId: "base", valueType: "color", allowedUnits: [], min: null, max: null, allowedTokenNames: ["--lab-color-action"], fallback: css("src/styles/site.css", ".button--primary", "background-color"), override: css("src/styles/site.css", "#contact-primary-cta", "background-color") },
  ],
});

export const exampleProject = ProjectSchema.parse({
  id: "project-a", name: "Astro Style Lab A", renderer: "astro", pageCount: 2,
  blueprint: { id: "astro-style-lab", version: "1.0.0" },
  designSystem: { id: "stellar-style-lab", version: "1.0.0" },
  capabilities: exampleManifest.capabilities,
});
export const exampleRegisteredWorkspace = RegisteredWorkspaceSchema.parse({
  id: "workspace-a", project: exampleProject, label: "Working copy A", sourceKind: "trusted-local-copy",
});
export const exampleListProjects = ListProjectsResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION, requestId: "projects-0001", projects: [exampleRegisteredWorkspace],
});
export const exampleSession = SessionSchema.parse({
  id: "session-a", projectId: "project-a", state: "ready", sourceRevision: "revision-0001",
  previewGeneration: "generation-0001", previewUrl: "http://preview.localhost:4321/", statusMessage: null,
});
export const examplePage = PageSchema.parse({ id: "home", route: "/", label: "Home" });
export const exampleSessionResponse = SessionResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "open-0001", session: exampleSession,
});
export const exampleListPages = ListPagesResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "pages-0001", pages: [examplePage, { id: "contact", route: "/contact/", label: "Contact" }],
});
export const exampleElementTarget = SourceTargetSchema.parse({
  kind: "element", targetId: "target-cta-rev1", revision: "revision-0001", anchor: "home-primary-cta", pageId: "home",
  source: { file: "src/pages/index.astro", structuralLocator: "#home-primary-cta", componentDefinitionFile: null, componentCallSiteFile: null },
  editable: true, readOnlyReason: null, linkedTokenTargetIds: ["target-token-rev1"],
  controls: [{ property: "background-color", scopeId: "base", valueType: "color", allowedUnits: [], min: null, max: null,
    allowedTokenNames: ["--lab-color-action"], authoredValue: null, resolvedValue: { kind: "color", hex: "#146d69" }, provenance: "fallback",
    fallback: css("src/styles/site.css", ".button--primary", "background-color"), override: css("src/styles/site.css", "#home-primary-cta", "background-color") }],
});
export const exampleTokenTarget = SourceTargetSchema.parse({
  kind: "token-definition", targetId: "target-token-rev1", revision: "revision-0001", tokenName: "--lab-color-action-base",
  source: css("src/styles/tokens.css", ":root", "--lab-color-action-base"), valueType: "color", editable: true, readOnlyReason: null,
  authoredValue: { kind: "color", hex: "#146d69" }, allowedUnits: [], min: null, max: null,
  aliases: ["--lab-color-action"], impact: colorImpact,
});
export const exampleReadOnlyTarget = SourceTargetSchema.parse({
  kind: "element", targetId: "target-feature-rev1", revision: "revision-0001", anchor: "home-feature-clarity", pageId: "home",
  source: { file: "src/components/FeatureCard.astro", structuralLocator: ".feature-card", componentDefinitionFile: "src/components/FeatureCard.astro", componentCallSiteFile: "src/pages/index.astro" },
  editable: false, readOnlyReason: "repeated-component", controls: [], linkedTokenTargetIds: [],
});
export const examplePrepareChange = PrepareChangeSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "prepare-0001",
  expectedRevision: "revision-0001", targetId: "target-cta-rev1", command: { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "token", name: "--lab-color-action" } },
});
export const exampleProposal = ChangeProposalSchema.parse({
  proposalId: "proposal-0001", projectId: "project-a", sessionId: "session-a", targetId: "target-cta-rev1",
  baseRevision: "revision-0001", command: examplePrepareChange.command, impact: localCtaImpact,
  sourcePatch: { file: "src/styles/site.css", startByte: 123, endByte: 123, expectedOldText: "", replacementText: "  background-color: var(--lab-color-action);\n", expectedFileSha256: "a".repeat(64) },
});
export const examplePrepareResponse = PrepareChangeResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "prepare-0001", status: "ready", proposal: exampleProposal,
});
export const exampleReceipt = ChangeReceiptSchema.parse({
  receiptId: "receipt-0001", projectId: "project-a", sessionId: "session-a", requestId: "apply-0001", proposalId: "proposal-0001",
  operation: "apply", targetId: "target-cta-rev1", oldRevision: "revision-0001", newRevision: "revision-0002", changedFile: "src/styles/site.css",
});
export const exampleApplyResponse = ApplyChangeResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "apply-0001", status: "applied", receipt: exampleReceipt,
});
export const exampleDraftState = EditStateSchema.parse({ status: "draft", command: examplePrepareChange.command });
export const exampleReadyToApplyState = EditStateSchema.parse({ status: "ready-to-apply", proposal: exampleProposal });
export const exampleSavedState = EditStateSchema.parse({ status: "saved", receipt: exampleReceipt, previewFresh: false });
export const exampleHistory = HistoryResponseSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "history-0001", projectRevision: "revision-0002",
  entries: [{ entryId: "entry-0001", receipt: exampleReceipt, command: examplePrepareChange.command, state: "applied", impact: localCtaImpact }], canUndo: true, canRedo: false,
  undoEntryId: "entry-0001", redoEntryId: null,
});
export const examplePreviewSelection = PreviewEnvelopeSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", previewGeneration: "generation-0001", frameId: "frame-0001",
  pageId: "home", sourceRevision: "revision-0001", type: "selection", payload: { sourceKey: "source-cta-rev1", anchor: "home-primary-cta", occurrenceId: "occurrence-1", geometry: { x: 12, y: 18, width: 180, height: 44 } },
});
