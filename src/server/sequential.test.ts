import { describe, expect, it } from "vitest";
import { sequential } from "./sequential";

/** A lazy thenable like a Prisma query: starts only when awaited. */
function lazy<T>(value: T, log: string[], name: string): PromiseLike<T> {
  return {
    then(onFulfilled, onRejected) {
      log.push(`start ${name}`);
      return new Promise<T>((r) => setTimeout(() => (log.push(`end ${name}`), r(value)), 5)).then(onFulfilled, onRejected);
    },
  };
}

describe("sequential", () => {
  it("runs lazy queries one at a time and keeps result order and types", async () => {
    const log: string[] = [];
    const [a, b] = await sequential([lazy(1, log, "a"), lazy("x", log, "b")] as const);
    expect(a + 1).toBe(2);
    expect(b.toUpperCase()).toBe("X");
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });
});
