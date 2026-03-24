import pino from 'pino';
import chalk from 'chalk';

let logger: pino.Logger | null = null;

export function initLogger(level: string = 'info'): pino.Logger {
  logger = pino({
    level,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
  });
  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = initLogger('info');
  }
  return logger;
}

export function logSuccess(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function logError(msg: string): void {
  console.log(chalk.red('✗') + ' ' + msg);
}

export function logWarning(msg: string): void {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

export function logInfo(msg: string): void {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

export function logProgress(msg: string, progress?: number): void {
  const percentage = progress !== undefined ? ` (${Math.round(progress * 100)}%)` : '';
  console.log(chalk.cyan('⏳') + ' ' + msg + percentage);
}
