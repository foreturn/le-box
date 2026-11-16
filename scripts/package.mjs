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

function packageSingleTarget(target, opts, meta) {
  const appName = opts.name || meta.name || "LeBox";
  const version = opts.appVersion || meta.version || "1.0.0";
  const outDir = path.resolve(opts.out, target === "all" ? "" : "");
  fs.mkdirSync(outDir, { recursive: true });

  const nshArgs = ["package", "--target", target, "--out", outDir];
  if (opts.arch && target === "macos") nshArgs.push("--arch", opts.arch);
  if (opts.appVersion) nshArgs.push("--app-version", opts.appVersion);
  if (opts.build) nshArgs.push("--build", opts.build);
  if (opts.name) nshArgs.push("--name", opts.name);
  nshArgs.push(...opts.passthrough);

  console.log(`[LeBox] Running: nsh ${nshArgs.join(" ")}`);
  runCmd("nsh", nshArgs);

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
  for (const t of ["windows", "macos", "linux"]) {
    packageSingleTarget(t, args, meta);
  }
} else {
  packageSingleTarget(args.target, args, meta);
}
