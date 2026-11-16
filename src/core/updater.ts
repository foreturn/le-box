export const APP_META = {
  name: "LeBox",
  id: "dev.lebox.client",
  version: "1.0.0",
  build: 1,
} as const;

export interface GitHubReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

export interface GitHubReleasePayload {
  tag_name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

export interface SingBoxReleaseInfo {
  currentVersion: string | null;
  latestVersion: string;
  hasUpdate: boolean;
  assetName: string;
  downloadUrl: string;
  sizeBytes: number;
  publishedAt: string;
  releaseUrl: string;
  notes: string;
}

export function parseSingBoxVersionOutput(raw: string): string | null {
  const match = raw.match(/sing-box\s+version\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/i);
  if (match?.[1]) return match[1];
  const fallback = raw.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/);
  return fallback?.[1] ?? null;
}

interface ParsedSemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

function parseSemVer(raw: string): ParsedSemVer | null {
  const cleaned = raw.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
    pre: match[4] ? match[4].split(".") : [],
  };
}

export function compareSemVer(a: string, b: string): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa || !pb) {
    return a.localeCompare(b);
  }
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;

  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let idx = 0; idx < len; idx += 1) {
    const left = pa.pre[idx];
    const right = pb.pre[idx];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const leftNum = /^\d+$/.test(left) ? Number.parseInt(left, 10) : null;
    const rightNum = /^\d+$/.test(right) ? Number.parseInt(right, 10) : null;
    if (leftNum !== null && rightNum !== null) {
      return leftNum > rightNum ? 1 : -1;
    }
    if (leftNum !== null) return -1;
    if (rightNum !== null) return 1;
    return left > right ? 1 : -1;
  }
  return 0;
}

export function selectSingBoxReleaseAsset(
  assets: GitHubReleaseAsset[],
  platform: string,
  arch: string,
): GitHubReleaseAsset | null {
  const normalizedArch =
    arch === "aarch64" || arch === "arm64"
      ? "arm64"
      : arch === "x86_64" || arch === "amd64" || arch === "x64"
        ? "amd64"
        : arch;

  const patterns: RegExp[] = [];
  if (platform === "windows") {
    patterns.push(
      new RegExp(`^sing-box-.*-windows-${normalizedArch}\\.zip$`, "i"),
    );
  } else if (platform === "macos" || platform === "darwin") {
    patterns.push(
      new RegExp(`^sing-box-.*-darwin-${normalizedArch}\\.tar\\.gz$`, "i"),
    );
  } else if (platform === "linux") {
    patterns.push(
      new RegExp(`^sing-box-.*-linux-${normalizedArch}-glibc\\.tar\\.gz$`, "i"),
      new RegExp(`^sing-box-.*-linux-${normalizedArch}\\.tar\\.gz$`, "i"),
    );
  }

  for (const pat of patterns) {
    const found = assets.find((a) => pat.test(a.name));
    if (found) return found;
  }
  return null;
}