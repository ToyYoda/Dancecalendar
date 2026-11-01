import { describe, expect, it } from "vitest";
import { firstDates, ruleButtons, ruleDates, ruleFromFlyer, ruleOptions, ruleWords, type Rule } from "../src/series";
import { flyerEvent } from "./fake-apis";

// 2026-10-14 is the 2nd Wednesday of October; 2026-10-30 the last Friday.
const series = (rule_text: string, frequency: string, start_date = "2026-10-14") =>
  ({ ...flyerEvent(), start_date, series: { is_series: true, rule_text, frequency, explicit_dates: [] } }) as any;

describe("a Series rule", () => {
  it("gives its dates from the anchor on, after a date and up to a date", () => {
    expect(ruleDates({ freq: "weekly", anchor: "2026-10-14" }, "2026-10-14", "2026-11-04")).toEqual(["2026-10-21", "2026-10-28", "2026-11-04"]);
    expect(ruleDates({ freq: "every_n_weeks", n: 2, anchor: "2026-10-14" }, "2026-10-01", "2026-11-11")).toEqual(["2026-10-14", "2026-10-28", "2026-11-11"]);
    expect(ruleDates({ freq: "nth_weekday", n: 2, anchor: "2026-10-14" }, "2026-10-01", "2027-01-31")).toEqual([
      "2026-10-14",
      "2026-11-11",
      "2026-12-09",
      "2027-01-13",
    ]);
    expect(ruleDates({ freq: "nth_weekday", n: -1, anchor: "2026-10-30" }, "2026-10-30", "2027-01-31")).toEqual(["2026-11-27", "2026-12-25", "2027-01-29"]);
    expect(ruleDates({ freq: "custom", text: "nach Absprache", anchor: "2026-10-14" }, "2026-10-01", "2027-01-31")).toEqual([]);
  });

  it("reads in plain words", () => {
    const words = (r: object, anchor = "2026-10-14") => ruleWords({ ...r, anchor } as Rule);
    expect(words({ freq: "weekly" })).toBe("Jeden Mittwoch");
    expect(words({ freq: "every_n_weeks", n: 2 })).toBe("Alle 2 Wochen mittwochs");
    expect(words({ freq: "nth_weekday", n: 2 })).toBe("Jeden 2. Mittwoch im Monat");
    expect(words({ freq: "nth_weekday", n: -1 }, "2026-10-30")).toBe("Jeden letzten Freitag im Monat");
    expect(words({ freq: "custom", text: "jeden 1. und 3. Freitag" })).toBe("„jeden 1. und 3. Freitag“");
  });

  it("puts a Flyer's listed dates first and continues with the rule after the last", () => {
    expect(firstDates({ freq: "nth_weekday", n: 2, anchor: "2026-10-10" }, ["2026-11-14", "2026-10-10"], 4)).toEqual([
      "2026-10-10",
      "2026-11-14",
      "2026-12-12",
      "2027-01-09",
    ]);
  });

  it("is read from the Flyer when it's clear, and left open when it isn't", () => {
    expect(ruleFromFlyer(series("jeden Mittwoch", "weekly"))).toEqual({ freq: "weekly", anchor: "2026-10-14" });
    expect(ruleFromFlyer(series("alle 14 Tage", "every_n_weeks"))).toEqual({ freq: "every_n_weeks", n: 2, anchor: "2026-10-14" });
    expect(ruleFromFlyer(series("14-tägig", "every_n_weeks"))).toEqual({ freq: "every_n_weeks", n: 2, anchor: "2026-10-14" });
    expect(ruleFromFlyer(series("alle 3 Wochen", "every_n_weeks"))).toEqual({ freq: "every_n_weeks", n: 3, anchor: "2026-10-14" });
    expect(ruleFromFlyer(series("jeden 2. Mittwoch im Monat", "nth_weekday_of_month"))).toEqual({ freq: "nth_weekday", n: 2, anchor: "2026-10-14" });
    expect(ruleFromFlyer(series("jeden letzten Freitag", "nth_weekday_of_month", "2026-10-30"))).toEqual({ freq: "nth_weekday", n: -1, anchor: "2026-10-30" });
    expect(ruleFromFlyer(series("jeden 1. und 3. Freitag", "nth_weekday_of_month"))).toBeNull();
    expect(ruleFromFlyer(series("jeden 2. Mittwoch", "unclear"))).toBeNull();
    expect(ruleFromFlyer(series("jeden Mittwoch", "weekly", ""))).toBeNull();
  });

  it("offers the readings of its date as chat buttons and select options", () => {
    expect(ruleButtons("2026-10-14", "jeden 2. Mittwoch")).toEqual([
      { value: "every:2", title: "Alle 2 Wochen" },
      { value: "nth:2", title: "2. Mi im Monat" },
    ]);
    expect(ruleOptions("2026-10-30", null).map((o) => o.label)).toEqual([
      "Jeden Freitag",
      "Alle 2 Wochen freitags",
      "Jeden letzten Freitag im Monat",
    ]);
  });
});
