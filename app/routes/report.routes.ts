import { Router } from 'express';
import Report from '../utility/report.ts';
import Summary from '../utility/summary-data.ts';

import ComparisonReport from '../utility/compare-data.ts';


export const REPORT_ROUTES = Router();

// Request handling
REPORT_ROUTES.get('/dashboard', Report.getDashboard);

REPORT_ROUTES.get('/help', Report.getHelp);

REPORT_ROUTES.get('/api/dashboard', Report.getDashboardData);

REPORT_ROUTES.get('/api/reports/:idx/trends', Report.getComplexityTrends);

REPORT_ROUTES.get('/api/reports/:idx/function-trends', Report.getFunctionTrends);

REPORT_ROUTES.get('/api/reports/:idx/analysis/:kind', Report.getProjectInsightData);

REPORT_ROUTES.put('/api/reports/:idx/exclusions', Report.updateReportExclusions);

REPORT_ROUTES.post('/api/reports/:idx/temporary', Report.generateTemporaryReport);

REPORT_ROUTES.delete('/api/reports/:idx/temporary', Report.removeTemporaryReport);

REPORT_ROUTES.get('/api/reports/:idx/:tgt', Summary.getSummaryData);

REPORT_ROUTES.get('/api/reports/:idx', Report.getReportsData);

REPORT_ROUTES.post('/api/reports/compare', ComparisonReport.getComparisonReport);

REPORT_ROUTES.post('/reports/sync-gitlog', Report.syncGitLog);

REPORT_ROUTES.post('/reports', Report.generateAllReports);

REPORT_ROUTES.get('/reports/:idx/analysis', Report.getComplexityAnalysis);

REPORT_ROUTES.get('/reports/:idx/analysis/hotspots', Report.getComplexityHotspots);

REPORT_ROUTES.get('/reports/:idx/analysis/trends', Report.getBaselineAnalysis);

REPORT_ROUTES.get('/reports/:idx/analysis/:kind', Report.getProjectInsightPage);

REPORT_ROUTES.get('/reports/:idx/:tgt', Summary.getSummary);

REPORT_ROUTES.post('/reports/compare', ComparisonReport.getComparisonReport);

REPORT_ROUTES.post('/reports/:idx', Report.generateReport);

REPORT_ROUTES.get('/reports/:idx', Report.getReports);

REPORT_ROUTES.get('/', Report.getCodebases);
