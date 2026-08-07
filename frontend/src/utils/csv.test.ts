import { describe, expect, it } from "vitest";

import { buildResultsCsv, parseCasesCsvText } from "./csv";

describe("parseCasesCsvText", () => {
  it("preserves identifiers and accepts readable header variants", () => {
    const parsed = parseCasesCsvText("Case Number,Case Title,Description,Status Reason,Priority\n00123,Offline,Printer is offline,Pending,High");
    expect(parsed.fatalError).toBeUndefined();
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0].CaseNumber).toBe("00123");
    expect(parsed.cases[0].Priority).toBe("High");
  });

  it("reports skipped rows without discarding valid cases", () => {
    const parsed = parseCasesCsvText("CaseNumber,CaseTitle,Description,StatusReason\n1,Valid,Details,Pending\n2,,Details,Pending");
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.skippedRows).toBe(1);
    expect(parsed.issues[0].row).toBe(3);
  });

  it("reports missing required columns", () => {
    const parsed = parseCasesCsvText("CaseNumber,Description\n1,Details");
    expect(parsed.fatalError).toContain("CaseTitle");
    expect(parsed.cases).toHaveLength(0);
  });
});

describe("buildResultsCsv", () => {
  it("keeps original fields and appends predictions", () => {
    const csv = buildResultsCsv([{ originalCase: { CaseNumber: "001", Customer: "Example" }, predictedCategory: "Technical", predictedResolution: "Resolved", predictedCertainty: "high", predictedReasoning: "The technical issue was fixed." }]);
    expect(csv).toContain("Customer");
    expect(csv).toContain("Predicted Category");
    expect(csv).toContain("001");
  });
});
