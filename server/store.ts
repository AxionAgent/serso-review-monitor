import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Store catalog (742 stores). Format: [{ value: "5A", name: "5A-J753-HCIR SELMA SINGKAWANG G M" }, ...]
type StoreEntry = { value: string; name: string };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _stores: Map<string, string> | null = null;

function cleanName(raw: string): string {
  // Format nama: "{code}-{kode5}-{nama asli}" -> buang 2 segmen pertama, sisakan nama.
  // Contoh: "5A-J753-HCIR SELMA SINGKAWANG G M" -> "HCIR SELMA SINGKAWANG G M"
  const parts = raw.split("-");
  return parts.length > 2 ? parts.slice(2).join("-").trim() : raw.trim();
}

function loadStores(): Map<string, string> {
  if (_stores) return _stores;
  try {
    const raw = readFileSync(path.join(__dirname, "store.json"), "utf8");
    const entries = JSON.parse(raw) as StoreEntry[];
    _stores = new Map(entries.map((entry) => [entry.value.toUpperCase(), cleanName(entry.name)]));
  } catch {
    _stores = new Map();
  }
  return _stores;
}

/**
 * Resolve store code + name dari nomor tiket review.
 * Format yang didukung:
 *  - No Receipt: U{storeCode}.{unit}.{date}.{seq}  -> U5A.3.20260909.1 => store "5A"
 *  - No DO:      {storeCode}.{serial}               -> 5A.XA.000172     => store "5A"
 * Prefix "U" di depan hanya dipakai format No Receipt dan dibuang sebelum parse.
 */
export function resolveStoreFromTicket(raw?: string | null): { code: string | null; name: string | null } {
  if (!raw) return { code: null, name: null };
  let s = raw.trim();
  if (!s) return { code: null, name: null };
  if (s[0] === "U" || s[0] === "u") s = s.slice(1);
  const code = s.split(".")[0]?.trim().toUpperCase();
  if (!code) return { code: null, name: null };
  const name = loadStores().get(code) ?? null;
  return { code, name };
}

/** Store display name — fallback kalau tidak ketemu di katalog. */
export function storeLabel(raw?: string | null): string | null {
  const { code, name } = resolveStoreFromTicket(raw);
  return name ?? code;
}
