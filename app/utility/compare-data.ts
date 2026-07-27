import { Request, Response } from 'express';
import config from './config.ts';

import DBRead from '../database/db-read/db-read.ts';

const REPORTS = config.REPORTS;

type reportBody = {
  tgt_1: string;
  tgt_2: string;
  project?: string;
};

class ComparisonReport {
  static dynamicSort = (properties: any) => {
    return function (a: any, b: any): any {
      for (const prop of properties) {
        if (a[prop] < b[prop]) {
          return -1;
        }
        if (a[prop] > b[prop]) {
          return 1;
        }
      }
      return 0;
    };
  };

  static getComparisonReport = async (req: Request, res: Response): Promise<void> => {
    const targets: reportBody = req.body;
    if (!targets.project) {
      res.status(400).json({ error: 'Project is required for comparison.' });
      return;
    }

    const targetSort: reportBody = {
      tgt_1: (targets.tgt_1 < targets.tgt_2) ? targets.tgt_1 : targets.tgt_2,
      tgt_2: (targets.tgt_1 > targets.tgt_2) ? targets.tgt_1 : targets.tgt_2,
    }
    const timestamp1 = Number.parseInt(targetSort.tgt_1, 10);
    const timestamp2 = Number.parseInt(targetSort.tgt_2, 10);

    if (Number.isNaN(timestamp1) || Number.isNaN(timestamp2)) {
      res.status(400).json({ error: 'Invalid report timestamps.' });
      return;
    }

    const report1 = await DBRead.getReportByProjectAndTimestamp(targets.project, timestamp1);
    const report2 = await DBRead.getReportByProjectAndTimestamp(targets.project, timestamp2);

    if (!report1?.id || !report2?.id) {
      res.status(404).json({ error: 'One or both reports could not be found.' });
      return;
    }

    const targetNames: reportBody = {
      tgt_1: report1.report,
      tgt_2: report2.report,
    }

    const reportTarget = targets.project.toUpperCase();

    const complexityObj = DBRead.processCompareData(await DBRead.compareReports(report1.id, report2.id));

    res.status(200).json({ reportTarget, targetNames, complexityObj });
  };
}
export default ComparisonReport;
