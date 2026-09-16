# Parallel platform and upstream kickoff

Decision: start both workstreams now. Upstream review informs the editor before agent-driven writes; it does not block identity and project persistence. Company M2 continues independently.

- [Stacki selective upstream adoption](../exec-plans/stacki-selective-upstream-adoption.md): compare pinned 800fa52 with observed fd2a38f, triage applicability, and implement only evidenced correctness/test improvements.
- [Independent platform foundation](../exec-plans/independent-platform-foundation.md): WorkOS and Convex first; then a bounded Letta command proof and OpenRouter draft-generation plan.

Both tasks start from the committed kickoff baseline that includes e80cf4c. New task worktrees may default to older main: inspect HEAD and integrate the local kickoff commit on an isolated branch before editing. Do not alter main or the saved checkout. Launcher lifecycle work remains separately uncommitted in the saved checkout and must be coordinated rather than copied blindly.

Each task uses SOL high bounded implementation/review agents, owns its own plan/evidence, and reports any overlapping files before editing them. Upstream owns editor-core/preview research and focused fixes; platform owns auth/project state/provider contracts. Root package manifests, contracts and server dispatch require explicit coordination. No cross-task automatic merge or synchronization.

Acceptance is independent: upstream may conclude no immediate code port is warranted; platform must distinguish real provider evidence from offline tests. Neither should wait on company ACF mapping for unrelated progress. No push, deployment, paid generation or live company changes are part of this kickoff.
