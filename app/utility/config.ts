import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'path';
import {
  IAppConfig,
  IReportConfig,
  isNxReportConfig,
} from '../interface/config.interface.ts';

type RawConfig = {
  SERVER_PORT?: number | null;
  PATH?: string;
  MODE?: 'nx' | '';
  PROJECTS?: string[];
  REPORTS?: IReportConfig[];
};

const CONFIG_PATH = path.resolve('./config.json');
const DEFAULT_CONFIG = {
  SERVER_PORT: 3000,
  PATH: '',
  MODE: '',
  PROJECTS: [],
};

let config: IAppConfig = {
  SERVER_PORT: null,
  PATH: '',
  MODE: '',
  PROJECTS: [],
  REPORT_BASE_PATH: '',
  REPORTS: [],
};

const normalizeReportPath = (reportPath: string): string =>
  path.resolve(reportPath);

const normalizeRelativeConfigPath = (reportPath: string): string =>
  path.normalize(reportPath);

const validateReportConfig = (
  report: IReportConfig,
  index: number
): IReportConfig => {
  if (!report.NAME || !report.PATH || !report.FOLDER) {
    throw new Error(
      `Invalid report config at REPORTS[${index}]. NAME, PATH and FOLDER are required.`
    );
  }

  const normalizedReport: IReportConfig = {
    ...report,
    PATH: normalizeReportPath(report.PATH),
    FOLDER: report.FOLDER.trim(),
    NAME: report.NAME.trim(),
  };

  if (isNxReportConfig(normalizedReport)) {
    if (
      !normalizedReport.PROJECT ||
      !normalizedReport.APP_ROOT ||
      !normalizedReport.LIB_SCOPE
    ) {
      throw new Error(
        `Invalid Nx report config at REPORTS[${index}]. PROJECT, APP_ROOT and LIB_SCOPE are required.`
      );
    }

    normalizedReport.APP_ROOT = normalizeRelativeConfigPath(
      normalizedReport.APP_ROOT
    );
    normalizedReport.LIB_SCOPE = normalizedReport.LIB_SCOPE.trim();
    normalizedReport.PROJECT = normalizedReport.PROJECT.trim();
  }

  return normalizedReport;
};

const createNxReportsFromProjectList = (
  sourcePath: string,
  projects: string[]
): IReportConfig[] =>
  projects.map((projectName) => ({
    NAME: projectName,
    PATH: normalizeReportPath(sourcePath),
    FOLDER: projectName,
    MODE: 'nx',
    PROJECT: projectName,
    APP_ROOT: normalizeRelativeConfigPath(`apps/${projectName}`),
    LIB_SCOPE: projectName,
  }));

if (!existsSync(CONFIG_PATH)) {
  await writeFile(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
}

{
  const configFile = await readFile(CONFIG_PATH, 'utf8');
  const parsedConfig = JSON.parse(configFile) as RawConfig;

  const normalizedSourcePath = parsedConfig.PATH
    ? normalizeReportPath(parsedConfig.PATH)
    : '';

  const reports = Array.isArray(parsedConfig.REPORTS)
    ? parsedConfig.REPORTS.map(validateReportConfig)
    : parsedConfig.MODE === 'nx' && Array.isArray(parsedConfig.PROJECTS)
      ? createNxReportsFromProjectList(
          normalizedSourcePath,
          parsedConfig.PROJECTS
        )
      : [];

  config = {
    SERVER_PORT: parsedConfig.SERVER_PORT ?? null,
    PATH: normalizedSourcePath,
    MODE: parsedConfig.MODE ?? '',
    PROJECTS: Array.isArray(parsedConfig.PROJECTS) ? parsedConfig.PROJECTS : [],
    REPORT_BASE_PATH: path.resolve('./reporting'),
    REPORTS: reports,
  };
}

export default config;
