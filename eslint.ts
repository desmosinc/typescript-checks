import { ESLint, Linter } from "eslint";
import { CheckResult } from ".";
import { GithubCheckAnnotation } from "./octokit-types";

export async function eslintCheck(
  globs: string[],
  overrides?: Linter.Config
): Promise<CheckResult> {
  const eslint = new ESLint({
    overrideConfig: overrides
  });

  const formatter = await eslint.loadFormatter("stylish");
  const results = await eslint.lintFiles(globs);
  const consoleOutput = formatter.format(results);

  const out: {
    consoleOutput: string;
    annotations: GithubCheckAnnotation[];
    errorCount: number;
    warningCount: number;
  } = {
    consoleOutput,
    annotations: [],
    errorCount: 0,
    warningCount: 0
  };

  for (const result of results) {
    for (const message of result.messages) {
      out.errorCount += result.errorCount;
      out.warningCount += result.warningCount;

      if (message.severity !== 0) {
        let annotation: GithubCheckAnnotation = {
          annotation_level: message.severity === 2 ? "failure" : "warning",
          path: result.filePath,
          title: message.ruleId || undefined,
          message: message.message,
          start_line: message.line || 1,
          end_line: message.endLine || message.line || 1
        };
        if (
          annotation.start_line &&
          annotation.start_line === annotation.end_line
        ) {
          annotation = {
            ...annotation,
            start_column: message.column,
            end_column: message.endColumn || message.column
          };
        }
        out.annotations.push(annotation);
      }
    }
  }

  return out;
}
