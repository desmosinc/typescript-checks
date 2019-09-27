import { ChecksCreateParamsOutputAnnotations } from "@octokit/rest";
import * as path from "path";
import * as ts from "typescript";
import { CheckOptions } from ".";
import { getGitRepositoryDirectoryForFile, getGitSHA } from "./git-helpers";

/**
 * Run Typescript compiler on the given project and post results to Github Checks API.
 */
export async function typescriptCheck(tsConfigFile: string, checkOptions?: CheckOptions) {
  const baseDir = getGitRepositoryDirectoryForFile(tsConfigFile);

  let check;
  if (checkOptions) {
      check = await checkOptions.github.checks.create({
        owner: checkOptions.owner,
        repo: checkOptions.repo,
      head_sha: getGitSHA(baseDir),
    name: "Typescript",
    status: "in_progress",
  });
}

  const compileErrors = getDiagnosticsForProject(tsConfigFile);
  compileErrors.annotations = compileErrors.annotations.map((a) => ({
    ...a,
    path: path.relative(baseDir, a.path), // patch file paths to be relative to git root
  }));

  const summary = `${compileErrors.globalErrors.length +
    compileErrors.annotations.length} errors.\n\n` +
  compileErrors.globalErrors.join("\n");

  if (checkOptions && check) {
    while (compileErrors.annotations.length > 0) {
      const batch = compileErrors.annotations.splice(0, 50);
      await checkOptions.github.checks.update({
        check_run_id: check.data.id,
        owner: checkOptions.owner,
        repo: checkOptions.repo,
        output: {
          annotations: batch,
          summary,
          title: "Typescript",
        },
        conclusion: compileErrors.hasFailures ? "failure" : "success",
      });
    }
  }
}

/**
 * Get all Typescript compiler diagnostics for the given TS project.
 */
export function getDiagnosticsForProject(configFileName: string): {
  hasFailures: boolean,
  annotations: ChecksCreateParamsOutputAnnotations[],
  globalErrors: string[],
} {
  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
    configFileName,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic: ts.Diagnostic) => {
        ts.formatDiagnostic(diagnostic, {
          getCurrentDirectory: ts.sys.getCurrentDirectory,
          getNewLine: () => ts.sys.newLine,
          getCanonicalFileName: (s) => s,
        });
      },
    },
  );

  const program = ts.createProgram(parsedCommandLine!.fileNames, {
    ...parsedCommandLine!.options,
    noEmit: true,
  });
  const emitResult = program.emit();

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  const annotations: ChecksCreateParamsOutputAnnotations[] = [];
  const globalErrors = [];
  let hasFailures = false;

  for (const diagnostic of allDiagnostics) {
    if (diagnostic.file) {
      const start = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start!,
      );
      const end = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start! + diagnostic.length!,
      );

      annotations.push({
        annotation_level: diagnostic.category === ts.DiagnosticCategory.Error
        ? "failure"
        : diagnostic.category === ts.DiagnosticCategory.Warning
        ? "warning"
        : "notice",
        start_line: start.line + 1,
        end_line: end.line + 1,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        path: diagnostic.file.fileName,
      });

      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        hasFailures = true;
      }
    } else if (diagnostic.category === ts.DiagnosticCategory.Error) {
      globalErrors.push(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      );
      hasFailures = true;
    }
  }

  return { hasFailures, annotations, globalErrors };
}
