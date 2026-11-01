import { describe, expect, it } from "vitest";
import { codeFlags } from "../src/extraction/checks";

// Worked examples, received on Saturday 2026-10-31.
const received = "2026-10-31";
const event = (e: { start_date?: string; start_time?: string; weekday_on_flyer?: string }) => ({
  start_date: "2026-11-06",
  start_time: "21:00",
  weekday_on_flyer: "",
  ...e,
});

describe("code checks on an extracted Event", () => {
  it("passes a complete Event in the coming year", () => {
    expect(codeFlags(event({ weekday_on_flyer: "Fr." }), received)).toEqual([]);
  });

  it("flags a missing start time or date", () => {
    expect(codeFlags(event({ start_time: "" }), received)).toEqual(["start_time"]);
    expect(codeFlags(event({ start_date: "" }), received)).toEqual(["start_date"]);
  });

  it("flags a date before the Flyer arrived or more than a year after", () => {
    expect(codeFlags(event({ start_date: "2026-10-30" }), received)).toEqual(["start_date"]);
    expect(codeFlags(event({ start_date: "2027-11-01" }), received)).toEqual(["start_date"]);
    expect(codeFlags(event({ start_date: "2026-10-31" }), received)).toEqual([]);
  });

  it("flags a date whose weekday disagrees with the one printed on the Flyer", () => {
    expect(codeFlags(event({ weekday_on_flyer: "Samstag" }), received)).toEqual(["start_date"]);
    expect(codeFlags(event({ weekday_on_flyer: "vie" }), received)).toEqual([]);
    expect(codeFlags(event({ weekday_on_flyer: "Friday" }), received)).toEqual([]);
  });

  it("flags a date that is not a real calendar date", () => {
    expect(codeFlags(event({ start_date: "2026-11-31" }), received)).toEqual(["start_date"]);
  });
});
