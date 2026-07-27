export type ReportMode = 'nx' | '';

export interface IReportConfigBase {
  NAME: string;
  PATH: string;
  FOLDER: string;
  MODE?: ReportMode;
  INSTALL_PATH?: string;
}

export interface INxReportConfig extends IReportConfigBase {
  MODE: 'nx';
  PROJECT: string;
  APP_ROOT: string;
  LIB_SCOPE: string;
}

export type IReportConfig = IReportConfigBase | INxReportConfig;

export interface IAppConfig {
  SERVER_PORT: number | null;
  PATH: string;
  MODE: ReportMode;
  PROJECTS: string[];
  REPORT_BASE_PATH: string;
  REPORTS: IReportConfig[];
}

export const isNxReportConfig = (
  report: IReportConfig
): report is INxReportConfig => report.MODE === 'nx';
