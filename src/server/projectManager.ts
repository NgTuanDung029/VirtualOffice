import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { ProjectInfo } from '../shared/types.js';

/**
 * Validates and inspects a local Windows project directory.
 * Supports drive letters, spaces, Unicode, and Vietnamese characters.
 * Never executes project files or scripts.
 */
export function validateProjectDirectory(rawInputPath: string): ProjectInfo {
  const now = new Date().toISOString();
  const trimmed = (rawInputPath || '').trim();

  if (!trimmed) {
    return {
      path: '',
      name: '',
      exists: false,
      accessible: false,
      lastValidatedAt: now,
      error: 'Directory path cannot be empty.',
    };
  }

  if (trimmed.includes('\0')) {
    return {
      path: trimmed,
      name: '',
      exists: false,
      accessible: false,
      lastValidatedAt: now,
      error: 'Invalid characters in directory path.',
    };
  }

  let resolvedPath: string;
  try {
    resolvedPath = path.resolve(trimmed);
  } catch (err) {
    return {
      path: trimmed,
      name: path.basename(trimmed) || trimmed,
      exists: false,
      accessible: false,
      lastValidatedAt: now,
      error: `Invalid path syntax: ${String(err)}`,
    };
  }

  const parsed = path.parse(resolvedPath);
  const folderName = parsed.base || parsed.root || resolvedPath;
  const driveMatch = resolvedPath.match(/^([A-Za-z]:)/);
  const driveLetter = driveMatch ? driveMatch[1].toUpperCase() : undefined;

  if (!fs.existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      name: folderName,
      exists: false,
      accessible: false,
      driveLetter,
      lastValidatedAt: now,
      error: 'The selected folder does not exist (it may have been moved or deleted).',
    };
  }

  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return {
        path: resolvedPath,
        name: folderName,
        exists: true,
        accessible: false,
        driveLetter,
        lastValidatedAt: now,
        error: 'The selected path is a file, not a directory.',
      };
    }

    const entries = fs.readdirSync(resolvedPath);
    return {
      path: resolvedPath,
      name: folderName,
      exists: true,
      accessible: true,
      driveLetter,
      fileCountSummary: entries.length,
      lastValidatedAt: now,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || 'EACCES';
    return {
      path: resolvedPath,
      name: folderName,
      exists: true,
      accessible: false,
      driveLetter,
      lastValidatedAt: now,
      error: `Cannot access directory (${code}). Check Windows folder permissions.`,
    };
  }
}

/**
 * Checks if `candidatePath` is strictly inside `authorizedRootDir` (or equal to it),
 * preventing `..` path traversal or cross-drive access.
 */
export function isPathInsideProject(authorizedRootDir: string, candidatePath: string): boolean {
  try {
    const rootResolved = path.resolve(authorizedRootDir);
    const targetResolved = path.resolve(rootResolved, candidatePath);
    const rootComparable = process.platform === 'win32' ? rootResolved.toLowerCase() : rootResolved;
    const targetComparable =
      process.platform === 'win32' ? targetResolved.toLowerCase() : targetResolved;

    if (targetComparable === rootComparable) {
      return true;
    }
    const prefix = rootComparable.endsWith(path.sep)
      ? rootComparable
      : rootComparable + path.sep;
    return targetComparable.startsWith(prefix);
  } catch {
    return false;
  }
}

/**
 * Lists available Windows drive roots (e.g., C:\, D:\).
 */
export function listWindowsDrives(): { drive: string; label: string }[] {
  const drives: { drive: string; label: string }[] = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) {
        drives.push({ drive: root, label: `${letter}:\\` });
      }
    } catch {
      // Skip inaccessible drive
    }
  }
  return drives;
}

/**
 * Lists subdirectories inside a directory for the in-app folder browser modal.
 */
export function listSubdirectories(dirPath: string): {
  currentPath: string;
  parentPath: string | null;
  directories: { name: string; path: string }[];
  error?: string;
} {
  try {
    let clean = (dirPath || '').trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.slice(1, -1).trim();
    }
    if (/^[a-zA-Z]:$/.test(clean)) {
      clean += '\\';
    }
    const resolved = path.resolve(clean);
    const parsed = path.parse(resolved);
    const parentPath = resolved !== parsed.root ? path.dirname(resolved) : null;

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const directories: { name: string; path: string }[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip system hidden folders like $RECYCLE.BIN or System Volume Information
        if (entry.name.startsWith('$') || entry.name === 'System Volume Information') {
          continue;
        }
        directories.push({
          name: entry.name,
          path: path.join(resolved, entry.name),
        });
      }
    }
    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return {
      currentPath: resolved,
      parentPath,
      directories,
    };
  } catch (err: unknown) {
    return {
      currentPath: dirPath,
      parentPath: path.dirname(dirPath),
      directories: [],
      error: `Unable to read folder: ${(err as Error)?.message || String(err)}`,
    };
  }
}

/**
 * Lists files inside the currently authorized project directory for context attachment.
 * Restricted strictly to `authorizedProjectDir`.
 */
export function listAuthorizedProjectFiles(
  authorizedProjectDir: string,
  relativeSubdir = ''
): { name: string; relativePath: string; isDirectory: boolean; size?: number }[] {
  if (!isPathInsideProject(authorizedProjectDir, relativeSubdir)) {
    throw new Error('Path traversal outside authorized project directory is prohibited.');
  }
  const targetDir = path.resolve(authorizedProjectDir, relativeSubdir);
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const results: { name: string; relativePath: string; isDirectory: boolean; size?: number }[] = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(targetDir, entry.name);
    const relPath = path.relative(authorizedProjectDir, fullPath);
    if (entry.isDirectory()) {
      results.push({ name: entry.name, relativePath: relPath, isDirectory: true });
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        results.push({
          name: entry.name,
          relativePath: relPath,
          isDirectory: false,
          size: stat.size,
        });
      } catch {
        // Ignore unreadable file
      }
    }
  }
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return results.slice(0, 100);
}

/**
 * Opens a native Windows FolderBrowserDialog via PowerShell STA thread.
 * Ensures UTF-8 output so Vietnamese / Unicode folder paths work seamlessly.
 */
export function openNativeWindowsFolderPicker(initialDir?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const safeInitial = initialDir && fs.existsSync(initialDir) ? initialDir : '';
    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dummy = New-Object System.Windows.Forms.Form
$dummy.TopMost = $true
$dummy.ShowInTaskbar = $false
$dummy.WindowState = 'Minimized'
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select Project Working Directory - The Virtual Office for Your Work'
$dialog.ShowNewFolderButton = $true
if ($env:VO_INIT_DIR -and (Test-Path -LiteralPath $env:VO_INIT_DIR)) {
  $dialog.SelectedPath = $env:VO_INIT_DIR
}
$result = $dialog.ShowDialog($dummy)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      {
        env: { ...process.env, VO_INIT_DIR: safeInitial },
        encoding: 'utf8',
        timeout: 120000,
        windowsHide: true,
      },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const selected = (stdout || '').trim();
        resolve(selected.length > 0 ? selected : null);
      }
    );
  });
}
