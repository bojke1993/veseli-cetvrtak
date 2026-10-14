// One-off load of the team's history sheet into the local database through the app's import service.
// Usage (from server/): npx tsx scripts/load-history.ts ../docs/initial-data/match ../docs/initial-data/match/matched.json <outXlsx> [--commit]
// DB connection: DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (defaults: local .localdb on port 3307).
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/kysely.js';
import { EventBus } from '../src/live/bus.js';
import { FakeProvider } from '../src/provider/fake.js';
import { splitPersonName } from '../src/provider/euroleague.js';
import { DerivedService } from '../src/services/derived.js';
import { commitImport, previewImport } from '../src/services/import.js';
import { normalizeName } from '../src/domain/text.js';
import type { Deps } from '../src/deps.js';

const [cacheDir, matchedPath, outXlsx] = process.argv.slice(2);
const commit = process.argv.includes('--commit');

// Players verified by hand (see report): not in that day's box score (void) or misread by the matcher.
const OVERRIDES: Record<string, string> = {
  '2025-12-30|Lakićević': '014178', // Rhoden — did not play (void)
  '2025-12-30|Simara': '004132', // Thies = Daniel Theis
  '2026-01-08|Simara': '004132', // Thies — did not play (void)
  '2026-02-26|Simara': '004508', // Obst — did not play (void)
};
const DIRECTION_FIX: Record<string, string> = { '2026-01-15|Lakićević': 'više' }; // confirmed by the team

type People = { person: { code: string; name: string }; club?: { code: string; name: string; abbreviatedName?: string; images?: { crest?: string } } | null; positionName?: string; dorsal?: string; images?: { headshot?: string } };
const people = new Map<string, People>();
for (const season of ['E2026', 'E2025']) {
  for (const p of JSON.parse(fs.readFileSync(`${cacheDir}/people-${season}.json`, 'utf8')).data as People[]) {
    if (!people.has(p.person.code)) people.set(p.person.code, p);
  }
}

const config = loadConfig({ DB_PORT: '3307', DB_USER: 'vc', DB_PASSWORD: 'vc', DB_NAME: 'veseli_cetvrtak', ...process.env });
const db = createDb(config.db);
const deps: Deps = { db, config, provider: new FakeProvider(), bus: new EventBus(), derived: new DerivedService(db), now: () => new Date() };

const rounds = JSON.parse(fs.readFileSync(matchedPath, 'utf8')) as any[];

// 1) Make sure every matched player exists (past-season players are added as inactive).
const playerIdByCode = new Map<string, number>();
let added = 0;
for (const r of rounds) {
  for (const p of r.picks) {
    const code: string = OVERRIDES[`${r.day}|${p.member}`] ?? p.match.code;
    p.code = code;
    if (playerIdByCode.has(code)) continue;
    const existing = await db.selectFrom('players').select('id').where('external_code', '=', code).executeTakeFirst();
    if (existing) {
      playerIdByCode.set(code, existing.id);
      continue;
    }
    const pp = people.get(code);
    if (!pp) throw new Error(`Nepoznat igrač ${code}`);
    if (pp.club) {
      await db
        .insertInto('clubs')
        .values({ code: pp.club.code, name: pp.club.name, short_name: pp.club.abbreviatedName || pp.club.name, crest_url: pp.club.images?.crest ?? null })
        .onDuplicateKeyUpdate({ code: pp.club.code })
        .execute();
    }
    const { firstName, lastName } = splitPersonName(pp.person.name);
    const full = `${firstName} ${lastName}`.trim();
    const res = await db
      .insertInto('players')
      .values({
        external_code: code,
        first_name: firstName,
        last_name: lastName,
        full_name: full,
        search_name: normalizeName(`${full} ${pp.club?.abbreviatedName ?? ''}`),
        club_code: pp.club?.code ?? null,
        position: pp.positionName ?? null,
        jersey: pp.dorsal ?? null,
        photo_url: pp.images?.headshot ?? null,
        is_active: 0,
        is_manual: 0,
        last_synced_at: null,
      })
      .executeTakeFirstOrThrow();
    playerIdByCode.set(code, Number(res.insertId));
    added++;
  }
}
console.log(`Igrači: ${playerIdByCode.size} različitih, dodato neaktivnih: ${added}`);

// 2) Build the import file in the app's template format.
const fullNameById = new Map((await db.selectFrom('players').select(['id', 'full_name']).execute()).map((p) => [p.id, p.full_name]));
const header = ['Kolo', 'Datum', 'Član', 'Umesto', 'Igrač', 'Tim', 'Granica', 'Tip', 'Poeni', 'Ishod', 'Uplata', 'Kvota', 'Uplatio', 'Dobitak'];
const aoa: unknown[][] = [header];
const nameToId: Record<string, number> = {};
rounds.forEach((r, i) => {
  const [y, m, d] = r.day.split('-');
  const odds = r.potential ? Math.round((r.potential / r.stake) * 100) / 100 : r.win > 0 ? Math.round((r.win / r.stake) * 100) / 100 : null;
  r.picks.forEach((p: any, j: number) => {
    const id = playerIdByCode.get(p.code)!;
    const label = `${fullNameById.get(id)} [${p.code}]`; // unique per player; mapped explicitly at commit
    nameToId[label] = id;
    const dnp = p.outcome === 'poništen';
    const officialPts = !dnp && p.match.code === p.code ? p.match.pts : null;
    aoa.push([
      i + 1,
      `${d}.${m}.${y}.`,
      p.member,
      null,
      label,
      p.match.code === p.code ? p.match.team : null,
      p.line,
      DIRECTION_FIX[`${r.day}|${p.member}`] ?? p.dir,
      officialPts,
      p.outcome,
      j === 0 ? r.stake : null,
      j === 0 ? odds : null,
      j === 0 ? r.payer : null,
      j === 0 ? r.win : null,
    ]);
  });
});
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Istorija');
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
fs.writeFileSync(outXlsx, buffer);
console.log(`Fajl za uvoz: ${outXlsx} (${aoa.length - 1} redova)`);

// 3) Preview (and commit) through the app's import service.
const preview = await previewImport(deps, { buffer });
const blocking = preview.errors.filter((e) => !e.message.startsWith('Upozorenje: '));
const warnings = new Map<string, number>();
for (const e of preview.errors) if (e.message.startsWith('Upozorenje: ')) {
  const k = e.message.replace(/kolo \d+/, 'kolo N');
  warnings.set(k, (warnings.get(k) ?? 0) + 1);
}
console.log(`Pregled: ${preview.rounds} kola (${preview.from} – ${preview.to}), canCommit=${preview.canCommit}`);
for (const [k, n] of warnings) console.log(`  ${n}× ${k}`);
for (const e of blocking) console.log(`  GREŠKA red ${e.row}: ${e.message}`);
const playerMatches: Record<string, number> = {};
for (const u of preview.unmatchedPlayers) playerMatches[u.name] = nameToId[u.name]!;
console.log(`Imena koja automatsko uparivanje nije našlo (mapiram po Evroliga ID-ju): ${preview.unmatchedPlayers.length}`);

if (commit && preview.canCommit) {
  const admin = await db.selectFrom('members').selectAll().where('is_admin', '=', 1).executeTakeFirstOrThrow();
  const imported = await commitImport(
    deps,
    { id: admin.id, name: admin.name, displayName: admin.display_name, username: admin.username, isAdmin: true, mustChangePassword: false },
    { token: preview.token, mapping: preview.mapping, playerMatches, confirmReplace: true },
  );
  // Euroleague round per imported round (informative), from the matched games.
  for (const r of rounds) {
    const elRound = r.picks.find((p: any) => p.match.code === p.code)?.match.elRound ?? null;
    if (elRound !== null) await db.updateTable('rounds').set({ euroleague_round: elRound }).where('game_day', '=', r.day).where('source', '=', 'import').execute();
  }
  console.log(`UVEZENO: ${imported} kola`);
}
await db.destroy();
