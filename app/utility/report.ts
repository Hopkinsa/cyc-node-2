import { Request, Response } from 'express';
import * as path from 'node:path';
import config, { updateReportExclusions } from '../utility/config.ts';
import { IReportConfig } from '../interface/config.interface.ts';
import GitlogReporting from './gitlog-reporting.ts';
import DBRead from '../database/db-read/db-read.ts';
import { STATIC_PATH } from './helpers.ts';
import { ANALYSIS_REPORTS, AnalysisKind, buildProjectAnalysis } from './project-analysis.ts';

const REPORTS = config.REPORTS;

class Report {
  static getDashboard = async (_req: Request, res: Response): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-dashboard.html'));
  };

  static getReportBrowser = async (_req: Request, res: Response): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-browser.html'));
  };

  static getComplexityAnalysis = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-project-analysis.html'));
  };

  static getComplexityHotspots = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-analysis.html'));
  };

  static getBaselineAnalysis = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-baseline.html'));
  };

  static getProjectInsightPage = async (req: Request, res: Response): Promise<void> => {
    if (!Object.hasOwn(ANALYSIS_REPORTS, String(req.params['kind']))) {
      res.status(404).json({ error: 'Unknown analysis report.' });
      return;
    }
    res.sendFile(path.join(STATIC_PATH, 'reports-insights.html'));
  };

  static getProjectInsightData = async (req: Request, res: Response): Promise<void> => {
    const idx = Number(req.params['idx']);
    const report = Number.isInteger(idx) ? REPORTS[idx] : undefined;
    const kind = String(req.params['kind']) as AnalysisKind;
    const threshold = req.query['threshold'] === undefined ? 10 : Number(req.query['threshold']);
    const topPercent = req.query['topPercent'] === undefined ? 10 : Number(req.query['topPercent']);
    const depth = req.query['depth'] === undefined ? 3 : Number(req.query['depth']);
    const temporary = req.query['temporary'];
    if (!report || !Object.hasOwn(ANALYSIS_REPORTS, kind) ||
      !Number.isInteger(threshold) || threshold < 1 || threshold > 1000 ||
      !Number.isInteger(topPercent) || topPercent < 1 || topPercent > 100 ||
      !Number.isInteger(depth) || depth < 1 || depth > 10 ||
      (temporary !== undefined && temporary !== 'true' && temporary !== 'false')) {
      res.status(400).json({ error: 'Invalid project, report type or analysis parameters.' });
      return;
    }
    const projectKey = 'PROJECT' in report ? report.PROJECT : report.FOLDER;
    const history = (await DBRead.getReports())
      .filter((stored) => stored.project === projectKey && (temporary === 'true' || !stored.isTemporary))
      .sort((left, right) => left.timestamp - right.timestamp);
    const startIndex = req.query['start'] === undefined ? 0
      : history.findIndex((stored) => Number(stored.id) === Number(req.query['start']));
    const endIndex = req.query['end'] === undefined ? history.length - 1
      : history.findIndex((stored) => Number(stored.id) === Number(req.query['end']));
    if ((history.length > 0 && (startIndex < 0 || endIndex < startIndex)) ||
      (history.length === 0 && (req.query['start'] !== undefined || req.query['end'] !== undefined))) {
      res.status(400).json({ error: 'Select valid reports from this project in chronological order.' });
      return;
    }
    const selected = history.slice(startIndex, endIndex + 1);
    const targets = kind === 'attribution' && selected.length > 1
      ? [selected[0], selected.at(-1)!] : selected;
    const functions = await DBRead.getReportFunctionsForReports(targets.flatMap((stored) => (
      stored.id ? [{ id: stored.id, excludedFiles: report.EXCLUDE_FILES }] : []
    )));
    const runs = targets.map((stored) => ({
      id: Number(stored.id), timestamp: stored.timestamp, report: stored.report,
      functions: functions.get(String(stored.id)) ?? [],
    }));
    const insight = buildProjectAnalysis(kind, runs, { threshold, topPercent, depth });
    res.status(200).json({
      name: report.NAME, projectKey, kind, title: ANALYSIS_REPORTS[kind],
      threshold, topPercent, depth,
      period: { start: selected[0]?.report, end: selected.at(-1)?.report, runs: selected.length },
      ...insight,
      notice: [
        runs.some((run) => run.functions.length === 0)
          ? 'Some selected reports have no function data. Averages and rates are N/A; changes involving these snapshots may reflect missing data.' : '',
        insight.notice ?? '',
      ].filter(Boolean).join(' '),
    });
  };

  static getFunctionTrends = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const idx = Number(req.params['idx']);
    const report = Number.isInteger(idx) ? REPORTS[idx] : undefined;
    const threshold = req.query['threshold'] === undefined ? 10 : Number(req.query['threshold']);
    if (!report || !Number.isInteger(threshold) || threshold < 1 || threshold > 1000) {
      res.status(400).json({ error: 'Invalid project or complexity threshold (1-1000).' });
      return;
    }

    const projectKey = 'PROJECT' in report ? report.PROJECT : report.FOLDER;
    const storedReports = (await DBRead.getReports())
      .filter((storedReport) => storedReport.project === projectKey)
      .sort((left, right) => left.timestamp - right.timestamp);
    const targets = storedReports.flatMap((storedReport) => (
      storedReport.id ? [{ id: storedReport.id, excludedFiles: report.EXCLUDE_FILES }] : []
    ));
    const [fileStats, functionStats] = await Promise.all([
      DBRead.getReportFileStatsForReports(targets),
      DBRead.getReportFunctionStatsForReports(targets, threshold),
    ]);

    res.status(200).json({
      projectKey,
      name: report.NAME,
      threshold,
      history: storedReports.map((storedReport) => ({
        id: Number(storedReport.id),
        timestamp: storedReport.timestamp,
        report: storedReport.report,
        isTemporary: Boolean(storedReport.isTemporary),
        fileCount: fileStats.get(String(storedReport.id))?.fileCount ?? 0,
        ...functionStats.get(String(storedReport.id)),
      })),
    });
  };

  static getHelp = async (_req: Request, res: Response): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-help.html'));
  };

  static getDashboardData = async (_req: Request, res: Response): Promise<void> => {
    const [gitlogRows, storedReports] = await Promise.all([
      DBRead.getGitLog(),
      DBRead.getReports(),
    ]);
    const reportConfigsByProject = new Map(
      REPORTS.map((report) => [
        'PROJECT' in report ? report.PROJECT : report.FOLDER,
        report,
      ])
    );
    const reportsByProject = new Map<string, typeof storedReports>();
    const gitlogCountByProject = new Map<string, number>();

    for (const storedReport of storedReports) {
      const projectReports = reportsByProject.get(storedReport.project) ?? [];
      projectReports.push(storedReport);
      reportsByProject.set(storedReport.project, projectReports);
    }

    for (const row of gitlogRows) {
      for (const label of row.labels) {
        if (reportConfigsByProject.has(label)) {
          gitlogCountByProject.set(
            label,
            (gitlogCountByProject.get(label) ?? 0) + 1
          );
        }
      }
    }

    const reportStatsById = await DBRead.getReportFileStatsForReports(
      storedReports.flatMap((storedReport) => {
        if (!storedReport.id) {
          return [];
        }

        return [{
          id: storedReport.id,
          excludedFiles: reportConfigsByProject.get(storedReport.project)
            ?.EXCLUDE_FILES,
        }];
      })
    );

    const projects = REPORTS.map((report, idx) => {
        const projectKey = 'PROJECT' in report ? report.PROJECT : report.FOLDER;
        const projectReports = reportsByProject.get(projectKey) ?? [];
        const projectReportsWithCurrentStats = projectReports.map((storedReport) => ({
          ...storedReport,
          ...(storedReport.id
            ? reportStatsById.get(String(storedReport.id))
            : {}),
        }));
        const reportsByNewest = projectReportsWithCurrentStats.slice().sort(
          (left, right) => right.timestamp - left.timestamp
        );
        const latestReport = reportsByNewest[0] ?? null;
        return {
          idx,
          name: report.NAME,
          projectKey,
          gitlogCount: gitlogCountByProject.get(projectKey) ?? 0,
          reportCount: projectReports.length,
          latestReport,
          latestReportStats: latestReport
            ? {
                fileCount: latestReport.fileCount,
                functionCount: latestReport.functionCount,
                totalComplexity: latestReport.totalComplexity,
                averageComplexity: latestReport.averageComplexity,
                averageComplexityPerFunction:
                  latestReport.averageComplexityPerFunction,
              }
            : null,
          reportHistory: projectReportsWithCurrentStats
            .slice()
            .sort((left, right) => left.timestamp - right.timestamp),
        };
      });

    res.status(200).json({
      sourcePath: config.PATH,
      gitlogRows: gitlogRows.length,
      storedReports: storedReports.length,
      projects,
    });
  };

  static getReportsData = async (req: Request, res: Response): Promise<void> => {
    const idx: number = parseInt(req.params['idx'] as string);
    const report = REPORTS[idx] as IReportConfig;
    const projectKey = 'PROJECT' in report ? report.PROJECT : report.FOLDER;
    const storedReports = (await DBRead.getReports())
      .filter((storedReport) => storedReport.project === projectKey)
      .sort((left, right) => right.timestamp - left.timestamp);

    const reportStatsById = await DBRead.getReportFileStatsForReports(
      storedReports.flatMap((storedReport) => {
        if (!storedReport.id) {
          return [];
        }

        return [{ id: storedReport.id, excludedFiles: report.EXCLUDE_FILES }];
      })
    );
    const storedReportsWithHiddenStats = storedReports.map((storedReport) =>
      ({
        ...storedReport,
        ...(storedReport.id
          ? reportStatsById.get(String(storedReport.id))
          : {
              fileCount: 0,
              functionCount: 0,
              totalComplexity: 0,
              averageComplexity: 0,
              averageComplexityPerFunction: 0,
              hiddenFileCount: 0,
              hiddenComplexity: 0,
            }),
      })
    );

    res.status(200).json({
      idx,
      report,
      projectKey,
      storedReports: storedReportsWithHiddenStats,
    });
  };

  static getComplexityTrends = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const idx = Number.parseInt(req.params['idx'] as string, 10);
    const report = REPORTS[idx] as IReportConfig | undefined;
    if (!report) {
      res.status(400).json({ error: 'Invalid report index.' });
      return;
    }

    const projectKey = 'PROJECT' in report ? report.PROJECT : report.FOLDER;
    const storedReports = (await DBRead.getReports())
      .filter((storedReport) => storedReport.project === projectKey)
      .sort((left, right) => left.timestamp - right.timestamp);
    const visibleFilesByReportId = await DBRead.getVisibleFilesForReports(
      storedReports.flatMap((storedReport) => (
        storedReport.id
          ? [{ id: storedReport.id, excludedFiles: report.EXCLUDE_FILES }]
          : []
      ))
    );

    res.status(200).json({
      projectKey,
      history: storedReports.map((storedReport) => ({
        timestamp: storedReport.timestamp,
        report: storedReport.report,
        isTemporary: storedReport.isTemporary ?? false,
        files: storedReport.id
          ? (visibleFilesByReportId.get(String(storedReport.id)) ?? []).map(
              (file) => ({
                filename: file.filename,
                fileComplexity: file.fileComplexity,
                totalFunctions: file.totalFunctions,
                totalComplexity: file.totalComplexity,
                averageComplexity: file.averageComplexity,
              })
            )
          : [],
      })),
    });
  };

  static updateReportExclusions = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const idx = Number.parseInt(req.params['idx'] as string, 10);
      if (Number.isNaN(idx)) {
        res.status(400).json({ error: 'Invalid report index.' });
        return;
      }

      const report = await updateReportExclusions(idx, req.body?.EXCLUDE_FILES);
      res.status(200).json({ report });
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to update report exclusions.',
      });
    }
  };

  // Handling requests
  static generateReport = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const idx: number = parseInt(req.params['idx'] as string);
      const report = REPORTS[idx] as IReportConfig;
      const result = await GitlogReporting.generateReports(
        'PROJECT' in report ? report.PROJECT : report.FOLDER
      );

      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to generate reports.',
      });
    }
  };

  static generateTemporaryReport = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const idx = Number.parseInt(req.params['idx'] as string, 10);
      const report = REPORTS[idx];
      if (!report) {
        res.status(400).json({ error: 'Invalid report index.' });
        return;
      }

      await GitlogReporting.generateTemporaryReport(report);
      res.status(200).json({ message: 'Temporary report generated.' });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to generate temporary report.',
      });
    }
  };

  static removeTemporaryReport = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const idx = Number.parseInt(req.params['idx'] as string, 10);
      const report = REPORTS[idx];
      if (!report) {
        res.status(400).json({ error: 'Invalid report index.' });
        return;
      }

      const removed = await GitlogReporting.removeTemporaryReport(
        GitlogReporting.getProjectKey(report)
      );
      res.status(200).json({ removed });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to remove temporary report.',
      });
    }
  };

  static syncGitLog = async (_req: Request, res: Response): Promise<void> => {
    try {
      const rows = await GitlogReporting.syncGitLog();
      res.status(200).json({ rows: rows.length });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to synchronize gitlog.',
      });
    }
  };

  static generateAllReports = async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await GitlogReporting.generateReports();
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to generate reports.',
      });
    }
  };

  static getReports = async (req: Request, res: Response): Promise<void> => {
    await Report.getReportBrowser(req, res);
  };

  static getCodebases = async (req: Request, res: Response): Promise<void> => {
    res.redirect('/dashboard');
  };
}

export default Report;
