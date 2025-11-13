# /deep_review — READ‑ONLY PRE‑RELEASE STABILITY REVIEW (MULTI‑AGENT)

> **Intent**  
> Run a *forensic, read‑only* review of the current repository to surface **all correctness, reliability, data‑integrity, and edge‑case issues** that would stop us from using every feature **100× in a row** on an iPhone developer build without crashes or unhandled errors.  
> **De‑emphasize** last‑minute production hardening (secrets placement, CI/CD polish, infra configs). Log those as `prod-later` notes only.

---

## Context (anchor this review)
- Release target ≈ **1 month** out. Not public yet; we cannot rely on live user feedback loops.
- Current data: **52 demo restaurants** (placeholders). Launch goal: **~1,500 signed restaurants** before release.
- Domain: B2B2C restaurant reservations (discovery → availability/slotting → create/modify/cancel/waitlist → notify). Any payments or holds should be treated as idempotent actions if present.

**Do not write to the repo.** No PRs, no edits, no formatting changes. If you must produce artifacts, output them inline in this session.

---

## Agent choreography (when multiple agents are enabled)
- **Planner/Coordinator (Claude Sonnet 4.5):** Draft the plan, break work into parallel tracks, and merge results into a single report.
- **Static & Runtime Analyst (GPT‑5 Codecs — High):** Line‑by‑line reasoning on hot paths; logic errors; algorithmic complexity; type/contract mismatches; error‑handling gaps; performance foot‑guns.
- **Adversarial/Edge Explorer (Claude Opus 4.1):** Generate failure scenarios, race conditions, timezone/DST traps, idempotency violations, and destructive edge cases; attempt to invalidate assumptions.

> Coordinator announces assignments up front, then requests parallel analysis, then reconciles conflicts and builds the final prioritized list.

---

## Operating rules
- **Read‑only:** Never change files, configs, or dependencies. Don’t run commands that mutate the workspace. Avoid hitting real third‑party endpoints; prefer mocks/fixtures if present.
- **Be specific:** Every finding must cite **file:line** (or function/class), include a **minimal reproduction path**, and explain **why** it fails.
- **Prioritize by user/business impact:** Focus on issues that break core flows or corrupt data before polish.

---

## Review plan (execute step‑by‑step)

### 0) Tailored plan
Produce a one‑screen, repo‑specific plan: critical components, suspected risk areas, and the order of attack. Then proceed.

### 1) Repo map & hot‑spot scan
- Enumerate: entrypoints, modules, services, mobile app targets, background jobs, migrations, test suites, scripts.
- Use `git` history to flag **high‑churn + complex** files as hot spots. Start reviews there.

### 2) Dependency & environment (current‑state only)
- Inventory all dependency manifests (e.g., `package.json`, `requirements.txt`, `pyproject`, `Podfile`, `Gemfile`, lockfiles).
- Flag **version conflicts, native module gotchas, reproducibility gaps**. Only note security issues that break features **now**. Secrets hygiene → `prod-later`.

### 3) Build & analyzer smoke (non‑destructive)
- Identify and (if safe) run **read‑only analyzers** (linters, type checkers, static analyzers). Capture warnings/errors inline.  
- If tests require writing coverage files, **do not run them**; instead, statically map untested branches.

### 4) Feature‑flow deep dive (restaurant domain)
For each flow, trace code paths and validate invariants:
- **Discovery/search/list:** filters, pagination, empty states, location permissions.
- **Availability/slotting:** timezone & locale, **DST boundaries**, business hours/closures/overrides, lead times, party sizes, seating duration, **no overbooking**.
- **Create/modify/cancel reservation:** idempotency (rapid taps/retries), retries/backoff/timeouts, optimistic UI ↔ server truth, state rollback on failure, user‑visible errors.
- **Waitlist/queue:** join/promote/expire/notify; duplicate messages and race windows; abandonment handling.
- **Staff/console (if present):** schedule and capacity edits; propagation; cache invalidation.
- **Auth/session/tenancy:** token refresh & revocation; user vs. restaurant‑staff isolation; deep links; background transitions.
- **Offline/poor network:** queued mutations, replay semantics, de‑dupe to prevent **ghost bookings** or **double actions**.

### 5) Data model & integrity
- Review schemas, migrations, FKs, unique constraints, cascades.  
- Define and check invariants (examples):  
  - **No double booking** of (restaurant/resource/timeslot)  
  - Capacity never < 0  
  - Legal reservation lifecycle only (requested → pending‑hold → confirmed → seated → completed/canceled/no‑show)  
  - Time windows valid across zones, including DST transitions  
- Surface N+1 queries, unbounded scans, missing indexes in hot reads/writes.

### 6) Concurrency/async & background work
- Queues, schedulers, push notifications, webhooks, background fetch.  
- Verify **idempotency keys**, de‑duplication, retry policies (bounded with backoff), **poison message** handling, and safe re‑entrancy on duplicate deliveries.

### 7) Error handling & resilience
- Locate all `try/catch` / error mappers. No swallowed exceptions.  
- **Map external I/O failure modes** (timeouts, 4xx/5xx, partial responses) to user‑safe states. Ensure every network call has a timeout.

### 8) Performance (stability‑first)
- Call out O(N²) or unbounded loops, synchronous I/O on UI thread, large payloads without pagination, heavy (de)serialization, image sizing, obvious memory leaks/retain cycles.

### 9) Testing gap assessment (read‑only)
- Map coverage **by scenario** (not just percentage): core flows, edge cases, concurrency, time math.  
- Propose **concrete tests** to add (unit/integration/e2e/property‑based/soak), each with name + given/when/then + required fixtures. Do **not** add tests yourself.

---

## Prioritization model
- **P0 Blocker:** crash/data loss/cross‑tenant access/incorrect booking; prevents core flow.  
- **P1 High:** wrong results, stuck states, broken but recoverable core path.  
- **P2 Medium:** edge‑case failure, inconsistent UI/state with workaround.  
- **P3 Low:** minor or polish.

Add **Likelihood** (High/Med/Low) and **Confidence** (High/Med/Low).

---

## Deliverables (single structured report)
1. **Top‑10 Blockers (executive summary)** — bullets with impact in plain language.
2. **Prioritized Defect Backlog** — for each:  
   - *ID • Title • Severity • Likelihood • Confidence • Affected feature(s) • User/Restaurant impact*  
   - *Evidence* (file:line + short snippet or stack)  
   - *Minimal repro* (exact steps or input)  
   - *Failure mode & why it happens*  
   - *Fix sketch* (concept only — **no code**)  
   - *Regression tests to add* (names + intent)  
   - *Related findings/dependencies*
3. **Data Invariants Catalog** — explicit invariants and where they must be enforced (validation, DB constraints, job guards).
4. **Concurrency/Idempotency Summary** — risks and required guards.
5. **Test Gap Matrix** — missing scenarios (unit/integration/e2e/property/soak) and proposed fixtures.
6. **`prod-later` Notes** — secrets hygiene, CI/CD/infra hardening, monitoring, rate‑limiting/WAF, etc. (one‑liners with pointers only).

---

## Reporting style
- Keep items atomic and evidence‑backed.  
- Prefer numbered bullets and small tables over prose.  
- Default to the **server as source of truth**; ensure clients invalidate/refresh caches on mutations and on app resume.  
- Always consider **timezone/DST/locale** and **idempotency** for mutations.

---

## (Optional) Arguments
If `$1` is provided, treat it as a **path filter** (review only that sub‑tree). If `$2` is provided, treat it as **depth**: `shallow|normal|exhaustive` (default: `exhaustive`).  
You may reference the full tail as `$ARGUMENTS`.

---

## Kickoff
1. **Planner**: emit the tailored plan and assignments.  
2. **Analysts (in parallel)**: execute sections 1–9 with findings formatted per the backlog spec.  
3. **Planner**: deduplicate, resolve conflicts, and deliver the final report, including `prod-later` notes.

> End state: **No unknown P0/P1 risks** remain, and every critical flow has deterministic, reproducible test ideas for stabilization.

