import { ChecksCreateParamsOutputAnnotations } from "@octokit/rest";
import * as path from "path";
import * as ts from "typescript";
import { CheckOptions } from ".";
import { getGitRepositoryDirectoryForFile, getGitSHA } from "./git-helpers";

/**
 * Run Typescript compiler on the given project and post results to Github Checks API.
 */
export async function typescriptCheck(
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
      name: checkOptions.name
        ? `Typescript - ${checkOptions.name}`
        : "Typescript",
      status: "in_progress"
    });
    console.log(`Created check ${check.data.id} (${check.data.url})`);
  }

  const compileResult = getDiagnosticsForProject(tsConfigFile);
  compileResult.annotations = compileResult.annotations.map(a => ({
    ...a,
    path: path.relative(baseDir, a.path) // patch file paths to be relative to git root
  }));

  const summary =
    `${compileResult.globalErrors.length +
      compileResult.annotations.length} errors.\n\n` +
    compileResult.globalErrors.join("\n");

  console.log(`Typescript: ${summary}`);
  console.log(compileResult.consoleOutput);

  if (checkOptions && check) {
    for (
      let updateCount = 0;
      updateCount === 0 || compileResult.annotations.length > 0;
      updateCount++
    ) {
      const batch = compileResult.annotations.splice(0, 50);
      const update = await checkOptions.github.checks.update({
        check_run_id: check.data.id,
        owner: checkOptions.owner,
        repo: checkOptions.repo,
        output: {
          annotations: batch,
          summary,
          title: checkOptions.name
            ? `Typescript - ${checkOptions.name}`
            : "Typescript"
        },
        conclusion: compileResult.hasFailures ? "failure" : "success"
      });
      console.log(
        `Updated check ${update.data.id} with ${batch.length} annotations.`
      );
    }
  }
}

/**
 * Get all Typescript compiler diagnostics for the given TS project.
 */
export function getDiagnosticsForProject(
  configFileName: string
): {
  hasFailures: boolean;
  annotations: ChecksCreateParamsOutputAnnotations[];
  globalErrors: string[];
  consoleOutput: string;
} {
  const diagnosticHost = {
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
    getCanonicalFileName: (s: string) => s
  };

  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
    configFileName,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic: ts.Diagnostic) => {
        ts.formatDiagnostic(diagnostic, diagnosticHost);
      }
    }
  );

  const program = ts.createProgram(parsedCommandLine!.fileNames, {
    ...parsedCommandLine!.options,
    noEmit: true
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
        diagnostic.start!
      );
      const end = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start! + diagnostic.length!
      );

      annotations.push({
        annotation_level:
          diagnostic.category === ts.DiagnosticCategory.Error
            ? "failure"
            : diagnostic.category === ts.DiagnosticCategory.Warning
            ? "warning"
            : "notice",
        start_line: start.line + 1,
        end_line: end.line + 1,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        path: diagnostic.file.fileName
      });

      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        hasFailures = true;
      }
    } else if (diagnostic.category === ts.DiagnosticCategory.Error) {
      globalErrors.push(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      );
      hasFailures = true;
    }
  }

  const consoleOutput = ts.formatDiagnosticsWithColorAndContext(
    allDiagnostics,
    diagnosticHost
  );

  return { hasFailures, annotations, globalErrors, consoleOutput };
}
