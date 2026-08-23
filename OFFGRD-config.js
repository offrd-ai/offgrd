/* OFFGRD Supabase config. The anon/publishable key is public-safe (RLS protects data). */
/** Single cache-bust token — every <script src> and ES module import must match (currently ?v=322). */
window.OFFGRD_ASSET_V = "322";
window.OFFGRD_CONFIG = {
  assetV: "322",
  /* Consolidation (Sprint 1–5 cutover) — pointed at the AUTHORITY project (getOFFRD).
     BEFORE DEPLOY, in the maintenance window: (1) paste the authority anon/public key below,
     (2) add `offgrd` to Supabase ? API ? Exposed schemas, (3) serve same-origin under getoffrd.com/<path>. */
  url:     "https://xpcbsnbzdwuubheyystu.supabase.co",
  /* Public publishable key — legacy JWT anon keys are retired. */
  anonKey: "sb_publishable_KMoWZBKRlRpkAQbbb5sM3g_IczXgGna",
  /* Unified OFFOPS surface — Team Portal (HS coach dashboard) + gameday home */
  coachPortalUrl: "https://getoffrd.com/high-school-coach/dashboard",
  gamedayUrl: "https://getoffrd.com/gameday/OFFGRD.html",
  /* Step 2 shared renderer — ON in prod. Rollback: ?unified=0 or localStorage.offgrd_unified_render=0 */
  unifiedRender: true,
  /* Step 3 auto-derive reads/OL keys — ON in prod. Rollback: ?autoderive=0 or localStorage.offgrd_autoderive_reads=0 */
  autoderiveReads: true,
  /* Steal A scout cards — ON. Rollback: ?scoutcards=0 or localStorage.offgrd_scoutcards=0 */
  scoutCards: true,
  /* Steal B tendency reports — ON. Rollback: ?tendency=0 or localStorage.offgrd_tendency_reports=0 */
  tendencyReports: true,
  /* AI-GM weekly package — ON. Rollback: ?weeklypackage=0 or localStorage.offgrd_weekly_package=0 */
  weeklyPackage: true,
  /* Auto-assign week teach-tests on package approve — ON.
     Rollback: ?week_autotest=0 or localStorage.offgrd_week_autotest=0 */
  weekAutotest: true,
  /* Film telestration (still-frame Phase 1) — ON. Rollback: ?telestrate=0 or localStorage.offgrd_film_telestrate=0 */
  filmTelestrate: true,
  /* Redesign tokens + 4-phase nav shell — ON (global cutover). Rollback: ?redesign=0 or localStorage.offgrd_redesign=0 */
  redesign: true
};
