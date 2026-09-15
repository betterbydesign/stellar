# Review an offline content import plan

The content planner is a developer command for reviewing intended WordPress changes from local JSON inputs. It works without starting Stellar, WordPress or Airtable. It performs no import or publication. The Projects and Studio screens retain the M1 editor behavior; there is no content-import dashboard yet.

## Try the synthetic example

From the repository root, install dependencies and build the planner:

```sh
npm ci
npm run build --workspace=@stellar/content-import
npm run content:plan:example
```

The example uses invented content and identifiers in [the package fixtures](../../packages/content-import/fixtures/). It demonstrates a page, shared content, ACF field bindings, taxonomy terms/assignments and media intent. It does not represent approved company schema or imported company records.

For an exact JSON document without npm's command headings:

```sh
npm run --silent content:plan:example
```

Use your own version-compatible, normalized inputs with:

```sh
npm run --silent content:plan -- --mapping mapping.json --source source.json --target target.json
```

Each input must be a regular JSON file of at most 8 MiB. The source snapshot supplies complete root-view membership and typed fields; the mapping declares targets, forward dependencies and ownership; the target inventory supplies observed state and schema/planning evidence. See the [package contract](../../packages/content-import/README.md) for exact shapes. Raw Airtable API responses and the older company research draft are different formats and are rejected by this command.

## Read the result

A ready plan contains proposed `create`, `update` and `noop` operations, input/plan digests and observed target revisions. A blocked plan contains diagnostic codes and blocked operations. Every result reports `writesAttempted: 0`. Run the same unchanged inputs again to reproduce the result. Changes to meaningful input data produce a different review digest.

| Exit code | Meaning | Next action |
| --- | --- | --- |
| 0 | Offline plan is ready for review | Inspect the exact operations and ownership; no executor or live authorization is implied |
| 1 | Usage, JSON or contract input is invalid | Correct the named input/path/code; raw parser messages and input values are omitted |
| 2 | Inputs are valid but planning is blocked | Resolve the reported missing evidence, scope, ownership or dependency condition and replan |

New post intent is draft-only. Managed fields can appear in import intent; WP-owned fields are preserved. Terms and attachments require an explicit non-draftable side-effect policy for the selected environment. Global options, publishing, deletion and unpublishing have no writer in this version. Replan from fresh target state before a future executor applies changes; an old report or approval-shaped JSON is not write permission.

## Check the company research draft

```sh
npm run content:audit:company
```

This separate audit checks [the saved mapping](../contracts/company-airtable-acf-map.v0.1.json) against [the saved schema snapshot](../research/airtable-schema-snapshot.json). Its current result is **blocked**, with 71 bindings, 16 tables, 176 fields, seven body sections, one global section and one selected root. Exit code 2 is the expected report for this unfinished mapping.

The audit identifies unresolved target field keys/schema, taxonomy, record values, media identities and target inventory. Global ACF options also need a separate policy because they lack a post draft boundary. This legacy research format always remains non-executable even if someone adds approval-shaped values to it. The audit validates evidence consistency; it does not fetch fresh Airtable records or inspect a live WordPress schema.

The next task is [M2-02](../prds/m2-02-wordpress-model-and-ownership.md): prepare the actual company schema and shared ownership service. The independently runnable writer arrives in [M2-03](../prds/m2-03-independent-seed-executor.md).
