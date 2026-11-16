import { describe, expect, test } from "nsh/test";
import {
  APP_META,
  compareSemVer,
  parseSingBoxVersionOutput,
  selectSingBoxReleaseAsset,
} from "./src/core/updater";
import type { GitHubReleaseAsset } from "./src/core/updater";

describe("Updater core helpers", () => {
  test("parses sing-box version output across formats", () => {
    const raw = "sing-box version 1.14.4\n\nEnvironment: go1.24.0 windows/amd64\nTags: with_gvisor,with_naive_outbound";
    expect(parseSingBoxVersionOutput(raw)).toBe("1.14.4");
    expect(parseSingBoxVersionOutput("sing-box version v1.15.0-beta.1")).toBe("1.15.0-beta.1");
    expect(parseSingBoxVersionOutput("no version here")).toBe(null);
  });

  test("compares SemVer including prereleases", () => {
    expect(compareSemVer("1.14.4", "1.14.3")).toBe(1);
    expect(compareSemVer("1.14.4", "1.14.4")).toBe(0);
    expect(compareSemVer("1.13.9", "1.14.0")).toBe(-1);
    expect(compareSemVer("1.15.0", "1.15.0-rc.1")).toBe(1);
    expect(compareSemVer("1.15.0-rc.2", "1.15.0-rc.1")).toBe(1);
  });

  test("selects matching sing-box GitHub release asset for desktop targets", () => {
    const assets: GitHubReleaseAsset[] = [
      { name: "sing-box-1.14.4-windows-amd64.zip", size: 42000000, browser_download_url: "https://example/win-x64.zip" },
      { name: "sing-box-1.14.4-windows-arm64.zip", size: 40000000, browser_download_url: "https://example/win-arm64.zip" },
      { name: "sing-box-1.14.4-darwin-arm64.tar.gz", size: 39000000, browser_download_url: "https://example/mac-arm64.tar.gz" },
      { name: "sing-box-1.14.4-darwin-amd64.tar.gz", size: 41000000, browser_download_url: "https://example/mac-x64.tar.gz" },
      { name: "sing-box-1.14.4-linux-amd64-musl.tar.gz", size: 38000000, browser_download_url: "https://example/linux-musl.tar.gz" },
      { name: "sing-box-1.14.4-linux-amd64-glibc.tar.gz", size: 39000000, browser_download_url: "https://example/linux-glibc.tar.gz" },
      { name: "sing-box-1.14.4-linux-arm64-glibc.tar.gz", size: 37000000, browser_download_url: "https://example/linux-arm64.tar.gz" },
    ];

    expect(selectSingBoxReleaseAsset(assets, "windows", "x86_64")?.name).toBe("sing-box-1.14.4-windows-amd64.zip");
    expect(selectSingBoxReleaseAsset(assets, "windows", "aarch64")?.name).toBe("sing-box-1.14.4-windows-arm64.zip");
    expect(selectSingBoxReleaseAsset(assets, "macos", "aarch64")?.name).toBe("sing-box-1.14.4-darwin-arm64.tar.gz");
    expect(selectSingBoxReleaseAsset(assets, "macos", "x86_64")?.name).toBe("sing-box-1.14.4-darwin-amd64.tar.gz");
    expect(selectSingBoxReleaseAsset(assets, "linux", "x86_64")?.name).toBe("sing-box-1.14.4-linux-amd64-glibc.tar.gz");
    expect(selectSingBoxReleaseAsset(assets, "linux", "aarch64")?.name).toBe("sing-box-1.14.4-linux-arm64-glibc.tar.gz");
    expect(selectSingBoxReleaseAsset(assets, "ios", "aarch64")).toBe(null);
  });

  test("exposes consistent APP_META defaults", () => {
    expect(APP_META.id).toBe("dev.lebox.client");
    expect(APP_META.version).toBe("1.0.0");
    expect(APP_META.build).toBe(1);
  });
});
