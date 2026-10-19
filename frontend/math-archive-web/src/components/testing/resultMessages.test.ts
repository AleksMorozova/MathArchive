import { describe, expect, it } from "vitest";
import { resultMessages, resultPresentation } from "./resultMessages";
describe("result messages", () => {
  it.each([[0,"practice"],[39.99,"practice"],[40,"developing"],[59.99,"developing"],[60,"good"],[79.99,"good"],[80,"high"],[99.99,"high"],[100,"perfect"]] as const)("classifies %s without rounding across boundaries", (score, band) => { expect(resultPresentation("attempt", score).band).toBe(band); });
  it("has five distinct pairs in each range and keeps selection stable for an attempt", () => {
    for (const messages of Object.values(resultMessages)) { expect(messages).toHaveLength(5); expect(new Set(messages.map(m => m.title)).size).toBe(5); }
    const first = resultPresentation("a7e91a18-647c-421a-bc14-6278f658aadc", 85);
    expect(resultPresentation("a7e91a18-647c-421a-bc14-6278f658aadc", 85)).toEqual(first);
    expect(new Set(Array.from({length: 30}, (_, i) => resultPresentation("attempt-" + i, 85).title)).size).toBe(5);
  });
  it.each([null, NaN, Infinity, -1, 101])("uses neutral presentation for unavailable or invalid percentages: %s", score => { expect(resultPresentation("id", score).band).toBe("neutral"); });
});
