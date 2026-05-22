export function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

export function renderDiff(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) {
        return `\x1b[1m${line}\x1b[0m`;
      }
      if (line.startsWith("+")) {
        return `\x1b[32m${line}\x1b[0m`;
      }
      if (line.startsWith("-")) {
        return `\x1b[31m${line}\x1b[0m`;
      }
      if (line.startsWith("@@")) {
        return `\x1b[36m${line}\x1b[0m`;
      }
      return line;
    })
    .join("\n");
}
