#!/usr/bin/env node
// tslint:disable:no-var-requires
require("ts-node/register/transpile-only");
import * as path from "path";
require("dotenv").config({
  path: process.env.ENV_FILE || path.join(process.cwd(), ".env")
});
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { eslintCheck } from "./eslint";
import { tslintCheck } from "./tslint";
import { typescriptCheck } from "./typescript";

const TSLINT_CHECK_APP_ID = 42099;

export type CheckOptions = {
  /**
   * An Octokit instance, authenticated as a github app with checks:write permission
   */
  github: Octokit;
  name?: string;
  owner: string;
  repo: string;
  sha?: string;
};

import yargs from "yargs";

const _ = yargs
  .usage(
    "$0 --label ... --repo org/repository --sha ... [command]",
    `

Get TypeScript or linting diagnostics and post results as a "check run" to the given GitHub repository.

The following environment variables, corresponding to a GitHub app with 'checks:write' permission, are used to authenticate with the GitHub API:

GITHUB_APP_PRIVATE_KEY
GITHUB_APP_INSTALLATION_ID
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET

They can also be provided in a ".env" file in the current working directory.`
  )
  .option("repo", {
    describe: 'The github repository, "owner/repo"',
    type: "string"
  })
  .options("sha", {
    describe: "The git sha to which to post check results. Defaults to HEAD",
    type: "string"
  })
  .options("label", {
    describe: "A label for this check run",
    type: "string"
  })
  .command(
    "tsc <tsconfig>",
    "Check TypeScript errors",
    builder =>
      builder.positional("tsconfig", {
        describe: "Path to the TypeScript project configuration file",
        type: "string",
        default: path.join(process.cwd(), "tsconfig.json")
      }),
    async argv => {
      typescriptCheck(argv.tsconfig, await getCheckOptions("Typescript", argv));
    }
  )
  .command(
    "tslint <tsconfig>",
    "Check TSLint errors",
    builder =>
      builder.positional("tsconfig", {
        describe: "Path to the TypeScript project configuration file",
        type: "string",
        default: path.join(process.cwd(), "tsconfig.json")
      }),
    async argv => {
      tslintCheck(argv.tsconfig, await getCheckOptions("TSLint", argv));
    }
  )
  .command(
    "eslint <directory>",
    "Check ESLint errors`",
    builder =>
      builder.positional("directory", {
        describe: "Location of files to lint",
        type: "string",
        demand: true
      }),
    async argv => {
      eslintCheck(argv.directory!, await getCheckOptions("ESLint", argv));
    }
  ).argv;

async function getCheckOptions(
  command: string,
  argv: {
    repo?: string;
    sha?: string;
    label?: string;
  }
) {
  let check: CheckOptions | undefined;
  if (argv.repo) {
    const [owner, repo] = argv.repo.split("/");
    if (!owner || !repo) {
      console.error(
        `Invalid --repo argument ${argv.repo}. Expected "owner/repo".`
      );
      process.exit(1);
    }
    check = {
      github: await authenticate(),
      owner,
      repo,
      sha: argv.sha,
      name: argv.label || command
    };
  }
  return check;
}

async function authenticate(): Promise<Octokit> {
  const auth = createAppAuth({
    id: TSLINT_CHECK_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || "",
    installationId: Number(process.env.GITHUB_APP_INSTALLATION_ID),
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET
  });

  // Retrieve installation access token
  const installationAuthentication = await auth({ type: "installation" });

  // workaround TS versions being inconsistent about how they handle the import
  const octokit = require("@octokit/rest");
  return new octokit({
    auth: installationAuthentication.token
  });
}
