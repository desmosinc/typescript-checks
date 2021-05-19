import * as path from "path";
import { Configuration, Formatters, Linter } from "tslint";
import { CheckOptions } from ".";
import { getGitRepositoryDirectoryForFile, getGitSHA } from "./git-helpers";
import { GithubCheckAnnotation } from "./octokit-types";

/**
 * Run TSLin on the given project and post results to Github Checks API.
 */
export async function tslintCheck(
  tsConfigFile: string,
  checkOptions?: CheckOptions
) {
  const baseDir = getGitRepositoryDirectoryForFile(tsConfigFile);

  let check;
  if (checkOptions) {
    check = await checkOptions.github.checks.create({
      owner: checkOptions.owner,
      repo: checkOptions.repo,
      head_sha: checkOptions.sha || getGitSHA(baseDir),
      name: checkOptions.name ? `TSLint - ${checkOptions.name}` : "TSLint",
      status: "in_progress",
    });
    console.log(`Created check ${check.data.id} (${check.data.url})`);
  }

  const linterResult = getLintResultsForProject({ tsConfigFile });
  const annotations = linterResult.annotations.map((a) => ({
    ...a,
    path: path.relative(baseDir, a.path), // patch file paths to be relative to git root
  }));
  const summary = `${linterResult.errorCount} errors, ${linterResult.warningCount} warnings.`;
  const conclusion = linterResult.errorCount > 0 ? "failure" : "success";

  console.log(`TSLint: ${summary}`);
  console.log(linterResult.consoleOutput);

  if (checkOptions && check) {
    for (
      let updateCount = 0;
      updateCount === 0 || annotations.length > 0;
      updateCount++
    ) {
      const batch = annotations.splice(0, 50);
      const update = await checkOptions.github.checks.update({
        check_run_id: check.data.id,
        owner: checkOptions.owner,
        repo: checkOptions.repo,
        output: {
          annotations: batch,
          summary,
          title: checkOptions.name ? `TSLint - ${checkOptions.name}` : "TSLint",
        },
        conclusion,
      });
      console.log(
        `Updated check ${update.data.id} with ${batch.length} annotations.`
      );
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
  annotations: GithubCheckAnnotation[];
  errorCount: number;
  warningCount: number;
} {
  const program = Linter.createProgram(options.tsConfigFile);
  const linter = new Linter(
    {
      fix: false,
      formatter: Formatters.CodeFrameFormatter,
    },
    program
  );

  const files = Linter.getFileNames(program);
  files.forEach((file) => {
    const fileContents = program.getSourceFile(file)!.getFullText();
    const configuration = Configuration.findConfiguration(
      options.tslintConfigFile || null,
      file
    ).results;
    linter.lint(file, fileContents, configuration);
  });

  const results = linter.getResult();
  const annotations: GithubCheckAnnotation[] = [];
  for (const failure of results.failures) {
    if (failure.getRuleSeverity() === "off") {
      continue;
    }
    let annotation: GithubCheckAnnotation = {
      annotation_level:
        failure.getRuleSeverity() === "error" ? "failure" : "warning",
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
        end_column:
          failure.getEndPosition().getLineAndCharacter().character + 1,
      };
    }
    annotations.push(annotation);
  }

  return {
    consoleOutput: results.output,
    annotations,
    errorCount: results.errorCount,
    warningCount: results.warningCount,
  };
}
