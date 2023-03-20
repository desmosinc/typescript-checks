# typescript-checks

Get Typescript and ESLint diagnostics and post results as a GitHub Check.

## Prerequisites

- [Set up a GitHub App](https://developer.github.com/apps/quickstart-guides/setting-up-your-development-environment) that requests `checks:write` permissions.
- Install the app for the repo where you want to run TS / ESLint checks.

## Usage

```
> typescript-checks --help
typescript-checks [command]

Commands:
  index.ts tsc <tsconfig>      Check TypeScript errors
  index.ts eslint <directory>  Check ESLint errors

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
  --repo     The github repository, "owner/repo"                        [string]
  --sha      The git sha to which to post check results. Defaults to HEAD
                                                                        [string]
  --label    A label for this check run                                 [string]


This tool gets TypeScript or ESLint diagnostics and posts results as a
"check run" to the given GitHub repository.

The following environment variables, corresponding to a GitHub app with
'checks:write' permission, are used to authenticate with the GitHub API:

GITHUB_APP_PRIVATE_KEY
GITHUB_APP_INSTALLATION_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET

They can also be provided in a ".env" file in the current working directory.
```
