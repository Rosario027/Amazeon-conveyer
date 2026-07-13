// Indian-grouping money formatting, shared by exporters.
export function formatINR(n, withDecimals = true) {
  const num = Number(n) || 0;
  const neg = num < 0;
  const fixed = Math.abs(num).toFixed(withDecimals ? 2 : 0);
  const [intPart, decPart] = fixed.split('.');

  // Indian grouping: last 3 digits, then groups of 2.
  const last3 = intPart.slice(-3);
  const other = intPart.slice(0, -3);
  let grouped = last3;
  if (other) {
    grouped = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const out = decPart ? `${grouped}.${decPart}` : grouped;
  return neg ? `-${out}` : out;
}

// Format a tax rate without forcing whole numbers: 9 -> "9", 2.5 -> "2.5".
export function formatRate(n) {
  return String(Math.round((Number(n) || 0) * 100) / 100);
}

export default formatINR;
