# M2-01 — Reviewed implementation and next task

Date: 2026-09-14. Branch: `codex/m2-content-contracts`. Baseline: `bb5a310`, containing completed M1 and its kickoff. This handoff is committed with the reviewed implementation. [Verification evidence](../evidence/m2-01/verification.json) records the baseline and exact file fingerprints for the tested M2 source.

## Delivered

All [M2-01 acceptance criteria](../prds/m2-01-content-mapping-and-dry-run.md) are complete. The separate `@stellar/content-import` package validates `stellar.content-import.v1` mappings, typed source snapshots and target inventories, then emits deterministic offline intent. Reports contain stable source/target identities, schema/mapping/plan and operation-intent digests, observed target revisions, ordered dependencies, ownership-aware comparisons and blockers. The package has no I/O or live writer.

The synthetic example produces six ordered creates: attachment, parent term, child term, shared post, draft page and taxonomy assignment. The replay test produces six no-ops from matching observed target state. CLI failure/success/blocked exits are 1/0/2, with no writes. [Saved example](../evidence/m2-01/synthetic-plan.json).

The separate legacy company audit validates 71 mapped source fields against 16 tables/176 fields, seven body sections, one global section and one selected root. It deliberately returns eight blockers and exit 2. The research format cannot be promoted to executable by inserting approval-shaped fields. [Saved audit](../evidence/m2-01/company-audit.json).

Created [six M2 PRDs and dispatch order](../prds/m2.md). Only M2-01 is implemented; the remaining files describe dependent work in its owning repository. Existing Projects/Studio screens are unchanged.

## Delegation and review

All three subagents used SOL high with disjoint ownership. The source reviewer built the legacy audit; the implementation agent owned `packages/content-import`; the UX reviewer drafted M2-02–06 and independently reviewed the engine. The orchestrator owned root configuration, CLI, integration tests, documentation and final review.

Confirmed findings fixed before closeout: false readiness from research flags, untrusted diagnostic keys, owner-table mismatches, mapping/schema/target identity binding, locale-sensitive digest ordering, invalid transform targets, non-view root back-links, WP-owned dependency traversal, term exclusions/missing parents, non-draft post updates, identity collisions, batch taxonomy binding reuse, unordered media no-op comparisons, global-blocker propagation and hidden ownership-conflict intent. Blocked operations retain review details and cannot represent executable success.

## Verification seen

| Check | Result |
| --- | --- |
| Root and fixture dependency installation | Passed; new workspace uses existing pinned dependency versions |
| `npm run verify` | Passed: harness, docs, lint, typechecks, 103 tests and fixture source validation |
| Test groups | 9 editor-contract, 14 content-import, 5 source-engine, 14 runner, 33 web, 2 Astro-integration, 26 root tests |
| `npm run build` | Passed: workspace packages, Next app and standalone Astro fixture |
| Synthetic CLI | Ready, six proposed creates, zero writes; repeat output identical |
| Company audit CLI | Expected blocked exit 2, eight blockers, zero writes |
| Batch target inventory review | Two different posts can reuse one mapping-level taxonomy binding |
| Source/whitespace review | Reviewed; no M1 application source or company checkout changed |

The first full verify stopped at the intentionally changed guide-index hash; inspection confirmed that one change and the harness lock was refreshed. The next run reached existing runner tests but the sandbox denied localhost listeners. Re-running with localhost-server permission passed. No port checks were disabled. No new browser evidence is claimed because this slice adds no application UI; M1's earlier visual review remains separate.

## Try it

From the repository root after `npm ci`:

```sh
npm run build --workspace=@stellar/content-import
npm run content:plan:example
npm run content:audit:company
```

The final command's exit 2 is expected. See [the guide](../user-guide/content-planning.md) for arbitrary normalized inputs and machine-readable output.

## Next dispatch: M2-02

Read harness intake, this handoff, [Decision 005](../decisions/005-content-plan-and-company-poc.md), [POC-01](../POC-01-company-site.md) and [M2-02](../prds/m2-02-wordpress-model-and-ownership.md). Work in a reviewed isolated checkout of `altitude-headless-theme`; its last read-only local baseline was clean develop at `80cf5252`, not a verified live runtime. Prepare concrete CPT/shared-entity/ACF group/field/taxonomy definitions and Local JSON ownership before asking the user to approve them. Preserve the existing source and deployment conventions, and use current docs for actual APIs.

The acceptance gates still require company taxonomy/source assignments, real ACF keys and composition approval, licensed plugin availability, current runtime/SDL, source record/media snapshots and target inventory. A distinct WP-owned editable draft and final component/token source are later integration inputs. The standalone executor/skill belongs in the company WP repo and arrives in M2-03; settle the format/package distribution boundary explicitly. M2-04 owns the distinct GraphQL response fixture and Astro page. No Stellar/Convex runtime is required to import or serve the site.

These results do not constitute a real WP import, WordPress authorization service, general ACF flexible-content compiler, attachment downloader, agency portal, Agent Hub integration or release. No live company data, remote task, push, merge or deployment was changed. Continue with local preparation; honor the session's concrete authorization before external actions.
