const elements = {
  sourcePath: document.querySelector('#source-path'),
  gitlogCount: document.querySelector('#gitlog-count'),
  reportCount: document.querySelector('#report-count'),
  statusMessage: document.querySelector('#status-message'),
  projects: document.querySelector('#projects'),
  syncGitlog: document.querySelector('#sync-gitlog'),
  generateAll: document.querySelector('#generate-all'),
  template: document.querySelector('#project-template'),
};

const setStatus = (message, state = '') => {
  elements.statusMessage.textContent = message;
  if (state) {
    elements.statusMessage.setAttribute('data-state', state);
  } else {
    elements.statusMessage.removeAttribute('data-state');
  }
};

const setBusy = (busy) => {
  document.querySelectorAll('button').forEach((button) => {
    button.disabled = busy;
  });
};

const loadDashboard = async () => {
  const response = await fetch('/api/dashboard');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Unable to load dashboard data.');
  }

  const sourcePathName = data.sourcePath || 'Not configured';
  elements.sourcePath.textContent = sourcePathName.split("/").pop();
  elements.gitlogCount.textContent = String(data.gitlogRows);
  elements.reportCount.textContent = String(data.storedReports);
  elements.projects.textContent = '';

  for (const project of data.projects) {
    const fragment = elements.template.content.cloneNode(true);
    fragment.querySelector('.project-key').textContent = project.projectKey;
    fragment.querySelector('.project-name').textContent = project.name;
    fragment.querySelector('.project-gitlog-count').textContent = String(project.gitlogCount);
    fragment.querySelector('.project-report-count').textContent = String(project.reportCount);
    fragment.querySelector('.project-latest').textContent = project.latestReport
      ? `${project.latestReport.report}`
      : 'No stored report';

    const reportLink = fragment.querySelector('.report-link');
    if (project.reportCount > 0) {
      reportLink.href = `/reports/${project.idx}`;
      reportLink.classList.remove('hidden');
    }

    fragment
      .querySelector('.generate-project')
      .addEventListener('click', () => runRequest(`/reports/${project.idx}`, 'POST', `${project.name} reports generated.`));

    elements.projects.append(fragment);
  }

  setStatus('Dashboard data is current.', 'success');
};

const runRequest = async (url, method, successMessage) => {
  setBusy(true);
  setStatus('Processing request...');

  try {
    const response = await fetch(url, { method });
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      throw new Error(data?.error || `Request failed with ${response.status}.`);
    }

    setStatus(successMessage, 'success');
    await loadDashboard();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Request failed.', 'error');
  } finally {
    setBusy(false);
  }
};

elements.syncGitlog.addEventListener('click', () => {
  runRequest('/reports/sync-gitlog', 'POST', 'Gitlog synchronized.');
});

elements.generateAll.addEventListener('click', () => {
  runRequest('/reports', 'POST', 'All configured reports processed.');
});

loadDashboard().catch((error) => {
  setStatus(error instanceof Error ? error.message : 'Unable to load dashboard.', 'error');
});