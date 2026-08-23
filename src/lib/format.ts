const pkrFormatter = new Intl.NumberFormat('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPkr(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `PKR ${pkrFormatter.format(value)}`;
}

export function formatNumber(value: number): string {
  return pkrFormatter.format(value);
}
