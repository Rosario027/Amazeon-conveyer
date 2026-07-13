// Indian-system number → words (Rupees / Paise).
// e.g. 3552 -> "Rupees Three Thousand Five Hundred and Fifty Two Only."

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (rest) out += (h ? ' and ' : '') + twoDigits(rest);
  return out;
}

// Convert an integer using Indian grouping (crore / lakh / thousand).
function integerToWords(num) {
  if (num === 0) return 'Zero';
  let words = '';

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  if (crore) words += integerToWords(crore) + ' Crore ';
  if (lakh) words += twoDigits(lakh) + ' Lakh ';
  if (thousand) words += twoDigits(thousand) + ' Thousand ';
  if (hundred) words += threeDigits(hundred) + ' ';

  return words.trim();
}

export function amountInWords(amount, currencyWord = 'Rupees', subWord = 'Paise') {
  const rounded = Math.round(Number(amount || 0) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  let result = currencyWord + ' ' + integerToWords(rupees);
  if (paise > 0) {
    result += ' and ' + integerToWords(paise) + ' ' + subWord;
  }
  result += ' Only.';
  return result;
}

export default amountInWords;
