import { ChecksCreateParamsOutputAnnotations } from "@octokit/rest";
import Octokit = require("@octokit/rest");
import * as path from "path";
import { Configuration, Linter } from "tslint";
import { getGitRepositoryDirectoryForFile, getGitSHA } from "./git-helpers";

/**
 * Run TSLin on the given project and post results to Github Checks API.
 * @param github An Octokit instance, authenticated as a github app with checks:write permission
 */
export async function tslintCheck(github: Octokit, options: {
  owner: string;
  repo: string;
  tsConfigFile: string;
}) {
  const { owner, repo, tsConfigFile } = options;
  const baseDir = getGitRepositoryDirectoryForFile(tsConfigFile);

  const check = await github.checks.create({
    owner,
    repo,
    head_sha: getGitSHA(baseDir),
    name: "TSLint",
    status: "in_progress",
  });

  const lintResults = getLintResultsForProject({ tsConfigFile }).map((a) => ({
    ...a,
    path: path.relative(baseDir, a.path), // patch file paths to be relative to git root
  }));
  const lintErrors = lintResults.filter((a) => a.annotation_level === "failure");
  const conclusion = lintErrors.length > 0 ? "failure" : "success";

  const summary = `${lintErrors.length} errors, ${lintResults.length - lintErrors.length} warnings.`;

  while (lintResults.length > 0) {
    const batch = lintResults.splice(0, 50);
    await github.checks.update({
      check_run_id: check.data.id,
      owner,
      repo,
      output: {
        annotations: batch,
        summary,
        title: "TSLint",
      },
      conclusion,
    });
  }
}

/**
 * Get all TSLint errors and warnings for the given Typescript project.
 */
export function getLintResultsForProject(options: {
  tslintConfigFile?: string;
  tsConfigFile: string;
}): ChecksCreateParamsOutputAnnotations[] {
  const program = Linter.createProgram(options.tsConfigFile);
  const linter = new Linter(
    {
      fix: false,
      formatter: "json",
    },
    program,
  );

  const files = Linter.getFileNames(program);
  files.forEach((file) => {
    const fileContents = program.getSourceFile(file)!.getFullText();
    const configuration = Configuration.findConfiguration(
      options.tslintConfigFile || null,
      file,
    ).results;
    linter.lint(file, fileContents, configuration);
  });

  const results = linter.getResult();
  const annotations: ChecksCreateParamsOutputAnnotations[] = [];
  for (const failure of results.failures) {
    if (failure.getRuleSeverity() === "off") { continue; }
    let annotation: ChecksCreateParamsOutputAnnotations = {
      annotation_level: failure.getRuleSeverity() === "error" ? "failure" : "warning",
      path: failure.getFileName(),
      title: failure.getRuleName(),
      message: failure.getFailure(),
      start_line: failure.getStartPosition().getLineAndCharacter().line + 1,
      end_line: failure.getEndPosition().getLineAndCharacter().line + 1,
    };
    if (
      annotation.start_line &&
      annotation.start_line === annotation.end_line
    ) {
      annotation = {
        ...annotation,
        start_column:
          failure.getStartPosition().getLineAndCharacter().character + 1,
        end_column: failure.getEndPosition().getLineAndCharacter().character + 1,
      };
    }
    annotations.push(annotation);
  }

  return annotations;
}
