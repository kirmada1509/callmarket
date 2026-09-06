<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CallMarket agent contract

Read `CALLMARKET_BUILD_SPEC.md` before planning or editing. It is the product source of truth. The product must prove that contextual, outcome-settled bidder reputation improves utility on a frozen holdout set; visual polish cannot substitute for this experiment.

## Non-negotiable invariants

- Use Zod at every LLM, tool, route, and dataset boundary.
- Benchmark truth comes from deterministic scenario verifiers, never an LLM judge.
- Invalid bidder output is recorded and settled as a failure, including its token and latency cost.
- Preserve immutable `scenarioId`, `runId`, and lineage on every derived record.
- Freeze holdout scenarios before tuning. Do not silently regenerate them during benchmark runs.
- Live Dodo/GitHub mutations are disabled unless `ALLOW_LIVE_TEST_WRITES=true`; simulators are the default.
- Never put credentials in source, fixtures, traces, screenshots, or committed environment files.
- Keep scoring and reputation math pure and deterministic. Any formula change needs a focused unit test.

## Required checks

Run `pnpm check` before handing off a worktree. Run `pnpm build` after changes to routes, server/client boundaries, or configuration. Add Playwright coverage for the three-minute demo path once it exists.

## Integration boundaries

- TensorMux is the high-volume inference provider through the AI SDK's OpenAI-compatible adapter.
- Neatlogs receives a shared conversation/run identifier across bidder, tool, verifier, retry, and settlement spans.
- Dodo and GitHub live adapters implement the same narrow tool contract as their deterministic simulators.
- Store raw evidence separately from calculated market decisions so every score remains auditable.
