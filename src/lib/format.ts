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

export function formatEmdNumberInput(val: string): string {
  let cleaned = val.replace(/\D/g, '');
  if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
  if (cleaned.length > 3) {
    return cleaned.slice(0, 3) + ' ' + cleaned.slice(3);
  }
  return cleaned;
}
