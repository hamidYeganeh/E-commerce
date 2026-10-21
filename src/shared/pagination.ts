export function pageNumber(value: unknown) { const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=100000?n:1; }
export const historyPageSize=25;
