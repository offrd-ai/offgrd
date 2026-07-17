/* Bridge for Reps Lab — exposes window.QB for saving/reading results. */
import { Cloud } from "./OFFGRD-cloud.js?v=80";
async function activeTeam(){
  const teams = await Cloud.myTeams();
  if(!teams.length) return null;
  let s=null; try{ s=localStorage.getItem("offgrd_team"); }catch(e){}
  return teams.find(t=>t.id===s) || teams[0];
}
window.QB = {
  ready: Cloud.ready,
  async context(){
    try{
      const u = await Cloud.user(); if(!u) return { user:null };
      const t = await activeTeam(); if(!t) return { user:u, team:null };
      const role = await Cloud.myRole(t.id);
      return { user:u, team:t, role };
    }catch(e){ return { user:null, error:e.message }; }
  },
  async save(result){
    const t = await activeTeam(); if(!t) throw new Error("No program yet.");
    return Cloud.saveQuizResult(t.id, result);
  },
  async rosterPosition(){
    const ps = await this.rosterPositions();
    return ps.length ? ps[0] : null;
  },
  async rosterPositions(){
    try{
      const ctx = await this.context();
      if(!ctx || !ctx.user || !ctx.team) return [];
      const roster = await Cloud.teamRoster(ctx.team.id).catch(()=>[]);
      const me = (roster||[]).find(m => m.user_id === ctx.user.id);
      if(!me) return [];
      const AT = window.OFFGRD_WEEK_AUTOTEST;
      if(AT && AT.parseMemberPositions) return AT.parseMemberPositions(me);
      if(me.positions && me.positions.length) return me.positions.map(p => String(p).toUpperCase());
      if(me.position) return [String(me.position).toUpperCase()];
    }catch(e){}
    return [];
  },
  async saveMyPositions(positions){
    const ctx = await this.context();
    if(!ctx || !ctx.team) throw new Error("Join a program first.");
    const arr = (positions || []).map(p => String(p || "").trim()).filter(Boolean);
    await Cloud.setMyPositions(ctx.team.id, arr);
    return arr;
  },
  async results(){
    const t = await activeTeam(); if(!t) return { rows:[], roster:[] };
    const [rows, roster] = await Promise.all([
      Cloud.listQuizResults(t.id),
      Cloud.teamRoster(t.id).catch(()=>[])
    ]);
    return { rows, roster };
  },
  async plays(){
    const t = await activeTeam(); if(!t) return [];
    return Cloud.listPlays(t.id);
  },
  async games(){
    const t = await activeTeam(); if(!t) return [];
    try{ return await Cloud.listGames(t.id); }catch(e){ return []; }
  },
  async savePlayReads(id, reads){
    return Cloud.updatePlayReads(id, reads);
  },
  async saveOlKeys(id, keys){
    return Cloud.updatePlayOlKeys(id, keys);
  },
  async saveWeekDef(planId, defAligns){
    return Cloud.saveWeekPlan(planId, { def_aligns: defAligns });
  },
  async saveBlitzCalls(planId, blitzCalls, genBase){
    const gen = Object.assign({}, genBase || {}, { blitz_calls: blitzCalls || null });
    return Cloud.saveWeekPlan(planId, { gen: gen });
  },
  /* Phase B: active week plan + observed coverage distribution for its opponent */
  async weekContext(){
    const t = await activeTeam(); if(!t) return null;
    let wp = null;
    try{ wp = await Cloud.activeWeekPlan(t.id); }catch(e){ return null; }
    if(!wp) return null;
    let coverages = [];
    try{
      const games = await Cloud.listGames(t.id);
      const counts = {};
      (games||[]).filter(g => g.side==="def" && g.opponent===wp.opponent).forEach(g => {
        (g.rows||[]).forEach(r => { const c = r && r.coverage; if(c && c!=="—"){ counts[c]=(counts[c]||0)+1; } });
      });
      coverages = Object.keys(counts).map(k=>({k, n:counts[k]})).sort((a,b)=>b.n-a.n);
    }catch(e){}
    return { plan: wp, coverages };
  }
};
