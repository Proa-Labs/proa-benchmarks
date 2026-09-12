// Helpers used by page_table.marko (Marko 6 imports JS helpers directly).

const STATUS_BADGE =
  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border";

export const STATUS_CLASSES = {
  Active: STATUS_BADGE + " bg-green-100 text-green-800 border-green-300",
  Pending: STATUS_BADGE + " bg-yellow-100 text-yellow-800 border-yellow-300",
  Disabled: STATUS_BADGE + " bg-gray-100 text-gray-700 border-gray-300",
  Cancelled: STATUS_BADGE + " bg-red-100 text-red-800 border-red-300",
  Refunded: STATUS_BADGE + " bg-purple-100 text-purple-800 border-purple-300",
};

export function fmtCurrency(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const pennies = abs % 100;
  const dStr = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const pStr = pennies < 10 ? "0" + pennies : "" + pennies;
  return (neg ? "-$" : "$") + dStr + "." + pStr;
}

export function fmtPct(bps) {
  const whole = Math.floor(bps / 100);
  const tenth = Math.floor((bps % 100) / 10);
  return whole + "." + tenth + "%";
}

export function fmtDate(unix) {
  const d = new Date(unix * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return d.getUTCFullYear() + "-" + mm + "-" + dd;
}

export function fmtDateTime(unix) {
  const d = new Date(unix * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return d.getUTCFullYear() + "-" + mm + "-" + dd + " " + hh + ":" + mi;
}
