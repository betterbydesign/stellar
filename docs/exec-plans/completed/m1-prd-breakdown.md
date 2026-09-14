# Plan the first editor milestone

## Context

The user requested local PRDs suitable for agent delegation, following the harness, for opening a project and clicking elements to tweak styles. Work is on `codex/m1-editor-prds`, created from clean main after the bootstrap merge. The source product PRD remains the broader product direction.

## Goals

Produce a bounded M1 PRD set with prerequisites, shared contracts, source-backed acceptance, tests, rollback and disjoint agent ownership. Make the first implementation task and parallel work explicit. Preserve the confirmed external WP/ACF company POC and later HTML/hosted requirements.

## Non-Goals

No application code, dependency installation, company content import, implementation-task dispatch, external tracker updates or publication is part of this planning request.

## Scope

`docs/prds`, this planning ExecPlan, the current-work pointer, product-PRD cross-reference and operations log. Documentation-only validation applies. No harness instruction or lock-managed template change is needed.

## Plan

1. Read the intake set, parent PRD, bootstrap plan, template and inspected source research.
2. Define M1 scope and interfaces; divide six bounded implementation PRDs.
3. Review the source-engine boundary and integrated acceptance for contradictions.
4. Run the docs and harness checks, close this planning plan and hand off M1-01.

## Progress

- 2026-09-14: intake and clean main verified; planning branch created.
- 2026-09-14: reviewed the Stacki reference at its pinned commit and current Astro integration documentation. SOL high source review confirmed minimal CSS patches, occurrence-aware selection and separation of parser from filesystem writes.
- 2026-09-14: completed the index and six PRDs with all harness template sections, ownership boundaries and 43 unchecked implementation acceptance items.
- 2026-09-14: cross-review identified element/token target separation, alias preservation, reset fallback and revision/retry semantics as shared-contract gaps. Aligned those definitions across the set; added authorized request reconciliation across reconnects.
- 2026-09-14: final review confirmed the shared definitions align. Removed a downstream-browser acceptance dependency from M1-03 so its pure engine deliverable can close before the canvas task starts.
- 2026-09-14: linked M1 from the product PRD and current-work pointer. Documentation/template checks passed; implementation has not started.

## Surprises & Discoveries

The parent product's Milestone A includes WordPress and release work, while the bootstrap's next proof is smaller. Name this local editor milestone M1 and link it as preparation for Milestone A rather than silently replacing that milestone. Stacki's whole-model saves and wildcard frame messages cannot be copied into the browser boundary unchanged.

## Decision Log

- 2026-09-14: use registered trusted fixture copies first; no external services or repository access are required to start.
- 2026-09-14: freeze contracts/fixture before parallel runner and engine work. Source proposals and physical writes have separate owners.
- 2026-09-14: support bounded local CSS overrides/reset and shared base tokens first; defer structural/prop/code editing and full design-system adoption.
- 2026-09-14: require real preview/source/reopen evidence and portable fixture output; local form mocks do not satisfy the milestone.

## Validation

All six PRDs include every applicable template section plus an agent handoff; acceptance items remain unchecked. The full docs scan passed over 54 Markdown files with no broken links, placeholders, absolute local paths or secret findings. Harness profile and strict integrity verification passed, and diff whitespace checks passed. SOL high review examined source feasibility and cross-PRD dependencies/contracts; its four shared-definition findings were addressed. No application tests or builds were run for these prose-only changes.

## Outcomes & Retrospective

The [M1 index](../../prds/README.md) is the implementation dispatch entry. M1-01 can begin implementation planning; M1-02 and M1-03 can run in parallel after its contracts and fixture are integrated. The remaining PRDs depend on actual predecessor outputs. User-guide sweep found no new shipped application behavior to document yet; each implementation PRD includes that obligation. Keep the company WP/ACF POC, full HTML support and hosted execution as explicit follow-on work. Changes are local planning artifacts; this request did not publish or start implementation tasks.
