import { Request, Response } from 'express';
import * as path from 'node:path';
import config, { updateReportExclusions } from '../utility/config.ts';
import { IReportConfig } from '../interface/config.interface.ts';
import GitlogReporting from './gitlog-reporting.ts';
import DBRead from '../database/db-read/db-read.ts';
import { STATIC_PATH } from './helpers.ts';

const REPORTS = config.REPORTS;

class Report {
  static getDashboard = async (_req: Request, res: Response): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-dashboard.html'));
  };

  static getReportBrowser = async (_req: Request, res: Response): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-browser.html'));
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
