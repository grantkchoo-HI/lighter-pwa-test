export function money(value, currency = "USD", digits = 0) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0);
}
export function percent(value, digits = 0) { return `${(Number(value) || 0).toFixed(digits)}%`; }
export function dateLabel(value, options = { month: "long", year: "numeric" }) {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat(undefined, options).format(date);
}
export function fullDate(value) { return dateLabel(value, { month: "short", day: "numeric", year: "numeric" }); }
export function monthsLabel(months) {
  if (months == null) return "No payoff date";
  const years = Math.floor(months / 12), rest = months % 12;
  return [years ? `${years} yr${years === 1 ? "" : "s"}` : "", rest ? `${rest} mo` : ""].filter(Boolean).join(" ") || "This month";
}
export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
export function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function uid(prefix = "id") { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
