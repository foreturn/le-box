import { appInfo, openUrl } from "nsh";
import {
  checkForPackage,
  checkForUpdate,
  downloadPackage,
  downloadUpdate,
  installAndRestart,
  restartToPackage,
  runningPackage,
  shellInfo,
} from "nsh/updater";
import type { AppUpdate, PackageUpdate, RunningPackage, ShellInfo, UpdateProgress } from "nsh/updater";
import * as fs from "fs/promises";
import * as path from "path";
import process from "process";
import {
  APP_META,
  compareSemVer,
  parseSingBoxVersionOutput,
  selectSingBoxReleaseAsset,
} from "../core/updater";
import type { GitHubReleasePayload, SingBoxReleaseInfo } from "../core/updater";
import {
  formatProcessError,
  getDataDirSingBoxPath,
  getSingBoxBinaryName,
  isDesktopPlatform,
  probeSingBoxVersion,
  writeCoreOriginMarker,
} from "./runtime";

export const SINGBOX_RELEASES_LATEST_API =
  "https://api.github.com/repos/SagerNet/sing-box/releases/latest";

export interface AppRuntimeStatus {
  name: string;
  id: string;
  version: string;
  build: number;
  development: boolean;
  nshVersion: string;
  shellVersion: string | null;
  shellBuild: number | null;
  packagesEnabled: boolean;
  runningPackage: RunningPackage | null;
}

export interface FallbackManifestUpdate {
  version: string;
  build?: number;
  notes?: string;
  url?: string;
}

export interface AppUpdateCheckResult {
  packageUpdate: PackageUpdate | null;
  shellUpdate: AppUpdate | null;
  fallbackUpdate: FallbackManifestUpdate | null;
  errors: string[];
}

export interface HotUpdateSingBoxOptions {
  release: SingBoxReleaseInfo;
  useActiveProxy?: boolean;
  proxyUrl?: string;
  isCoreRunning?: boolean;
  stopCore?: () => Promise<void>;
  startCore?: () => Promise<void>;
  onStage?: (stage: string) => void;
}

function quotePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export async function checkSingBoxUpdate(
  configuredPath: string,
): Promise<SingBoxReleaseInfo> {
  const probe = await probeSingBoxVersion(configuredPath);
  const currentVersion = probe.ok
    ? parseSingBoxVersionOutput(probe.raw || probe.version)
    : null;

  const res = await fetch(SINGBOX_RELEASES_LATEST_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${APP_META.name}/${APP_META.version}`,
    },
  });
  if (!res.ok) {
    throw new Error(`查询 GitHub Release 失败 (HTTP ${res.status})`);
  }

  const payload = (await res.json()) as GitHubReleasePayload;
  const latestVersion = (payload.tag_name ?? "").replace(/^v/i, "").trim();
  if (!latestVersion) {
    throw new Error("GitHub Release 未返回有效的 tag_name 版本号。");
  }

  const asset = selectSingBoxReleaseAsset(
    Array.isArray(payload.assets) ? payload.assets : [],
    process.platform,
    process.arch,
  );
  if (!asset) {
    throw new Error(
      `官方发布资产中未找到适配当前平台 (${process.platform}/${process.arch}) 的安装包。`,
    );
  }

  const hasUpdate = currentVersion
    ? compareSemVer(latestVersion, currentVersion) > 0
    : true;

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    assetName: asset.name,
    downloadUrl: asset.browser_download_url,
    sizeBytes: asset.size,
    publishedAt: payload.published_at ?? "",
    releaseUrl:
      payload.html_url ??
      `https://github.com/SagerNet/sing-box/releases/tag/v${latestVersion}`,
    notes: (payload.body ?? "").trim(),
  };
}

async function resetDirectory(dirPath: string, cwd: string): Promise<void> {
  if (process.platform === "windows") {
    const escaped = quotePowerShellLiteral(dirPath);
    const cmd = [
      "$ErrorActionPreference = 'Stop'",
      `if (Test-Path -LiteralPath '${escaped}') { Remove-Item -LiteralPath '${escaped}' -Recurse -Force }`,
      `New-Item -ItemType Directory -Force -Path '${escaped}' | Out-Null`,
    ].join("; ");
    const res = await process.run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", cmd],
      { cwd, timeoutMs: 15000 },
    );
    if (res.code !== 0) {
      throw new Error(res.stderr.trim() || `初始化暂存目录失败 (code=${res.code})`);
    }
    return;
  }

  const res = await process.run(
    "env",
    ["sh", "-c", "rm -rf \"$1\" && mkdir -p \"$1\"", "_", dirPath],
    { cwd, timeoutMs: 15000 },
  );
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || `初始化暂存目录失败 (code=${res.code})`);
  }
}

async function cleanupDirectory(dirPath: string, cwd: string): Promise<void> {
  try {
    if (process.platform === "windows") {
      const escaped = quotePowerShellLiteral(dirPath);
      await process.run(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Remove-Item -LiteralPath '${escaped}' -Recurse -Force -ErrorAction SilentlyContinue`,
        ],
        { cwd, timeoutMs: 10000 },
      );
    } else {
      await process.run("env", ["rm", "-rf", dirPath], { cwd, timeoutMs: 10000 });
    }
  } catch {
    // best-effort cleanup
  }
}

async function findExtractedBinary(extractDir: string, binName: string): Promise<string | null> {
  const direct = path.join(extractDir, binName);
  if (await fs.exists(direct)) return direct;

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(extractDir, entry.name, binName);
    if (await fs.exists(nested)) return nested;
  }
  return null;
}

async function probeSpecificBinary(binPath: string, cwd: string): Promise<string> {
  const res =
    process.platform === "windows"
      ? await process.run(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `& '${quotePowerShellLiteral(binPath)}' version`,
          ],
          { cwd, timeoutMs: 8000 },
        )
      : await process.run("env", [binPath, "version"], { cwd, timeoutMs: 8000 });

  const raw = (res.stdout || res.stderr || "").trim();
  if (res.code !== 0) {
    throw new Error(`新内核自检失败 (exit ${String(res.code)}): ${raw}`);
  }
  const parsed = parseSingBoxVersionOutput(raw);
  if (!parsed) {
    throw new Error(`新内核版本输出异常: ${raw || "空输出"}`);
  }
  return parsed;
}

export async function hotUpdateSingBox(
  options: HotUpdateSingBoxOptions,
): Promise<{ version: string; binaryPath: string; restarted: boolean }> {
  const targetBin = getDataDirSingBoxPath();
  if (!targetBin || !process.dataDir || !isDesktopPlatform()) {
    throw new Error("当前运行环境未提供桌面数据目录，无法执行 sing-box 热更新。");
  }

  const dataDir = process.dataDir;
  const stageDir = path.join(dataDir, "core-update-tmp");
  const extractDir = path.join(stageDir, "extracted");
  const archivePath = path.join(stageDir, options.release.assetName);
  const binName = getSingBoxBinaryName();
  const backupBin = path.join(dataDir, `${binName}.bak`);

  await fs.mkdir(dataDir, { recursive: true });
  await resetDirectory(stageDir, dataDir);
  await fs.mkdir(extractDir, { recursive: true });

  try {
    options.onStage?.(`正在下载 ${options.release.assetName}...`);
    const curlCmd = process.platform === "windows" ? "curl.exe" : "curl";
    const curlArgs = [
      "-fL",
      "--retry",
      "2",
      "--connect-timeout",
      "15",
      "-o",
      archivePath,
    ];
    if (options.useActiveProxy && options.proxyUrl) {
      curlArgs.push("-x", options.proxyUrl);
    }
    curlArgs.push(options.release.downloadUrl);

    const dlRes = await process.run(curlCmd, curlArgs, {
      cwd: dataDir,
      timeoutMs: 180000,
    });
    if (dlRes.code !== 0) {
      throw new Error(
        `下载失败 (exit ${String(dlRes.code)}): ${dlRes.stderr.trim() || dlRes.stdout.trim()}`,
      );
    }

    options.onStage?.("正在解压内核压缩包...");
    const tarCmd = process.platform === "windows" ? "tar.exe" : "tar";
    const tarRes = await process.run(
      tarCmd,
      ["-xf", archivePath, "-C", extractDir],
      { cwd: dataDir, timeoutMs: 60000 },
    );
    if (tarRes.code !== 0) {
      throw new Error(
        `解压失败 (exit ${String(tarRes.code)}): ${tarRes.stderr.trim() || tarRes.stdout.trim()}`,
      );
    }

    const extractedBin = await findExtractedBinary(extractDir, binName);
    if (!extractedBin) {
      throw new Error(`压缩包内未找到 ${binName} 可执行文件。`);
    }

    if (process.platform !== "windows") {
      await process.run("chmod", ["+x", extractedBin], {
        cwd: dataDir,
        timeoutMs: 5000,
      });
    }

    options.onStage?.("正在校验新版本内核...");
    const verifiedVersion = await probeSpecificBinary(extractedBin, dataDir);

    const wasRunning = Boolean(options.isCoreRunning);
    if (wasRunning && options.stopCore) {
      options.onStage?.("正在停止当前 sing-box 以替换文件...");
      await options.stopCore();
    }

    options.onStage?.("正在原子替换内核文件...");
    if (await fs.exists(backupBin)) {
      await fs.unlink(backupBin);
    }
    const hadOldTarget = await fs.exists(targetBin);
    if (hadOldTarget) {
      await fs.rename(targetBin, backupBin);
    }

    try {
      await fs.rename(extractedBin, targetBin);
      const liveProbe = await probeSingBoxVersion("sing-box");
      if (!liveProbe.ok) {
        throw new Error(liveProbe.raw || "替换后内核探测失败");
      }
    } catch (swapErr) {
      if (await fs.exists(backupBin)) {
        try {
          if (await fs.exists(targetBin)) {
            await fs.unlink(targetBin);
          }
          await fs.rename(backupBin, targetBin);
        } catch {
          // ignore rollback secondary failure
        }
      }
      throw new Error(`替换内核失败并已回滚: ${formatProcessError(swapErr)}`);
    }

    await writeCoreOriginMarker({
      origin: "hot-updated",
      version: verifiedVersion,
      updatedAt: new Date().toISOString(),
    });

    if (await fs.exists(backupBin)) {
      try {
        await fs.unlink(backupBin);
      } catch {
        // ignore backup cleanup failure
      }
    }

    let restarted = false;
    if (wasRunning && options.startCore) {
      options.onStage?.("正在重启 sing-box...");
      await options.startCore();
      restarted = true;
    }

    return {
      version: verifiedVersion,
      binaryPath: targetBin,
      restarted,
    };
  } finally {
    await cleanupDirectory(stageDir, dataDir);
  }
}

export function getAppUpdateStatus(): AppRuntimeStatus {
  let info = {
    id: APP_META.id as string | null,
    name: APP_META.name as string | null,
    version: APP_META.version as string | null,
    build: APP_META.build as number | null,
    development: true,
  };
  let shell: ShellInfo = {
    version: null,
    build: null,
    nshVersion: "unknown",
    packages: false,
  };
  let pkg: RunningPackage | null = null;

  try {
    info = appInfo();
  } catch {
    // fallback to APP_META
  }
  try {
    shell = shellInfo();
  } catch {
    // ignore in non-updater environments
  }
  try {
    pkg = runningPackage();
  } catch {
    pkg = null;
  }

  return {
    name: info.name ?? APP_META.name,
    id: info.id ?? APP_META.id,
    version: pkg?.version ?? info.version ?? shell.version ?? APP_META.version,
    build: pkg?.build ?? info.build ?? shell.build ?? APP_META.build,
    development: Boolean(info.development),
    nshVersion: shell.nshVersion,
    shellVersion: shell.version ?? null,
    shellBuild: shell.build ?? null,
    packagesEnabled: Boolean(shell.packages),
    runningPackage: pkg,
  };
}

export async function checkAppUpdates(
  manifestUrl?: string,
): Promise<AppUpdateCheckResult> {
  const errors: string[] = [];
  let packageUpdate: PackageUpdate | null = null;
  let shellUpdate: AppUpdate | null = null;
  let fallbackUpdate: FallbackManifestUpdate | null = null;

  try {
    packageUpdate = await checkForPackage();
  } catch (err) {
    errors.push(`检查代码热更新包失败: ${formatProcessError(err)}`);
  }

  try {
    shellUpdate = await checkForUpdate();
  } catch (err) {
    errors.push(`检查桌面整包更新失败: ${formatProcessError(err)}`);
  }

  const trimmedManifest = manifestUrl?.trim() ?? "";
  if (!packageUpdate && !shellUpdate && trimmedManifest) {
    try {
      const res = await fetch(trimmedManifest, {
        headers: {
          Accept: "application/json",
          "User-Agent": `${APP_META.name}/${APP_META.version}`,
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        version?: string;
        build?: number;
        notes?: string;
        url?: string;
        package?: { version?: string; build?: number; notes?: string; url?: string };
      };
      const status = getAppUpdateStatus();
      const remoteVer = (data.package?.version ?? data.version ?? "").trim();
      const remoteBuild = data.package?.build ?? data.build;
      const isNewerVer = remoteVer
        ? compareSemVer(remoteVer, status.version) > 0
        : false;
      const isNewerBuild =
        typeof remoteBuild === "number" && remoteBuild > status.build;

      if (isNewerVer || isNewerBuild) {
        fallbackUpdate = {
          version: remoteVer || status.version,
          build: typeof remoteBuild === "number" ? remoteBuild : undefined,
          notes: data.package?.notes ?? data.notes,
          url: data.package?.url ?? data.url ?? trimmedManifest,
        };
      }
    } catch (err) {
      errors.push(`检查自定义更新清单失败: ${formatProcessError(err)}`);
    }
  }

  return {
    packageUpdate,
    shellUpdate,
    fallbackUpdate,
    errors,
  };
}

export async function applyAppPackageHotUpdate(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  await downloadPackage(onProgress ?? null);
  await restartToPackage();
}

export async function applyAppShellUpdate(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  await downloadUpdate(onProgress ?? null);
  await installAndRestart();
}

export async function openExternalUrl(url: string): Promise<void> {
  await openUrl(url);
}
