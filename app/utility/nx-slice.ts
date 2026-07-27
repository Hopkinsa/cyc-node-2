import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, symlink } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { INxReportConfig } from '../interface/config.interface.ts';
import { log } from './logger.ts';

type TsConfigPaths = Record<string, string[]>;

type SharedAliasEntry = {
  alias: string;
  projectRoot: string;
};

export type INxWorkspaceSlice = {
  sliceRoot: string;
  cleanup: () => Promise<void>;
  sharedRoots: string[];
};

const DEBUG = 'nx-slice | ';
const TEMP_FOLDER = 'test-results/complexity-slices';
const execFileAsync = promisify(execFile);
const ROOT_FILES = [
  'package.json',
  'nx.json',
  'tsconfig.base.json',
  'tsconfig.eslint.json',
  'global.d.ts',
  'json-typings.d.ts',
];
const ROOT_DIRECTORIES = ['eslint-configs'];
const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
];
const IMPORT_PATTERN =
  /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|jest\.mock\s*\(\s*['"]([^'"]+)['"]/g;
const SOURCE_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
]);

class NxWorkspaceSlice {
  static createSliceName = (project: string): string => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);

    return `${project}-${timestamp}`;
  };

  static create = async (
    report: INxReportConfig
  ): Promise<INxWorkspaceSlice> => {
    const workspaceRoot = report.PATH;
    const appRoot = path.resolve(workspaceRoot, report.APP_ROOT);
    const scopedLibRoot = path.resolve(workspaceRoot, 'libs', report.LIB_SCOPE);

    NxWorkspaceSlice.validateWorkspaceRoot(workspaceRoot, report);

    const sliceRoot = path.join(
      workspaceRoot,
      TEMP_FOLDER,
      NxWorkspaceSlice.createSliceName(report.PROJECT)
    );

    await mkdir(sliceRoot, { recursive: true });

    const sharedRoots = await NxWorkspaceSlice.discoverRequiredSharedRoots(
      workspaceRoot,
      appRoot,
      scopedLibRoot
    );

    await NxWorkspaceSlice.copyWorkspaceRootFiles(workspaceRoot, sliceRoot);
    await NxWorkspaceSlice.copyDirectory(
      appRoot,
      path.join(sliceRoot, report.APP_ROOT)
    );

    if (existsSync(scopedLibRoot)) {
      await NxWorkspaceSlice.copyDirectory(
        scopedLibRoot,
        path.join(sliceRoot, 'libs', report.LIB_SCOPE)
      );
    }

    for (const sharedRoot of sharedRoots) {
      await NxWorkspaceSlice.copyDirectory(
        path.join(workspaceRoot, sharedRoot),
        path.join(sliceRoot, sharedRoot)
      );
    }

    await NxWorkspaceSlice.linkNodeModules(report, sliceRoot);

    await NxWorkspaceSlice.preloadProjectGraph(sliceRoot);

    log.info_lv2(
      `${DEBUG}created slice for ${report.PROJECT}`,
      `shared roots: ${sharedRoots.join(', ') || 'none'}`
    );

    return {
      sliceRoot,
      sharedRoots,
      cleanup: async (): Promise<void> => {
        await rm(sliceRoot, { recursive: true, force: true });
        log.info_lv2(`${DEBUG}removed slice`, sliceRoot);
      },
    };
  };

  static validateWorkspaceRoot = (
    workspaceRoot: string,
    report: INxReportConfig
  ): void => {
    const requiredPaths = [
      path.join(workspaceRoot, 'nx.json'),
      path.join(workspaceRoot, 'package.json'),
      path.join(workspaceRoot, report.APP_ROOT),
    ];

    requiredPaths.forEach((requiredPath) => {
      if (!existsSync(requiredPath)) {
        throw new Error(`Missing required Nx path: ${requiredPath}`);
      }
    });
  };

  static copyWorkspaceRootFiles = async (
    workspaceRoot: string,
    sliceRoot: string
  ): Promise<void> => {
    for (const filename of ROOT_FILES) {
      const sourcePath = path.join(workspaceRoot, filename);
      if (!existsSync(sourcePath)) {
        continue;
      }

      await NxWorkspaceSlice.copyFile(
        sourcePath,
        path.join(sliceRoot, filename)
      );
    }

    for (const filename of ESLINT_CONFIG_FILES) {
      const sourcePath = path.join(workspaceRoot, filename);
      if (!existsSync(sourcePath)) {
        continue;
      }

      await NxWorkspaceSlice.copyFile(
        sourcePath,
        path.join(sliceRoot, filename)
      );
    }

    for (const directoryName of ROOT_DIRECTORIES) {
      const sourcePath = path.join(workspaceRoot, directoryName);
      if (!existsSync(sourcePath)) {
        continue;
      }

      await NxWorkspaceSlice.copyDirectory(
        sourcePath,
        path.join(sliceRoot, directoryName)
      );
    }
  };

  static discoverRequiredSharedRoots = async (
    workspaceRoot: string,
    appRoot: string,
    scopedLibRoot: string
  ): Promise<string[]> => {
    const tsConfigPaths =
      await NxWorkspaceSlice.loadTsConfigPaths(workspaceRoot);
    const sharedAliasEntries = await NxWorkspaceSlice.buildSharedAliasEntries(
      workspaceRoot,
      tsConfigPaths
    );

    const queue: string[] = [appRoot];
    if (existsSync(scopedLibRoot)) {
      queue.push(scopedLibRoot);
    }

    const discoveredSharedRoots = new Set<string>();
    const scannedRoots = new Set<string>();

    while (queue.length > 0) {
      const rootToScan = queue.shift() as string;
      const normalizedRoot = path.resolve(rootToScan);
      if (scannedRoots.has(normalizedRoot) || !existsSync(normalizedRoot)) {
        continue;
      }

      scannedRoots.add(normalizedRoot);

      const imports =
        await NxWorkspaceSlice.collectImportsFromDirectory(normalizedRoot);

      for (const importPath of imports) {
        if (!importPath.startsWith('@libs/shared/')) {
          continue;
        }

        const sharedRoot = NxWorkspaceSlice.resolveSharedRoot(
          importPath,
          sharedAliasEntries
        );

        if (!sharedRoot || discoveredSharedRoots.has(sharedRoot)) {
          continue;
        }

        discoveredSharedRoots.add(sharedRoot);
        queue.push(path.join(workspaceRoot, sharedRoot));
      }
    }

    return Array.from(discoveredSharedRoots).sort();
  };

  static preloadProjectGraph = async (sliceRoot: string): Promise<void> => {
    try {
      await execFileAsync('npx', ['nx', 'show', 'projects', '--json'], {
        cwd: sliceRoot,
        env: {
          ...process.env,
          NX_DAEMON: 'false',
        },
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });

      log.info_lv3(`${DEBUG}preloaded Nx project graph`, sliceRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.info_lv3(`${DEBUG}unable to preload Nx project graph`, message);
    }
  };

  static linkNodeModules = async (
    report: INxReportConfig,
    sliceRoot: string
  ): Promise<void> => {
    const installRoot = report.INSTALL_PATH ?? report.PATH;
    const sourceNodeModulesPath = path.join(installRoot, 'node_modules');
    const targetNodeModulesPath = path.join(sliceRoot, 'node_modules');

    if (!existsSync(sourceNodeModulesPath) || existsSync(targetNodeModulesPath)) {
      return;
    }

    await symlink(sourceNodeModulesPath, targetNodeModulesPath, 'dir');
  };

  static loadTsConfigPaths = async (
    workspaceRoot: string
  ): Promise<TsConfigPaths> => {
    const tsConfigBasePath = path.join(workspaceRoot, 'tsconfig.base.json');
    const configFile = await readFile(tsConfigBasePath, 'utf8');
    // Normalize JSONC-like tsconfig content to strict JSON before parsing.
    const strippedConfig = configFile
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas before } or ]

    const parsedConfig = JSON.parse(strippedConfig) as {
      compilerOptions?: { paths?: TsConfigPaths };
    };

    return parsedConfig.compilerOptions?.paths ?? {};
  };

  static buildSharedAliasEntries = async (
    workspaceRoot: string,
    tsConfigPaths: TsConfigPaths
  ): Promise<SharedAliasEntry[]> => {
    const entries: SharedAliasEntry[] = [];

    for (const [alias, mappedPaths] of Object.entries(tsConfigPaths)) {
      if (!alias.startsWith('@libs/shared/')) {
        continue;
      }

      for (const mappedPath of mappedPaths) {
        const absoluteTarget = path.resolve(workspaceRoot, mappedPath);
        const projectRoot = await NxWorkspaceSlice.findOwningProjectRoot(
          workspaceRoot,
          absoluteTarget
        );

        if (!projectRoot) {
          continue;
        }

        entries.push({
          alias,
          projectRoot,
        });
      }
    }

    return entries.sort(
      (left, right) => right.alias.length - left.alias.length
    );
  };

  static findOwningProjectRoot = async (
    workspaceRoot: string,
    absoluteTarget: string
  ): Promise<string | null> => {
    let currentPath = absoluteTarget;

    while (currentPath.startsWith(workspaceRoot)) {
      const projectJsonPath = path.join(currentPath, 'project.json');
      if (existsSync(projectJsonPath)) {
        return NxWorkspaceSlice.toWorkspaceRelativePath(
          workspaceRoot,
          currentPath
        );
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
    }

    return null;
  };

  static toWorkspaceRelativePath = (
    workspaceRoot: string,
    targetPath: string
  ): string =>
    path.relative(workspaceRoot, targetPath).split(path.sep).join('/');

  static collectImportsFromDirectory = async (
    directoryPath: string
  ): Promise<Set<string>> => {
    const imports = new Set<string>();
    const directoryEntries = await readdir(directoryPath, {
      withFileTypes: true,
    });

    for (const entry of directoryEntries) {
      const fullPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'complexity'
        ) {
          continue;
        }

        const childImports =
          await NxWorkspaceSlice.collectImportsFromDirectory(fullPath);
        childImports.forEach((importPath) => imports.add(importPath));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name);
      if (!SOURCE_FILE_EXTENSIONS.has(extension)) {
        continue;
      }
      if (entry.name.includes('.spec.') || entry.name.includes('.test.')) {
        continue;
      }

      const fileContents = await readFile(fullPath, 'utf8');
      const matches = fileContents.matchAll(IMPORT_PATTERN);
      for (const match of matches) {
        const importPath = match[1] || match[2] || match[3] || match[4];
        if (importPath) {
          imports.add(importPath);
        }
      }
    }

    return imports;
  };

  static resolveSharedRoot = (
    importPath: string,
    sharedAliasEntries: SharedAliasEntry[]
  ): string | null => {
    const aliasEntry = sharedAliasEntries.find(
      ({ alias }) => importPath === alias || importPath.startsWith(`${alias}/`)
    );

    return aliasEntry?.projectRoot ?? null;
  };

  static copyDirectory = async (
    sourcePath: string,
    destinationPath: string
  ): Promise<void> => {
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { recursive: true, force: true });
  };

  static copyFile = async (
    sourcePath: string,
    destinationPath: string
  ): Promise<void> => {
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { force: true });
  };
}

export default NxWorkspaceSlice;
