import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ALL_TARGETS = [
  "windows-x86_64",
  "windows-aarch64",
  "linux-x86_64",
  "linux-aarch64",
  "macos-aarch64",
  "macos-x86_64",
];

const TARGET_SPECS = {
  "windows-x86_64": {
    binName: "sing-box.exe",
    archiveKind: "zip",
    patterns: [/^sing-box-.*-windows-amd64\.zip$/i],
  },
  "windows-aarch64": {
    binName: "sing-box.exe",
    archiveKind: "zip",
    patterns: [/^sing-box-.*-windows-arm64\.zip$/i],
  },
  "linux-x86_64": {
    binName: "sing-box",
    archiveKind: "tar.gz",
    patterns: [
      /^sing-box-.*-linux-amd64-glibc\.tar\.gz$/i,
      /^sing-box-.*-linux-amd64\.tar\.gz$/i,
    ],
  },
  "linux-aarch64": {
    binName: "sing-box",
    archiveKind: "tar.gz",
    patterns: [
      /^sing-box-.*-linux-arm64-glibc\.tar\.gz$/i,
      /^sing-box-.*-linux-arm64\.tar\.gz$/i,
    ],
  },
  "macos-aarch64": {
    binName: "sing-box",
    archiveKind: "tar.gz",
    patterns: [/^sing-box-.*-darwin-arm64\.tar\.gz$/i],
  },
  "macos-x86_64": {
    binName: "sing-box",
    archiveKind: "tar.gz",
    patterns: [/^sing-box-.*-darwin-amd64\.tar\.gz$/i],
  },
};

function parseArgs(argv) {
  const opts = {
    targets: ["windows-x86_64", "linux-x86_64"],
    version: "",
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--targets" && argv[i + 1]) {
      const raw = argv[++i].trim();
      if (raw === "all") {
        opts.targets = [...ALL_TARGETS];
      } else {
        opts.targets = raw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } else if (token === "--version" && argv[i + 1]) {
      opts.version = argv[++i].trim().replace(/^v/i, "");
    } else if (token === "--force") {
      opts.force = true;
    } else if (token === "--help" || token === "-h") {
      console.log(`Usage: node scripts/prepare-cores.mjs [options]

Options:
  --targets <list|all>  Comma-separated targets (default: windows-x86_64,linux-x86_64)
                        Supported: ${ALL_TARGETS.join(", ")}
  --version <semver>    Specific sing-box tag version (default: latest release)
  --force               Re-download even if target binary already exists`);
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

function fetchReleaseMetadata(version) {
  const url = version
    ? `https://api.github.com/repos/SagerNet/sing-box/releases/tags/v${version}`
    : "https://api.github.com/repos/SagerNet/sing-box/releases/latest";
  const raw = execFileSync(
    curlCommand(),
    ["-fsSL", "-H", "Accept: application/vnd.github+json", "-H", "User-Agent: LeBox-Core-Prep", url],
    { encoding: "utf8" },
  );
  return JSON.parse(raw);
}

function findAsset(assets, patterns) {
  for (const pat of patterns) {
    const match = assets.find((asset) => pat.test(asset.name));
    if (match) return match;
  }
  return null;
}

function findFileRecursive(rootDir, expectedName) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileRecursive(fullPath, expectedName);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name.toLowerCase() === expectedName.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

function extractArchive(archivePath, archiveKind, extractDir) {
  fs.mkdirSync(extractDir, { recursive: true });
  if (archiveKind === "zip") {
    if (process.platform === "win32") {
      execFileSync(tarCommand(), ["-xf", archivePath, "-C", extractDir], { stdio: "inherit" });
    } else {
      execFileSync("unzip", ["-oq", archivePath, "-d", extractDir], { stdio: "inherit" });
    }
    return;
  }
  execFileSync(tarCommand(), ["-xzf", archivePath, "-C", extractDir], { stdio: "inherit" });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  for (const target of opts.targets) {
    if (!TARGET_SPECS[target]) {
      throw new Error(`Unsupported target: ${target}. Supported: ${ALL_TARGETS.join(", ")}`);
    }
  }

  console.log("[LeBox] Fetching sing-box release metadata...");
  const release = fetchReleaseMetadata(opts.version);
  const tagName = String(release.tag_name || "unknown");
  const assets = Array.isArray(release.assets) ? release.assets : [];
  console.log(`[LeBox] Selected release: ${tagName} (${assets.length} assets)`);

  const cacheDir = path.resolve(".nsh", "cache", "sing-box");
  fs.mkdirSync(cacheDir, { recursive: true });

  for (const target of opts.targets) {
    const spec = TARGET_SPECS[target];
    const destDir = path.resolve("core", target);
    const destPath = path.join(destDir, spec.binName);

    if (!opts.force && fs.existsSync(destPath)) {
      const sizeMb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
      console.log(`[LeBox] Skip ${target}: already exists at ${destPath} (${sizeMb} MB). Use --force to replace.`);
      continue;
    }

    const asset = findAsset(assets, spec.patterns);
    if (!asset) {
      throw new Error(`No matching asset found in ${tagName} for target ${target}`);
    }

    const archivePath = path.join(cacheDir, asset.name);
    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size !== asset.size) {
      console.log(`[LeBox] Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)...`);
      const tmpArchive = `${archivePath}.part`;
      execFileSync(curlCommand(), ["-fL", "--retry", "3", "-o", tmpArchive, asset.browser_download_url], {
        stdio: "inherit",
      });
      fs.renameSync(tmpArchive, archivePath);
    } else {
      console.log(`[LeBox] Using cached archive ${archivePath}`);
    }

    const extractDir = path.join(cacheDir, `extract-${target}-${Date.now()}`);
    try {
      extractArchive(archivePath, spec.archiveKind, extractDir);
      const foundBin = findFileRecursive(extractDir, spec.binName);
      if (!foundBin) {
        throw new Error(`Extracted archive ${asset.name} did not contain ${spec.binName}`);
      }

      fs.mkdirSync(destDir, { recursive: true });
      const tmpDest = `${destPath}.tmp`;
      fs.copyFileSync(foundBin, tmpDest);
      if (process.platform !== "win32" && !spec.binName.endsWith(".exe")) {
        fs.chmodSync(tmpDest, 0o755);
      }
      fs.renameSync(tmpDest, destPath);
      fs.writeFileSync(path.join(destDir, ".sing-box-version"), `${tagName}\n`, "utf8");
      const sizeMb = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
      console.log(`[LeBox] Ready ${target} -> ${destPath} (${sizeMb} MB, ${tagName})`);
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }
}

main();
