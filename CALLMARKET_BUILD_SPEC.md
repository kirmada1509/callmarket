# CallMarket — Product and Build Specification

## 1. Product definition

### One-line pitch

CallMarket is an orchestration layer in which agents must forecast the result, cost, and latency of a proposed tool action before receiving authority to execute it; verified outcomes continuously update which agents receive budget and control in similar future situations.

### Judge-facing thesis

Most multi-agent systems choose an agent by a static router, majority vote, or a supervisor LLM. CallMarket instead makes operational authority earned and revocable: bidders publish falsifiable forecasts, a market selects the best risk-adjusted proposal, and a deterministic verifier settles the result. The system's growing memory is an auditable forecast-and-reputation ledger rather than a transcript or vector store.

### Problem

An agent can sound confident without being calibrated. Existing orchestrators usually cannot answer:

- Which agent is reliably correct for this kind of tool state?
- Was its confidence justified by the eventual API outcome?
- Is the reliability gain worth its extra tokens and latency?
- When should a cheap agent act, when should a careful agent verify, and when should a human be involved?
- Does knowledge about a capability such as stateful mutation transfer to a new tool domain?

CallMarket answers these questions from settled historical predictions.

### Target user

The primary user is an engineer or operations team deploying autonomous agents over stateful third-party APIs. The hackathon demo uses payment operations and repository operations, but the product abstraction is domain-independent.

### Core user journey

1. The user submits a task and risk policy.
2. CallMarket derives a machine-readable context from current tool state.
3. Three bidder agents independently propose an action, postconditions, success probability, expected tokens, expected latency, and an escalation decision.
4. The market maker combines the bid with context-specific historical reputation and selects one proposal.
5. The selected action runs in a sandbox or test account.
6. A deterministic verifier checks actual postconditions.
7. The market settles the forecast, updates reputation and bankroll, and records the full trace.
8. The dashboard explains why the winner was selected and how the result changes future authority.

## 2. Product principles

1. **No subjective settlement.** An LLM may propose an action but may not grade whether that action succeeded.
2. **Every confidence number is falsifiable.** A bid must name postconditions that can be checked against resulting tool state.
3. **Authority follows demonstrated calibration.** Confidence alone never earns influence.
4. **Cost and latency are first-class outcomes.** An expensive win can lose to a sufficiently reliable cheaper policy.
5. **Human escalation is a valid action.** It is correct when policy requires review, not an automatic failure.
6. **Training and holdout scenarios are isolated.** Improvement claims must be computed on a frozen holdout set.
7. **Real APIs prove realism; deterministic simulators prove reproducibility.** The benchmark uses simulators, while the demo includes at least one live test-mode interaction per available external domain.
8. **The mechanism must remain legible.** A judge should be able to trace task → bids → selection → tool result → settlement → reputation update in under 30 seconds.

## 3. Deliberate scope

### Must ship

- Three fixed bidder archetypes:
  - **Sprinter:** lowest token and latency budget; acts with minimal verification.
  - **Inspector:** reads current state, validates assumptions, and uses idempotent execution.
  - **Skeptic:** optimized for detecting ambiguity and selecting human escalation when required.
- A typed bid contract with action, arguments, predicted postconditions, probability, predicted cost, predicted latency, rationale, and stake.
- A deterministic market-selection function.
- Brier-score settlement for binary success forecasts.
- Context-conditioned reputation with hierarchical fallback.
- Virtual bankrolls that affect future bidding capacity or selection influence.
- A deterministic tool simulator for both demo domains.
- Seeded scenario generation and a frozen train/holdout split.
- Baseline implementations:
  - one static agent;
  - majority vote;
  - equal-weight ensemble;
  - CallMarket.
- A dashboard showing live runs, bids, selection, settlement, bankrolls, contextual reputation, and benchmark comparisons.
- TensorMux-backed bidder calls using `glm-4-7-flash`.
- Neatlogs instrumentation for workflow, bidder, market, tool, verifier, and settlement spans.
- At least one Dodo test-mode or fixture-backed payment workflow.
- At least one GitHub test-repository or deterministic fixture-backed repository workflow.
- Automated tests for scoring math, market selection, reputation updates, simulators, dataset isolation, and end-to-end runs.
- AO used from repository initialization through final merge, with visible worker and PR history for the demo.

### Should ship

- A live Dodo sandbox read/write operation if verification is available.
- A live GitHub issue-label or close/reopen operation in a disposable repository.
- Confidence intervals on benchmark metrics.
- Replay of any benchmark run from its seed.
- A context-transfer view showing a new domain inheriting capability-level reputation.
- A Neatlogs detection for overconfident failure, excessive tool calls, and latency budget violations.

### Explicitly out of scope

- Natural-language rule promotion or a separate strategy-law system.
- Genetic evolution, prompt mutation, or architecture search.
- A decentralized, blockchain, token, or real-money market.
- More than three bidders.
- More than two demo domains.
- Complex auction clearing, order books, or zero-sum economics.
- Training or fine-tuning a model.
- 3D visualizations, avatars, or simulated trading-floor theatrics.
- Authentication, organizations, billing, or general SaaS administration.
- Production writes against real customer or repository data.
- An LLM judge used as the source of benchmark truth.

## 4. Demo domains

### Domain A: Dodo payment operations

Representative tasks:

- Decide whether a refund request may proceed, must no-op, or requires human review.
- Decide whether a subscription action is still appropriate after an event delay.
- Handle duplicated or out-of-order webhook events.
- Avoid repeating a state-changing action after a timeout or ambiguous response.

Generated state dimensions:

- payment status;
- refund status;
- dispute status;
- subscription status;
- event age relative to resource update time;
- duplicate-event count;
- previous idempotency key;
- API timeout or malformed response;
- policy materiality or human-review requirement.

Allowed actions should be narrowly defined: `fetch_current_state`, `refund`, `cancel_subscription`, `no_op`, and `escalate`. The simulator owns the truth table and final postconditions. During implementation, live Dodo behavior must be taken from current official API documentation rather than inferred from fixtures.

### Domain B: GitHub repository operations

Representative tasks:

- Apply or remove an issue label after receiving a potentially stale event.
- Close an issue only when its current state and linked-work status permit it.
- Avoid duplicating a mutation following an ambiguous timeout.
- Escalate when repository policy and the requested mutation conflict.

Generated state dimensions:

- issue state and labels;
- linked PR state or checks;
- event age relative to current issue update;
- prior mutation/idempotency record;
- permissions;
- API timeout or malformed response;
- policy ambiguity.

The two domains share capability tags such as `stateful_mutation`, `stale_event`, `ambiguous_write`, `schema_validation`, and `human_gate`. These shared tags make cross-domain reputation transfer testable.

## 5. System mechanism

### 5.1 Task context

Every task is normalized to:

```ts
type TaskContext = {
  taskId: string;
  domain: "dodo" | "github";
  operationClass: "read" | "reversible_write" | "irreversible_write";
  capabilityTags: string[];
  eventAgeBucket: "fresh" | "stale" | "unknown";
  stateVolatility: "low" | "medium" | "high";
  schemaHealth: "valid" | "malformed" | "unknown";
  ambiguity: "low" | "medium" | "high";
  failureCost: number;
  latencyBudgetMs: number;
  tokenBudget: number;
};
```

Context extraction can use an LLM for normalization, but capability tags needed by the benchmark must also be derivable deterministically from generated scenario metadata.

### 5.2 Bid contract

All bidders return structured output validated with Zod:

```ts
type Bid = {
  bidderId: "sprinter" | "inspector" | "skeptic";
  action: {
    tool: string;
    arguments: Record<string, unknown>;
  };
  predictedPostconditions: Array<{
    path: string;
    operator: "eq" | "neq" | "contains" | "unchanged";
    value?: unknown;
  }>;
  successProbability: number; // [0.01, 0.99]
  expectedTokens: number;
  expectedLatencyMs: number;
  stake: number;
  rationale: string;
};
```

Invalid structured output is a settled bidder failure, not silently repaired without accounting for its cost.

### 5.3 Reputation hierarchy

Maintain reputation at three levels:

1. Global bidder reputation.
2. Capability reputation, such as `inspector × stateful_mutation`.
3. Exact context bucket, such as `inspector × stale_event × irreversible_write × high_ambiguity`.

Use shrinkage so sparse exact-context data falls back toward capability and global history. The implementation may use weighted exponentially decayed averages for the MVP:

```text
effective_reputation =
  0.55 * exact_context_score_if_supported +
  0.30 * capability_score +
  0.15 * global_score
```

If an exact bucket has fewer than five settled runs, reduce its weight and transfer the unused weight to capability and global scores. Persist sample counts so the UI can distinguish strong evidence from a lucky result.

### 5.4 Market selection

Use a deterministic and inspectable selection score:

```text
calibrated_success = 0.65 * bid_probability + 0.35 * effective_reputation

selection_score =
  calibrated_success * task_value
  - (1 - calibrated_success) * failure_cost
  - token_weight * normalized_expected_tokens
  - latency_weight * normalized_expected_latency
  + stake_weight * normalized_stake
```

All weights come from a visible risk policy. The dashboard must show the term-by-term calculation for every bidder.

### 5.5 Settlement

The verifier returns `y = 1` when all required postconditions and policy constraints pass, otherwise `y = 0`.

```text
brier_loss  = (p - y)^2
brier_score = 1 - brier_loss
```

Update:

- global, capability, and context reputation;
- bidder bankroll;
- task and tool-call statistics;
- overconfidence and underconfidence counters.

Bankroll updates should be bounded:

```text
bankroll_delta = stake * (brier_score - 0.5)
```

Clamp bankrolls to a configured minimum and maximum. Bankroll changes future maximum stake and a small portion of selection influence; it must not make an early winner permanently unbeatable.

### 5.6 Transfer experiment

Train first on Dodo scenarios containing stale events and ambiguous writes. Then introduce GitHub as an unseen domain while retaining capability-level reputation and clearing domain-specific exact buckets.

Compare:

- GitHub cold start with all reputation reset;
- GitHub cold start with capability reputation transferred.

The transfer claim succeeds only if the second condition improves a frozen GitHub holdout metric without increasing unsafe action rate.

## 6. Benchmark design

### Dataset

- Use deterministic seeds committed to the repository.
- Generate at least 200 training scenarios per domain and 100 holdout scenarios per domain.
- Balance ordinary and adversarial cases; do not let the benchmark be dominated by trivial no-op tasks.
- Store only seeds and generator versions when possible, avoiding hand-edited expected results.
- Freeze `holdout-manifest.json` before running the learning experiment.

### Baselines

1. **Static Sprinter:** always use the cheap bidder.
2. **Static Inspector:** always use the careful bidder.
3. **Majority vote:** choose the action proposed by at least two bidders; fixed tie-breaker.
4. **Equal ensemble:** average bidder confidence without historical reputation.
5. **CallMarket:** context reputation, cost/latency utility, and bankroll.

### Primary metrics

- task completion rate;
- unsafe action rate;
- correct escalation rate;
- Brier loss and expected calibration error;
- tokens per successful task;
- tool calls per successful task;
- p50 and p95 latency;
- expected utility under the configured risk policy;
- capability-transfer lift on the unseen-domain holdout.

### Statistical presentation

- Report sample size with every result.
- Show bootstrap 95% confidence intervals for completion rate and expected utility.
- Use the same scenarios for every baseline.
- Do not claim improvement when intervals substantially overlap; describe it as inconclusive.
- Preserve raw run records and seeds for judge inspection.

## 7. User interface

### Screen 1: Market Arena

The primary demo screen contains:

- task and current tool state;
- three bidder cards arriving in parallel;
- action, confidence, predicted cost, latency, stake, and contextual reputation;
- expandable selection-score calculation;
- selected bidder and executed tool call;
- verifier result;
- animated but numerically precise settlement and bankroll update.

### Screen 2: Reputation Ledger

- bidder bankrolls;
- global calibration;
- capability reputation matrix;
- exact context buckets and sample counts;
- overconfident failure history;
- links from every score to supporting runs.

### Screen 3: Improvement Lab

- baseline selector;
- train/holdout indicator;
- completion, unsafe action, Brier, token, latency, and utility charts;
- generation/run index on the x-axis—not fabricated “Day 1/Day 30” labels;
- transfer experiment comparing reset versus capability-memory conditions;
- replay button for any outlier.

### Visual direction

Use a sober operations-terminal aesthetic rather than casino imagery. Suggested palette: charcoal background, off-white text, green for verified value, amber for uncertainty, red for violated postconditions, and muted blue for historical evidence. Avoid coins, confetti, stock charts, and gambling language in the finance-adjacent Dodo workflow.

## 8. Technical architecture

### Stack

- TypeScript end to end.
- Next.js with App Router for UI and server routes.
- Tailwind CSS and a small component library such as shadcn/ui.
- SQLite with Drizzle ORM.
- Zod for every boundary schema.
- Official OpenAI JavaScript client configured with TensorMux's base URL and model.
- Neatlogs TypeScript instrumentation.
- Octokit for the optional live GitHub adapter.
- Official Dodo SDK or direct documented HTTP calls for the optional live adapter.
- Vitest for unit and integration tests.
- Playwright for the critical demo path.
- Recharts or an equivalent lightweight charting library.

### Suggested repository layout

```text
src/
  app/
    arena/
    ledger/
    lab/
    api/
  core/
    types.ts
    context.ts
    scoring.ts
    reputation.ts
    market.ts
    settlement.ts
  bidders/
    base.ts
    sprinter.ts
    inspector.ts
    skeptic.ts
    tensormux.ts
  tools/
    contract.ts
    dodo-simulator.ts
    github-simulator.ts
    dodo-live.ts
    github-live.ts
  evals/
    generators/
    baselines/
    runner.ts
    metrics.ts
    bootstrap.ts
  db/
    schema.ts
    repository.ts
  observability/
    neatlogs.ts
  components/
scripts/
  generate-dataset.ts
  freeze-holdout.ts
  run-benchmark.ts
  seed-demo.ts
tests/
  unit/
  integration/
  e2e/
```

### Data entities

- `tasks`
- `contexts`
- `bids`
- `market_decisions`
- `tool_executions`
- `verifications`
- `settlements`
- `reputation_buckets`
- `bankroll_events`
- `benchmark_runs`
- `benchmark_metrics`

Every derived record must point back to immutable run and scenario IDs.

## 9. Observability and sponsor integration

### TensorMux

- Configure the OpenAI client with `https://api.tensormux.com/v1` and `glm-4-7-flash`.
- Run three bidder calls concurrently.
- Require structured JSON output and validate it locally.
- Record actual prompt, completion, token count, and latency per bidder.
- Use deterministic simulator truth rather than the model to score outcomes.

### Neatlogs

Create one root workflow trace per market run with child spans:

```text
CALLMARKET_RUN
  CONTEXT_EXTRACTION
  BIDDER_SPRINTER
  BIDDER_INSPECTOR
  BIDDER_SKEPTIC
  MARKET_SELECTION
  TOOL_EXECUTION
  POSTCONDITION_VERIFIER
  MARKET_SETTLEMENT
  REPUTATION_UPDATE
```

Attach task ID, scenario seed, bidder ID, context tags, predicted probability, actual outcome, Brier loss, expected/actual cost, expected/actual latency, selection score, and bankroll delta as attributes. Configure detections for overconfident failure (`p >= 0.8 && outcome == 0`), tool-call loops, latency-budget violations, and invalid structured output.

### Dodo Payments

- Use test mode only.
- Verify every endpoint and event field against current official documentation during implementation.
- Treat webhooks as event notifications and retrieve current state before consequential actions when the scenario requires it.
- Keep the simulator adapter and live adapter behind the same interface.
- Never block the reproducible benchmark on sandbox availability.

### AI Grants India

This integration is optional. If GPT-5 Nano access is granted, add it as a benchmark bidder or arbiter only after the four baseline systems and TensorMux implementation are complete. Do not make submission success dependent on access approval.

## 10. AO and Codex 5.6 Sol execution plan

### Repository prerequisite

The current directory is not yet a Git repository. Initialize Git, create the first specification commit, connect a public GitHub repository, and register the project with AO before feature implementation begins. All meaningful implementation must happen in AO worker worktrees so the final demo contains genuine session and PR history.

### Codex operating contract

Codex 5.6 Sol should be given this entire specification plus a short workstream-specific prompt. Each worker must:

1. Inspect existing code and contracts before editing.
2. Own a non-overlapping file surface where possible.
3. Add tests with the implementation.
4. Run lint, typecheck, unit tests, and relevant integration tests.
5. Commit cohesive changes and open one focused PR.
6. Include exact acceptance evidence in the PR summary.
7. Avoid silently changing shared schemas; schema changes require an explicit integration PR.
8. Stop adding features once its acceptance gate passes.

Use higher reasoning effort for the scoring/reputation contracts, benchmark methodology, and final integration review. Use medium effort for deterministic adapters, UI implementation, fixtures, and mechanical test coverage. GPT-5.6 Sol supports structured outputs and tool use and has a large context window, so keeping this full specification in the orchestrator context is preferable to repeatedly paraphrasing it.

### AO workstreams

#### Workstream A — Foundation and contracts

Ownership:

- project bootstrap;
- shared Zod types;
- database schema;
- simulator tool contract;
- test and CI configuration;
- environment example file.

Acceptance gate:

- application boots;
- migrations run from a clean database;
- all shared contracts have tests;
- CI runs lint, typecheck, unit tests, and build;
- no real external write can run unless `ALLOW_LIVE_TEST_WRITES=true`.

This workstream merges first.

#### Workstream B — Market and learning core

Ownership:

- context hierarchy;
- selection math;
- Brier settlement;
- reputation fallback and decay;
- bankroll ledger;
- static baselines.

Acceptance gate:

- scoring formulas pass hand-calculated fixtures;
- an overconfident incorrect forecast loses more reputation than a cautious incorrect forecast;
- sparse contexts fall back correctly;
- early wins cannot permanently monopolize selection;
- identical inputs produce identical market decisions.

#### Workstream C — Bidders and TensorMux

Ownership:

- bidder archetypes and prompts;
- concurrency;
- structured-output validation;
- retries and failure accounting;
- token and latency capture.

Acceptance gate:

- all three bidders satisfy the same contract;
- calls run concurrently;
- invalid output becomes a recorded failure;
- the system can run with deterministic stub bidders in CI;
- TensorMux smoke test passes when credentials are present.

#### Workstream D — Domains and evaluation

Ownership:

- Dodo and GitHub simulators;
- seeded scenario generators;
- deterministic verifiers;
- holdout freezing;
- baseline runner;
- metrics and bootstrap intervals.

Acceptance gate:

- all scenarios replay from seeds;
- no training code imports the holdout manifest;
- adversarial states include stale events, duplicates, ambiguous timeouts, malformed output, and human gates;
- each baseline runs against identical scenarios;
- transfer experiment can reset exact/domain memory while preserving capability memory.

#### Workstream E — Product UI

Ownership:

- Arena, Ledger, and Lab screens;
- streaming or polling run progress;
- score-breakdown component;
- charts and replay;
- responsive demo layout.

Acceptance gate:

- a complete run is understandable without terminal output;
- every displayed metric comes from stored run data;
- any reputation score links to contributing runs;
- the main demo path passes Playwright at the intended recording resolution.

#### Workstream F — Observability and live adapters

Ownership:

- Neatlogs instrumentation and detections;
- optional Dodo live adapter;
- optional GitHub live adapter;
- redaction and environment safety.

Acceptance gate:

- one run appears as the required nested trace tree;
- sensitive environment values never enter trace attributes;
- simulator and live adapters conform to the same contract;
- live writes are restricted to explicit test resources.

#### Workstream G — Integration, benchmark, and release

Starts after B–F are individually green.

Ownership:

- resolve integration issues;
- freeze benchmark configuration;
- execute final benchmark;
- seed deterministic demo state;
- create README and architecture diagram;
- rehearse and test the video path flow;
- prepare deployment and submission artifacts.

Acceptance gate:

- clean clone installs and runs from README;
- benchmark completes without manual intervention;
- raw benchmark artifacts are committed or downloadable;
- final metrics are generated, never hard-coded;
- live demo has a simulator fallback;
- public deployment and repository are reachable;
- AO session/PR history is captured for the video.

### Dependency order

```text
A: contracts
├── B: market core ───────┐
├── C: bidders ───────────┤
├── D: domains/evals ─────┼── G: integration/release
├── E: UI ────────────────┤
└── F: observability ─────┘
```

Do not start parallel implementation before Workstream A's schemas are merged. Most avoidable multi-agent integration failures come from allowing workers to invent incompatible domain types.

## 11. Suggested 15-hour schedule

### Hour 0–1

- Initialize Git and public GitHub repository.
- Commit this specification.
- Configure AO.
- Launch Workstream A.
- Request Dodo sandbox and Neatlogs credentials in parallel.

### Hours 1–3

- Merge A.
- Launch B, C, D, E, and F through AO as capacity permits.
- Ensure every worker has explicit ownership and acceptance tests.

### Hours 3–7

- Complete market core, simulators, stub bidders, database, and first Arena UI.
- Run an end-to-end deterministic market before integrating live inference.
- Fix shared-contract issues through a dedicated integration PR.

### Hours 7–10

- Integrate TensorMux and Neatlogs.
- Complete baseline runner and transfer experiment.
- Add live Dodo/GitHub smoke paths if credentials are ready.

### Hours 10–12

- Run pilot benchmarks.
- Inspect failures and correct methodology or implementation defects.
- Freeze prompts, seeds, weights, holdout manifest, and final benchmark configuration.

### Hours 12–13

- Run the final benchmark once from the frozen configuration.
- Generate charts and store raw artifacts.
- Finish README and deployment.

### Hours 13–14

- Rehearse and record the three-minute demo.
- Capture AO and Neatlogs evidence.
- Record a fallback take using deterministic simulators.

### Hours 14–15

- Fix only submission blockers.
- Publish the video and repository.
- Complete Devpost fields and submit with buffer.

## 12. Three-minute demo specification

### 0:00–0:18 — The problem

Show three agents proposing different actions for the same stale Dodo event. State: “Today, the most confident agent usually wins. CallMarket makes confidence accountable.”

### 0:18–0:48 — Cold-start market

Show all bids, probabilities, predicted cost, latency, and stakes. Expand the transparent selection calculation and execute the winner.

### 0:48–1:08 — Settlement

The verifier reveals that the confident cheap bidder acted from stale state. Show its Brier loss, bankroll decrease, and capability reputation update.

### 1:08–1:38 — Learning in later runs

Time-lapse a seeded training batch. Keep the capability reputation matrix and unsafe-action count visible while authority shifts toward the better-calibrated bidder for risky writes.

### 1:38–2:05 — Cross-domain transfer

Introduce GitHub as a new domain. Compare a complete reputation reset against capability-level transfer on the same hidden scenarios; replay one case where transferred stateful-mutation reputation changes the selected bidder.

### 2:05–2:34 — Measured proof

Show the frozen holdout table comparing static Sprinter, static Inspector, majority vote, equal ensemble, and CallMarket. Highlight completion rate, unsafe actions, Brier loss, tokens per success, p95 latency, expected utility, sample size, and confidence intervals.

### 2:34–2:50 — Trace proof

Open the Neatlogs trace and move through bidder forecast → market decision → tool response → deterministic verifier → settlement. Do not scroll through raw logs.

### 2:50–3:00 — Build proof

Show the AO board, isolated worktrees, PRs, and a CI failure returned to and fixed by its owning worker. End on: “CallMarket: operational authority earned by verified calibration.”

## 13. Definition of done

The project is ready to submit only when all of the following are true:

- A judge can run a full market round from the UI.
- Three distinct bids appear with validated structured outputs.
- The winner is selected by visible deterministic math.
- The resulting tool state is verified without an LLM judge.
- Reputation and bankroll visibly update after settlement.
- Later selection changes because of settled history.
- The benchmark compares CallMarket with at least three simpler baselines on identical frozen holdout scenarios.
- Cross-domain capability transfer is measured separately from same-domain learning.
- All displayed numbers derive from persisted raw runs.
- Neatlogs shows the complete run tree.
- The application has deterministic simulator fallbacks.
- Unit, integration, and critical Playwright tests pass.
- The repository is public and reproducible from its README.
- The demo visibly proves AO usage.

## 14. Kill order if schedule slips

Cut features in this order:

1. AI Grants India integration.
2. Live Dodo writes; retain documented fixtures and a live read if possible.
3. Live GitHub writes; retain a live read and simulator mutation.
4. Advanced chart interactions.
5. Reputation decay controls in the UI.
6. Bankroll animations.

Never cut:

- deterministic verification;
- frozen holdout evaluation;
- baseline comparison;
- contextual reputation updates;
- one demonstrated later decision changed by learning;
- Neatlogs trace evidence;
- AO build evidence.
