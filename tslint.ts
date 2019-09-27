import { ChecksCreateParamsOutputAnnotations } from "@octokit/rest";
import * as path from "path";
import { Configuration, Formatters, Linter } from "tslint";
import { CheckOptions } from ".";
import { getGitRepositoryDirectoryForFile, getGitSHA } from "./git-helpers";

/**
 * Run TSLin on the given project and post results to Github Checks API.
 */
export async function tslintCheck(tsConfigFile: string, checkOptions?: CheckOptions) {
  const baseDir = getGitRepositoryDirectoryForFile(tsConfigFile);

  let check;
  if (checkOptions) {
    check = await checkOptions.github.checks.create({
      owner: checkOptions.owner,
      repo: checkOptions.repo,
      head_sha: getGitSHA(baseDir),
      name: "TSLint",
      status: "in_progress",
    });
  }

  const linterResult = getLintResultsForProject({ tsConfigFile });
  const annotations = linterResult.annotations.map((a) => ({
    ...a,
    path: path.relative(baseDir, a.path), // patch file paths to be relative to git root
  }));
  const errorCount = linterResult.annotations.filter((a) => a.annotation_level === "failure").length;
  const warningCount = linterResult.annotations.length - errorCount;
  const summary = `${errorCount} errors, ${warningCount} warnings.`;
  const conclusion = errorCount > 0 ? "failure" : "success";

  console.log(`TSLint: ${summary}`);
  console.log(linterResult.consoleOutput);

  if (checkOptions && check) {
    while (annotations.length > 0) {
      const batch = annotations.splice(0, 50);
      await checkOptions.github.checks.update({
        check_run_id: check.data.id,
        owner: checkOptions.owner,
        repo: checkOptions.repo,
        output: {
          annotations: batch,
          summary,
          title: "TSLint",
        },
        conclusion,
      });
    }
  }
}

/**
 * Get all TSLint errors and warnings for the given Typescript project.
 */
export function getLintResultsForProject(options: {
  tslintConfigFile?: string;
  tsConfigFile: string;
}): {
  consoleOutput: string;
  annotations: ChecksCreateParamsOutputAnnotations[];
 } {
  const program = Linter.createProgram(options.tsConfigFile);
  const linter = new Linter(
    {
      fix: false,
      formatter: Formatters.CodeFrameFormatter,
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

  return {
    consoleOutput: results.output,
    annotations,
  };
}
