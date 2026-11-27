// aides-entreprises.fr publishes territories with its own codes: region initials (ARA, BFC, IDF...), department
// numbers (7, 14, 75) and overseas INSEE codes (971...). The matcher compares NUTS codes, so this maps them.
const REGION_TO_NUTS: Record<string, string> = {
  ARA: "FRK", BFC: "FRC", BRET: "FRH", CVL: "FRB", COR: "FRM", GE: "FRF", HDF: "FRE", IDF: "FR1", NORM: "FRD", NA: "FRI", OCC: "FRJ", PL: "FRG", PACA: "FRL",
  "971": "FRY1", "972": "FRY2", "973": "FRY3", "974": "FRY4", "976": "FRY5",
};

const DEPARTMENTS: Record<string, string[]> = {
  ARA: ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  BFC: ["21", "25", "39", "58", "70", "71", "89", "90"],
  BRET: ["22", "29", "35", "56"],
  CVL: ["18", "28", "36", "37", "41", "45"],
  COR: ["2A", "2B"],
  GE: ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  HDF: ["02", "59", "60", "62", "80"],
  IDF: ["75", "77", "78", "91", "92", "93", "94", "95"],
  NORM: ["14", "27", "50", "61", "76"],
  NA: ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  OCC: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  PL: ["44", "49", "53", "72", "85"],
  PACA: ["04", "05", "06", "13", "83", "84"],
};
const DEPARTMENT_TO_NUTS: Record<string, string> = {};
for (const [region, deps] of Object.entries(DEPARTMENTS)) for (const d of deps) DEPARTMENT_TO_NUTS[d] = REGION_TO_NUTS[region]!;

// A French territory code as NUTS when known; the original value otherwise (local authority names stay text).
export function frRegionToNuts(code: string): string {
  const c = code.toUpperCase();
  if (REGION_TO_NUTS[c]) return REGION_TO_NUTS[c];
  const dep = /^\d{1,2}$/.test(c) ? c.padStart(2, "0") : c;
  return DEPARTMENT_TO_NUTS[dep] ?? code;
}
