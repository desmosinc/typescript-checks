#!/usr/bin/env node

require("dotenv").config();
require("ts-node/register/transpile-only");
import * as Octokit from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { typescriptCheck } from "./typescript";
import { tslintCheck } from "./tslint";
import * as path from "path";

const TSLINT_CHECK_APP_ID = 42099;

require("yargs")
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
    yargs.positional('tsconfig', {
      describe: 'Path to the TypeScript project configuration file',
      type: 'string',
      default: path.join(process.cwd(), 'tsconfig.json')
    })
    .option('repo', {
      describe: 'The github repository, "owner/repo"',
      demandOption: true,
      type: 'string'
    })
    .demand(['repo']);
  },
  (argv: {tsconfig: string, repo: string, dryRun: string}) => {
    const tsConfigFile = argv.tsconfig;
    const [owner, repo] = argv.repo.split("/");
    if (!owner || !repo) {
      console.error(
        `Invalid --repo argument ${argv.repo}. Expected "owner/repo".`
      );
      process.exit(1);
    }

    runChecks({tsConfigFile, repo, owner}).catch(e => {
      console.error(e);
      process.exit(1);
    });
  }
)
.help("help")
.argv;

async function runChecks(options: {tsConfigFile: string, repo: string, owner: string}) {
  const {tsConfigFile, repo, owner} = options;
  const github = await authenticate();

  return Promise.all([
    typescriptCheck(github, { owner, repo, tsConfigFile }),
    tslintCheck(github, { owner, repo, tsConfigFile })
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

  const octokit = require("@octokit/rest"); // workaround TS versions being inconsistent about how they handle the import
  return new octokit({
    auth: installationAuthentication.token
  });
}
