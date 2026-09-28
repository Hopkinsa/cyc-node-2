# CYCNode2 User Guide

## Purpose

CYCNode2 builds and stores historical code-complexity reports for configured projects. It finds commits on the target repository's `master` branch, maps each commit to a GitHub issue label, and generates a complexity report for each matching project at that exact commit.

The web interface lets you review individual runs, filter file tables, exclude files from visible metrics, compare two runs, and see complexity trends over time.

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

`config.json` has two levels:

- **Application settings** identify the repository that CYCNode2 synchronizes and checks out.
- **Report settings** identify a report in the dashboard and define whether it analyzes a standard repository checkout or an Nx workspace slice.

The root `PATH` is the absolute path to the target Git repository. CYCNode2 runs `git log`, reads the `master` branch, and creates historical worktrees from this location. Every configured report is generated from those worktrees, so the root `PATH` must be the repository containing the commits and GitHub issues being reported.

| Setting | Used for |
| --- | --- |
| `SERVER_PORT` | HTTP port for the CYCNode2 web interface. |
| `PATH` | Target Git repository. Used to synchronize Git history and create detached worktrees for reports. |
| `MODE` | Set to `"nx"` only when using the shorthand `PROJECTS` configuration. Omit it for explicit `REPORTS` configuration unless an individual report is Nx. |
| `PROJECTS` | Shorthand list that creates one conventional Nx report for each project name. |
| `REPORTS` | Explicit report definitions. Use this for standard reports, custom Nx layouts, or project-specific exclusions. |

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

- `SERVER_PORT` and `PATH` have the meanings described in the table above.
- `MODE: "nx"` tells CYCNode2 to create one Nx report definition for each value in `PROJECTS`.
- Each `PROJECTS` value is used as the Nx project name, GitHub issue label, dashboard key, `APP_ROOT` (`apps/<project>`), and `LIB_SCOPE` (`libs/<project>`).

For example, `"PROJECTS": ["web-app"]` creates the equivalent of an Nx report with `PROJECT: "web-app"`, `APP_ROOT: "apps/web-app"`, and `LIB_SCOPE: "web-app"`. Use explicit reports when any of those conventions differs.

### Explicit report configuration

Use `REPORTS` when a project does not follow the standard Nx layout or when configuring a standard report. The example contains one standard report and one Nx report:

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

### Standard Report Fields

```json
{
  "NAME": "Service API",
  "PATH": "/absolute/path/to/the/repository",
  "FOLDER": "service-api"
}
```

| Field | Used for |
| --- | --- |
| `NAME` | Display name on the dashboard and report pages. It does not affect Git matching or the files analyzed. |
| `PATH` | Absolute root of the target repository. It should normally match the root `PATH`; CYCNode2 uses it to keep stored file paths relative to the repository and to locate installed dependencies. |
| `FOLDER` | Standard-report key. It must match the GitHub issue label that identifies commits for this report, and it groups those stored reports in the dashboard. It also prefixes temporary report output. It does **not** select a source folder to scan. |
| `MODE` | Omit this property, or use an empty string, for a standard report. |

A standard report runs ESLint from the detached repository worktree. Its scope is controlled by the repository's ESLint configuration and lint patterns, not by `FOLDER`.

### Nx Report Fields

```json
{
  "NAME": "Web application",
  "PATH": "/absolute/path/to/the/repository",
  "FOLDER": "web-app-output",
  "MODE": "nx",
  "PROJECT": "web-app",
  "APP_ROOT": "apps/web-app",
  "LIB_SCOPE": "web-app"
}
```

| Field | Used for |
| --- | --- |
| `NAME` and `PATH` | Have the same meanings as a standard report. |
| `FOLDER` | Required output-folder prefix for an Nx report. It is not the GitHub label and does not determine the source scope. |
| `MODE` | Must be `"nx"` to create an isolated Nx workspace slice. |
| `PROJECT` | Nx project name, dashboard/report key, and GitHub issue label that identifies commits for this report. |
| `APP_ROOT` | Path to the application inside the repository, relative to `PATH`; for example, `apps/web-app`. This is the primary source tree copied into the Nx slice. |
| `LIB_SCOPE` | Library directory name below `libs/`; for example, `web-app` copies `libs/web-app`. Required shared libraries imported from `@libs/shared/...` are also discovered and copied automatically. |

The values can be the same when the repository follows the conventional Nx layout, but they describe different things. For example, a project named `admin-portal` at `apps/admin-portal` that uses `libs/shared` can use `PROJECT: "admin-portal"`, `APP_ROOT: "apps/admin-portal"`, and `LIB_SCOPE: "shared"`.

Each report can also include an `EXCLUDE_FILES` array of exact file paths or `%` wildcard patterns. These files are excluded from visible report metrics, summaries, trends, and comparisons:

```json
{
  "EXCLUDE_FILES": ["apps/web-app/src/vendor.js", "%/third-party/%"]
}
```

You can also maintain these exclusions from the project report page. Saving changes writes the updated report configuration to `config.json`; it does not regenerate or delete stored report data.

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
- **Available runs**: each run lists its date, included-file count, total file complexity, and average complexity per file. Select a run to view its file-level results.
- **Compare stored runs**: choose two runs and compare their file metrics. New, deleted, and changed files are included in the comparison.
- **Third-party files**: add, amend, or remove per-project exact-path or `%` wildcard exclusion patterns. Save changes to persist them in `config.json` and refresh every stored run's visible file list and metrics immediately; regeneration is not required.
- **Refresh data**: reloads the data for the current page. It does not synchronize gitlog or generate reports.

### Run Summary Filters and Function Details

The run summary table can be sorted by its metric columns. Use the minimum and maximum inputs to filter the displayed rows by Complexity, Functions, Complexity Total, or Complexity Average. These filters only control the table view and do not change the run's stored data or report-level metrics.

Select **View functions** for a file to inspect its stored function names, lines, and complexity scores. Function scores use the following colour ranges: minimum (1-5), minor (6-10), medium (11-20), and high (21+). The **View functions** button uses the colour for the file's highest individual function when that score is above 5; files whose functions are all 5 or lower retain the standard button appearance.

### Built-in and Project Exclusions

Every report applies built-in exclusions for paths matching `%eslint-configs/%`, `%mock%`, `%test-setup%`, `%.json`, and `libs/shared/%`. These files remain hidden even when no project-specific exclusions are configured.

Project-specific `EXCLUDE_FILES` patterns are evaluated in addition to those built-in exclusions. Excluded files are omitted from visible dashboard statistics, project history, run summaries, and comparisons. The underlying file and function rows remain in SQLite, so removing a project-specific exclusion makes the historical data visible again without regenerating reports.

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
4. Stores project-level metrics with the run: **Files** is the number of included files after active exclusions are applied, **Total complexity** is the sum of their complexity scores, and **Average complexity** is total complexity divided by included-file count.
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
