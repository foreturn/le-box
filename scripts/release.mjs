import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runNsh(args) {
  console.log(`[LeBox] nsh ${args.join(" ")}`);
  const res = spawnSync("nsh", args, { stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function getArg(argv, flag, fallback = "") {
  const idx = argv.indexOf(flag);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : fallback;
}

const [, , command = "help", ...rest] = process.argv;
const meta = JSON.parse(fs.readFileSync(path.resolve("nsh.json"), "utf8"));
const keysDir = path.resolve("keys");
const rootSecret = path.join(keysDir, "root.secret");
const rootPub = path.join(keysDir, "root.pub");
const releaseSecret = path.join(keysDir, "release.secret");
const releasePub = path.join(keysDir, "release.pub");
const releaseCert = path.join(keysDir, "release.cert");

if (command === "init-keys") {
  fs.mkdirSync(keysDir, { recursive: true });
  if (!fs.existsSync(rootSecret)) {
    runNsh(["keygen", path.join("keys", "root")]);
  }
  if (!fs.existsSync(releaseSecret)) {
    runNsh(["keygen", path.join("keys", "release")]);
  }
  runNsh([
    "certify",
    "--root", rootSecret,
    "--key", releasePub,
    "--apps", meta.id,
    "--out", releaseCert,
  ]);

  const pubKeyText = fs.readFileSync(rootPub, "utf8").trim();
  console.log("\n[LeBox] Signing keys ready. Add the following \"updater\" block to nsh.json before packaging:");
  console.log(JSON.stringify({
    updater: {
      url: "https://github.com/<owner>/<repo>/releases/latest/download/latest.json",
      publicKey: pubKeyText,
      packages: {
        roots: [pubKeyText],
      },
    },
  }, null, 2));
} else if (command === "publish") {
  const outDir = path.resolve("dist", "updates");
  fs.mkdirSync(outDir, { recursive: true });
  const build = getArg(rest, "--build", String((meta.build ?? 1) + 1));
  const appVersion = getArg(rest, "--app-version", meta.version);
  const pkgOut = getArg(rest, "--out", path.join(outDir, `${meta.id}-${build}.nshpkg`));
  runNsh([
    "publish",
    "--key", releaseSecret,
    "--cert", releaseCert,
    "--app-version", appVersion,
    "--build", build,
    "--out", pkgOut,
    ".",
  ]);
} else if (command === "manifest") {
  const distDir = path.resolve(getArg(rest, "--dist", "dist"));
  const outDir = path.resolve(getArg(rest, "--out", distDir));
  const baseUrl = getArg(rest, "--base-url", "");
  const notes = getArg(rest, "--notes", "");
  const pkgFile = getArg(rest, "--package", "");

  const archives = fs.existsSync(distDir)
    ? fs.readdirSync(distDir)
        .filter((f) => /^.+-d+.d+.d+-.+.(zip|tar.gz)$/i.test(f))
        .map((f) => path.join(distDir, f))
    : [];

  const args = ["update-manifest", "--key", rootSecret, "--out", outDir];
  if (pkgFile) args.push("--package", pkgFile);
  if (baseUrl) args.push("--base-url", baseUrl);
  if (notes) args.push("--notes", notes);
  args.push(...archives);
  runNsh(args);
} else {
  console.log(`Usage:
  node scripts/release.mjs init-keys
  node scripts/release.mjs publish [--app-version 1.0.1] [--build 2]
  node scripts/release.mjs manifest [--package dist/updates/dev.lebox.client-2.nshpkg] [--base-url https://...]`);
}
