import { execFile } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  INxReportConfig,
  IReportConfig,
  isNxReportConfig,
} from '../interface/config.interface.ts';
import { log } from './logger.ts';
import NxWorkspaceSlice from './nx-slice.ts';

const execFileAsync = promisify(execFile);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NX_LINT_PATTERNS = [
  'apps/**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs}',
  'libs/**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs}',
  'tools/**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs}',
  '.github/workflow-scripts/**/*.js',
];

const filterExistingLintPatterns = (
  targetPath: string,
  lintPatterns?: string[]
): string[] | undefined => {
  if (!lintPatterns || lintPatterns.length === 0) {
    return undefined;
  }

  const filteredPatterns = lintPatterns.filter((pattern) => {
    const rootSegment = pattern.split('/')[0];
    return existsSync(`${targetPath}/${rootSegment}`);
  });

  return filteredPatterns.length > 0 ? filteredPatterns : undefined;
};

class ComplexityReport {
  static getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && 'stderr' in error) {
      const stderr = Reflect.get(error, 'stderr');
      if (typeof stderr === 'string' && stderr.trim().length > 0) {
        return stderr.trim();
      }
    }

    return error instanceof Error ? error.message : 'Unknown error';
  };

  static generateReportName = (output: string): string => {
    const oDate = new Date();
    const ymdTime = `${oDate.getFullYear().toString().padStart(2, '0')}${(oDate.getMonth() + 1).toString().padStart(2, '0')}${oDate.getDate().toString().padStart(2, '0')}`;
    const hmsTime = `${oDate.getHours().toString().padStart(2, '0')}${oDate.getMinutes().toString().padStart(2, '0')}${oDate.getSeconds().toString().padStart(2, '0')}`;
    const reportName = `${output}-${ymdTime}${hmsTime}`;
    return reportName;
  };

  static generate = async (
    report: IReportConfig
  ): Promise<string | null> => {
    const reportFolder = ComplexityReport.generateReportName(report.FOLDER);
    const tempReportRoot = await mkdtemp(path.join(os.tmpdir(), 'cyc-node-2-report-'));
    const outputPath = path.join(tempReportRoot, reportFolder);

    if (isNxReportConfig(report)) {
      const generated = await ComplexityReport.generateNxReport(report, outputPath);
      return generated ? outputPath : null;
    }

    const generated = await ComplexityReport.generateStandardReport(report.PATH, outputPath);
    return generated ? outputPath : null;
  };

  static deleteOutput = async (outputPath: string): Promise<void> => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
  };

  static generateStandardReport = async (
    targetPath: string,
    outputPath: string
  ): Promise<boolean> => {
    try {
      return await ComplexityReport.runReport(targetPath, outputPath);
    } catch (error) {
      log.info_lv2(
        'Complexity report failed:',
        ComplexityReport.getErrorMessage(error)
      );
    }

    return false;
  };

  static generateNxReport = async (
    report: INxReportConfig,
    outputPath: string
  ): Promise<boolean> => {
    const slice = await NxWorkspaceSlice.create(report);

    try {
      log.info_lv2(`Generating Nx report for:`, report.PROJECT);
      log.info_lv2(`Using slice:`, slice.sliceRoot);

      const lintPatterns = filterExistingLintPatterns(
        slice.sliceRoot,
        NX_LINT_PATTERNS
      );

      return await ComplexityReport.runReport(
        slice.sliceRoot,
        outputPath,
        lintPatterns
      );
    } catch (error) {
      log.info_lv2(
        `Generating Nx report failed for ${report.PROJECT}:`,
        ComplexityReport.getErrorMessage(error)
      );
      return false;
    } finally {
      await slice.cleanup();
    }
  };

  static runReport = async (
    targetPath: string,
    outputPath: string,
    lintPatterns?: string[]
  ): Promise<boolean> => {
    const targetTempDir = `${targetPath}/complexity`;
    const complexityExists = existsSync(`${targetTempDir}`);
    const outputComplexityReportPath = path.join(outputPath, 'complexity-report.json');
    const outputFunctionReportPath = path.join(outputPath, 'function-names.all.md');

    log.info_lv2(`Generating report for:`, targetPath);

    const existJS = existsSync(`${targetPath}/eslint.config.js`);
    const existCJS = existsSync(`${targetPath}/eslint.config.cjs`);
    const existMJS = existsSync(`${targetPath}/eslint.config.mjs`);
    if (!(existJS || existCJS || existMJS)) {
      return false;
    }

    try {
      await ComplexityReport.executeReportProcess(
        targetPath,
        outputPath,
        lintPatterns
      );
    } finally {
      // do something
    }

    const hasExpectedArtifacts =
      existsSync(outputComplexityReportPath) && existsSync(outputFunctionReportPath);

    if (!hasExpectedArtifacts) {
      throw new Error(
        `Complexity report did not produce expected artifacts in ${outputPath}`
      );
    }

    if (existsSync(`${targetTempDir}`) && !complexityExists) {
      rmSync(targetTempDir, { recursive: true, force: true });
      log.info_lv2(`Temp folder removed:`, targetTempDir);
    }

    return true;
  };

  static executeReportProcess = async (
    targetPath: string,
    outputPath: string,
    lintPatterns?: string[]
  ): Promise<void> => {
    const script = String.raw`
      import path from 'node:path';
      import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
      import { ESLint } from 'eslint';
      import tseslint from 'typescript-eslint';
      import { parse } from '@typescript-eslint/typescript-estree';

      const targetPath = process.argv[1];
      const outputPath = process.argv[2];
      const lintPatternsArg = process.argv[3];
      const lintPatterns = lintPatternsArg ? JSON.parse(lintPatternsArg) : null;
      const supportedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
      const ignorePatterns = [
        'complexity/**',
        'dist/**',
        'data/**',
        'build/**',
        '.angular/**',
        '**/coverage/**',
        'node_modules/**',
        '**/*.spec.ts',
        '**/*.spec.js',
        '**/test-setup.*',
        '**/polyfills.*',
        '**/jest.config.*',
        '**/jest-global-mocks.*',
      ];
      const functionNodeTypes = new Set([
        'FunctionDeclaration',
        'FunctionExpression',
        'ArrowFunctionExpression',
      ]);

      const normalise = (filePath) => filePath.split(path.sep).join('/');

      const escapeRegExp = (value) => value.replace(/[.+^$\\{}()|[\]\\]/g, '\\$&');

      const globToRegExp = (pattern) => {
        const normalisedPattern = normalise(pattern);
        const placeholder = '__DOUBLE_STAR__';
        const withPlaceholder = normalisedPattern.replace(/\*\*/g, placeholder);
        const escaped = escapeRegExp(withPlaceholder);

        return new RegExp('^' + escaped
          .replace(/\*/g, '[^/]*')
          .replace(new RegExp(placeholder, 'g'), '.*') + '$');
      };

      const matchesPattern = (filePath, pattern) => {
        const normalisedPath = normalise(filePath);
        const normalisedPattern = normalise(pattern);
        const regex = globToRegExp(normalisedPattern);

        if (regex.test(normalisedPath)) {
          return true;
        }

        if (!normalisedPattern.includes('/')) {
          return regex.test(path.posix.basename(normalisedPath));
        }

        return false;
      };

      const isIgnoredPath = (filePath) => {
        const normalisedPath = normalise(filePath);
        return ignorePatterns.some((pattern) => matchesPattern(normalisedPath, pattern));
      };

      const isCandidateFile = (filePath) => {
        const normalisedPath = normalise(filePath);
        const extension = path.extname(normalisedPath);

        if (!supportedExtensions.has(extension)) {
          return false;
        }

        if (normalisedPath.endsWith('.d.ts')) {
          return false;
        }

        return !isIgnoredPath(normalisedPath);
      };

      const walk = (node, visitor, parent = null) => {
        if (!node || typeof node !== 'object') {
          return;
        }

        visitor(node, parent);

        Object.keys(node).forEach((key) => {
          const child = node[key];

          if (Array.isArray(child)) {
            child.forEach((item) => walk(item, visitor, node));
          } else if (child && typeof child === 'object' && child.type) {
            walk(child, visitor, node);
          }
        });
      };

      const getFunctionName = (node, parent) => {
        if (node.type === 'FunctionDeclaration' && node.id?.name) {
          return node.id.name;
        }

        if ((node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') && parent) {
          if (parent.type === 'VariableDeclarator' && parent.id?.name) {
            return parent.id.name;
          }

          if (parent.type === 'Property' && parent.key?.name) {
            return parent.key.name;
          }

          if (parent.type === 'MethodDefinition' && parent.key?.name) {
            return parent.key.name;
          }
        }

        return 'anonymous';
      };

      const createDecisionCounts = () => ({
        controlFlow: 0,
        expressions: 0,
        defaultParameters: 0,
      });

      const shouldSkipNestedFunction = (node, rootFunctionNode) =>
        functionNodeTypes.has(node.type) && node !== rootFunctionNode;

      const countDecisionPointsInFunction = (functionNode) => {
        const counts = createDecisionCounts();

        functionNode.params?.forEach((param) => {
          if (param.type === 'AssignmentPattern') {
            counts.defaultParameters += 1;
          }
        });

        walk(functionNode.body, (node) => {
          if (shouldSkipNestedFunction(node, functionNode)) {
            return;
          }

          switch (node.type) {
            case 'IfStatement':
            case 'ForStatement':
            case 'ForInStatement':
            case 'ForOfStatement':
            case 'WhileStatement':
            case 'DoWhileStatement':
            case 'CatchClause':
              counts.controlFlow += 1;
              break;
            case 'SwitchCase':
              if (node.test) {
                counts.controlFlow += 1;
              }
              break;
            case 'ConditionalExpression':
              counts.expressions += 1;
              break;
            case 'LogicalExpression':
              if (node.operator === '&&' || node.operator === '||' || node.operator === '??') {
                counts.expressions += 1;
              }
              break;
            case 'MemberExpression':
            case 'CallExpression':
              if (node.optional) {
                counts.expressions += 1;
              }
              break;
            default:
              break;
          }
        });

        return counts;
      };

      const parseFunctionComplexitiesFromMessages = (messages) => {
        const complexitiesByLocation = new Map();

        messages
          .filter((message) => message.ruleId === 'complexity')
          .forEach((message) => {
            const complexityMatch = message.message.match(/complexity of\s+(\d+)/i);

            if (!complexityMatch) {
              return;
            }

            complexitiesByLocation.set(message.line + ':' + message.column, Number(complexityMatch[1]));
          });

        return complexitiesByLocation;
      };

      const lintForComplexity = async (content, filePath, eslint) => {
        const [result] = await eslint.lintText(content, { filePath });
        return parseFunctionComplexitiesFromMessages(result?.messages || []);
      };

      const collectFunctions = (ast) => {
        const functions = [];

        walk(ast, (node, parent) => {
          if (!functionNodeTypes.has(node.type) || !node.loc) {
            return;
          }

          const decisionPoints = countDecisionPointsInFunction(node);

          functions.push({
            name: getFunctionName(node, parent),
            line: node.loc.start.line,
            column: node.loc.start.column + 1,
            decisionPoints,
          });
        });

        return functions;
      };

      const analyzeContent = async (content, filePath, eslint) => {
        const ast = parse(content, {
          loc: true,
          comment: false,
          jsx: filePath.endsWith('.tsx') || filePath.endsWith('.jsx'),
        });

        const lintComplexities = await lintForComplexity(content, filePath, eslint);
        const functions = collectFunctions(ast).map((entry) => {
          const fallback = 1 + entry.decisionPoints.controlFlow + entry.decisionPoints.expressions + entry.decisionPoints.defaultParameters;
          const key = entry.line + ':' + entry.column;
          const complexity = lintComplexities.get(key) || fallback;

          return {
            name: entry.name,
            line: entry.line,
            complexity,
          };
        });

        const relativePath = normalise(path.relative(targetPath, filePath));
        const fileComplexity = functions.reduce((total, entry) => total + entry.complexity, 0);
        const totalFunctions = functions.length;
        const average = totalFunctions > 0
          ? Number((fileComplexity / totalFunctions).toFixed(2))
          : 0;

        return {
          filePath: relativePath,
          fileComplexity,
          totalFunctions,
          average,
          functions,
        };
      };

      const collectCandidateFiles = async (directoryPath, results = []) => {
        const entries = await readdir(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(directoryPath, entry.name);
          const relativePath = normalise(path.relative(targetPath, fullPath));

          if (entry.isDirectory()) {
            if (isIgnoredPath(relativePath)) {
              continue;
            }

            await collectCandidateFiles(fullPath, results);
            continue;
          }

          if (!entry.isFile() || !isCandidateFile(relativePath)) {
            continue;
          }

          results.push(fullPath);
        }

        return results;
      };

      process.chdir(targetPath);

      const eslint = new ESLint({
        cwd: targetPath,
        overrideConfigFile: true,
        overrideConfig: {
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
              ecmaVersion: 'latest',
              sourceType: 'module',
              ecmaFeatures: {
                jsx: true,
              },
            },
          },
          rules: {
            complexity: ['error', 0],
          },
        },
      });

      const rootSegments = Array.isArray(lintPatterns) && lintPatterns.length > 0
        ? Array.from(new Set(lintPatterns.map((pattern) => pattern.split('/')[0]).filter(Boolean)))
        : ['.'];
      const candidateFiles = [];
      const complexityRows = [];
      const reportEntries = [];

      for (const rootSegment of rootSegments) {
        const rootPath = rootSegment === '.' ? targetPath : path.join(targetPath, rootSegment);
        try {
          await collectCandidateFiles(rootPath, candidateFiles);
        } catch {
          // ignore missing directories
        }
      }

      const uniqueCandidateFiles = Array.from(new Set(candidateFiles)).sort((left, right) => left.localeCompare(right));

      for (const filePath of uniqueCandidateFiles) {
        const content = await readFile(filePath, 'utf8');
        const reportEntry = await analyzeContent(content, filePath, eslint);

        reportEntries.push(reportEntry);

        for (const functionEntry of reportEntry.functions) {
          complexityRows.push({
            name: functionEntry.name,
            complexity: functionEntry.complexity,
            file: reportEntry.filePath,
            line: functionEntry.line,
          });
        }
      }

      complexityRows.sort((left, right) => {
        if (left.file !== right.file) {
          return left.file.localeCompare(right.file);
        }

        if (left.name !== right.name) {
          return left.name.localeCompare(right.name);
        }

        return left.line - right.line;
      });

      const markdownLines = [
        '# Function Complexity Report',
        '',
        '| Rank | Function | Complexity | File:Line |',
        '| --- | --- | --- | --- |',
        ...complexityRows.map((row, index) =>
          '| ' + (index + 1) + ' | ' + row.name + ' | ' + row.complexity + ' | ' + row.file + ':' + row.line + ' |'
        ),
        '',
      ];

      await mkdir(outputPath, { recursive: true });
      await writeFile(
        path.join(outputPath, 'complexity-report.json'),
        JSON.stringify(reportEntries, null, 2),
        'utf8'
      );
      await writeFile(
        path.join(outputPath, 'function-names.all.md'),
        markdownLines.join('\n'),
        'utf8'
      );
    `;

    mkdirSync(outputPath, { recursive: true });

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        script,
        targetPath,
        outputPath,
        JSON.stringify(lintPatterns ?? []),
      ],
      {
        cwd: APP_ROOT,
        env: {
          ...process.env,
        },
        timeout: 420000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    if (stdout.trim().length > 0) {
      process.stdout.write(stdout);
    }

    if (stderr.trim().length > 0) {
      process.stderr.write(stderr);
    }
  };
}
export default ComplexityReport;
