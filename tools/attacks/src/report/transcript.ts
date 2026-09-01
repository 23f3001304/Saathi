const COLOURS: Readonly<Record<string, string>> = {
  reset: "[0m",
  dim: "[2m",
  bold: "[1m",
  red: "[31m",
  green: "[32m",
  yellow: "[33m",
  cyan: "[36m",
};

const RULE = "-".repeat(78);

const PAD = 22;

function paint(colour: string, text: string): string {
  if (process.env["NO_COLOR"] !== undefined || process.stdout.isTTY !== true) {
    return text;
  }
  return `${COLOURS[colour] ?? ""}${text}${COLOURS["reset"] ?? ""}`;
}

export interface SealLike {
  readonly check: string;
  readonly outcome: string;
  readonly reason_code: string | null;
}

/**
 * The narrated transcript. It is a demo artifact, so it prints what was
 * *attempted* next to what the gateway *answered* — a screen recording of a
 * block that never showed the attack is not evidence of anything.
 */
export class Transcript {
  private stepNo = 0;

  /**
   * `false` runs the same flow with no output. The FP harness re-runs the
   * three attacks silently to fill the true-block row of its own matrix.
   */
  constructor(private readonly enabled: boolean = true) {}

  banner(attackId: string, title: string, subtitle: string): void {
    this.out("");
    this.out(paint("bold", RULE));
    this.out(paint("bold", `  ${attackId}  ${title}`));
    this.out(paint("dim", `  ${subtitle}`));
    this.out(paint("bold", RULE));
  }

  section(title: string): void {
    this.out("");
    this.out(paint("cyan", `-- ${title} ${"-".repeat(Math.max(0, 74 - title.length))}`));
  }

  step(text: string): void {
    this.stepNo += 1;
    this.out("");
    this.out(`${paint("bold", `[${this.stepNo}]`)} ${text}`);
  }

  detail(label: string, value: string): void {
    this.out(`     ${paint("dim", label.padEnd(PAD))} ${value}`);
  }

  attempt(text: string): void {
    this.out(`     ${paint("yellow", "ATTEMPT")}${" ".repeat(PAD - 7)} ${text}`);
  }

  answer(reasonCode: string | null, human: string | null): void {
    this.out(`     ${paint("dim", "reason_code".padEnd(PAD))} ${paint("bold", reasonCode ?? "(none)")}`);
    if (human !== null) {
      this.out(`     ${paint("dim", "human".padEnd(PAD))} ${human}`);
    }
  }

  toPass(value: unknown): void {
    if (value === null || value === undefined) {
      this.detail("to_pass", "null");
      return;
    }
    const lines = JSON.stringify(value, null, 2).split("\n");
    this.detail("to_pass", lines[0] ?? "");
    for (const line of lines.slice(1)) {
      this.out(`     ${" ".repeat(PAD)} ${line}`);
    }
  }

  seals(seals: readonly SealLike[]): void {
    if (seals.length === 0) {
      this.detail("seals", paint("red", "0 - stage-0 rejection, the pipeline never ran"));
      return;
    }
    this.detail("seals", String(seals.length));
    for (const seal of seals) {
      const mark =
        seal.outcome === "pass"
          ? paint("green", "PASS")
          : paint("red", seal.outcome.toUpperCase());
      this.out(
        `     ${" ".repeat(PAD)} ${mark.padEnd(16)} ${seal.check.padEnd(16)} ${seal.reason_code ?? ""}`,
      );
    }
  }

  blocked(text: string): void {
    this.out(`     ${paint("green", "BLOCKED")}${" ".repeat(PAD - 7)} ${text}`);
  }

  succeeded(text: string): void {
    this.out(`     ${paint("red", "GOT THROUGH")}${" ".repeat(Math.max(1, PAD - 11))} ${text}`);
  }

  note(text: string): void {
    this.out(`     ${paint("dim", text)}`);
  }

  result(id: string, ok: boolean, text: string): void {
    const mark = ok ? paint("green", " ok ") : paint("red", "FAIL");
    this.out(`  ${mark}  ${id.padEnd(5)} ${text}`);
  }

  verdictLine(label: string, ok: boolean): void {
    this.out("");
    this.out(ok ? paint("green", `  [PASS] ${label}`) : paint("red", `  [FAIL] ${label}`));
  }

  raw(text: string): void {
    this.out(text);
  }

  private out(line: string): void {
    if (this.enabled) {
      process.stdout.write(`${line}\n`);
    }
  }
}
