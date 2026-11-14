---
name: agents
description: "Area agents for GroupBasket: applications, the 2 km clash, deposits, weekly hours, suspension, leaving and losses, agent screens and the Agents and orders admin workspace."
---

# Agents

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

Policy references: `AGT-001`–`AGT-005`, `ORD-005`, `BSK-006`, `RETURN-001`, `ADMIN-002`,
`UX-002`.

Built 2026-11-15: agents earn the full 5% agent fee and pay their own couriers (`DEC-018`),
resell buyer-fault returns privately and mark them Sold or Taken back (`markResold`,
`markTakenBack`, `/agent/returns` To resell), and cannot close while holding one (`DEC-017`).

## Ownership and code

- Services: `src/server/agents/` — `apply.ts` (`applyAsAgent`), `admin.ts` (`decideAgent`,
  `suspendAgent`, `liftSuspension`, `recordLoss`), `deposit.ts` (`startDeposit`,
  `agentDepositPaid`), `hours.ts` (`setHours`), `leave.ts` (`requestLeave`,
  `closeLeavingAgents`, `collectHeldReturns`), `live.ts` (`liveAgents` for checkout),
  `screens.ts` (agent home lists), `admin-screens.ts` (Agents and orders admin lists),
  `common.ts` (statuses, `requireAgentsAdmin`, `withAgent`).
- Pure rules: `src/lib/agent-rules.ts` (`clashesWith`, `nearestAgents`, `openNow`),
  `src/lib/agent-hours.ts` (`formatHours`, map links).
- Pages: `src/app/agent/` (Home, Pickups, Returns, Tokens, Hours, deposit result),
  `src/app/agents/apply/` (public), `src/app/admin/agents/`. Private photos:
  `src/app/api/agent-photos/[id]/`.
- Gates: `requireAgent()` in `src/server/auth/session.ts`, `assertAgent`, `AGENT_ACCESS`.
- Handover and returns services belong to [orders-baskets](orders-baskets.md); courier receipt to
  [courier](courier.md); the deposit payment to [payments](payments.md).

## Implementation guards

- Statuses: `APPLIED → APPROVED → LIVE`, plus `SUSPENDED`, `LEAVING`, `LEFT`, `REJECTED`. The
  `AGENT` role stays after `LEFT`, so every agent page and action must also gate on
  `Agent.status`. Only `LIVE` agents take new orders; `SUSPENDED` and `LEAVING` still receive,
  hand over and collect returns.
- Approval is refused within `agentGapM` of an active agent; show the clash. `agentRadiusM` is
  display only.
- The deposit is `agentDeposit` plus the PayHere fee, by gateway only. `startDeposit` stores the
  deposit charged on the attempt (`PaymentAttempt.depositPrincipal`); `agentDepositPaid` copies it
  to `Agent.depositAmount`, which is what leaving returns. Never read the current setting for it.
  A deposit notice for an agent no longer `APPROVED` (or already paid) takes the late-payment
  path and becomes tokens. A deposit that arrives while the agent has no hours is recorded and
  the agent stays `APPROVED`; `setHours` then makes it `LIVE`.
- Suspension and leaving lock the agent's open baskets early (`lockReason SUSPENDED`).
  `closeLeavingAgents` moves a leaving agent to `LEFT` only when nothing is left to hand over,
  then credits the deposit minus recorded losses and any fee take-back still owed
  (`clawbackOwed`, `src/server/agent-fees.ts`) as `DEPOSIT_RETURN` tokens. A `WITH_AGENT`
  buyer-fault return keeps the agent open. `collectHeldReturns`
  lets an admin move returns stranded at a leaving or left agent onto a return courier.
- Hours are weekly days with open and close minutes; a 23:59 close is stored as 24:00. An
  APPROVED applicant sets hours at `/agent/hours` (gate `requireAgentHours()`), and
  `startDeposit` refuses until hours exist (FR-029a). `setHours` refuses an empty list in every
  status. Every other agent page uses `requireAgent`.
- Agents are buyers too. Their sections show as an in-page tab row under the buyer tab bar, not a
  second bottom bar; whether that stays is open (`DEC-016`).

## Verification and coordination

Unit: `agent-rules.test.ts`, `agent-hours.test.ts`. Integration: `agents.int.test.ts`,
`agent-access.int.test.ts`, `admin-screens.int.test.ts`, `handover.int.test.ts`. Browser:
`tests/e2e/agent.spec.ts` at 360 px. Apply `groupbasket-access-review` to every agent and
Agents-and-orders admin change. See [qa-review](qa-review.md).
