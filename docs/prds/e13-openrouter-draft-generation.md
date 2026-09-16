# OpenRouter draft asset generation

Status: bounded draft for review after the [Letta command proof](e01-letta-command-proof.md) and platform acceptance. No image generation, provider setup or paid call is authorized or implemented now.

## Objective
An authorized project editor requests one image draft through a Stellar-owned job. The worker reserves a budget, invokes one allowed image-capable model/provider, imports one validated result into a scoped draft asset, and records provenance. A reasoning agent receives only the asset ID/preview; approval to place or publish is separate.

## Contract and ownership
The application derives tenant, project, actor and account from verified session/current grants. The request contains bounded prompt/reference IDs and an approved generation preset, not credentials, arbitrary URLs or model-selected account overrides. Validate access and approved reference revisions before dispatch. Text-reasoning model selection is independent from image model/tool selection.

Convex owns metadata, authorization, budget reservations, job attempts, review state and asset references. A separately selected asset store owns originals and derivatives; its selection and secure delivery remain implementation prerequisites. A job cannot succeed until the original is durably stored, type/size/content checks pass, a digest/revision exists, and its scoped asset record commits. Use a durable import identity to recover partial storage/metadata failure without regenerating the image.

## Budget and provider policy
The default budget is zero and jobs are disabled. A pilot requires an explicit per-job and per-tenant currency cap, one output, allowlisted resolution/quality, maximum input size, one concurrent generation, and maximum provider attempts. Reserve a conservative upper-bound amount transactionally before dispatch. Include uncertain previous attempts in the outstanding reservation. If the selected provider's pricing cannot be bounded for the preset, refuse the job until the configuration can be reviewed.

Pin both model and permitted provider routes. Current [image generation documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) describes provider restrictions and disabling fallback. Disable automatic SDK/HTTP retries for paid submission. A provider `max_price` filter or token limit is not a total job-spend guarantee; verify current pricing and supported limits at implementation and execution. No concrete model/pricing choice is approved in this PRD.

## Provenance and retry
Persist job/attempt ID, account/environment reference, actor/tenant/project, prompt and template version, reference asset IDs/revisions, model, requested and actual provider, parameters, timestamps, response/request/generation IDs when provided, estimates, reserved amount, actual reported usage/cost and cost-finalization status. Asset metadata includes source job, original digest, moderation/review status, rights review and approval identity. Do not log API keys or send raw unrelated client context.

State transitions: `queued → reserved → dispatched → importing → draft_ready`, with `cancel_requested`, `failed`, `outcome_unknown` and `needs_reconciliation`. Persist dispatch intent before network I/O. When a response is lost, do not create another paid generation merely because the browser retries. Reuse the same application job ID, reconcile by provider IDs when available, and retain budget reservation while outcome is uncertain. An application idempotency key does not establish provider deduplication.

The [generation metadata endpoint](https://openrouter.ai/docs/api-reference/get-a-generation) can provide cost/usage metadata for supported generation IDs. Its applicability and identifier availability must be proven for the selected image endpoint; do not assume a completion lookup recovers a lost image body or an image call that returned no ID. Without authoritative recovery, show unresolved status and require explicit approval for any new paid attempt. A cancellation request may prevent import/placement but cannot promise a refund or that provider compute stopped.

## Acceptance
- Anonymous/viewer/cross-tenant/wrong-project/revoked access fails before dispatch or asset delivery.
- Concurrent requests cannot over-reserve the configured cap; exhausted/unknown budget blocks new dispatch.
- Retried browser requests return the same job. Timeout before ID, lost response, storage failure and cost lookup failure each have distinct recoverable states; none silently regenerate.
- Actual result type/size and scoped import are validated. The draft cannot be published or projected into WP/ACF without a separate approval and adapter operation.
- An authorized one-image pilot captures usage and provenance; rejection/cancellation, export and removal of the draft are verified. Mock tests never count as that paid provider proof.

Agent Hub interoperability, DAM procurement, recurring batch generation, video, production publication and billing products are out of scope.
