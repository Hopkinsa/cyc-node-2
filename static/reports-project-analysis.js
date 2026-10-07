const reportIdx = Number(window.location.pathname.split('/')[2]);
const select = (id) => document.getElementById(id);

select('reports-link').href = `/reports/${reportIdx}`;
select('hotspots-link').href = `/reports/${reportIdx}/analysis/hotspots`;
select('trends-link').href = `/reports/${reportIdx}/analysis/trends`;
document.querySelectorAll('[data-analysis-kind]').forEach((link) => {
  link.href = `/reports/${reportIdx}/analysis/${link.dataset.analysisKind}`;
});

const loadDashboard = async () => {
  const response = await fetch(`/api/reports/${reportIdx}/function-trends`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load project analysis.');
  document.title = `${data.name} - Project Analysis`;
  select('title').textContent = data.name;
  select('subtitle').textContent = data.projectKey;
  const storedRuns = data.history.filter((run) => !run.isTemporary);
  const latest = data.history.at(-1);
  select('run-count').textContent = storedRuns.length.toLocaleString();
  select('file-count').textContent = latest?.fileCount.toLocaleString() ?? 'N/A';
  select('function-count').textContent = latest?.functionCount.toLocaleString() ?? 'N/A';
  select('latest-report').textContent = latest?.report ?? 'No reports';
  select('analysis-content').hidden = false;
  select('message').textContent = data.history.length ? '' : 'No report history available.';
  select('message').hidden = data.history.length > 0;
};

loadDashboard().catch((error) => {
  select('message').textContent = error.message;
  select('message').dataset.state = 'error';
});