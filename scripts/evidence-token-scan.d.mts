// Declarations for the test, which imports the scanner from TypeScript.
export const PATTERNS: RegExp[];
export function findHits(text: string): number[];
export function scanTree(root: string): { file: string; lines: number[] }[];
