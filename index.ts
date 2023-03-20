#!/usr/bin/env node
// eslint-disable @typescript-eslint/no-var-requires
require("ts-node/register/transpile-only");
import * as path from "path";
require("dotenv").config({
  path: process.env.ENV_FILE || path.join(process.cwd(), ".env")
});
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { eslintCheck } from "./eslint";
import { typescriptCheck } from "./typescript";

const TYPESCRIPT_CHECK_APP_ID = 42099;

export type GithubInfo = {
  /**
   * An Octokit instance, authenticated as a github app with checks:write permission
   */
  github: Octokit;
  owner: string;
  repo: string;
  sha?: string;
};
export interface CheckResult {
  consoleOutput: string;
  annotations: GithubCheckAnnotation[];
  errorCount: number;
  warningCount: number;
}

import yargs from "yargs";
import { getGitRepositoryDirectoryForFile, getGitSHA } from "./git-helpers";
import { GithubCheckAnnotation } from "./octokit-types";

// eslint-disable-next-line no-unused-expressions
yargs
  .epilogue(
    `
This tool gets TypeScript or ESLint diagnostics and posts results as a "check run" to the given GitHub repository.

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
    argv => {
      runCheck("Typescript", () => typescriptCheck(argv.tsconfig), {
        ...argv,
        location: argv.tsconfig
      });
    }
  )
  .command(
    "eslint <directory>",
    "Check ESLint errors",
    builder =>
      builder
        .positional("directory", {
          describe: "Location of files to lint",
          type: "string",
          demand: true
        })
        .option("overrideConfig", {
          describe: "ESLint configuration overrides as a JSON string",
          type: "string",
          default: "{}"
        }),
    argv =>
      runCheck(
        "ESLint",
        () =>
          eslintCheck([argv.directory || "."], JSON.parse(argv.overrideConfig)),
        {
          ...argv,
          location: argv.directory || "."
        }
      )
  ).argv;

async function runCheck(
  commandName: string,
  check: () => Promise<CheckResult>,
  options: {
    location: string;
    label?: string;
    repo?: string;
    sha?: string;
  }
) {
  let gh: GithubInfo | undefined;
  if (options.repo) {
    const [owner, repo] = options.repo.split("/");
    if (!owner || !repo) {
      console.error(
        `Invalid --repo argument ${options.repo}. Expected "owner/repo".`
      );
      process.exit(1);
    }
    gh = {
      github: await authenticate(),
      owner,
      repo,
      sha: options.sha
    };
  }

  const commandAndLabel = options.label
    ? `${commandName} - ${options.label}`
    : commandName;

  const baseDir = getGitRepositoryDirectoryForFile(options.location);

  let ghCheck;
  if (gh) {
    ghCheck = await gh.github.checks.create({
      owner: gh.owner,
      repo: gh.repo,
      head_sha: gh.sha || getGitSHA(baseDir),
      name: commandAndLabel,
      status: "in_progress"
    });
    console.log(`Created check ${ghCheck.data.id} (${ghCheck.data.url})`);
  }

  const linterResult = await check();
  const annotations = linterResult.annotations.map(a => ({
    ...a,
    path: path.relative(baseDir, a.path) // patch file paths to be relative to git root
  }));
  const summary = `${linterResult.errorCount} errors, ${linterResult.warningCount} warnings.`;
  const conclusion =
    linterResult.errorCount + linterResult.warningCount > 0
      ? "failure"
      : "success";

  console.log(`${commandAndLabel}: ${summary}`);
  console.log(linterResult.consoleOutput);

  if (gh && ghCheck) {
    for (
      let updateCount = 0;
      updateCount === 0 || annotations.length > 0;
      updateCount++
    ) {
      const batch = annotations.splice(0, 50);
      const update = await gh.github.checks.update({
        check_run_id: ghCheck.data.id,
        owner: gh.owner,
        repo: gh.repo,
        output: {
          annotations: batch,
          summary,
          title: commandAndLabel
        },
        conclusion
      });
      console.log(
        `Updated check ${update.data.id} with ${batch.length} annotations.`
      );
    }
  }

  if (conclusion === "failure") {
    process.exit(1);
  }
}

async function authenticate(): Promise<Octokit> {
  const auth = createAppAuth({
    id: TYPESCRIPT_CHECK_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || "",
    installationId: Number(process.env.GITHUB_APP_INSTALLATION_ID),
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET
  });

  // Retrieve installation access token
  const installationAuthentication = await auth({ type: "installation" });

  return new Octokit({
    auth: installationAuthentication.token
  });
}
