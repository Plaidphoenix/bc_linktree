import { describe, expect, it } from "vitest";
import { buildAnalyticsTimeline } from "./index";

describe("analytics timeline", () => {
  it("starts empty without demo metrics", () => {
    const timeline = buildAnalyticsTimeline([], new Date("2026-07-30T12:00:00Z"));

    expect(timeline).toHaveLength(7);
    expect(timeline.every((item) => item.views === 0 && item.clicks === 0)).toBe(true);
  });

  it("maps real event counts into the last seven UTC days", () => {
    const timeline = buildAnalyticsTimeline(
      [
        { day: "2026-07-29", views: "3", clicks: "1" },
        { day: "2026-07-30", views: 2, clicks: 0 }
      ],
      new Date("2026-07-30T12:00:00Z")
    );

    expect(timeline.at(-2)).toEqual({ label: "Qua", views: 3, clicks: 1 });
    expect(timeline.at(-1)).toEqual({ label: "Qui", views: 2, clicks: 0 });
  });
});
