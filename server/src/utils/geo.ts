export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function districtCode(district: string) {
  const letters = district.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.startsWith("WARANGAL")) return "WGL";
  if (letters.startsWith("HYDERABAD")) return "HYD";
  if (letters.startsWith("RANGAREDDY")) return "RR";
  return (letters.slice(0, 3) || "GEN").padEnd(3, "X");
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
