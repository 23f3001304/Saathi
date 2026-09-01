import { describe, expect, it } from "vitest";

import {
  HANDOFF_REASONS,
  SessionStateError,
  SessionStateMachine,
  UserDriveViolation,
} from "../src/session-state.js";
import type { SessionState } from "../src/session-state.js";

const ALL: readonly SessionState[] = ["idle", "agent-drive", "user-drive", "closed"];

function machineAt(state: SessionState): SessionStateMachine {
  const machine = new SessionStateMachine();
  if (state === "idle") {
    return machine;
  }
  machine.transition("agent-drive");
  if (state === "agent-drive") {
    return machine;
  }
  if (state === "user-drive") {
    machine.transition("user-drive");
    return machine;
  }
  machine.transition("closed");
  return machine;
}

const EDGES: Readonly<Record<SessionState, readonly SessionState[]>> = {
  idle: ["agent-drive", "closed"],
  "agent-drive": ["user-drive", "closed"],
  "user-drive": ["agent-drive", "closed"],
  closed: [],
};

describe("SessionStateMachine transitions", () => {
  it("starts idle", () => {
    expect(new SessionStateMachine().current()).toBe("idle");
  });

  for (const from of ALL) {
    for (const to of ALL) {
      const legal = EDGES[from].includes(to);
      it(`${from} -> ${to} is ${legal ? "allowed" : "refused"}`, () => {
        const machine = machineAt(from);
        expect(machine.canTransition(to)).toBe(legal);
        if (legal) {
          machine.transition(to);
          expect(machine.current()).toBe(to);
          return;
        }
        expect(() => machine.transition(to)).toThrow(SessionStateError);
        expect(machine.current()).toBe(from);
      });
    }
  }

  it("is terminal once closed", () => {
    const machine = machineAt("closed");
    for (const target of ALL) {
      expect(machine.canTransition(target)).toBe(false);
    }
  });
});

describe("assertAgentMayAct", () => {
  it("permits action only while the agent is driving", () => {
    expect(() => machineAt("agent-drive").assertAgentMayAct("type")).not.toThrow();
  });

  it.each(["idle", "user-drive", "closed"] as const)(
    "throws UserDriveViolation while %s",
    (state) => {
      const machine = machineAt(state);
      expect(() => machine.assertAgentMayAct("type")).toThrow(UserDriveViolation);
    },
  );

  it("names the action and the state, because a silent freeze is a bug report", () => {
    const machine = machineAt("user-drive");
    expect(() => machine.assertAgentMayAct("click")).toThrow(
      /"click" while the session was "user-drive"/,
    );
  });

  it("throws rather than returns: a refusal the caller can ignore is not enforcement", () => {
    const machine = machineAt("user-drive");
    let reached = false;
    try {
      machine.assertAgentMayAct("navigate");
      reached = true;
    } catch (error) {
      expect(error).toBeInstanceOf(UserDriveViolation);
    }
    expect(reached).toBe(false);
  });
});

describe("handoff reasons", () => {
  it("is a closed list", () => {
    expect(HANDOFF_REASONS).toEqual([
      "login",
      "account-creation",
      "otp",
      "payment",
      "captcha",
      "final-review",
    ]);
  });
});
