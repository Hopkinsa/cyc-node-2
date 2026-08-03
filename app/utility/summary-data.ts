import { Request, Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import config from './config.ts';
import {
  IFiles,
  IFunctions,
  IReports,
} from '../interface/report-data.interface.ts';
import {
  dataObject,
  functionComplexity,
  functionObject,
} from '../interface/summary.interface.ts';
import { STATIC_PATH } from './helpers.ts';

import DBUpdate from '../database/db-update/db-update.ts';

import DBRead from '../database/db-read/db-read.ts';

const REPORTS = config.REPORTS;

const parseFunctionReportLine = (line: string): functionComplexity | null => {
  if (!line.trim().startsWith('|')) {
    return null;
  }

  const dataLine = line.split('|').map((item) => item.trim());
  if (dataLine.length < 5) {
    return null;
  }

  const functionName = dataLine[2];
  const complexity = Number.parseInt(dataLine[3], 10);
  const fileAndLine = dataLine[4]?.split(':');
  const lineNumber = Number.parseInt(fileAndLine?.at(-1) ?? '', 10);

  if (
    !functionName ||
    Number.isNaN(complexity) ||
    !fileAndLine ||
    fileAndLine.length < 2 ||
    Number.isNaN(lineNumber)
  ) {
    return null;
  }

  return {
    name: functionName,
    complexity,
    file: fileAndLine.slice(0, -1).join(':').trim(),
    line: lineNumber,
  };
};

class SummaryReport {
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

  static processSummary = async (
    functions: functionComplexity[]
  ): Promise<dataObject[]> => {
    const data: dataObject[] = [];
    let file = '';
    let complexity = 0;
    let complexityTotal = 0;
    let functionArray: functionObject[] = [];

    let used: string[] = [];
    functions.forEach((item) => {
      // reset on new file
      if (file !== item.file) {
        if (file !== '') {
          data.push({
            file,
            complexity,
            functions: functionArray,
            functionTotal: functionArray.length,
            complexityTotal: complexityTotal,
            complexityAverage: complexityTotal / functionArray.length,
          });
        }
        file = item.file;
        complexity = 0;
        complexityTotal = 0;
        functionArray = [];
        used = [];
      }
      const functionItem = {
        name: item.name,
        line: item.line,
        complexity: item.complexity,
      };
      functionArray.push(functionItem);
      complexityTotal += item.complexity;

      // Filter out functions with the same name, as per original report
      if (!used.includes(item.name)) {
        complexity += item.complexity;
        used.push(item.name);
      }
    });

    if (file !== '') {
      data.push({
        file,
        complexity,
        functions: functionArray,
        functionTotal: functionArray.length,
        complexityTotal,
        complexityAverage:
          functionArray.length > 0 ? complexityTotal / functionArray.length : 0,
      });
    }

    return data;
  };

  static loadFunctionReportFromOutput = async (
    outputPath: string
  ): Promise<functionComplexity[]> => {
    const filepath = path.join(outputPath, 'function-names.all.md');
    const data: functionComplexity[] = [];

    if (existsSync(filepath)) {
      const fileStream = createReadStream(filepath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const parsedLine = parseFunctionReportLine(line);
        if (parsedLine) {
          data.push(parsedLine);
        }
      }
    }

    return data.sort(SummaryReport.dynamicSort(['file', 'name', 'line']));
  };

  static createDataFromOutput = async (
    outputPath: string,
    workspaceRoot: string,
    reportData: IReports
  ): Promise<void> => {
    const loadedData = await SummaryReport.loadFunctionReportFromOutput(outputPath);
    const tmpObj = await SummaryReport.processSummary(loadedData);
    const fileCount = tmpObj.length;
    const totalComplexity = tmpObj.reduce(
      (total, fileItem) => total + fileItem.complexity,
      0
    );
    const averageComplexity = fileCount > 0 ? totalComplexity / fileCount : 0;
    const tmpReportId = await DBUpdate.createReports({
      ...reportData,
      fileCount,
      totalComplexity,
      averageComplexity,
    });

    for (const fileItem of tmpObj) {
      const fileData: IFiles = {
        report_id: tmpReportId,
        filename: path.isAbsolute(fileItem.file)
          ? path.relative(workspaceRoot, fileItem.file)
          : path.normalize(fileItem.file),
        fileComplexity: fileItem.complexity,
        totalFunctions: fileItem.functionTotal,
        totalComplexity: fileItem.complexityTotal,
        averageComplexity: fileItem.complexityAverage,
      };
      const fileId = await DBUpdate.createFiles(fileData);

      for (const functionItem of fileItem.functions) {
        const functiomData: IFunctions = {
          report_id: tmpReportId,
          summary_id: fileId,
          function: functionItem.name,
          line: functionItem.line,
          functionComplexity: functionItem.complexity,
        };
        await DBUpdate.createFunctions(functiomData);
      }
    }
  };

  static getSummary = async (req: Request, res: Response): Promise<void> => {
    res.sendFile(path.join(STATIC_PATH, 'reports-browser.html'));
  };

  static getSummaryData = async (req: Request, res: Response): Promise<void> => {
    const idx: number = parseInt(req.params['idx'] as string);
    const target: string = req.params['tgt'] as string;
    const report = REPORTS[idx] as any;
    const projectKey = 'PROJECT' in report ? report.PROJECT : report.FOLDER;
    const timestamp = Number.parseInt(target, 10);

    if (Number.isNaN(timestamp)) {
      res.status(400).json({ error: 'Invalid report timestamp.' });
      return;
    }

    const storedReport = await DBRead.getReportByProjectAndTimestamp(projectKey, timestamp);
    if (!storedReport?.id) {
      res.status(404).json({ error: 'Stored report could not be found.' });
      return;
    }

    const complexityObj = await DBRead.getReportById(storedReport.id);
    const targetName = storedReport.report;

    res.status(200).json({
      report,
      target,
      targetName,
      idx,
      storedReport,
      complexityObj,
      hasHtmlReport: false,
    });
  };
}
export default SummaryReport;
