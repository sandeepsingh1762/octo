import chalk from "chalk";
export const C = {
    cyan: (t) => chalk.cyan(t),
    green: (t) => chalk.green(t),
    yellow: (t) => chalk.yellow(t),
    red: (t) => chalk.red(t),
    blue: (t) => chalk.blue(t),
    magenta: (t) => chalk.magenta(t),
    bold: (t) => chalk.bold(t),
    dim: (t) => chalk.dim(t),
};
export function info(msg) {
    console.log(C.cyan(msg));
}
export function ok(msg) {
    console.log(C.green(msg));
}
export function warn(msg) {
    console.log(C.yellow(`Warning: ${msg}`));
}
export function err(msg) {
    console.error(C.red(`Error: ${msg}`));
}
//# sourceMappingURL=logger.js.map