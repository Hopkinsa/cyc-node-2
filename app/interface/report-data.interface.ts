export interface IGitLog {
  id: string;
  labels: string[];
  datetime: number;
}

export interface IReports {
  id?: number | bigint;
  project: string;
  report: string;
  timestamp: number;
}

export interface IFiles {
  id?: number | bigint;
  report_id: number | bigint;
  filename: string;
  fileComplexity: number;
  totalFunctions: number;
  totalComplexity: number;
  averageComplexity: number;
  report?: string;
}

export interface IFunctions {
  id?: number | bigint;
  report_id: number | bigint;
  summary_id: number | bigint;
  function: string;
  line: number;
  functionComplexity: number;
}
