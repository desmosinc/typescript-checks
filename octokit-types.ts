/**
 * Copied from @octokit/rest internals because this detailed type info doesn't seem to be publicly exported.
 * Docs: https://docs.github.com/rest/reference/checks#annotations-object-1
 */
export type GithubCheckAnnotation = {
  /** The path of the file to add an annotation to. For example, `assets/css/main.css`. */
  path: string;
  /** The start line of the annotation. */
  start_line: number;
  /** The end line of the annotation. */
  end_line: number;
  /** The start column of the annotation. Annotations only support `start_column` and `end_column` on the same line.
   * Omit this parameter if `start_line` and `end_line` have different values.
   */
  start_column?: number;
  /** The end column of the annotation. Annotations only support `start_column` and `end_column` on the same line.
   * Omit this parameter if `start_line` and `end_line` have different values.
   */
  end_column?: number;
  /** The level of the annotation. Can be one of `notice`, `warning`, or `failure`. */
  annotation_level: "notice" | "warning" | "failure";
  /** A short description of the feedback for these lines of code. The maximum size is 64 KB. */
  message: string;
  /** The title that represents the annotation. The maximum size is 255 characters. */
  title?: string;
  /** Details about this annotation. The maximum size is 64 KB. */
  raw_details?: string;
};
