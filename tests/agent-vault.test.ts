import { describe, expect, it } from "vitest";
import {
  boolCV,
  listCV,
  principalCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";

// vitest-environment-clarinet provides `simnet` globally.

const accounts = simnet.getAccounts();
const owner = accounts.get("wallet_1")!;
const nonOwner = accounts.get("wallet_5")!;
const agent = accounts.get("wallet_2")!;
const newAgent = accounts.get("wallet_6")!;
const recipientAllowed = accounts.get("wallet_3")!;
const recipientNotAllowed = accounts.get("wallet_4")!;

const CONTRACT = "agent-vault";

// error codes from contract
const ERR_NOT_OWNER = 100;
const ERR_NOT_AGENT = 101;
const ERR_PAUSED = 102;
const ERR_NOT_WHITELISTED = 103;
const ERR_LIMIT_EXCEEDED = 104;
const ERR_INSUFFICIENT_BALANCE = 105;

const balanceTuple = (n: number) => tupleCV({ stx: uintCV(n) });

const okExecute = ({
  ownerPrincipal,
  agentPrincipal,
  recipientPrincipal,
  amount,
  spentInWindow,
  balanceAfter,
}: {
  ownerPrincipal: string;
  agentPrincipal: string;
  recipientPrincipal: string;
  amount: number;
  spentInWindow: number;
  balanceAfter: number;
}) =>
  tupleCV({
    executed: boolCV(true),
    owner: principalCV(ownerPrincipal),
    agent: principalCV(agentPrincipal),
    recipient: principalCV(recipientPrincipal),
    amount: uintCV(amount),
    spent_in_window: uintCV(spentInWindow),
    balance_after: uintCV(balanceAfter),
  });

function initVault({
  whitelist = [recipientAllowed],
  windowBlocks = 10,
  stxLimit = 1000,
  ftLimit = 0,
  sender = owner,
  agentPrincipal = agent,
}: {
  whitelist?: string[];
  windowBlocks?: number;
  stxLimit?: number;
  ftLimit?: number;
  sender?: string;
  agentPrincipal?: string;
} = {}) {
  const wl = listCV(whitelist.map((p) => principalCV(p)));

  return simnet.callPublicFn(
    CONTRACT,
    "init-vault",
    [
      principalCV(agentPrincipal),
      wl,
      uintCV(windowBlocks),
      uintCV(stxLimit),
      uintCV(ftLimit),
    ],
    sender
  );
}

function depositStx(amount: number, sender: string = owner) {
  return simnet.callPublicFn(
    CONTRACT,
    "deposit-stx",
    [principalCV(sender), uintCV(amount)],
    sender
  );
}

function withdrawStx(amount: number, sender: string = owner) {
  return simnet.callPublicFn(
    CONTRACT,
    "withdraw-stx",
    [principalCV(sender), uintCV(amount)],
    sender
  );
}

function setPaused(ownerPrincipal: string, paused: boolean, sender: string) {
  return simnet.callPublicFn(
    CONTRACT,
    "set-paused",
    [principalCV(ownerPrincipal), boolCV(paused)],
    sender
  );
}

function setAgent(ownerPrincipal: string, agentPrincipal: string, sender: string) {
  return simnet.callPublicFn(
    CONTRACT,
    "set-agent",
    [principalCV(ownerPrincipal), principalCV(agentPrincipal)],
    sender
  );
}

function setWhitelist(ownerPrincipal: string, whitelist: string[], sender: string) {
  const wl = listCV(whitelist.map((p) => principalCV(p)));
  return simnet.callPublicFn(
    CONTRACT,
    "set-whitelist",
    [principalCV(ownerPrincipal), wl],
    sender
  );
}

function setLimits(
  ownerPrincipal: string,
  stxLimit: number,
  ftLimit: number,
  windowBlocks: number,
  sender: string
) {
  // NOTE: matches contract signature:
  // (set-limits (owner principal) (stx-limit uint) (ft-limit uint) (window-blocks uint))
  return simnet.callPublicFn(
    CONTRACT,
    "set-limits",
    [
      principalCV(ownerPrincipal),
      uintCV(stxLimit),
      uintCV(ftLimit),
      uintCV(windowBlocks),
    ],
    sender
  );
}

function executeStxTransfer({
  amount,
  recipient,
  ownerPrincipal = owner,
  sender = agent,
}: {
  amount: number;
  recipient: string;
  ownerPrincipal?: string;
  sender?: string;
}) {
  return simnet.callPublicFn(
    CONTRACT,
    "execute-stx-transfer",
    [principalCV(ownerPrincipal), principalCV(recipient), uintCV(amount)],
    sender
  );
}

function getBalance(ownerPrincipal: string = owner) {
  return simnet.callReadOnlyFn(
    CONTRACT,
    "get-balance",
    [principalCV(ownerPrincipal)],
    ownerPrincipal
  );
}

describe("agent-vault (custodial vault) - policy + execution", () => {
  it("init-vault creates config/state/whitelist/balance", () => {
    const r = initVault();
    expect(r.result).toBeOk(boolCV(true));

    const bal = getBalance();
    expect(bal.result).toBeSome(balanceTuple(0));
  });

  it("deposit-stx increases vault logical balance", () => {
    initVault();

    const d = depositStx(500);
    expect(d.result).toBeOk(boolCV(true));

    const bal = getBalance();
    expect(bal.result).toBeSome(balanceTuple(500));
  });

  it("execute-stx-transfer rejects when caller is not agent (ERR-NOT-AGENT = u101)", () => {
    initVault();
    depositStx(500);

    const r = executeStxTransfer({
      amount: 1,
      recipient: recipientAllowed,
      sender: owner, // not agent
    });

    expect(r.result).toBeErr(uintCV(ERR_NOT_AGENT));
  });

  it("execute-stx-transfer rejects when paused (ERR-PAUSED = u102)", () => {
    initVault();
    depositStx(500);

    const p = setPaused(owner, true, owner);
    expect(p.result).toBeOk(boolCV(true));

    const r = executeStxTransfer({
      amount: 1,
      recipient: recipientAllowed,
      sender: agent,
    });

    expect(r.result).toBeErr(uintCV(ERR_PAUSED));
  });

  it("execute-stx-transfer rejects when recipient not whitelisted (ERR-NOT-WHITELISTED = u103)", () => {
    initVault();
    depositStx(500);

    const r = executeStxTransfer({
      amount: 1,
      recipient: recipientNotAllowed,
      sender: agent,
    });

    expect(r.result).toBeErr(uintCV(ERR_NOT_WHITELISTED));
  });

  it("execute-stx-transfer rejects when exceeding stx-limit (ERR-LIMIT-EXCEEDED = u104)", () => {
    initVault({ stxLimit: 10 });
    depositStx(500);

    const r = executeStxTransfer({
      amount: 11,
      recipient: recipientAllowed,
      sender: agent,
    });

    expect(r.result).toBeErr(uintCV(ERR_LIMIT_EXCEEDED));
  });

  it("execute-stx-transfer rejects when insufficient balance (ERR-INSUFFICIENT-BALANCE = u105)", () => {
    initVault({ stxLimit: 1000 });

    const r = executeStxTransfer({
      amount: 1,
      recipient: recipientAllowed,
      sender: agent,
    });

    expect(r.result).toBeErr(uintCV(ERR_INSUFFICIENT_BALANCE));
  });

  it("execute-stx-transfer succeeds and decreases balance", () => {
    initVault({ stxLimit: 1000 });
    depositStx(500);

    const r = executeStxTransfer({
      amount: 200,
      recipient: recipientAllowed,
      sender: agent,
    });

    expect(r.result).toBeOk(
      okExecute({
        ownerPrincipal: owner,
        agentPrincipal: agent,
        recipientPrincipal: recipientAllowed,
        amount: 200,
        spentInWindow: 200,
        balanceAfter: 300,
      })
    );

    const bal = getBalance();
    expect(bal.result).toBeSome(balanceTuple(300));
  });

  it("withdraw-stx decreases vault logical balance", () => {
    initVault();
    depositStx(300);

    const w = withdrawStx(100);
    expect(w.result).toBeOk(boolCV(true));

    const bal = getBalance();
    expect(bal.result).toBeSome(balanceTuple(200));
  });
});

describe("agent-vault - admin controls (most important)", () => {
  it("set-paused: only owner can pause/unpause", () => {
    initVault();

    const unauthorized = setPaused(owner, true, nonOwner);
    expect(unauthorized.result).toBeErr(uintCV(ERR_NOT_OWNER));

    const authorized = setPaused(owner, true, owner);
    expect(authorized.result).toBeOk(boolCV(true));

    // while paused, even agent is blocked
    depositStx(100);
    const r = executeStxTransfer({ amount: 1, recipient: recipientAllowed, sender: agent });
    expect(r.result).toBeErr(uintCV(ERR_PAUSED));
  });

  it("set-agent: only owner can change agent; old agent loses access; new agent can execute", () => {
    initVault();
    depositStx(200);

    const unauth = setAgent(owner, newAgent, nonOwner);
    expect(unauth.result).toBeErr(uintCV(ERR_NOT_OWNER));

    const ok = setAgent(owner, newAgent, owner);
    expect(ok.result).toBeOk(boolCV(true));

    // old agent should now fail
    const oldAgentTry = executeStxTransfer({
      amount: 1,
      recipient: recipientAllowed,
      sender: agent,
    });
    expect(oldAgentTry.result).toBeErr(uintCV(ERR_NOT_AGENT));

    // new agent should succeed
    const newAgentTry = executeStxTransfer({
      amount: 1,
      recipient: recipientAllowed,
      sender: newAgent,
    });
    expect(newAgentTry.result).toBeOk(
      okExecute({
        ownerPrincipal: owner,
        agentPrincipal: newAgent,
        recipientPrincipal: recipientAllowed,
        amount: 1,
        spentInWindow: 1,
        balanceAfter: 199,
      })
    );

    const bal = getBalance();
    expect(bal.result).toBeSome(balanceTuple(199));
  });

  it("set-whitelist: only owner can update; new recipient becomes allowed", () => {
    initVault();
    depositStx(200);

    // initially blocked
    const blocked = executeStxTransfer({
      amount: 1,
      recipient: recipientNotAllowed,
      sender: agent,
    });
    expect(blocked.result).toBeErr(uintCV(ERR_NOT_WHITELISTED));

    // unauthorized whitelist update
    const unauth = setWhitelist(owner, [recipientAllowed, recipientNotAllowed], nonOwner);
    expect(unauth.result).toBeErr(uintCV(ERR_NOT_OWNER));

    // authorized whitelist update
    const ok = setWhitelist(owner, [recipientAllowed, recipientNotAllowed], owner);
    expect(ok.result).toBeOk(boolCV(true));

    // now should pass
    const allowedNow = executeStxTransfer({
      amount: 1,
      recipient: recipientNotAllowed,
      sender: agent,
    });
    expect(allowedNow.result).toBeOk(
      okExecute({
        ownerPrincipal: owner,
        agentPrincipal: agent,
        recipientPrincipal: recipientNotAllowed,
        amount: 1,
        spentInWindow: 1,
        balanceAfter: 199,
      })
    );

    const bal = getBalance();
    expect(bal.result).toBeSome(balanceTuple(199));
  });

  it("set-limits: only owner can change; new stx-limit is enforced immediately", () => {
    initVault({ stxLimit: 1000 });
    depositStx(500);

    const unauth = setLimits(owner, 1, 0, 10, nonOwner);
    expect(unauth.result).toBeErr(uintCV(ERR_NOT_OWNER));

    const ok = setLimits(owner, 1, 0, 10, owner);
    expect(ok.result).toBeOk(boolCV(true));

    // with limit=1, amount=2 should fail
    const r = executeStxTransfer({
      amount: 2,
      recipient: recipientAllowed,
      sender: agent,
    });
    expect(r.result).toBeErr(uintCV(ERR_LIMIT_EXCEEDED));
  });
});

describe("agent-vault - multi-owner isolation (high priority)", () => {
  const owner2 = accounts.get("wallet_5")!;
  const agent2 = accounts.get("wallet_7")!;
  const recipient2Allowed = accounts.get("wallet_8")!;

  it("two owners can initialize vaults independently and maintain separate balances", () => {
    // Owner1 vault
    const r1 = initVault({
      sender: owner,
      agentPrincipal: agent,
      whitelist: [recipientAllowed],
      stxLimit: 1000,
      ftLimit: 0,
      windowBlocks: 10,
    });
    expect(r1.result).toBeOk(boolCV(true));

    const d1 = depositStx(300, owner);
    expect(d1.result).toBeOk(boolCV(true));

    // Owner2 vault (independent)
    const r2 = initVault({
      sender: owner2,
      agentPrincipal: agent2,
      whitelist: [recipient2Allowed],
      stxLimit: 1000,
      ftLimit: 0,
      windowBlocks: 10,
    });
    expect(r2.result).toBeOk(boolCV(true));

    const d2 = depositStx(700, owner2);
    expect(d2.result).toBeOk(boolCV(true));

    // Verify balances are isolated
    expect(getBalance(owner).result).toBeSome(balanceTuple(300));
    expect(getBalance(owner2).result).toBeSome(balanceTuple(700));
  });

  it("agent for owner1 cannot execute transfers for owner2 (ERR-NOT-AGENT)", () => {
    // Setup owner2 vault
    expect(
      initVault({
        sender: owner2,
        agentPrincipal: agent2,
        whitelist: [recipient2Allowed],
        stxLimit: 1000,
        ftLimit: 0,
        windowBlocks: 10,
      }).result
    ).toBeOk(boolCV(true));

    expect(depositStx(100, owner2).result).toBeOk(boolCV(true));

    // Agent1 attempts to spend from owner2's vault -> should fail
    const attempt = executeStxTransfer({
      ownerPrincipal: owner2,
      recipient: recipient2Allowed,
      amount: 1,
      sender: agent, // wrong agent
    });

    expect(attempt.result).toBeErr(uintCV(ERR_NOT_AGENT));

    // Balance unchanged
    expect(getBalance(owner2).result).toBeSome(balanceTuple(100));
  });

  it("operations on owner1 do not impact owner2 (and vice versa)", () => {
    // Setup both vaults
    expect(
      initVault({
        sender: owner,
        agentPrincipal: agent,
        whitelist: [recipientAllowed],
        stxLimit: 1000,
        ftLimit: 0,
        windowBlocks: 10,
      }).result
    ).toBeOk(boolCV(true));

    expect(
      initVault({
        sender: owner2,
        agentPrincipal: agent2,
        whitelist: [recipient2Allowed],
        stxLimit: 1000,
        ftLimit: 0,
        windowBlocks: 10,
      }).result
    ).toBeOk(boolCV(true));

    expect(depositStx(500, owner).result).toBeOk(boolCV(true));
    expect(depositStx(200, owner2).result).toBeOk(boolCV(true));

    // Spend from owner1
    const spend1 = executeStxTransfer({
      ownerPrincipal: owner,
      recipient: recipientAllowed,
      amount: 120,
      sender: agent,
    });
    expect(spend1.result).toBeOk(
      okExecute({
        ownerPrincipal: owner,
        agentPrincipal: agent,
        recipientPrincipal: recipientAllowed,
        amount: 120,
        spentInWindow: 120,
        balanceAfter: 380,
      })
    );

    // Spend from owner2
    const spend2 = executeStxTransfer({
      ownerPrincipal: owner2,
      recipient: recipient2Allowed,
      amount: 50,
      sender: agent2,
    });
    expect(spend2.result).toBeOk(
      okExecute({
        ownerPrincipal: owner2,
        agentPrincipal: agent2,
        recipientPrincipal: recipient2Allowed,
        amount: 50,
        spentInWindow: 50,
        balanceAfter: 150,
      })
    );

    // Balances remain isolated
    expect(getBalance(owner).result).toBeSome(balanceTuple(380));
    expect(getBalance(owner2).result).toBeSome(balanceTuple(150));
  });
});








describe("agent-vault - edge cases & error codes (high value)", () => {
  it("ERR-NO-VAULT (u106): deposit-stx without init-vault fails", () => {
    const r = depositStx(1, owner);
    expect(r.result).toBeErr(uintCV(106));
  });

  it("ERR-NO-VAULT (u106): withdraw-stx without init-vault fails", () => {
    const r = withdrawStx(1, owner);
    expect(r.result).toBeErr(uintCV(106));
  });

  it("ERR-NO-VAULT (u106): set-paused without init-vault fails", () => {
    const r = setPaused(owner, true, owner);
    expect(r.result).toBeErr(uintCV(106));
  });

  it("ERR-NO-VAULT (u106): set-agent without init-vault fails", () => {
    const r = setAgent(owner, newAgent, owner);
    expect(r.result).toBeErr(uintCV(106));
  });

  it("ERR-NO-VAULT (u106): set-whitelist without init-vault fails", () => {
    const r = setWhitelist(owner, [recipientAllowed], owner);
    expect(r.result).toBeErr(uintCV(106));
  });

  it("ERR-NO-VAULT (u106): set-limits without init-vault fails", () => {
    const r = setLimits(owner, 10, 0, 10, owner);
    expect(r.result).toBeErr(uintCV(106));
  });

  it("ERR-NO-VAULT (u106): execute-stx-transfer without init-vault fails", () => {
    const r = executeStxTransfer({
      ownerPrincipal: owner,
      recipient: recipientAllowed,
      amount: 1,
      sender: agent,
    });
    expect(r.result).toBeErr(uintCV(106));
  });

  it("ERR-ALREADY-INITIALIZED (u107): init-vault twice fails for same owner", () => {
    expect(initVault().result).toBeOk(boolCV(true));
    const r2 = initVault();
    expect(r2.result).toBeErr(uintCV(107));
  });

  it("ERR-INVALID-AMOUNT (u108): execute-stx-transfer with amount=0 fails", () => {
    initVault();
    depositStx(10);

    const r = executeStxTransfer({
      ownerPrincipal: owner,
      recipient: recipientAllowed,
      amount: 0,
      sender: agent,
    });

    expect(r.result).toBeErr(uintCV(108));
  });

  it("deposit-stx: non-owner cannot deposit into someone else's vault (ERR-NOT-OWNER u100)", () => {
    initVault();

    const r = depositStx(1, nonOwner); // sender is nonOwner; and owner param is nonOwner in helper
    // That call tries to deposit into nonOwner's own vault (which doesn't exist) -> ERR-NO-VAULT.
    // We want: sender=nonOwner but owner param=owner.
    const r2 = simnet.callPublicFn(
      CONTRACT,
      "deposit-stx",
      [principalCV(owner), uintCV(1)],
      nonOwner
    );

    expect(r2.result).toBeErr(uintCV(100));
  });

  it("withdraw-stx: cannot withdraw more than balance (ERR-INSUFFICIENT-BALANCE u105)", () => {
    initVault();
    depositStx(10);

    const r = withdrawStx(11, owner);
    expect(r.result).toBeErr(uintCV(105));
  });

  it("withdraw-stx: non-owner cannot withdraw from someone else's vault (ERR-NOT-OWNER u100)", () => {
    initVault();
    depositStx(10);

    const r = simnet.callPublicFn(
      CONTRACT,
      "withdraw-stx",
      [principalCV(owner), uintCV(1)],
      nonOwner
    );

    expect(r.result).toBeErr(uintCV(100));
  });
});