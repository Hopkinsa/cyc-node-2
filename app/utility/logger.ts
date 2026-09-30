import config from './config.ts';

type CrayonType = {
  default: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  bgBlack: string;
  bgRed: string;
  bgGreen: string;
  bgYellow: string;
  bgBlue: string;
  bgMagenta: string;
  bgCyan: string;
  bgWhite: string;
};

const CRAYONS = (...args: string[]): CrayonType => ({
  default: '\x1b[0m',
  black: `\x1b[30m${args.join(' ')}`,
  red: `\x1b[31m${args.join(' ')}`,
  green: `\x1b[32m${args.join(' ')}`,
  yellow: `\x1b[33m${args.join(' ')}`,
  blue: `\x1b[34m${args.join(' ')}`,
  magenta: `\x1b[35m${args.join(' ')}`,
  cyan: `\x1b[36m${args.join(' ')}`,
  white: `\x1b[37m${args.join(' ')}`,
  bgBlack: `\x1b[40m${args.join(' ')}\x1b[0m`,
  bgRed: `\x1b[41m${args.join(' ')}\x1b[0m`,
  bgGreen: `\x1b[42m${args.join(' ')}\x1b[0m`,
  bgYellow: `\x1b[43m${args.join(' ')}\x1b[0m`,
  bgBlue: `\x1b[44m${args.join(' ')}\x1b[0m`,
  bgMagenta: `\x1b[45m${args.join(' ')}\x1b[0m`,
  bgCyan: `\x1b[46m${args.join(' ')}\x1b[0m`,
  bgWhite: `\x1b[47m${args.join(' ')}\x1b[0m`,
});

type LogEntry = string | boolean;

const resolveLogEntries = (entries: LogEntry[]): {
  args: string[];
  override: boolean;
} => {
  const override = entries.at(-1) === true;
  const args = entries.filter((entry): entry is string => typeof entry === 'string');

  return { args, override };
};

const shouldLog = (override: boolean): boolean => config.DEBUGGER || override;

export const log = {
  title: (...entries: LogEntry[]): void => {
    const { args, override } = resolveLogEntries(entries);
    if (!shouldLog(override)) {
      return;
    }
    const formattedArgs = [' ', ...args, ' '];
    console.info(CRAYONS(CRAYONS(...formattedArgs).blue).bgWhite);
  },
  info_lv1: (...entries: LogEntry[]): void => {
    const { args, override } = resolveLogEntries(entries);
    if (!shouldLog(override)) {
      return;
    }
    console.info(CRAYONS(...args).yellow, CRAYONS().default);
  },
  info_lv2: (...entries: LogEntry[]): void => {
    const { args, override } = resolveLogEntries(entries);
    if (!shouldLog(override)) {
      return;
    }
    const formattedArgs = ['  ', ...args];
    console.info(CRAYONS(...formattedArgs).cyan, CRAYONS().default);
  },
  info_lv3: (...entries: LogEntry[]): void => {
    const { args, override } = resolveLogEntries(entries);
    if (!shouldLog(override)) {
      return;
    }
    const formattedArgs = ['    ', ...args];
    console.info(CRAYONS(...formattedArgs).magenta, CRAYONS().default);
  },
  error: (...entries: LogEntry[]): void => {
    const { args, override } = resolveLogEntries(entries);
    if (!shouldLog(override)) {
      return;
    }
    console.info(CRAYONS(...args).red, CRAYONS().default);
  },
};
