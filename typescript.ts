import * as ts from "typescript";
import { CheckResult } from ".";
import { GithubCheckAnnotation } from "./octokit-types";

/**
 * Get all Typescript compiler diagnostics for the given TS project.
 */
export async function typescriptCheck(
  configFileName: string
): Promise<CheckResult> {
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

  const program = ts.createProgram(parsedCommandLine?.fileNames || [], {
    ...parsedCommandLine?.options,
    noEmit: true
  });
  const emitResult = program.emit();

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  const annotations: GithubCheckAnnotation[] = [];
  const globalErrors = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const diagnostic of allDiagnostics) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      errorCount++;
    } else if (diagnostic.category === ts.DiagnosticCategory.Warning) {
      warningCount++;
    }

    if (diagnostic.file) {
      const start = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start ?? 0
      );
      const end = diagnostic.file.getLineAndCharacterOfPosition(
        (diagnostic.start ?? 0) + (diagnostic.length ?? 0)
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
    } else if (diagnostic.category === ts.DiagnosticCategory.Error) {
      globalErrors.push(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      );
    }
  }

  let consoleOutput = ts.formatDiagnosticsWithColorAndContext(
    allDiagnostics,
    diagnosticHost
  );

  if (globalErrors.length > 0) {
    consoleOutput = `${globalErrors.join("\n")}\n${consoleOutput}`;
  }

  return {
    errorCount,
    warningCount,
    annotations,
    consoleOutput
  };
}
