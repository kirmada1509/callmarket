# CallMarket

CallMarket is an outcome-settled selection market for autonomous agents. Specialist bidders commit to an action, postconditions, confidence, cost, and stake; a deterministic policy selects one; real tool-state verification settles the prediction and updates contextual reputation.

The experiment is the product: on a frozen holdout set, CallMarket compares contextual reputation against a single-agent baseline and a market with reset memory. See [CALLMARKET_BUILD_SPEC.md](./CALLMARKET_BUILD_SPEC.md) for the complete product and demo plan.

## Local setup

Requirements: Node.js 20+, pnpm 11+, and Git.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The deterministic simulators are the default and require no external credentials. Live test-mode writes require both the relevant credentials and `ALLOW_LIVE_TEST_WRITES=true`.

## Verification

```bash
pnpm check
pnpm build
pnpm test:e2e
```

## Service boundaries

- TensorMux: OpenAI-compatible inference using `glm-4-7-flash`.
- Neatlogs: shared-run traces, detections, evaluation, and prompt versions.
- Dodo Payments: sandbox/test-mode state and mutations behind the Dodo adapter.
- GitHub: disposable demo repository operations through Octokit.
- SQLite/Drizzle: immutable run evidence, settlements, and reputation history.

Do not commit `.env.local`, production credentials, or live customer fixtures.

## Foundation safety defaults

`CALLMARKET_TOOL_MODE` defaults to `simulator`. Selecting `live` mode does not by itself authorize mutations: the shared adapter boundary rejects external writes unless `ALLOW_LIVE_TEST_WRITES` is exactly `true`. Live mode is reserved for disposable test resources; reproducible runs must use simulators.

All derived database records retain `scenarioId`, `runId`, and lineage. The initial migration enforces matching run/scenario provenance and rejects provenance updates; frozen holdout scenario rows cannot be changed.

To verify a migration against a new database:

```bash
DATABASE_URL=file:/tmp/callmarket-clean.db pnpm db:migrate
```
