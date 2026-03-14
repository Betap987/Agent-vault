# Agent Vault (Clarity) — Custodial Execution Sandbox (MVP)

[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20clarinet-brightgreen)](#tests)
[![Clarity](https://img.shields.io/badge/stacks-clarity%202.1-blue)](#)
[![Status](https://img.shields.io/badge/status-MVP-orange)](#)

**Agent Vault** is a **custodial sandbox** smart contract for **Stacks (Clarity 2.1)**.

An **owner** deposits STX into a vault controlled by the **contract principal**, then configures:
- an authorized **agent** (bot/service/operator)
- a **recipient whitelist**
- **spending limits** enforced per time window (by `burn-block-height`)

The **agent** can execute STX transfers **only if on-chain policy checks pass**.

---

## Why this exists (problem → solution)

If you want an automated process to pay people (users, vendors, rewards, refunds), you often don’t want the bot to hold full custody of funds.

This contract provides:
- **custody in-contract** (safer than leaving all funds on a hot bot key)
- **hard constraints** (who can receive, and how much can be spent)
- **emergency controls** (pause immediately, rotate the agent)

---

## Mental model (how it works)

For each `owner`:
1. **Initialize** a vault (`init-vault`) with agent + policy.
2. **Deposit** STX into the contract (`deposit-stx`), increasing the owner’s **logical vault balance**.
3. The **agent** executes payments (`execute-stx-transfer`) from the **contract principal** to a recipient, **only if**:
   - caller is the configured agent
   - vault is not paused
   - recipient is whitelisted
   - amount is valid and within the spending limit/window
   - the owner’s logical vault balance can cover it
4. Owner can **withdraw** remaining funds (`withdraw-stx`).

**Custody:** STX is held by the contract principal after deposit.  
**Accounting:** the contract tracks `vault-balance` per owner.

---

## Roles

### Owner
- Initializes vault config
- Deposits / withdraws STX
- Updates whitelist / limits / window size
- Pauses/unpauses
- Rotates agent

### Agent
- Can execute STX transfers within the owner’s policy
- Cannot bypass whitelist or limits

---

## Example flow (copy/paste mental walkthrough)

### 0) Owner chooses policy
- `agent = ST...AGENT`
- `whitelist = [ST...ALICE, ST...BOB]`
- `stx-limit = 1_000_000` (microstacks)
- `window-blocks = 144` (example “~1 day”, depends on chain)

### 1) Owner initializes vault
Owner calls:
- `init-vault(agent, whitelist, window-blocks, stx-limit, ft-limit)`

### 2) Owner deposits STX
Owner calls:
- `deposit-stx(owner, amount)`

Result:
- STX moves from owner → contract principal
- `vault-balance[owner].stx += amount`

### 3) Agent pays a whitelisted recipient
Agent calls:
- `execute-stx-transfer(owner, recipient, amount)`

If policy passes:
- STX moves from contract principal → recipient
- `vault-balance[owner].stx -= amount`
- `spent-stx` increases in the current window

### 4) Owner withdraws leftovers
Owner calls:
- `withdraw-stx(owner, amount)`

Result:
- STX moves from contract principal → owner
- `vault-balance[owner].stx -= amount`

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

## Policy rules enforced (STX)

`execute-stx-transfer(owner, recipient, amount)` enforces:
- vault exists for `owner`
- `tx-sender` is the configured `agent`
- vault is not paused
- `amount > 0`
- `recipient` is in whitelist
- `spent_in_window + amount <= stx-limit`
- `amount <= vault-balance[owner].stx`

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

This repo includes a **Vitest + Clarinet simnet** suite with coverage for:
- initialization, deposit, execute, withdraw
- admin controls (only-owner)
- multi-owner isolation (no cross-vault access)
- rejection paths for each important error code

### Run
```bash
npm test
```

### Contract checks
```bash
clarinet check
```

---

## Project layout
- `contracts/agent-vault.clar` — main Clarity contract
- `tests/agent-vault.test.ts` — test suite
- `docs/SECURITY.md` — threat model / invariants / limitations
- `deployments/`, `settings/` — Clarinet simnet config

---

## Notes / limitations (MVP)
- FT limit/state exists for future work; only STX execution is implemented.
- Whitelist is capped at `(list 10 principal)`.
- Window reset depends on `burn-block-height`. Some JS simnet environments may not support advancing burn blocks easily.

---

## License
No license specified yet. Add one (e.g., MIT) if you want others to reuse the code.