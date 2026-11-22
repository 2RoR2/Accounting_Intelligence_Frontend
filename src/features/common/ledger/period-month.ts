export function periodFromMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000-")) return null;

  const startsOn = `${month}-01`;
  const end = new Date(`${startsOn}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { periodCode: month, startsOn, endsOn: `${month}-${end.getUTCDate()}` };
}
