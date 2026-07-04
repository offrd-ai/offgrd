/* Bridge for Reps Lab — exposes window.QB for saving/reading results. */
import { Cloud } from "./OFFGRD-cloud.js?v=28";
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
  async savePlayReads(id, reads){
    return Cloud.updatePlayReads(id, reads);
  },
  async saveOlKeys(id, keys){
    return Cloud.updatePlayOlKeys(id, keys);
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
