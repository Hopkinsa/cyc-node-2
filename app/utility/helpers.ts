import * as path from 'path';

// Determine the base directory path
export const DIR_PATH = (path.resolve('./../').includes('www')) ? path.resolve('./../') : path.resolve('./');
export const DATA_PATH = path.join(DIR_PATH, 'data');
export const STATIC_PATH = path.join(DIR_PATH, 'static');
export const IMAGE_PATH = path.join(DIR_PATH, 'images', 'uploaded');
export const TEMPLATE_PATH = path.join(DIR_PATH, 'images', 'template');