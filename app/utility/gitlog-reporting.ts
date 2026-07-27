import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import config from './config.ts';
import ComplexityReport from './generate-report.ts';
import SummaryReport from './summary-data.ts';
import { log } from './logger.ts';
import DBRead from '../database/db-read/db-read.ts';
import DBUpdate from '../database/db-update/db-update.ts';
import {
  IGitLog,
  IReports,
} from '../interface/report-data.interface.ts';
import {
  IReportConfig,
  isNxReportConfig,
} from '../interface/config.interface.ts';

const DEBUG = 'gitlog-reporting | ';
const execFileAsync = promisify(execFile);
const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';
const GITHUB_ISSUE_LOOKUP_MAX_ATTEMPTS = 3;
const GITHUB_ISSUE_LOOKUP_BACKOFF_MS = 500;
const REPORT_START_DATE = '2026-01-01';

type GitCommitRecord = {
  id: string;
  datetime: number;
  message: string;
};

class GitlogReporting {
  static getProjectKey = (report: IReportConfig): string =>
    isNxReportConfig(report) ? report.PROJECT : report.FOLDER;

  static getTargetReports = (projectName?: string): IReportConfig[] => {
    if (!projectName) {
      return config.REPORTS;
    }

    return config.REPORTS.filter(
      (report) => GitlogReporting.getProjectKey(report) === projectName
    );
  };

  static syncGitLog = async (): Promise<IGitLog[]> => {
    const repoSlug = await GitlogReporting.resolveGithubRepoSlug(config.PATH);
    const commits = await GitlogReporting.listMasterCommits(config.PATH);
    const labelCache = new Map<number, string[]>();
    const rows: IGitLog[] = [];

    for (const commit of commits) {
      const issueNumber = GitlogReporting.extractIssueNumber(commit.message);
      if (issueNumber === null) {
        continue;
      }

      const labels = await GitlogReporting.getIssueLabels(
        config.PATH,
        repoSlug,
        issueNumber,
        labelCache
      );

      if (labels.length === 0) {
        continue;
      }

      rows.push({
        id: commit.id,
        labels,
        datetime: commit.datetime,
      });
    }

    await DBUpdate.replaceGitLog(rows);

    return rows;
  };

  static generateReports = async (projectName?: string): Promise<{
    gitlogRows: number;
    reportsGenerated: number;
  }> => {
    const gitlogRows = projectName
      ? await DBRead.getGitLogByProject(projectName)
      : await DBRead.getGitLog();

    if (gitlogRows.length === 0) {
      throw new Error(
        'No synchronized gitlog data found. Run /reports/sync-gitlog before generating reports.'
      );
    }

    const reports = GitlogReporting.getTargetReports(projectName);

    await GitlogReporting.pruneStaleReports(gitlogRows, reports);

    let reportsGenerated = 0;

    for (const row of gitlogRows) {
      const matchedReports = reports.filter((report) =>
        row.labels.includes(GitlogReporting.getProjectKey(report))
      );

      for (const report of matchedReports) {
        const generated = await GitlogReporting.generateReportForCommit(row, report);
        if (generated) {
          reportsGenerated += 1;
        }
      }
    }

    return {
      gitlogRows: gitlogRows.length,
      reportsGenerated,
    };
  };

  static pruneStaleReports = async (
    gitlogRows: IGitLog[],
    reports: IReportConfig[]
  ): Promise<void> => {
    const validKeys = new Set<string>();

    for (const row of gitlogRows) {
      for (const report of reports) {
        const project = GitlogReporting.getProjectKey(report);
        if (row.labels.includes(project)) {
          validKeys.add(`${project}:${row.datetime}`);
        }
      }
    }

    const reportProjects = new Set(
      reports.map((report) => GitlogReporting.getProjectKey(report))
    );
    const existingReports = await DBRead.getReports();

    for (const reportRow of existingReports) {
      if (!reportProjects.has(reportRow.project)) {
        continue;
      }

      if (validKeys.has(`${reportRow.project}:${reportRow.timestamp}`)) {
        continue;
      }

      if (typeof reportRow.id !== 'undefined') {
        await DBUpdate.deleteReportCascade(reportRow.id);
      }
    }
  };

  static listMasterCommits = async (repoPath: string): Promise<GitCommitRecord[]> => {
    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        repoPath,
        'log',
        'master',
        '--reverse',
        `--since=${REPORT_START_DATE}`,
        `--format=%H${FIELD_SEPARATOR}%ct${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`,
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    );

    return stdout
      .split(RECORD_SEPARATOR)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [id, datetime, ...messageParts] = entry.split(FIELD_SEPARATOR);

        return {
          id,
          datetime: Number(datetime),
          message: messageParts.join(FIELD_SEPARATOR).trim(),
        };
      });
  };

  static extractIssueNumber = (message: string): number | null => {
    const match = message.match(/(?:#|issues\/)(\d+)/i);
    return match ? Number(match[1]) : null;
  };

  static resolveGithubRepoSlug = async (repoPath: string): Promise<string> => {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'remote', 'get-url', 'origin'],
      { maxBuffer: 1024 * 1024 }
    );

    const remote = stdout.trim();
    const sshMatch = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    if (sshMatch) {
      return sshMatch[1];
    }

    throw new Error(`Unable to determine GitHub repository from remote '${remote}'.`);
  };

  static getIssueLabels = async (
    repoPath: string,
    repoSlug: string,
    issueNumber: number,
    labelCache: Map<number, string[]>
  ): Promise<string[]> => {
    const cached = labelCache.get(issueNumber);
    if (cached) {
      return cached;
    }

    for (let attempt = 1; attempt <= GITHUB_ISSUE_LOOKUP_MAX_ATTEMPTS; attempt += 1) {
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['issue', 'view', String(issueNumber), '--repo', repoSlug, '--json', 'labels'],
          {
            cwd: repoPath,
            maxBuffer: 1024 * 1024,
          }
        );

        const parsed = JSON.parse(stdout) as {
          labels?: Array<{ name?: string }>;
        };

        const labels = (parsed.labels ?? [])
          .map((label) => label.name?.trim())
          .filter((label): label is string => Boolean(label));

        log.info_lv2(`${DEBUG}issue`, `${issueNumber}`);

        labelCache.set(issueNumber, labels);
        return labels;
      } catch (error) {
        const stderr = GitlogReporting.getCommandErrorOutput(error);
        if (GitlogReporting.isMissingGithubIssueError(stderr)) {
          log.info_lv2(`${DEBUG}skipping unresolved issue`, `${issueNumber}`);
          labelCache.set(issueNumber, []);
          return [];
        }

        const isTransient = GitlogReporting.isTransientGithubIssueError(stderr);
        if (!isTransient) {
          throw error;
        }

        if (attempt === GITHUB_ISSUE_LOOKUP_MAX_ATTEMPTS) {
          log.info_lv2(
            `${DEBUG}skipping issue after transient gh failure`,
            `${issueNumber} | ${stderr.trim()}`
          );
          labelCache.set(issueNumber, []);
          return [];
        }

        log.info_lv2(
          `${DEBUG}retrying issue label lookup`,
          `${issueNumber} attempt ${attempt + 1}/${GITHUB_ISSUE_LOOKUP_MAX_ATTEMPTS}`
        );
        await delay(GITHUB_ISSUE_LOOKUP_BACKOFF_MS * attempt);
      }
    }

    return [];
  };

  static getCommandErrorOutput = (error: unknown): string => {
    if (error instanceof Error && 'stderr' in error) {
      const stderr = Reflect.get(error, 'stderr');
      return typeof stderr === 'string' ? stderr : '';
    }

    return error instanceof Error ? error.message : '';
  };

  static isMissingGithubIssueError = (stderr: string): boolean =>
    /could not resolve to an issue or pull request/i.test(stderr) ||
    /repository\.issue/i.test(stderr);

  static isTransientGithubIssueError = (stderr: string): boolean =>
    /connection reset by peer/i.test(stderr) ||
    /read tcp/i.test(stderr) ||
    /i\/o timeout/i.test(stderr) ||
    /tls handshake timeout/i.test(stderr) ||
    /context deadline exceeded/i.test(stderr) ||
    /temporary failure/i.test(stderr) ||
    /temporarily unavailable/i.test(stderr) ||
    /eof/i.test(stderr);

  static generateReportForCommit = async (
    row: IGitLog,
    report: IReportConfig
  ): Promise<boolean> => {
    const project = GitlogReporting.getProjectKey(report);
    const existing = await DBRead.reportExistsByProjectAndTimestamp(
      project,
      row.datetime
    );
    if (existing !== -1) {
      return false;
    }

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cyc-node-2-'));
    const worktreePath = path.join(tempRoot, project);
    let outputPath: string | null = null;

    try {
      await execFileAsync(
        'git',
        ['-C', config.PATH, 'worktree', 'add', '--detach', worktreePath, row.id],
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const reportConfig: IReportConfig = {
        ...report,
        INSTALL_PATH: report.PATH,
        PATH: worktreePath,
      };
      outputPath = await ComplexityReport.generate(reportConfig);
      if (!outputPath) {
        log.info_lv2(
          `${DEBUG}report generation produced no output`,
          `${project} @ ${row.datetime}`
        );
        return false;
      }

      const reportRow: IReports = {
        project,
        report: GitlogReporting.formatTimestamp(row.datetime),
        timestamp: row.datetime,
      };

      await SummaryReport.createDataFromOutput(
        outputPath,
        report.PATH,
        reportRow
      );

      return true;
    } finally {
      await execFileAsync(
        'git',
        ['-C', config.PATH, 'worktree', 'remove', '--force', worktreePath],
        { maxBuffer: 10 * 1024 * 1024 }
      ).catch(() => undefined);
      if (outputPath) {
        await ComplexityReport.deleteOutput(outputPath).catch(() => undefined);
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  };

  static formatTimestamp = (timestamp: number): string => {
    const commitDate = new Date(timestamp * 1000);
    const day = String(commitDate.getDate()).padStart(2, '0');
    const month = String(commitDate.getMonth() + 1).padStart(2, '0');
    const year = commitDate.getFullYear();
    const hours = String(commitDate.getHours()).padStart(2, '0');
    const minutes = String(commitDate.getMinutes()).padStart(2, '0');
    const seconds = String(commitDate.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  };
}

export default GitlogReporting;