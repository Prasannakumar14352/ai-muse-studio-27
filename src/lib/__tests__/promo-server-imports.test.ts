// Static guards for Promo Studio (design §5 and §11 "Grep/CI test"):
//  - no file under src/routes or src/components imports the new server-only provider helpers or
//    Promo Studio *.server modules. The one allowed exception is the existing paid server route
//    src/routes/api/generate-image.ts, and only via a type-only import or a dynamic import inside
//    its handler (after auth + chargeCredits).
//  - the provider helpers are imported only by generate-image.ts and src/lib/promo-studio/**.
//  - Promo Studio code never touches user credits.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|jsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

/** Every module specifier in a file: static imports/exports, dynamic import(), require(). */
function imports(src: string): Array<{ spec: string; typeOnly: boolean; dynamic: boolean }> {
  const out: Array<{ spec: string; typeOnly: boolean; dynamic: boolean }> = [];
  const stat = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?(?:[^'"`;]*?\sfrom\s+)?["']([^"']+)["']/g;
  for (const m of src.matchAll(stat)) out.push({ spec: m[3], typeOnly: !!m[2], dynamic: false });
  for (const m of src.matchAll(/\b(?:import|require)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g))
    out.push({ spec: m[1], typeOnly: false, dynamic: true });
  return out;
}

const PROVIDER_HELPER = /(^|\/)providers\/(fal-image|openrouter-json)\.server(\.ts)?$/;
const PROMO_SERVER = /(^|\/)promo-studio\/[^/]+\.server(\.ts)?$/;
const ALLOWED_ROUTE = "src/routes/api/generate-image.ts";

const files = walk(SRC).filter((f) => !rel(f).includes("/__tests__/"));

describe("server-only Promo Studio / provider modules", () => {
  it("are not imported by src/routes or src/components (except the type/dynamic import in generate-image.ts)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (!r.startsWith("src/routes/") && !r.startsWith("src/components/")) continue;
      for (const imp of imports(readFileSync(f, "utf8"))) {
        if (!PROVIDER_HELPER.test(imp.spec) && !PROMO_SERVER.test(imp.spec)) continue;
        const allowed =
          r === ALLOWED_ROUTE &&
          /providers\/fal-image\.server$/.test(imp.spec) &&
          (imp.typeOnly || imp.dynamic);
        if (!allowed) offenders.push(`${r} → ${imp.spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the guard sees the generate-image imports (so it isn't vacuous)", () => {
    const src = readFileSync(join(ROOT, ALLOWED_ROUTE), "utf8");
    const found = imports(src).filter((i) => PROVIDER_HELPER.test(i.spec));
    expect(found.map((i) => (i.typeOnly ? "type" : i.dynamic ? "dynamic" : "static")).sort()).toEqual([
      "dynamic",
      "type",
    ]);
    expect(src).not.toContain("https://fal.run/");
  });

  it("provider helpers are imported only by generate-image.ts and src/lib/promo-studio/**", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (r === ALLOWED_ROUTE || r.startsWith("src/lib/promo-studio/")) continue;
      for (const imp of imports(readFileSync(f, "utf8"))) {
        if (PROVIDER_HELPER.test(imp.spec)) offenders.push(`${r} → ${imp.spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Promo Studio code never touches user credits", () => {
    const promo = files.filter((f) => {
      const r = rel(f);
      return (
        r.startsWith("src/lib/promo-studio/") ||
        r === "src/lib/promo-studio.functions.ts" ||
        r.startsWith("src/lib/providers/fal-image.server") ||
        r.startsWith("src/lib/providers/openrouter-json.server")
      );
    });
    expect(promo.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of promo) {
      const src = readFileSync(f, "utf8");
      for (const imp of imports(src)) {
        if (/credits-guard|credit-refund|\/api\//.test(imp.spec)) offenders.push(`${rel(f)} imports ${imp.spec}`);
      }
      for (const word of ["chargeCredits", "reserve_credits", "credit_ledger", "refund_credits", "/api/generate"]) {
        if (src.includes(word)) offenders.push(`${rel(f)} mentions ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Promo Studio code never writes content_plan_items (H8)", () => {
    const offenders = files
      .filter((f) => rel(f).startsWith("src/lib/promo-studio/") || rel(f) === "src/lib/promo-studio.functions.ts")
      .filter((f) => /content_plan_items["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
