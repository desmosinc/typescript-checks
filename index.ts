#!/usr/bin/env node
// tslint:disable:no-var-requires

require("dotenv").config();
require("ts-node/register/transpile-only");
import { createAppAuth } from "@octokit/auth-app";
import * as Octokit from "@octokit/rest";
import * as path from "path";
import { tslintCheck } from "./tslint";
import { typescriptCheck } from "./typescript";

const TSLINT_CHECK_APP_ID = 42099;

type ParsedArgs = {
  tsconfig: string;
  repo?: string;
  sha?: string;
};

export type CheckOptions = {
  /**
   * An Octokit instance, authenticated as a github app with checks:write permission
   */
  github: Octokit;
  owner: string;
  repo: string;
  sha?: string;
};

const _ = require("yargs")
  .usage(
    "$0 <tsconfig>",
    `Get Typescript and TSLint diagnostics for the Typescript project and post results as a "check run" to the given GitHub repository.

  The following environment variables, corresponding to a GitHub app with 'checks:write' permission, are used to authenticate with the GitHub API:

  GITHUB_APP_PRIVATE_KEY
  GITHUB_APP_INSTALLATION_ID
  GITHUB_APP_CLIENT_ID
  GITHUB_APP_CLIENT_SECRET

  They can also be provided in a ".env" file in the current working directory.`,
    (yargs: any) => {
      yargs
        .positional("tsconfig", {
          describe: "Path to the TypeScript project configuration file",
          type: "string",
          default: path.join(process.cwd(), "tsconfig.json")
        })
        .option("repo", {
          describe: 'The github repository, "owner/repo"',
          type: "string"
        })
        .options("sha", {
          describe:
            "The git sha to which to post check results. Defaults to HEAD",
          type: "string"
        });
    },
    (argv: ParsedArgs) => {
      runChecks(argv).catch(e => {
        console.error(e);
        process.exit(1);
      });
    }
  )
  .help("help").argv;

async function runChecks(argv: ParsedArgs) {
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
      sha: argv.sha
    };
  }

  return Promise.all([
    typescriptCheck(argv.tsconfig, check),
    tslintCheck(argv.tsconfig, check)
  ]);
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
