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
