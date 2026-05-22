import { createPatch } from "diff";
export function unifiedDiff(oldContent, newContent, filename) {
    return createPatch(filename, oldContent, newContent, "", "", { context: 3 });
}
export function maybeTruncateDiff(diffText, maxLines = 80) {
    const lines = diffText.split("\n");
    if (lines.length <= maxLines)
        return diffText;
    const shown = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;
    return shown.join("\n") + `\n\n[... ${remaining} more lines ...]`;
}
//# sourceMappingURL=diff.js.map