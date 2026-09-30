import { log } from '../../utility/logger.ts';
import DBService from '../../services/db.service.ts';
import {
  IFiles,
  IFunctions,
  IGitLog,
  IReports,
} from '../../interface/report-data.interface.ts';
import {
  dataObject,
  dataObjectCompare,
  functionObject,
} from '../../interface/summary.interface.ts';
import {
  GET_ALL_FILES,
  GET_ALL_FUNCTIONS,
  GET_ALL_GITLOG,
  GET_ALL_REPORTS,
  GET_EXTRACTION_STATE,
  GET_GITLOG_BY_PROJECT,
  GET_REPORT_BY_NAME,
  GET_REPORT_BY_PROJECT_AND_TIMESTAMP,
  GET_REPORT_FILES,
  GET_ALL_STORED_REPORT_FILES,
  GET_REPORT_FUNCTIONS,
} from './sql-read.ts';
import { shouldIncludeReportFile } from '../report-file-filter.ts';

const DEBUG = 'db-read | ';

type ReportFileStats = {
  fileCount: number;
  totalComplexity: number;
  averageComplexity: number;
  hiddenFileCount: number;
  hiddenComplexity: number;
};

class DBRead {
  static parseGitLog = (item: {
    id: string;
    labels: string;
    datetime: number;
  }): IGitLog => ({
    id: item.id,
    labels: JSON.parse(item.labels),
    datetime: item.datetime,
  });

  static getGitLog = async (): Promise<IGitLog[]> => {
    log.info_lv2(`${DEBUG}getGitLog`);

    return (DBService.db.prepare(GET_ALL_GITLOG).all() as Array<{
      id: string;
      labels: string;
      datetime: number;
    }>).map(DBRead.parseGitLog);
  };

  static getGitLogByProject = async (project: string): Promise<IGitLog[]> => {
    log.info_lv2(`${DEBUG}getGitLogByProject - ${project}`);

    return (DBService.db
      .prepare(GET_GITLOG_BY_PROJECT)
      .all(`%"${project}"%`) as Array<{
      id: string;
      labels: string;
      datetime: number;
    }>).map(DBRead.parseGitLog);
  };

  static getExtractionState = async (key: string): Promise<string | null> => {
    log.info_lv2(`${DEBUG}getExtractionState - ${key}`);

    const state = DBService.db.prepare(GET_EXTRACTION_STATE).get(key) as
      | { value: string }
      | undefined;
    return state?.value ?? null;
  };

  static getReports = async (): Promise<IReports[]> => {
    log.info_lv2(`${DEBUG}getReports`);

    return DBService.db.prepare(GET_ALL_REPORTS).all() as IReports[];
  };

  static reportExists = async (
    reportName: string
  ): Promise<number | bigint> => {
    log.info_lv2(`${DEBUG}reportExists - ${reportName}`);

    const data = await DBService.db.prepare(GET_REPORT_BY_NAME).get(reportName);
    if (data === undefined) {
      return -1;
    }

    return (data as IReports).id as number;
  };

  static reportExistsByProjectAndTimestamp = async (
    project: string,
    timestamp: number
  ): Promise<number | bigint> => {
    log.info_lv2(`${DEBUG}reportExistsByProjectAndTimestamp - ${project} @ ${timestamp}`);

    const data = DBService.db
      .prepare(GET_REPORT_BY_PROJECT_AND_TIMESTAMP)
      .get(project, timestamp);
    if (data === undefined) {
      return -1;
    }

    return (data as IReports).id as number;
  };

  static getReportByProjectAndTimestamp = async (
    project: string,
    timestamp: number
  ): Promise<IReports | null> => {
    log.info_lv2(`${DEBUG}getReportByProjectAndTimestamp - ${project} @ ${timestamp}`);

    const data = DBService.db
      .prepare(GET_REPORT_BY_PROJECT_AND_TIMESTAMP)
      .get(project, timestamp);

    return (data as IReports | undefined) ?? null;
  };

  static getReportHiddenFileStats = async (
    reportId: number | bigint,
    excludedFiles: string[] = []
  ): Promise<{ hiddenFileCount: number; hiddenComplexity: number }> => {
    log.info_lv2(`${DEBUG}getReportHiddenFileStats - ${reportId}`);

    const files = DBService.db.prepare(GET_REPORT_FILES).all(reportId) as IFiles[];
    const hiddenFiles = files.filter(
      (file) => !shouldIncludeReportFile(file.filename, excludedFiles)
    );

    return {
      hiddenFileCount: hiddenFiles.length,
      hiddenComplexity: hiddenFiles.reduce(
        (total, file) => total + file.fileComplexity,
        0
      ),
    };
  };

  static getReportFileStats = async (
    reportId: number | bigint,
    excludedFiles: string[] = []
  ): Promise<ReportFileStats> => {
    const files = DBService.db.prepare(GET_REPORT_FILES).all(reportId) as IFiles[];
    const visibleFiles = files.filter((file) =>
      shouldIncludeReportFile(file.filename, excludedFiles)
    );
    const totalComplexity = visibleFiles.reduce(
      (total, file) => total + file.fileComplexity,
      0
    );
    const hiddenFiles = files.filter(
      (file) => !shouldIncludeReportFile(file.filename, excludedFiles)
    );

    return {
      fileCount: visibleFiles.length,
      totalComplexity,
      averageComplexity:
        visibleFiles.length > 0 ? totalComplexity / visibleFiles.length : 0,
      hiddenFileCount: hiddenFiles.length,
      hiddenComplexity: hiddenFiles.reduce(
        (total, file) => total + file.fileComplexity,
        0
      ),
    };
  };

  static getReportFileStatsForReports = async (
    reports: Array<{ id: number | bigint; excludedFiles?: string[] }>
  ): Promise<Map<string, ReportFileStats>> => {
    const statsByReportId = new Map<string, ReportFileStats>();
    const exclusionsByReportId = new Map<string, string[]>();

    for (const report of reports) {
      const reportId = String(report.id);
      exclusionsByReportId.set(reportId, report.excludedFiles ?? []);
      statsByReportId.set(reportId, {
        fileCount: 0,
        totalComplexity: 0,
        averageComplexity: 0,
        hiddenFileCount: 0,
        hiddenComplexity: 0,
      });
    }

    if (statsByReportId.size === 0) {
      return statsByReportId;
    }

    const files = DBService.db
      .prepare(GET_ALL_STORED_REPORT_FILES)
      .all() as IFiles[];

    for (const file of files) {
      const reportId = String(file.report_id);
      const stats = statsByReportId.get(reportId);
      if (!stats) {
        continue;
      }

      if (shouldIncludeReportFile(file.filename, exclusionsByReportId.get(reportId))) {
        stats.fileCount += 1;
        stats.totalComplexity += file.fileComplexity;
      } else {
        stats.hiddenFileCount += 1;
        stats.hiddenComplexity += file.fileComplexity;
      }
    }

    for (const stats of statsByReportId.values()) {
      stats.averageComplexity =
        stats.fileCount > 0 ? stats.totalComplexity / stats.fileCount : 0;
    }

    return statsByReportId;
  };

  static getFiles = async (): Promise<void> => {
    log.info_lv2(`${DEBUG}getFiles`);

    const data = DBService.db.prepare(GET_ALL_FILES).all();
  };

  static getFunctions = async (): Promise<void> => {
    log.info_lv2(`${DEBUG}getFunctions`);

    const data = DBService.db.prepare(GET_ALL_FUNCTIONS).all();
  };

  static processCompareData = (
    rawData: dataObjectCompare[]
  ): dataObjectCompare[] => {
    const map = new Map<
      string,
      { r1?: dataObjectCompare; r2?: dataObjectCompare }
    >();

    for (const row of rawData) {
      const entry = map.get(row.file) ?? {};
      if (row.report === '1') {
        entry.r1 = row;
      } else {
        entry.r2 = row;
      }
      map.set(row.file, entry);
    }

    const result: dataObjectCompare[] = [];

    for (const { r1, r2 } of map.values()) {
      const compareValues = {
        compareAComplexity: r1?.complexity,
        compareBComplexity: r2?.complexity,
        compareAFunctionTotal: r1?.functionTotal,
        compareBFunctionTotal: r2?.functionTotal,
        compareAComplexityAverage: r1?.complexityAverage,
        compareBComplexityAverage: r2?.complexityAverage,
      };

      if (r1 && !r2) {
        result.push({ ...r1, ...compareValues, status: 'D' });
      } else if (!r1 && r2) {
        result.push({ ...r2, ...compareValues, status: 'N' });
      } else if (r1 && r2) {
        result.push({
          ...r2,
          ...compareValues,
          complexityChange: r2.complexity - r1.complexity,
          functionTotalChange: r2.functionTotal - r1.functionTotal,
          complexityTotalChange: r2.complexityTotal - r1.complexityTotal,
          complexityAverageChange: r2.complexityAverage - r1.complexityAverage,
          status: '',
        });
      }
    }

    return result;
  };

  static compareReports = async (
    reportId1: number | bigint,
    reportId2: number | bigint,
    excludedFiles: string[] = []
  ): Promise<any> => {
    log.info_lv2(`${DEBUG}compareReports - ${reportId1} : ${reportId2}`);

    const fileData = [
      ...(DBService.db.prepare(GET_REPORT_FILES).all(reportId1) as IFiles[]).map(
        (file) => ({ ...file, report: '1' })
      ),
      ...(DBService.db.prepare(GET_REPORT_FILES).all(reportId2) as IFiles[]).map(
        (file) => ({ ...file, report: '2' })
      ),
    ].filter((file) => shouldIncludeReportFile(file.filename, excludedFiles));

    const data: dataObjectCompare[] = [];

    fileData.forEach((item) => {
      const tmpData: dataObjectCompare = {
        file: item.filename,
        complexity: item.fileComplexity,
        functionTotal: item.totalFunctions,
        complexityTotal: item.totalComplexity,
        complexityAverage: item.averageComplexity,
        complexityChange: 0,
        functionTotalChange: 0,
        complexityTotalChange: 0,
        complexityAverageChange: 0,
        report: item.report,
        status: '',
      };

      data.push(tmpData);
    });

    return data;
  };

  static getReportById = async (
    reportId: number | bigint,
    excludedFiles: string[] = []
  ): Promise<any> => {
    log.info_lv2(`${DEBUG}getReportById - ${reportId}`);

    const fileData = (DBService.db
      .prepare(GET_REPORT_FILES)
      .all(reportId) as IFiles[]).filter((file) =>
      shouldIncludeReportFile(file.filename, excludedFiles)
    );
    const functionsByFileId = new Map<string, functionObject[]>();
    const functionData = DBService.db
      .prepare(GET_REPORT_FUNCTIONS)
      .all(reportId) as IFunctions[];

    for (const itemFunction of functionData) {
      const fileId = String(itemFunction.summary_id);
      const functions = functionsByFileId.get(fileId) ?? [];
      functions.push({
        name: itemFunction.function,
        line: itemFunction.line,
        complexity: itemFunction.functionComplexity,
      });
      functionsByFileId.set(fileId, functions);
    }

    return fileData.map((item): dataObject => ({
        file: item.filename,
        complexity: item.fileComplexity,
        functions: functionsByFileId.get(String(item.id)) ?? [],
        functionTotal: item.totalFunctions,
        complexityTotal: item.totalComplexity,
        complexityAverage: item.averageComplexity,
      }));
  };
}

export default DBRead;
