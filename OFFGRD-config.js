/* OFFGRD Supabase config. The anon key is public-safe (RLS protects data). */
window.OFFGRD_CONFIG = {
  /* Consolidation (Sprint 1 §5 cutover) — pointed at the AUTHORITY project (getOFFRD).
     BEFORE DEPLOY, in the maintenance window: (1) paste the authority anon/public key below,
     (2) add `offgrd` to Supabase → API → Exposed schemas, (3) serve same-origin under getoffrd.com/<path>. */
  url:     "https://xpcbsnbzdwuubheyystu.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwY2JzbmJ6ZHd1dWJoZXl5c3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE3NTYyNTcsImV4cCI6MjA1NzMzMjI1N30.9WMAOkgXp_s1RgMCTKFfcmKquVQELD-bw2S50oldqNM",
  /* Where to send coaches who need a getOFFRD HS-coach profile before school-link works */
  coachPortalUrl: "https://getoffrd.com/high-school-coach/profile",
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
  /* Film telestration (still-frame Phase 1) — ON. Rollback: ?telestrate=0 or localStorage.offgrd_film_telestrate=0 */
  filmTelestrate: true,
  /* Redesign tokens + 4-phase nav shell — ON (global cutover). Rollback: ?redesign=0 or localStorage.offgrd_redesign=0 */
  redesign: true
};
