// The checks the app adds on top of the model's own uncertain_fields (same as eval/extract_eval.py `code_flags`).

const WEEKDAYS: Record<string, number> = {
  // getUTCDay(): Sunday = 0
  so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  dom: 0, lun: 1, mar: 2, "mié": 3, mie: 3, jue: 4, vie: 5, "sáb": 6, sab: 6,
};

type Checked = { start_date: string; start_time: string; weekday_on_flyer: string };

export function codeFlags(event: Checked, receivedOn: string): string[] {
  const flags: string[] = [];
  if (!event.start_date || !dateLooksRight(event, receivedOn)) flags.push("start_date");
  if (!event.start_time) flags.push("start_time");
  return flags;
}

function dateLooksRight(event: Checked, receivedOn: string): boolean {
  const date = parseDate(event.start_date);
  const received = parseDate(receivedOn);
  if (!date || !received) return false;
  const yearLater = new Date(received.getTime() + 365 * 86_400_000);
  if (date < received || date > yearLater) return false;

  const printed = event.weekday_on_flyer.trim().toLowerCase().replace(/\.$/, "");
  const key = Object.keys(WEEKDAYS).find((k) => printed.startsWith(k));
  return key === undefined || WEEKDAYS[key] === date.getUTCDay();
}

function parseDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === iso ? d : null;
}
