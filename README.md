# CYCNode2

See the [user guide](docs/usage.md) for setup, configuration, dashboard controls, report generation, filtering, exclusions, metrics, charts, and troubleshooting.

## To install

In a command prompt, from the repository root, run

```bash
npm install
```

The `config.json` file in the project root folder controls which codebases appear in the UI and how reports are generated.

The application supports two project modes:

- single-folder projects
- Nx monorepo projects

The report browser supports sortable file metrics, numeric range filters, per-project file exclusions, function-level drill-down, and comparisons between stored runs.

## Configuration

```json
{
  "SERVER_PORT": 3000,
  "PATH": "/to/codebase",
  "MODE": "nx",
  "PROJECTS": [ "project", "names" ]
}
```

- `SERVER_PORT`: Port used by the web app.
- `PATH`: Absolute path to the project root that will be analyzed.
- `MODE`: Using 'nx' or not.
- `PROJECTS`: Label shown in the UI.

This form creates conventional Nx report definitions for every project in `PROJECTS`. Use explicit `REPORTS` configuration when a project needs custom paths or file exclusions.

## Report Configuration and File Exclusions

Use an explicit `REPORTS` array for single-folder projects, non-standard Nx layouts, or per-project exclusions:

```json
{
  "SERVER_PORT": 3000,
  "PATH": "/to/codebase",
  "REPORTS": [
    {
      "NAME": "Web application",
      "PATH": "/to/codebase",
      "FOLDER": "web-app",
      "EXCLUDE_FILES": ["apps/web-app/src/vendor.js", "%/third-party/%"]
    }
  ]
}
```

`EXCLUDE_FILES` accepts exact file paths and `%` wildcard patterns. Excluded files do not contribute to visible dashboard statistics, project history, summaries, or comparisons, but their stored data is retained. You can also update exclusions from the project report page; saving writes them to `config.json` and refreshes historical results without regenerating reports.

Built-in exclusions always hide paths matching `%eslint-configs/%`, `%mock%`, `%test-setup%`, `%.json`, and `libs/shared/%`.

On a run summary, numeric minimum and maximum filters limit the displayed files only. They do not change report metrics or stored data. The **View functions** button shows per-function details and is coloured by the highest individual function complexity when that score exceeds 5: yellow for 6-10, orange for 11-20, and red for 21+.

## How Nx Mode Works

For Nx targets, the application does not run the complexity report against the full monorepo root.

Instead it:

1. creates a temporary copied workspace slice under `test-results/complexity-slices/`
2. copies the selected app root
3. copies all libraries under `libs/<scope>`
4. discovers and copies only the required `libs/shared/**` library roots
5. preloads the Nx project graph inside that copied slice
6. runs the report in an isolated child Node process
7. removes the temporary slice when the run completes

This keeps the report scoped to the selected app while still allowing ESLint and Nx rules to resolve correctly.

## Prerequisites

### Single-folder projects

The project being analyzed must have:

- a working ESLint flat config
- all packages and local files referenced by that config installed and available
- one of `eslint.config.js`, `eslint.config.mjs`, or `eslint.config.cjs` at the configured `PATH`

If any package or referenced file is missing, the report run will fail.

### Nx projects

The Nx workspace root configured in `PATH` must have:

- `nx.json`
- `package.json`
- `tsconfig.base.json`
- `tsconfig.eslint.json`
- a root ESLint flat config
- any shared config modules referenced by the ESLint setup

The selected `APP_ROOT` must exist, and the selected `LIB_SCOPE` must map to libraries under `libs/<scope>`.

## To run the reporter

In a command prompt, from the repository root, run

```bash
npm run start
```

Once the server is running, open your browser and navigate to `http://localhost:3000/`.
