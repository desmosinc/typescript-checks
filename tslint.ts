import { Configuration, Formatters, Linter } from "tslint";
import { CheckResult } from ".";
import { GithubCheckAnnotation } from "./octokit-types";

/**
 * Get all TSLint errors and warnings for the given Typescript project.
 */
export async function tslintCheck(options: {
  tslintConfigFile?: string;
  tsConfigFile: string;
}): Promise<CheckResult> {
  const program = Linter.createProgram(options.tsConfigFile);
  const linter = new Linter(
    {
      fix: false,
      formatter: Formatters.CodeFrameFormatter
    },
    program
  );

  const files = Linter.getFileNames(program);
  files.forEach(file => {
    const fileContents = program.getSourceFile(file)?.getFullText() || "";
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
      end_line: failure.getEndPosition().getLineAndCharacter().line + 1
    };
    if (
      annotation.start_line &&
      annotation.start_line === annotation.end_line
    ) {
      annotation = {
        ...annotation,
        start_column:
          failure.getStartPosition().getLineAndCharacter().character + 1,
        end_column: failure.getEndPosition().getLineAndCharacter().character + 1
      };
    }
    annotations.push(annotation);
  }

  return {
    consoleOutput: results.output,
    annotations,
    errorCount: results.errorCount,
    warningCount: results.warningCount
  };
}
