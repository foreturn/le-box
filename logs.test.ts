import { describe, expect, test } from "nsh/test";
import { detectLogLevel, stripAnsiCodes } from "./src/services/runtime";

describe("Log formatting and level detection", () => {
  test("stripAnsiCodes removes terminal color sequences cleanly", () => {
    const raw = "+0800 2026-11-18 15:49:31 \u001b[36mINFO\u001b[0m dns: exchanged A tc.throws.work.";
    expect(stripAnsiCodes(raw)).toBe("+0800 2026-11-18 15:49:31 INFO dns: exchanged A tc.throws.work.");
  });

  test("detectLogLevel classifies sing-box stderr INFO/WARN/FATAL/DEBUG lines accurately", () => {
    expect(
      detectLogLevel("+0800 2026-11-18 15:49:31 \u001b[36mINFO\u001b[0m dns: exchanged A example.com", "stderr"),
    ).toBe("info");
    expect(
      detectLogLevel("\u001b[33mWARN\u001b[0m[0000] legacy download_detour", "stderr"),
    ).toBe("warn");
    expect(
      detectLogLevel("\u001b[31mFATAL\u001b[0m[0000] start service: EOF", "stderr"),
    ).toBe("error");
    expect(
      detectLogLevel("+0800 2026-11-18 15:49:31 \u001b[37mDEBUG\u001b[0m router: updating rule-set", "stderr"),
    ).toBe("debug");
  });
});
