# M2-06 — Staging release and recovery proof

Status: proposed local PRD. Local identifier M2-06. Parent: [M2 index](m2.md). This is the first staging integration slice. Prepare the concrete plan and targets, then obtain any live authorization still missing from the session; authorization may cover the whole reviewed sequence and need not be requested again per step. This PRD grants no production authority.

## Overview

Prove one coherent company page through WordPress schema/content staging, Astro build/promotion and post-deploy verification while a second page remains draft. Record source, schema, mapping, content/media, selected pages and release evidence independently. A failed Astro build or promotion must leave the prior frontend artifact serving. Production, atomic WordPress code deployment and a general release platform are out of scope.

## Prerequisites

- M2-02 approved schema/ownership service and documented staging activation/configuration plan.
- M2-03 reviewed live dry-run, resumable executor and complete draft readback; M2-04 typed page/preview; M2-05 reviewed company Studio edits and user visual review.
- Resolve release-blocking content, taxonomy, navigation/footer and required links for the selected page, or explicitly scope an approved non-public integration proof. Identify the second draft page.
- Reverify current `develop` baselines, active plugins/runtime, Headless application binding, `HOST`, schema dispatch and rebuild webhook consumers before proposing changes. Credentials remain in configured stores.

## User Stories

- As a publisher, I want to approve a concrete page and dependency closure without releasing unrelated drafts.
- As an operator, I want schema, content and frontend deployment states separated so I know what succeeded and what to recover.
- As a site owner, I want a failed replacement build to preserve the previous serving frontend and an auditable retry path.

## Technical Requirements

### Endpoints and routes

Use existing repository and WP Engine staging mechanisms. Wire the minimum content-publication rebuild trigger for the selected prerendered route, with authenticated webhook handling, idempotent event identity and no logged credential URL. Do not recreate the Headless application, add `PORT`, or introduce a new deployment service. Post-deploy verification checks the selected route/release stamp and content identity; `/health` alone is insufficient.

### Interface

Prepare a release review artifact before the live action. Show selected page and dependency closure, excluded draft page, code commit, schema/mapping/content/media revisions, environment, checks, approver and recovery target. States are independently timestamped: schema `planned/applied/verified/failed`; content `draft/imported/approved/published`; frontend `queued/building/deploying/deployed/failed/superseded`; verification `pending/passed/failed`; recovery `not_needed/available/running/completed/failed`.

Stellar may display the artifact and observed state only after the underlying actions exist. Do not add a one-click Publish/Deploy button that collapses content approval, CMS publication, build and verification.

### Data model

The release manifest is immutable and identifies target environment, source commit, renderer, schema and mapping hashes, import/readback run, approved WP revisions, media IDs/hashes, selected/excluded routes, navigation closure, trigger event, provider build/deploy identity, checks and approver. Store observed and completed times; never infer success from elapsed time or a stale status.

WordPress publication and frontend build are separate side effects. Reconcile ambiguous trigger/build outcomes before retrying. Repeated content events for the same approved revision map to one logical release; a newer revision supersedes an older queued job without making the older result current.

### Integrations

`altitude-headless-theme` owns schema/content operations and its existing `develop`→`altitude26stg` deployment. `altitude-astro` owns the content trigger consumer, prerender/build behavior and existing `develop` staging target. Stellar owns coordination/evidence only. Keep schema dispatch and content rebuild distinct. Record the WordPress deploy's additive, non-atomic `rsync --inplace` behavior and use additive schema compatible with both frontend revisions.

## Acceptance Criteria

- [ ] M2-06-A: The reviewed manifest names the exact staging installs/repos/branches, selected page/dependencies, excluded draft, revisions/hashes, approver, checks and recovery target before any live write.
- [ ] M2-06-B: The approved schema and import run apply to staging, read back through WPGraphQL and preserve M2-03 idempotency/ownership; no source-owned field is editorially overwritten.
- [ ] M2-06-C: Publishing the selected content revision triggers one logical Astro rebuild; duplicate delivery does not create conflicting releases, and the deployed route proves its build/content stamp.
- [ ] M2-06-D: The second page remains draft and absent from public routes/navigation. Shared dependencies cannot leak unapproved content; unresolved shared impact blocks release.
- [ ] M2-06-E: A controlled failing Astro build/promotion leaves the previous frontend artifact serving, records failure and supports a bounded retry after repair.
- [ ] M2-06-F: An ambiguous trigger or provider status is reconciled before retry; a superseded job cannot become the current verified release.
- [ ] M2-06-G: Post-deploy browser checks cover responsive page, links/media/alt text, public draft exclusion and source/schema/content identities; Stellar and Airtable can be unavailable while the site serves.
- [ ] M2-06-H: The staging recovery procedure covers partial WordPress file deployment without claiming atomic rollback; no production data, branch or environment changes occur.

## Testing Plan

Before live work, test manifest closure, event idempotency, supersession and failure recovery with fixtures. Run full verification/build in each changed repository. On staging, capture pre-action state, schema/content readback, provider commit status/build identity, route stamp, screenshots at 390/768/1440, public draft exclusion and prior-artifact behavior under a controlled bad Astro build. Redact webhook URLs/credentials. A reviewer inspects the evidence and the user performs the required release/visual review.

## Rollback Plan

Frontend recovery promotes or retains the previously verified artifact/commit; never label a failed build current. Stop content triggers before repair. WordPress recovery disables new writes, reconciles import operations and applies an additive forward repair or inspected file redeploy; it does not promise transactional rollback for `rsync --inplace`. Preserve published content and audit records unless a concrete reviewed reversal is authorized.

## Timeline

1. Prepare and review the immutable staging manifest, connection audit, dry-run and recovery procedure.
2. Obtain authorization for the concrete staging schema/import/publication/deploy actions and execute them in dependency order.
3. Inject frontend failure, repair/retry, verify serving output and close the evidence/user-review gate.

## Dependencies On Other Work

Requires M2-02 through M2-05. It closes the company Milestone A staging proof only. Production launch, scheduled sync, atomic WP deployment, general release service, other pages, HTML/Vercel/Neon and client self-service remain later work.

## Agent handoff

- **Owned:** cross-repo staging plan/manifest, minimal content-trigger integration, recovery test and evidence; changes remain in their owning company repositories.
- **Excluded:** production, Headless app recreation, permanent environment redesign, broad release UI, new CMS/backend, scheduled import and unrelated page/content cleanup.
- **Review gates:** operator reviews exact targets and secrets handling; user authorizes the prepared live actions; schema/content/frontend evidence receives independent review; user visual/release review remains distinct.
