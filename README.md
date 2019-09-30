# typescript-checks

Get Typescript and TSLint diagnostics and post results as a GitHub Check.

## Prerequisites

- [Set up a GitHub App](https://developer.github.com/apps/quickstart-guides/setting-up-your-development-environment) that requests `checks:write` permissions.
- Install the app for the repo where you want to run TS / TSLint checks.

## Usage

```
> typescript-checks --help
typescript-checks <tsconfig> --repo organization/repository

Get Typescript and TSLint diagnostics for the Typescript project and post
results as a "check run" to the given GitHub repository.

The following environment variables, corresponding to a GitHub app with
'checks:write' permission, are used to authenticate with the GitHub API:

GITHUB_APP_PRIVATE_KEY
GITHUB_APP_INSTALLATION_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET

They can also be provided in a ".env" file in the current working directory or at the path specified by the `ENV_FILE` environment variable.

Positionals:
  tsconfig  Path to the TypeScript project configuration file [string] [default: "tsconfig.json"]

Options:
  --version  Show version number                                       [boolean]
  --help     Show help                                                 [boolean]
  --repo     The github repository, "owner/repo"
  ```

