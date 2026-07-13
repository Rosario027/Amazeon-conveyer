// Local-date helpers. NEVER use toISOString() for yyyy-mm-dd — it converts
// to UTC and shifts IST dates back a day (month starts became the 30th).
export const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const today = () => localISO(new Date());

export const monthStart = () => {
  const n = new Date();
  return localISO(new Date(n.getFullYear(), n.getMonth(), 1));
};

export const monthEnd = () => {
  const n = new Date();
  return localISO(new Date(n.getFullYear(), n.getMonth() + 1, 0));
};
