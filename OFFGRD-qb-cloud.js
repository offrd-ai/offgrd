/* Bridge for the QB Reads Trainer — exposes window.QB for saving/reading results. */
import { Cloud } from "./OFFGRD-cloud.js?v=19";
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
  }
};
