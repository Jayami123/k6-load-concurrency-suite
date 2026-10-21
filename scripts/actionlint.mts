// Ported from Jayami123/playwright-e2e-ci-framework, path scripts/actionlint.mts, commit 2d714c7.
// Runs with plain node (type stripping); the only change is this header.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const ACTIONLINT_VERSION = "1.7.12";
const CHECKSUMS_URL = `https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_checksums.txt`;
/** GitHub release asset digest for actionlint_${VERSION}_checksums.txt (v1.7.12). */
const CHECKSUMS_FILE_SHA256 = "433028cf0ba3c42163ea1a668dedce30fcdbe84fe912b1a5e288c006eab8a4f5";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const binDir = path.join(repoRoot, "node_modules", ".bin");
const cacheDir = path.join(repoRoot, "node_modules", ".cache", "actionlint", ACTIONLINT_VERSION);

interface PlatformAsset {
  readonly os: string;
  readonly arch: string;
  readonly ext: "tar.gz" | "zip";
  readonly archiveMember: string;
}

function resolvePlatformAsset(): PlatformAsset {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "win32") {
    if (arch === "x64") {
      return { os: "windows", arch: "amd64", ext: "zip", archiveMember: "actionlint.exe" };
    }
    if (arch === "ia32") {
      return { os: "windows", arch: "386", ext: "zip", archiveMember: "actionlint.exe" };
    }
    if (arch === "arm64") {
      return { os: "windows", arch: "arm64", ext: "zip", archiveMember: "actionlint.exe" };
    }
  }
  if (platform === "darwin") {
    if (arch === "arm64") {
      return { os: "darwin", arch: "arm64", ext: "tar.gz", archiveMember: "actionlint" };
    }
    return { os: "darwin", arch: "amd64", ext: "tar.gz", archiveMember: "actionlint" };
  }
  if (platform === "linux") {
    if (arch === "arm64") {
      return { os: "linux", arch: "arm64", ext: "tar.gz", archiveMember: "actionlint" };
    }
    if (arch === "ia32") {
      return { os: "linux", arch: "386", ext: "tar.gz", archiveMember: "actionlint" };
    }
    return { os: "linux", arch: "amd64", ext: "tar.gz", archiveMember: "actionlint" };
  }
  if (platform === "freebsd") {
    if (arch === "ia32") {
      return { os: "freebsd", arch: "386", ext: "tar.gz", archiveMember: "actionlint" };
    }
    return { os: "freebsd", arch: "amd64", ext: "tar.gz", archiveMember: "actionlint" };
  }

  throw new Error(`Unsupported platform for actionlint ${ACTIONLINT_VERSION}: ${platform} ${arch}`);
}

function archiveFileName(asset: PlatformAsset): string {
  return `actionlint_${ACTIONLINT_VERSION}_${asset.os}_${asset.arch}.${asset.ext}`;
}

function installedExecutablePath(asset: PlatformAsset): string {
  const fileName = asset.archiveMember;
  return path.join(binDir, fileName);
}

async function sha256File(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function sha256Buffer(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${String(response.status)}): ${url}`);
  }
  if (response.body === null) {
    throw new Error(`Download returned no body: ${url}`);
  }
  await mkdir(path.dirname(destPath), { recursive: true });
  await pipeline(response.body, createWriteStream(destPath));
}

function parseChecksumForFile(checksumsText: string, fileName: string): string {
  for (const line of checksumsText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    const match = /^([a-f0-9]{64})\s+(\S+)$/.exec(trimmed);
    if (match === null) {
      continue;
    }
    const [, hash, name] = match;
    if (name === fileName && hash !== undefined) {
      return hash;
    }
  }
  throw new Error(`Checksum not found for ${fileName} in ${CHECKSUMS_URL}`);
}

async function fetchVerifiedChecksumsText(): Promise<string> {
  const response = await fetch(CHECKSUMS_URL);
  if (!response.ok) {
    throw new Error(`Checksums download failed (${String(response.status)}): ${CHECKSUMS_URL}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const digest = sha256Buffer(buffer);
  if (digest !== CHECKSUMS_FILE_SHA256) {
    throw new Error(
      `Checksums file digest mismatch: expected ${CHECKSUMS_FILE_SHA256}, got ${digest}`,
    );
  }
  return buffer.toString("utf8");
}

async function extractArchive(
  archivePath: string,
  asset: PlatformAsset,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  if (asset.ext === "zip") {
    const result = spawnSync("tar", ["-xf", archivePath, "-C", destDir, asset.archiveMember], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`Failed to extract ${archivePath} (tar exit ${String(result.status)})`);
    }
    return;
  }
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", destDir, asset.archiveMember], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to extract ${archivePath} (tar exit ${String(result.status)})`);
  }
}

async function ensureActionlintBinary(): Promise<string> {
  const asset = resolvePlatformAsset();
  const archiveName = archiveFileName(asset);
  const exePath = installedExecutablePath(asset);
  const markerPath = path.join(cacheDir, ".installed");

  try {
    await readFile(markerPath);
    const versionResult = spawnSync(exePath, ["-version"], { encoding: "utf8" });
    const versionOut = `${versionResult.stdout}${versionResult.stderr}`;
    if (versionResult.status === 0 && versionOut.includes(ACTIONLINT_VERSION)) {
      return exePath;
    }
  } catch {
    // install below
  }

  await mkdir(cacheDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  const checksumsText = await fetchVerifiedChecksumsText();
  const expectedArchiveHash = parseChecksumForFile(checksumsText, archiveName);
  const archivePath = path.join(cacheDir, archiveName);
  const downloadUrl = `https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${archiveName}`;

  await downloadToFile(downloadUrl, archivePath);
  const archiveHash = await sha256File(archivePath);
  if (archiveHash !== expectedArchiveHash) {
    throw new Error(
      `Archive checksum mismatch for ${archiveName}: expected ${expectedArchiveHash}, got ${archiveHash}`,
    );
  }

  const extractDir = path.join(cacheDir, "extract");
  await rm(extractDir, { recursive: true, force: true });
  await extractArchive(archivePath, asset, extractDir);

  const extractedExe = path.join(extractDir, asset.archiveMember);
  await rm(exePath, { force: true });
  await writeFile(exePath, await readFile(extractedExe));
  if (process.platform !== "win32") {
    await chmod(exePath, 0o755);
  }

  const versionResult = spawnSync(exePath, ["-version"], { encoding: "utf8" });
  const versionOut = `${versionResult.stdout}${versionResult.stderr}`;
  if (versionResult.status !== 0 || !versionOut.includes(ACTIONLINT_VERSION)) {
    throw new Error(`actionlint install verification failed: ${versionOut}`);
  }

  await writeFile(markerPath, `${versionOut.trim()}\n`, "utf8");
  return exePath;
}

function runActionlint(exePath: string, args: readonly string[]): void {
  const result = spawnSync(exePath, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const installOnly = args.length === 1 && args[0] === "--install-only";
  const exePath = await ensureActionlintBinary();
  if (installOnly) {
    process.stdout.write(`${exePath}\n`);
    return;
  }
  runActionlint(exePath, args);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
