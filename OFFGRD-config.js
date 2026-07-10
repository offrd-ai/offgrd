/* OFFGRD Supabase config. The anon key is public-safe (RLS protects data). */
window.OFFGRD_CONFIG = {
  /* Consolidation (Sprint 1 §5 cutover) — pointed at the AUTHORITY project (getOFFRD).
     BEFORE DEPLOY, in the maintenance window: (1) paste the authority anon/public key below,
     (2) add `offgrd` to Supabase → API → Exposed schemas, (3) serve same-origin under getoffrd.com/<path>. */
  url:     "https://xpcbsnbzdwuubheyystu.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwY2JzbmJ6ZHd1dWJoZXl5c3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE3NTYyNTcsImV4cCI6MjA1NzMzMjI1N30.9WMAOkgXp_s1RgMCTKFfcmKquVQELD-bw2S50oldqNM",
  coachPortalUrl: "https://getoffrd.com/high-school-coach/profile"
};
