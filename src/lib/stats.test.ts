import { describe, it, expect } from "vitest";
import { criteriaAchievement, submissionRate } from "./stats";

describe("stats", () => {
  it("submission rate counts submissions over students × assignments", () => {
    expect(submissionRate(10, 2, 15)).toBe(75);
    expect(submissionRate(0, 3, 0)).toBe(0);
  });
  it("criteria achievement percentage per criterion", () => {
    const r = criteriaAchievement([
      { criterion_code: "A.P1", achieved: true },
      { criterion_code: "A.P1", achieved: false },
      { criterion_code: "A.M1", achieved: false },
    ]);
    expect(r["A.P1"]).toEqual({ achieved: 1, total: 2, pct: 50 });
    expect(r["A.M1"]?.pct).toBe(0);
  });
});
