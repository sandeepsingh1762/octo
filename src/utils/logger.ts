import chalk from "chalk";

export const C = {
  cyan: (t: string) => chalk.cyan(t),
  green: (t: string) => chalk.green(t),
  yellow: (t: string) => chalk.yellow(t),
  red: (t: string) => chalk.red(t),
  blue: (t: string) => chalk.blue(t),
  magenta: (t: string) => chalk.magenta(t),
  bold: (t: string) => chalk.bold(t),
  dim: (t: string) => chalk.dim(t),
};

export function info(msg: string): void {
  console.log(C.cyan(msg));
}
export function ok(msg: string): void {
  console.log(C.green(msg));
}
export function warn(msg: string): void {
  console.log(C.yellow(`Warning: ${msg}`));
}
export function err(msg: string): void {
  console.error(C.red(`Error: ${msg}`));
}
