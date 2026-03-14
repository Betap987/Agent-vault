# Agent Vault — Policy-Restricted Custodial Payments for Automated Agents (Stacks / Clarity)

**One-liner hook:** Let an automated agent send STX payments **without ever giving it full custody**—enforced by on-chain policy (whitelist + limits + pause).

[![Tests](https://img.shields.io/badge/tests-28%2F28%20passing-brightgreen)](#tests)
[![Clarity](https://img.shields.io/badge/stacks-clarity%202.1-blue)](#)
[![Status](https://img.shields.io/badge/status-MVP-orange)](#mvp-scope)

Agent Vault is a **custodial execution sandbox** smart contract for **Stacks (Clarity 2.1)**.  
An **owner** deposits STX into a vault held by the **contract principal** and configures:
- an authorized **agent** (bot/service/operator)
- a **recipient whitelist**
- **spending limits per time window** (by `burn-block-height`)
- an emergency **pause switch**

The **agent** can execute STX transfers **only if** every on-chain policy check passes.

---

## MVP scope (what’s implemented today)
**Included**
- STX vault custody + per-owner accounting
- Agent-gated execution (`ERR-NOT-AGENT`)
- Whitelist enforcement
- Windowed spending limit enforcement
- Pause/unpause + agent rotation
- Test suite covering happy paths + rejection paths

**Not included yet (planned)**
- Full FT transfer execution (fields exist for future work)
- Rich “window reset” simulation tooling beyond current test environment

---

## Why this matters (real-world problem)
Bots that make payments (rewards, refunds, payroll, market-making ops) are operationally risky:
- If the bot key is compromised, **all funds can be drained**
- Off-chain policy is hard to audit and easy to bypass

Agent Vault puts the payment policy **on-chain**, so custody and execution are separated and verifiable.

---

## Why Stacks (Stacks Alignment)
Stacks is the right place for this primitive because it gives:
- **Bitcoin-anchored finality** (a strong settlement layer for custodial payment flows)
- A clear path to **Bitcoin liquidity integration** via **sBTC** (future extension: vault policies for sBTC/other assets)
- **Clarity’s decidable smart contracts**, making policy logic readable and auditable for judges and users

---

## Demo / Video
- **Live demo:** `TBD` (add link)
- **Video walkthrough (2–4 min):** `TBD` (add link)
- **What the demo shows:**
  1) Owner initializes vault + sets policy
  2) Owner deposits STX
  3) Agent executes a valid transfer
  4) Rejections: non-agent call, non-whitelisted recipient, limit exceeded, paused

---

## Mental model (how it works)
For each `owner`:
1. **Initialize** a vault (`init-vault`) with agent + policy.
2. **Deposit** STX into the contract (`deposit-stx`), increasing the owner’s logical vault balance.
3. The **agent** executes payments (`execute-stx-transfer`) from the **contract principal** to a recipient, **only if**:
   - caller is the configured agent
   - vault is not paused
   - recipient is whitelisted
   - amount is valid and within the spending limit/window
   - the owner’s logical vault balance can cover it
4. Owner can **withdraw** remaining funds (`withdraw-stx`).

Custody: STX is held by the **contract principal** after deposit.  
Accounting: the contract tracks `vault-balance` per owner.

---

## Roles
- **Owner**: initializes and controls the vault configuration; can deposit/withdraw; can pause; can rotate agent; can update whitelist and limits.
- **Agent**: can only execute transfers that satisfy the vault policy.

---

## Contract interface

### Public functions
- `init-vault(agent, whitelist, window-blocks, stx-limit, ft-limit)`
- `deposit-stx(owner, amount)` *(owner only)*
- `withdraw-stx(owner, amount)` *(owner only)*

**Admin (owner only):**
- `set-paused(owner, paused)`
- `set-agent(owner, new-agent)`
- `set-whitelist(owner, whitelist)`
- `set-limits(owner, stx-limit, ft-limit, window-blocks)`

**Agent:**
- `execute-stx-transfer(owner, recipient, amount)`

### Read-only functions
- `get-config(owner)`
- `get-state(owner)`
- `get-whitelist(owner)`
- `get-balance(owner)`

---

## Error codes
- `u100` `ERR-NOT-OWNER`
- `u101` `ERR-NOT-AGENT`
- `u102` `ERR-PAUSED`
- `u103` `ERR-NOT-WHITELISTED`
- `u104` `ERR-LIMIT-EXCEEDED`
- `u105` `ERR-INSUFFICIENT-BALANCE`
- `u106` `ERR-NO-VAULT`
- `u107` `ERR-ALREADY-INITIALIZED`
- `u108` `ERR-INVALID-AMOUNT`

---

## Tests
This repo includes a **Vitest + Clarinet simnet** suite covering:
- initialization, deposit, execute, withdraw
- admin controls (only-owner)
- multi-owner isolation (no cross-vault access)
- rejection paths for each important error code

Run:
```bash
npm test
```

Contract checks:
```bash
clarinet check
```

---

## Project layout
- `contracts/agent-vault.clar` — main Clarity contract
- `tests/agent-vault.test.ts` — test suite
- `docs/SECURITY.md` — threat model / invariants / limitations
- `deployments/`, `settings/` — Clarinet config

---

## License
MIT (see `LICENSE`).