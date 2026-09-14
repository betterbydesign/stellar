# Starting the Stellar application

2026-09-14 · Proposed implementation sequence. The user intends to develop Stellar in their own GitHub account and license its use to the company alongside Agent Hub. This is an intended ownership arrangement, not a determination that the user already owns all related code. Harness location, work status/jurisdiction and the company agreement remain unresolved.

## Repository layout

Keep `/Users/scottfoster/git/stellar` as the product workspace. Its current origin is `https://github.com/betterbydesign/stellar.git`, but its tracked application is still Stacki at `800fa5270523e7df3afbcaeee8bdbb3a6fe07b49`. `docs/` and `output/` are currently untracked. Remote visibility and account ownership were not independently verified.

Use an adjacent Stacki reference checkout and a separate harness source repository. Proposed layout, not folders already created:

```text
git/
  stellar/                 Product source, plans, tests and project configuration
    apps/web/              Stellar studio and client portal
    packages/contracts/    Project, tool, content and workflow contracts as needed
    packages/editor-core/  Selected Stacki-derived code, tests and MIT notice
    docs/                  Existing PRD, research, POC and provenance
  stacki-reference/        Preserved source checkout pinned to the audited revision
  <harness-repo>/          Harness source and its own release history
  agent-hub/               Existing product; reuse subject to ownership/license
```

Start with only the packages needed for the first proof. An adjacent reference checkout is a development aid, not a build dependency: Stellar CI must work without sibling directories. Keep imported editor code in Stellar or consume a reproducibly pinned package; do not import files through `../stacki-reference`. A full Stacki submodule inside the product is unnecessary unless later development specifically needs it.

## Preserve the current work before changing the root

1. Inventory tracked/untracked files; preserve the PRD, research, contracts, user mockups and useful preview evidence. Review content before committing, especially source-specific research snapshots. Exclude credentials, temporary API responses and local configuration.
2. Preserve the exact current Stacki revision in an adjacent checkout and verify it before removing anything from the product working tree. An upstream clone at its latest revision is not automatically the audited source.
3. Make a normal bootstrap branch/commit in Stellar, preserving its existing history. Do not delete `.git`, rewrite upstream history, force-push, or assume that a fresh history establishes ownership. Move research links to the reference source where extraction removes their current targets.
4. Replace the root application deliberately with the web scaffold. Bring over selected editor modules and tests when used, with upstream repository/revision and file provenance. Preserve their MIT notice. Select a separate licensing policy for original Stellar material after ownership is settled; do not overwrite the upstream notice with an exclusive-ownership claim.

No repository move, source deletion, branch/commit, clone or push has happened as part of this plan.

## Bring in the AI harness

The harness repository URL/local path has been requested. Inspect its README, agent instructions, licensing, bootstrap/update mechanism and expected directory structure before running its setup. Prefer the harness's supported installer or pinned package/release if one exists; otherwise define a small, repeatable integration rather than copying the entire repo into the product.

Apply only the intended project files: instructions, workflow/skill configuration, setup scripts and documented tool connections. Reconcile overlapping instructions with Stellar's requirements instead of blindly overwriting them. Keep credentials in their intended local/server secret stores and commit examples or secret references only.

Record the harness revision and the origin of generated configuration. Verify that setup preserves the project and its docs, works in a fresh checkout, and uses the intended development account. Distinguish this development harness from Stellar's end-user agent runtime: using the harness to build Stellar does not automatically make it a runtime dependency or give customers access to developer credentials.

The harness's authorship and employment context should be included in the same ownership review as Stellar. “I wrote it” alone does not resolve employer or contributor rights.

## First implementation slices

| Order | Deliverable | Completion evidence |
| --- | --- | --- |
| 1 | Preserved references, product scaffold and harness integration | Existing plans intact; fresh checkout starts and passes appropriate checks; original and third-party code provenance recorded; no sibling-path or secret dependency. |
| 2 | Minimal Stellar shell and project contract | Focused website workspace with one fixture project, role boundaries and an adapter boundary for the preview runner. Use Agent Hub patterns or code only where reuse rights are established. |
| 3 | Browser editor proof | A supported Astro page renders at desktop/mobile sizes; select an element, edit one token/prop, save source, reload and retain the change. Port source-preservation tests for imported editor modules. |
| 4 | Existing company-site POC | Follow [POC-01](POC-01-company-site.md): external Airtable → WP/ACF import, WPGraphQL reads, the Lead Generation page, scoped draft edits and existing WP Engine staging deployment. The app is not required to run the import. |
| 5 | Agent-assisted completion | A bounded Letta task invokes the same validated edit command as the GUI and produces a reviewable change. Add one OpenRouter-generated draft asset and WP attachment mapping after the basic page loop works. |

The detailed POC still performs the independent WP import/read/render work before integrating its real page with the canvas. The initial browser proof may use a controlled local fixture so unrelated content gaps do not block editor feasibility. Genuine HTML, Neon, the other hosting path and the wider PRD remain explicit later proofs; do not call the initial Astro slice complete product support.

## Ownership arrangement to take to counsel

Personal GitHub control, receipts, separate service accounts and development records help demonstrate provenance and spending. They do not alone resolve copyright ownership. Assuming US law, employee work within the scope of employment can be work made for hire without an express IP clause. Contractor treatment differs and the factual relationship matters. The user's jurisdiction and status are not yet known. [Copyright Office work-made-for-hire guidance](https://www.copyright.gov/register/se-hire.html), [ownership and transfers, sections 201 and 204](https://www.copyright.gov/title17/92chap2.html)

Ask an IP/employment attorney to prepare or review a signed project-specific ownership carve-out and company-use license. The business terms to resolve are:

- Identify Stellar, the harness and any existing related code; establish the intended owner and confirm exclusions from company ownership. If the company already owns relevant rights, address an actual assignment or sufficient license rather than just adding a copyright notice.
- Preserve the user's ability to develop, host, market, license and sell Stellar to other customers. Identify the owning person/entity explicitly.
- Give the company a defined nonexclusive use license. Specify internal use, client-facing use, hosting, source access, permitted modifications, distribution/sublicensing, fees, support, termination and continuity rights. “Lending the code” leaves these uncertain.
- Define who owns future improvements, company-funded changes and employee/contractor contributions, and what rights each party receives. Address company and client confidential material separately.
- If Agent Hub is company-owned, expressly cover the inbound right to reuse its identified modules in a commercially sold Stellar product; licensing Stellar to the company does not provide that reverse permission.
- Use an authorized company signatory and appropriate approval if the user also has a management/ownership role. Align the arrangement with applicable employment agreements, policies and duties.

This is a discussion checklist, not an executable legal agreement or an assurance of ownership. Copyright protects qualifying expression, such as original code, rather than the broad product idea. AI assistance also does not automatically confer copyright on wholly generated material; human authorship and other applicable rights matter. [Copyright scope](https://www.copyright.gov/help/faq/faq-protect.html), [Copyright Office AI report](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)

Keep repository preparation and public-source feasibility work moving while this is clarified. Do not treat account separation, an LLC, private repository settings, or personal token spending as a substitute for the actual ownership/license arrangement.
