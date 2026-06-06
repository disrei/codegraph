/**
 * Resolved package version, computed once at module load.
 *
 * The version string is the rendezvous datum between cooperating daemon and
 * proxy processes: the daemon advertises its version in the hello line, and
 * the proxy refuses to share IPC across a mismatch (falls back to direct
 * mode). Keeping the resolution in one place avoids drift between the CLI
 * `--version` output (which reads `package.json` directly) and the daemon
 * handshake.
 *
 * Resolution strategy: read the bundled `package.json` two levels up from
 * this file — same relative position whether we're loaded from `src/mcp/` or
 * the `dist/mcp/` output, since `tsc` preserves the layout. If reading fails
 * (e.g. the package was unpacked oddly), fall back to "0.0.0-unknown" — a
 * sentinel that will never match a real version, so the proxy harmlessly
 * falls back to direct mode.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version === 'string' && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to sentinel.
  }
  return '0.0.0-unknown';
}

function packageRoot(): string {
  return path.join(__dirname, '..', '..');
}

function readBuildIdentity(): string {
  const root = packageRoot();
  const hash = crypto.createHash('sha256');
  hash.update(fs.realpathSync.native?.(root) ?? fs.realpathSync(root));

  const candidates = [
    path.join(root, 'package.json'),
    path.join(root, 'dist', 'index.js'),
    path.join(root, 'dist', 'mcp', 'index.js'),
    path.join(root, 'dist', 'extraction', 'grammars.js'),
    path.join(root, 'dist', 'extraction', 'languages', 'gdscript.js'),
    path.join(root, 'src', 'index.ts'),
    path.join(root, 'src', 'mcp', 'index.ts'),
    path.join(root, 'src', 'extraction', 'grammars.ts'),
    path.join(root, 'src', 'extraction', 'languages', 'gdscript.ts'),
  ];

  for (const file of candidates) {
    try {
      const stat = fs.statSync(file);
      hash.update(path.relative(root, file));
      hash.update(String(stat.size));
      hash.update(String(Math.floor(stat.mtimeMs)));
    } catch {
      // This file doesn't exist in the current runtime layout.
    }
  }

  return hash.digest('hex').slice(0, 16);
}

export const CodeGraphPackageVersion = readPackageVersion();
export const CodeGraphBuildIdentity = readBuildIdentity();
