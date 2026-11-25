/** Formats integer minor units with a fixed number of decimals, without floating-point drift. */
export const formatMinor = (minor: number, decimals = 2): string => {
  const negative = minor < 0;
  const digits = Math.abs(minor)
    .toString()
    .padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? `.${digits.slice(-decimals)}` : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${frac}`;
};

/** Parses a decimal string such as "101.25" into minor units; null when malformed. */
export const parseMinor = (text: string, decimals = 2): number | null => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const frac = match[2] ?? '';
  if (frac.length > decimals) return null;
  const value = Number(`${match[1]}${frac.padEnd(decimals, '0')}`);
  return Number.isSafeInteger(value) ? value : null;
};
