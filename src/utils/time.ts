/** The current time as an ISO-8601 string, the format rows are stamped with. */
export function nowIso(): string {
  return new Date().toISOString();
}
