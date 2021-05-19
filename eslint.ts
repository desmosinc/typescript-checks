import { ESLint } from "eslint";
import * as path from "path";
import { CheckOptions } from ".";
import { getGitRepositoryDirectoryForFile, getGitSHA } from "./git-helpers";
import { GithubCheckAnnotation } from "./octokit-types";

/**
 * Run ESLint on the given project and post results to Github Checks API.
 */
export async function eslintCheck(
  directory: string,
  checkOptions?: CheckOptions
) {
  const baseDir = getGitRepositoryDirectoryForFile(directory);

  let check;
  if (checkOptions) {
    check = await checkOptions.github.checks.create({
      owner: checkOptions.owner,
      repo: checkOptions.repo,
      head_sha: checkOptions.sha || getGitSHA(baseDir),
      name: checkOptions.name ? `ESLint - ${checkOptions.name}` : "ESLint",
      status: "in_progress"
    });
    console.log(`Created check ${check.data.id} (${check.data.url})`);
  }

  const linterResult = await getLintResultsForProject([baseDir]);
  const annotations = linterResult.annotations.map(a => ({
    ...a,
    path: path.relative(baseDir, a.path) // patch file paths to be relative to git root
  }));
  const summary = `${linterResult.errorCount} errors, ${linterResult.warningCount} warnings.`;
  const conclusion = linterResult.errorCount > 0 ? "failure" : "success";

  console.log(`ESLint: ${summary}`);
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
          title: checkOptions.name ? `ESLint - ${checkOptions.name}` : "ESLint"
        },
        conclusion
      });
      console.log(
        `Updated check ${update.data.id} with ${batch.length} annotations.`
      );
    }
  }
}

/**
 * Get all ESLint errors and warnings for the given Typescript project.
 */
export async function getLintResultsForProject(
  globs: string[]
): Promise<{
  consoleOutput: string;
  annotations: GithubCheckAnnotation[];
  errorCount: number;
  warningCount: number;
}> {
  const eslint = new ESLint();
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
          start_line: message.line,
          end_line: message.endLine || message.line
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
