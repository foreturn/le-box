import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    target: "windows",
    out: "dist",
    arch: "",
    appVersion: "",
    build: "",
    name: "",
    debug: false,
    assetsOnly: false,
    passthrough: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--target" && argv[i + 1]) {
      args.target = argv[++i];
    } else if (token === "--out" && argv[i + 1]) {
      args.out = argv[++i];
    } else if (token === "--arch" && argv[i + 1]) {
      args.arch = argv[++i];
    } else if (token === "--app-version" && argv[i + 1]) {
      args.appVersion = argv[++i];
    } else if (token === "--build" && argv[i + 1]) {
      args.build = argv[++i];
    } else if (token === "--name" && argv[i + 1]) {
      args.name = argv[++i];
    } else if (token === "--debug") {
      args.debug = true;
    } else if (token === "--assets-only") {
      args.assetsOnly = true;
    } else {
      args.passthrough.push(token);
    }
  }
  return args;
}

function runCmd(cmd, args, cwd = process.cwd()) {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${res.status}`);
  }
}

function findCoreBinary(target, archHint) {
  if (target === "windows") {
    const sub = archHint === "arm64" || archHint === "aarch64" ? "windows-aarch64" : "windows-x86_64";
    return {
      src: path.resolve("core", sub, "sing-box.exe"),
      osArch: sub,
      binName: "sing-box.exe",
    };
  }
  if (target === "linux") {
    const sub = archHint === "arm64" || archHint === "aarch64" ? "linux-aarch64" : "linux-x86_64";
    return {
      src: path.resolve("core", sub, "sing-box"),
      osArch: sub,
      binName: "sing-box",
    };
  }
  if (target === "macos") {
    const sub = archHint === "x86_64" ? "macos-x86_64" : "macos-aarch64";
    return {
      src: path.resolve("core", sub, "sing-box"),
      osArch: sub,
      binName: "sing-box",
    };
  }
  return null;
}

function repackArchiveWindows(outDir, folderName, archiveName) {
  const zipPath = path.join(outDir, archiveName);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  if (process.platform === "win32") {
    execFileSync("tar.exe", ["-a", "-cf", archiveName, folderName], {
      cwd: outDir,
      stdio: "inherit",
    });
  } else {
    execFileSync("zip", ["-r", "-q", archiveName, folderName], {
      cwd: outDir,
      stdio: "inherit",
    });
  }
}

function repackArchiveTarGz(outDir, folderName, archiveName) {
  const tarPath = path.join(outDir, archiveName);
  if (fs.existsSync(tarPath)) {
    fs.unlinkSync(tarPath);
  }
  const tarCmd = process.platform === "win32" ? "tar.exe" : "tar";
  execFileSync(tarCmd, ["-czf", archiveName, folderName], {
    cwd: outDir,
    stdio: "inherit",
  });
}

function findApkRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) return null;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findApkRecursive(full);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name.endsWith(".apk")) {
      return full;
    }
  }
  return null;
}

function packageAndroid(opts, meta) {
  const appName = opts.name || meta.name || "LeBox";
  const version = opts.appVersion || meta.version || "1.0.0";
  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  const androidRoot = path.resolve("android");
  const assetsOut = path.join(androidRoot, "app", "src", "main", "assets", "nsh");
  fs.rmSync(assetsOut, { recursive: true, force: true });
  fs.mkdirSync(assetsOut, { recursive: true });

  console.log(`[LeBox] Building nsh bytecode bundle into ${assetsOut}`);
  runCmd("nsh", ["build", ".", "--release", "--out", assetsOut]);

  for (const extra of ["bundle.js", "bundle.js.map"]) {
    const extraPath = path.join(assetsOut, extra);
    if (fs.existsSync(extraPath)) {
      fs.unlinkSync(extraPath);
    }
  }

  if (opts.assetsOnly) {
    console.log(`[LeBox] Android NSH assets prepared at ${assetsOut}`);
    return;
  }

  const libsDir = path.join(androidRoot, "app", "libs");
  const nshAar = path.join(libsDir, "nsh.aar");
  const libboxAar = path.join(libsDir, "libbox.aar");
  const missing = [];
  if (!fs.existsSync(nshAar)) missing.push(nshAar);
  if (!fs.existsSync(libboxAar)) missing.push(libboxAar);

  if (missing.length > 0) {
    throw new Error(
      `Missing Android native AAR dependencies:\n  - ${missing.join("\n  - ")}\nRun: node scripts/prepare-android-deps.mjs [--build-libbox | --libbox-aar <path>]`,
    );
  }

  const task = opts.debug ? ":app:assembleDebug" : ":app:assembleRelease";
  const gradlew = process.platform === "win32"
    ? path.join(androidRoot, "gradlew.bat")
    : path.join(androidRoot, "gradlew");
  const gradleCmd = fs.existsSync(gradlew)
    ? gradlew
    : process.platform === "win32"
      ? "gradle.bat"
      : "gradle";

  console.log(`[LeBox] Running ${gradleCmd} ${task} in ${androidRoot}`);
  runCmd(gradleCmd, [task, "--no-daemon"], androidRoot);

  const variantDir = opts.debug ? "debug" : "release";
  const apkSearchDir = path.join(androidRoot, "app", "build", "outputs", "apk", variantDir);
  const builtApk = findApkRecursive(apkSearchDir);
  if (!builtApk) {
    throw new Error(`Gradle completed but no APK found under ${apkSearchDir}`);
  }

  const suffix = opts.debug ? "android-debug" : "android";
  const destApk = path.join(outDir, `${appName}-${version}-${suffix}.apk`);
  fs.copyFileSync(builtApk, destApk);
  console.log(`[LeBox] Android APK packaged -> ${destApk}`);
}

function packageSingleTarget(target, opts, meta) {
  if (target === "android") {
    packageAndroid(opts, meta);
    return;
  }

  const appName = opts.name || meta.name || "LeBox";
  const version = opts.appVersion || meta.version || "1.0.0";
  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  const nshArgs = ["package", "--target", target, "--out", outDir];
  if (opts.arch && target === "macos") nshArgs.push("--arch", opts.arch);
  if (opts.appVersion) nshArgs.push("--app-version", opts.appVersion);
  if (opts.build) nshArgs.push("--build", opts.build);
  if (opts.name) nshArgs.push("--name", opts.name);
  nshArgs.push(...opts.passthrough);

  console.log(`[LeBox] Running: nsh ${nshArgs.join(" ")}`);
  try {
    runCmd("nsh", nshArgs);
  } catch (err) {
    if (target === "linux" && process.platform !== "linux") {
      console.error(
        "[LeBox] Note: nsh package --target linux must run on a Linux host (e.g. WSL2 or Linux CI) with nsh installed.",
      );
    }
    throw err;
  }

  const coreSpec = findCoreBinary(target, opts.arch);
  if (!coreSpec) {
    console.log(`[LeBox] Note: target "${target}" does not embed desktop sing-box binary.`);
    return;
  }

  if (!fs.existsSync(coreSpec.src)) {
    console.warn(
      `[LeBox] Warning: bundled core not found at ${coreSpec.src}. Packaged shell created without embedded sing-box.`,
    );
    return;
  }

  if (target === "windows") {
    const appDir = path.join(outDir, appName);
    const coreDestDir = path.join(appDir, "core");
    const coreDest = path.join(coreDestDir, coreSpec.binName);
    fs.mkdirSync(coreDestDir, { recursive: true });
    fs.copyFileSync(coreSpec.src, coreDest);
    console.log(`[LeBox] Embedded core into ${coreDest}`);

    repackArchiveWindows(outDir, appName, `${appName}.zip`);
    const versionedZip = `${appName}-${version}-${coreSpec.osArch}.zip`;
    fs.copyFileSync(path.join(outDir, `${appName}.zip`), path.join(outDir, versionedZip));
    console.log(`[LeBox] Updated archive: ${path.join(outDir, `${appName}.zip`)} & ${versionedZip}`);
    return;
  }

  if (target === "linux") {
    const appDir = path.join(outDir, appName);
    const coreDestDir = path.join(appDir, "core");
    const coreDest = path.join(coreDestDir, coreSpec.binName);
    fs.mkdirSync(coreDestDir, { recursive: true });
    fs.copyFileSync(coreSpec.src, coreDest);
    fs.chmodSync(coreDest, 0o755);
    console.log(`[LeBox] Embedded core into ${coreDest}`);

    repackArchiveTarGz(outDir, appName, `${appName}.tar.gz`);
    const versionedTar = `${appName}-${version}-${coreSpec.osArch}.tar.gz`;
    fs.copyFileSync(path.join(outDir, `${appName}.tar.gz`), path.join(outDir, versionedTar));
    console.log(`[LeBox] Updated archive: ${path.join(outDir, `${appName}.tar.gz`)} & ${versionedTar}`);
    return;
  }

  if (target === "macos") {
    const bundleDir = path.join(outDir, `${appName}.app`);
    const macosCoreDir = path.join(bundleDir, "Contents", "MacOS", "core");
    const resCoreDir = path.join(bundleDir, "Contents", "Resources", "core");
    fs.mkdirSync(macosCoreDir, { recursive: true });
    fs.mkdirSync(resCoreDir, { recursive: true });
    const dest1 = path.join(macosCoreDir, coreSpec.binName);
    const dest2 = path.join(resCoreDir, coreSpec.binName);
    fs.copyFileSync(coreSpec.src, dest1);
    fs.copyFileSync(coreSpec.src, dest2);
    fs.chmodSync(dest1, 0o755);
    fs.chmodSync(dest2, 0o755);
    console.log(`[LeBox] Embedded core into ${dest2}`);

    const versionedTar = `${appName}-${version}-${coreSpec.osArch}.tar.gz`;
    repackArchiveTarGz(outDir, `${appName}.app`, versionedTar);
    console.log(`[LeBox] Created archive: ${path.join(outDir, versionedTar)}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const meta = JSON.parse(fs.readFileSync(path.resolve("nsh.json"), "utf8"));

if (args.target === "all") {
  for (const t of ["windows", "macos", "linux", "android"]) {
    packageSingleTarget(t, args, meta);
  }
} else {
  packageSingleTarget(args.target, args, meta);
}
