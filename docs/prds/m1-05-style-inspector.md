# M1-05 — Contextual styles, token impact and apply feedback

Status: dependent on M1-03 and M1-04. Local identifier M1-05. Parent: [M1 index](README.md); bounded parts of product R04/R06/R07.

## Overview

Turn source-linked selection into useful manual editing. Show supported style values, where they come from and what an edit will affect; prepare and apply a minimal source patch through the runner. A user can change a local override, reset it or intentionally update a shared base token. Controls are derived from capabilities, not inferred from every property in computed styles.

This PRD does not implement arbitrary CSS, structural layout dragging, content editing, component prop/variant editing, new token creation or a full design-system builder. It establishes a reusable inspector contract for those later features.

## Prerequisites

- M1-01 supported-property/type/scope manifest; M1-03 real source models/proposals; M1-04 stable session/selection API.
- M1-02 prepare/apply and durable receipts work with the real engine.
- No CMS, Agent Hub or agent-runtime credentials. Read [selected-element requirements](../STELLAR-PRD.md) and the M1 supported-case matrix.

## User Stories

- As a designer, I want to tweak the selected element's spacing or color and know that the edit is saved in the source.
- As a developer, I want to distinguish an instance override from a shared token so a small edit does not unexpectedly change the whole site.
- As an editor, I want to reset an override and recover the underlying system value without guessing it.

## Technical Requirements

### Endpoints and routes

No new backend route. Consume source-model, prepare, apply and request-outcome lookup from M1-02 using the M1-01 command envelope. Store the proposal ID and revision returned by preparation; do not fabricate or mutate patches in the browser. Prepare and apply use distinct request IDs. Repeated apply after a lost response keeps its original apply request ID/intent until reconciled, including authorized lookup after reconnect. An unchanged preparation result needs no Apply and creates no history entry.

### Interface

Add `apps/web/features/inspector` into M1-04's inspector region. Show selected element/component, active viewport, explicit **editing scope** (Base or Mobile), and the distinction between authored value, token reference, resolved value and computed/inherited result. CSS provenance comes from the model; computed style alone is insufficient proof of an editable declaration.

Render only M1-01's allowed controls: text/background color, inline/block padding, gap and radius where supported for that target. Length controls show permitted units/bounds and allow listed semantic tokens; color controls preserve valid raw/token values. Validate in the UI for feedback and again on the server. Unsupported properties and ambiguous ownership display clear read-only explanations. Do not silently create inline styles or sever token bindings.

Switching viewport does not change scope. When Mobile is selected while viewing a non-mobile width, explain that the rule is inactive there and offer the matching viewport. Shared token editing is a distinct action labelled with project-wide/declared scope; it is not the default result of changing an element control.

For a local edit, show the current ownership and resulting value. Reset removes that owned override and reveals the separate authored token/inherited fallback; it does not delete a base design-system declaration. For a token edit, follow the model's explicit link from the element to an approved concrete base token-definition target. Show the semantic alias chain, exact leaf definition being changed and known affected routes/elements before Apply. Never submit the element's target ID as a token target or replace an alias with a literal. Alias declarations stay read-only in M1. The fixture manifest provides bounded impact; unknown/cyclic/ambiguous definitions disable apply. Do not describe a limited scan as a complete global CSS analysis.

Use explicit draft, preparing, ready-to-apply, saving, saved, conflict and failed states. A local form value or temporary preview is labelled as unsaved. Saved requires the durable apply receipt; preview freshness is separate: a source save can succeed while the preview is rebuilding or broken. Show the saved revision/diff and preserve that fact if refresh fails. Retry preview separately from retrying the write.

Use an explicit Apply action for M1. On page/project/selection/scope changes with a pending draft, provide Apply, Discard or Keep editing; do not silently apply or drop changes. A stale proposal blocks Apply and offers to refresh/review against current source. Do not automatically rebase and apply an edit the user has not reviewed. Keyboard navigation, labels, validation focus and disabled-state explanations must work without pointer hover.

### Data model

Own UI draft/proposal state only. Project source, revisions and history remain runner-owned. Key drafts by project/session/target/revision/scope; invalidate stale preparation results and request IDs when intent changes. Save state must not bleed between elements or project copies. Preserve the user's intended value on recoverable failure without presenting it as applied.

After a successful write, refresh the source model and reconcile selection by a unique stable anchor at the new revision. Clear editing with an explanation if remapping fails. A previous target ID is not reusable just because the DOM still looks similar.

### Integrations

The GUI submits the same `style.set`, `style.reset` and `token.set` commands that a future agent tool will use. Do not add a second client-only writer or a Letta dependency. Website tokens are loaded from the selected project manifest, not the Stellar app stylesheet.

Use the runner's real preview refresh/reparse behavior. If temporary draft styling is added, remove it on discard/navigation/reconnect and prove source reload produces the same applied result; temporary styling is optional and not a substitute for source persistence.

## Acceptance Criteria

- [ ] M1-05-A: Select a supported target and see authored/token/computed/inherited provenance, current viewport and explicit write scope.
- [ ] M1-05-B: A local color/spacing change applies through the server and changes only its allowed declaration/target; project B and the fixture seed stay unchanged.
- [ ] M1-05-C: A mobile-only override affects the declared mobile condition while base/desktop stays correct; selecting a viewport alone never creates a rule.
- [ ] M1-05-D: Reset removes an override and restores the existing system value. Token references remain intact unless the chosen supported command intentionally changes them.
- [ ] M1-05-E: Shared-token editing shows scope and affected Home/Contact usage before Apply; both routes reflect the durable source change afterward.
- [ ] M1-05-F: Invalid values, unsupported or ambiguous targets and stale proposals fail without source mutation. Recoverable failures preserve the draft and explain the next action.
- [ ] M1-05-G: Lost responses, double clicks and page/project/selection changes cannot repeat a write, apply to another target or falsely claim saved state.
- [ ] M1-05-H: Keyboard use, desktop/mobile preview inspection and source-diff evidence demonstrate the real apply loop, including successful save with failed preview refresh.

## Testing Plan

Test draft/proposal state transitions and stale async responses. Browser tests perform actual local/base/mobile/token/reset edits on the fixture and assert both rendered values and exact source diffs. Include an invalid unit, cyclic/ambiguous token, pending-draft navigation, repeated apply and an injected preview-refresh failure after a successful save. The server capability tests remain authoritative for rejected writes.

## Rollback Plan

Revert the inspector UI without deleting applied site source. Disable incompatible controls when protocol support changes. Until M1-06 lands, restore a test project only through an explicit fixture-reset procedure after preserving the reviewed source diff; never make reverting the UI silently roll back a user's files.

## Timeline

1. Read-only provenance and one local control: first usable inspector.
2. Prepare/apply/reset states with real source persistence and explicit breakpoint scope.
3. Shared-token impact review, failures/navigation recovery and browser evidence; hand off edit state and receipts to M1-06.

## Dependencies On Other Work

Requires real source/session/selection integration from M1-02/03/04. M1-06 adds undo/redo and the final reopen/recovery proof. Component prop/variant controls, arbitrary CSS and role-based client editing are later PRDs.

## Agent handoff

Own `apps/web/features/inspector/**`, its state/client tests and style-editing user guide. Coordinate the one shell mounting point and session refresh callbacks with M1-04. Do not change runner apply semantics, parser code, contracts or the fixture to make a failing test pass. Deliver supported-control examples, state transition coverage, source/visual evidence and explicit unsupported cases. Use SOL high and the root verification groups appropriate to the change.
