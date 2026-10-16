export type CsvCell = string | number | null | undefined;

/**
 * Rows to CSV (RFC 4180, CRLF). Text that a spreadsheet would run as a formula (starting with
 * = + - @, tab or CR) gets a leading ' so an exported name or address can't execute.
 */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

function cell(value: CsvCell): string {
  if (value == null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
