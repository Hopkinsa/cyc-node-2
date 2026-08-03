# CYCNode2 User Guide

## Purpose

CYCNode2 builds and stores historical code-complexity reports for configured projects. It finds commits on the target repository's `master` branch, maps each commit to a GitHub issue label, and generates a complexity report for each matching project at that exact commit.

The web interface lets you review individual runs, compare two runs, and see complexity trends over time.

## Requirements

- Node.js and npm
- Git, with the target repository already cloned locally
- GitHub CLI (`gh`) authenticated for the target repository
- The target repository's dependencies installed
- A local `master` branch in the target repository

For an Nx target, the workspace also needs the Nx and ESLint configuration described in the [README](../README.md).

## Setup

From the CYCNode2 repository root:

```bash
npm install
npm start
```

Open `http://localhost:3000/`.

The application reads `config.json` from its root. If it is missing, CYCNode2 creates an empty starter configuration. Use [config.json](config.json) as a reference.

### Nx project list configuration

This is the simplest configuration for a conventional Nx workspace where apps are at `apps/<project>` and project libraries are under `libs/<project>`:

```json
{
  "SERVER_PORT": 3000,
  "PATH": "/absolute/path/to/the/repository",
  "MODE": "nx",
  "PROJECTS": ["project-a", "project-b"]
}
```

- `SERVER_PORT`: HTTP port for CYCNode2.
- `PATH`: absolute path to the repository to analyze.
- `MODE`: use `"nx"` to create standard Nx project definitions from `PROJECTS`.
- `PROJECTS`: GitHub label and Nx project names to report on.

### Explicit report configuration

Use `REPORTS` when a project does not follow the standard Nx layout or when configuring a single-folder project:

```json
{
  "SERVER_PORT": 3000,
  "PATH": "/absolute/path/to/the/repository",
  "REPORTS": [
    {
      "NAME": "Service API",
      "PATH": "/absolute/path/to/the/repository",
      "FOLDER": "service-api"
    },
    {
      "NAME": "Web application",
      "PATH": "/absolute/path/to/the/repository",
      "FOLDER": "web-app",
      "MODE": "nx",
      "PROJECT": "web-app",
      "APP_ROOT": "apps/web-app",
      "LIB_SCOPE": "web-app"
    }
  ]
}
```

`NAME`, `PATH`, and `FOLDER` are required for every report. Nx reports additionally require `PROJECT`, `APP_ROOT`, and `LIB_SCOPE`.

## Normal Workflow

1. Open the dashboard.
2. Select **Sync gitlog** to discover relevant commits.
3. Select **Generate all reports** to process every configured project, or **Generate reports** on one project card to process only that project.
4. Select **View reports** to inspect the runs, trend chart, report details, or compare two runs.

Generation can take time because each report is calculated against a detached worktree at the matching historical commit.

## Dashboard Controls

- **Sync gitlog**: reads commits from the target repository's local `master` branch and associates eligible commits with GitHub issue labels.
- **Generate all reports**: generates any missing report for every configured project and synchronized commit.
- **Generate reports**: generates missing reports only for that project.
- **View reports**: opens the project report page once the project has stored runs.

The status message reports exactly how many matching commits were synchronized and how many reports were generated. A result of `0 reports generated` can be successful: reports at the same project and commit timestamp are not regenerated.

Each dashboard project card shows an average-complexity trend line across all available runs.

## Project Report Page

The project page contains:

- **Project history**: a responsive line chart across all stored runs. Use **Files**, **Total complexity**, and **Average complexity** to toggle individual lines. The chart key and vertical scale update to match the selected metrics.
- **Available runs**: each run lists its date, tested-file count, total file complexity, and average complexity per file. Select a run to view its file-level results.
- **Compare stored runs**: choose two runs and compare their file metrics. New, deleted, and changed files are included in the comparison.
- **Refresh data**: reloads the data for the current page. It does not synchronize gitlog or generate reports.

## How Commit Synchronization Works

1. CYCNode2 reads commits from local `master` in chronological order.
2. On the first sync, it starts at `2026-01-01`.
3. Later syncs use the saved commit checkpoint and query only `last-extracted-commit..master`.
4. If the checkpoint is no longer an ancestor of `master`, such as after a rebase, it falls back to the initial date-based scan.
5. A commit needs an issue reference in its message, such as `#123` or `issues/123`.
6. CYCNode2 uses `gh issue view` to retrieve that issue's labels.
7. A commit is eligible for a project when one of its GitHub issue labels matches the configured project key.

Gitlog entries and the checkpoint are stored in the local SQLite database under `data/`.

## How Reports and Metrics Work

For every eligible project/commit pair, CYCNode2:

1. Creates a detached Git worktree at the commit.
2. Runs the complexity analysis there. For Nx projects, it prepares a temporary workspace slice that contains the selected app and required libraries.
3. Stores the file and function-level results in SQLite.
4. Stores project-level metrics with the run:
   - **Files**: number of tested files.
   - **Total complexity**: sum of complexity scores for the tested files.
   - **Average complexity**: total complexity divided by tested-file count.
5. Removes the temporary worktree and analysis output.

Existing databases are migrated automatically and historical run metrics are backfilled from stored file data at startup.

## Troubleshooting

- **No synchronized gitlog data**: run **Sync gitlog** before generating reports.
- **No reports generated**: the matching runs may already exist, no commits may carry configured labels, or no new commits may be available after the checkpoint.
- **GitHub issue lookup fails**: verify `gh auth status` and that your account can view the target repository and issues.
- **`master` cannot be resolved**: ensure the target repository contains a local `master` branch. Fetch or create it as appropriate for the repository workflow.
- **Complexity generation fails**: install target repository dependencies and verify its ESLint/Nx configuration. The dashboard status message will show the request failure.
- **Incorrect project matching**: confirm the GitHub issue label matches the configured `PROJECT` for Nx mode or `FOLDER` for explicit reports.

## Local Data

The SQLite database is stored at `data/cyclometric-reports.db`. It contains gitlog entries, extraction state, report metadata, file results, and function results. Deleting this database resets the local synchronized history and stored reports; the next sync starts from the initial date window.
