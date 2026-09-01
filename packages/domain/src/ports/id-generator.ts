/** Determinism seam for ids; `crypto.randomUUID` stays in the composition root. */
export interface IdGenerator {
  uuid(): string;
}
