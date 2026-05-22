import { createPatch } from "diff";

export function unifiedDiff(oldContent: string, newContent: string, filename: string): string {
  return createPatch(filename, oldContent, newContent, "", "", { context: 3 });
}

export function maybeTruncateDiff(diffText: string, maxLines = 80): string {
  const lines = diffText.split("\n");
  if (lines.length <= maxLines) return diffText;
  const shown = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;
  return shown.join("\n") + `\n\n[... ${remaining} more lines ...]`;
}
