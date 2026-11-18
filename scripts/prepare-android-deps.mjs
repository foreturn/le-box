import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const opts = {
    nshVersion: "",
    singBoxVersion: "1.14.4",
    libboxAar: "",
    buildLibbox: false,
    includeDev: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--nsh-version" && argv[i + 1]) {
      opts.nshVersion = argv[++i].trim().replace(/^v/i, "");
    } else if (token === "--sing-box-version" && argv[i + 1]) {
      opts.singBoxVersion = argv[++i].trim().replace(/^v/i, "");
    } else if (token === "--libbox-aar" && argv[i + 1]) {
      opts.libboxAar = path.resolve(argv[++i]);
    } else if (token === "--build-libbox") {
      opts.buildLibbox = true;
    } else if (token === "--include-dev") {
      opts.includeDev = true;
    } else if (token === "--force") {
      opts.force = true;
    } else if (token === "--help" || token === "-h") {
      console.log(`Usage: node scripts/prepare-android-deps.mjs [options]

Options:
  --nsh-version <ver>       nsh release tag (defaults to installed nsh --version)
  --sing-box-version <ver>  sing-box tag used by --build-libbox (default: 1.14.4)
  --libbox-aar <path>       Copy an existing libbox.aar into android/app/libs/libbox.aar
  --build-libbox            Build libbox.aar via gomobile bind (requires Go + Android NDK)
  --include-dev             Also copy nsh-dev.aar into android/app/libs/
  --force                   Re-download and overwrite existing AAR files`);
      process.exit(0);
    }
  }
  return opts;
}

function curlCommand() {
  return process.platform === "win32" ? "curl.exe" : "curl";
}

function tarCommand() {
  return process.platform === "win32" ? "tar.exe" : "tar";
}

function detectNshVersion() {
  try {
    const out = execFileSync("nsh", ["--version"], { encoding: "utf8" }).trim();
    const match = out.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }
  return "0.6.0";
}

function findFileRecursive(rootDir, expectedName) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileRecursive(fullPath, expectedName);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === expectedName) {
      return fullPath;
    }
  }
  return null;
}

function extractZip(archivePath, extractDir) {
  fs.mkdirSync(extractDir, { recursive: true });
  if (process.platform === "win32") {
    execFileSync(tarCommand(), ["-xf", archivePath, "-C", extractDir], { stdio: "inherit" });
  } else {
    execFileSync("unzip", ["-oq", archivePath, "-d", extractDir], { stdio: "inherit" });
  }
}

function ensureNshAndroidAar(opts, libsDir, cacheDir) {
  const nshVer = opts.nshVersion || detectNshVersion();
  const destNsh = path.join(libsDir, "nsh.aar");
  const destDev = path.join(libsDir, "nsh-dev.aar");

  if (!opts.force && fs.existsSync(destNsh) && (!opts.includeDev || fs.existsSync(destDev))) {
    const sizeMb = (fs.statSync(destNsh).size / 1024 / 1024).toFixed(1);
    console.log(`[LeBox] nsh.aar already present at ${destNsh} (${sizeMb} MB). Use --force to refresh.`);
    return;
  }

  const zipName = `nsh-embed-android-v${nshVer}.zip`;
  const zipPath = path.join(cacheDir, zipName);
  const url = `https://github.com/longbridge/nsh/releases/download/v${nshVer}/nsh-embed-android.zip`;

  if (!fs.existsSync(zipPath) || opts.force) {
    console.log(`[LeBox] Downloading nsh-embed-android.zip (v${nshVer})...`);
    const tmpZip = `${zipPath}.part`;
    execFileSync(curlCommand(), ["-fL", "--retry", "3", "-o", tmpZip, url], { stdio: "inherit" });
    fs.renameSync(tmpZip, zipPath);
  } else {
    console.log(`[LeBox] Using cached ${zipPath}`);
  }

  const extractDir = path.join(cacheDir, `nsh-extract-${Date.now()}`);
  try {
    extractZip(zipPath, extractDir);
    const nshAar = findFileRecursive(extractDir, "nsh.aar");
    if (!nshAar) {
      throw new Error("nsh-embed-android.zip did not contain nsh.aar");
    }
    fs.copyFileSync(nshAar, destNsh);
    console.log(`[LeBox] Installed ${destNsh} (${(fs.statSync(destNsh).size / 1024 / 1024).toFixed(1)} MB)`);

    if (opts.includeDev) {
      const devAar = findFileRecursive(extractDir, "nsh-dev.aar");
      if (devAar) {
        fs.copyFileSync(devAar, destDev);
        console.log(`[LeBox] Installed ${destDev} (${(fs.statSync(destDev).size / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

function detectAndroidNdk(androidHome) {
  if (process.env.ANDROID_NDK_HOME && fs.existsSync(process.env.ANDROID_NDK_HOME)) {
    return process.env.ANDROID_NDK_HOME;
  }
  const ndkRoot = path.join(androidHome, "ndk");
  if (!fs.existsSync(ndkRoot)) return null;
  const candidates = fs
    .readdirSync(ndkRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const ver of candidates) {
    const full = path.join(ndkRoot, ver);
    if (fs.existsSync(path.join(full, "source.properties"))) {
      return full;
    }
  }
  return null;
}

function ensureGomobile(goBinDir) {
  const ext = process.platform === "win32" ? ".exe" : "";
  const gomobilePath = path.join(goBinDir, `gomobile${ext}`);
  const gobindPath = path.join(goBinDir, `gobind${ext}`);
  if (!fs.existsSync(gomobilePath) || !fs.existsSync(gobindPath)) {
    console.log("[LeBox] Installing sagernet gomobile & gobind v0.1.13...");
    execFileSync("go", ["install", "-v", "github.com/sagernet/gomobile/cmd/gomobile@v0.1.13"], {
      stdio: "inherit",
    });
    execFileSync("go", ["install", "-v", "github.com/sagernet/gomobile/cmd/gobind@v0.1.13"], {
      stdio: "inherit",
    });
    execFileSync(gomobilePath, ["init"], { stdio: "inherit" });
  }
  return gomobilePath;
}

function buildLibboxAar(opts, libsDir, cacheDir) {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  if (!androidHome || !fs.existsSync(androidHome)) {
    throw new Error("ANDROID_HOME is not set or missing. Set ANDROID_HOME to your Android SDK directory.");
  }
  const ndkPath = detectAndroidNdk(androidHome);
  if (!ndkPath) {
    throw new Error(
      `Android NDK not found under ${path.join(androidHome, "ndk")} (or ANDROID_NDK_HOME). Install NDK via Android Studio SDK Manager or sdkmanager "ndk;27.2.12479018" before running --build-libbox.`,
    );
  }

  const goEnv = execFileSync("go", ["env", "GOPATH"], { encoding: "utf8" }).trim();
  const goBinDir = path.join(goEnv.split(path.delimiter)[0], "bin");
  const gomobilePath = ensureGomobile(goBinDir);

  const srcArchive = path.join(cacheDir, `sing-box-${opts.singBoxVersion}.tar.gz`);
  const srcUrl = `https://github.com/SagerNet/sing-box/archive/refs/tags/v${opts.singBoxVersion}.tar.gz`;
  if (!fs.existsSync(srcArchive) || opts.force) {
    console.log(`[LeBox] Downloading sing-box v${opts.singBoxVersion} source archive...`);
    const tmp = `${srcArchive}.part`;
    execFileSync(curlCommand(), ["-fL", "--retry", "3", "-o", tmp, srcUrl], { stdio: "inherit" });
    fs.renameSync(tmp, srcArchive);
  }

  const srcWork = path.join(cacheDir, `sing-box-src-${opts.singBoxVersion}`);
  if (!fs.existsSync(srcWork) || opts.force) {
    fs.rmSync(srcWork, { recursive: true, force: true });
    fs.mkdirSync(srcWork, { recursive: true });
    execFileSync(tarCommand(), ["-xzf", srcArchive, "-C", srcWork, "--strip-components=1"], {
      stdio: "inherit",
    });
  }

  const outAar = path.join(libsDir, "libbox.aar");
  const buildTags = [
    "with_gvisor",
    "with_quic",
    "with_wireguard",
    "with_utls",
    "with_naive_outbound",
    "with_clash_api",
    "badlinkname",
    "tfogo_checklinkname0",
  ].join(",");

  const env = {
    ...process.env,
    ANDROID_HOME: androidHome,
    ANDROID_NDK_HOME: ndkPath,
    PATH: `${goBinDir}${path.delimiter}${process.env.PATH || ""}`,
  };

  console.log(`[LeBox] Building libbox.aar (sing-box v${opts.singBoxVersion}, NDK: ${ndkPath})...`);
  const res = spawnSync(
    gomobilePath,
    [
      "bind",
      "-v",
      "-o",
      outAar,
      "-target",
      "android",
      "-androidapi",
      "24",
      "-javapkg=io.nekohasekai",
      "-libname=box",
      "-trimpath",
      "-buildvcs=false",
      "-ldflags",
      `-X github.com/sagernet/sing-box/constant.Version=${opts.singBoxVersion} -s -w -buildid=`,
      "-tags",
      buildTags,
      "./experimental/libbox",
    ],
    { cwd: srcWork, env, stdio: "inherit" },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`gomobile bind failed with exit code ${res.status}`);
  }
  console.log(`[LeBox] Built ${outAar} (${(fs.statSync(outAar).size / 1024 / 1024).toFixed(1)} MB)`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const libsDir = path.resolve("android", "app", "libs");
  const cacheDir = path.resolve(".nsh", "cache", "android");
  fs.mkdirSync(libsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  ensureNshAndroidAar(opts, libsDir, cacheDir);

  const destLibbox = path.join(libsDir, "libbox.aar");
  if (opts.libboxAar) {
    if (!fs.existsSync(opts.libboxAar)) {
      throw new Error(`--libbox-aar path does not exist: ${opts.libboxAar}`);
    }
    fs.copyFileSync(opts.libboxAar, destLibbox);
    console.log(`[LeBox] Copied libbox.aar -> ${destLibbox}`);
  } else if (opts.buildLibbox) {
    buildLibboxAar(opts, libsDir, cacheDir);
  } else if (fs.existsSync(destLibbox)) {
    const sizeMb = (fs.statSync(destLibbox).size / 1024 / 1024).toFixed(1);
    console.log(`[LeBox] libbox.aar already present at ${destLibbox} (${sizeMb} MB).`);
  } else {
    console.log(`
[LeBox] Note: android/app/libs/libbox.aar is not present yet.
Provide it in one of two ways:
  1. Copy an existing libbox.aar:
     node scripts/prepare-android-deps.mjs --libbox-aar <path-to-libbox.aar>
  2. Build it from sing-box v${opts.singBoxVersion} with Go + Android NDK:
     node scripts/prepare-android-deps.mjs --build-libbox`);
  }
}

main();
