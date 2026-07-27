// Helper: format a date value as YYYYMMDD
export const formatDateYYYYMMDD = (dateInput) => {
  const d = new Date(dateInput);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}${mm}${yy}`;
};
