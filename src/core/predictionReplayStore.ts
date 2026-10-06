import type { Prediction } from './predictionEngine';
import { createDecisionReplay, type DecisionReplay, type ReplayOutcome } from './predictionIntelligence';

const KEY='bet-builder:prediction-decision-replay:v1';

export interface ReplayRepository {
  list():DecisionReplay[];
  get(id:string):DecisionReplay|undefined;
  snapshot(prediction:Prediction, capturedAt?:string):DecisionReplay;
  settle(id:string,outcome:Exclude<ReplayOutcome,'PENDING'>,settledAt?:string):DecisionReplay;
}

function safeRead():DecisionReplay[]{
  if(typeof window==='undefined') return [];
  try { const raw=window.localStorage.getItem(KEY); return raw?JSON.parse(raw) as DecisionReplay[]:[]; } catch { return []; }
}
function safeWrite(rows:DecisionReplay[]){ if(typeof window!=='undefined') window.localStorage.setItem(KEY,JSON.stringify(rows)); }

export class BrowserPredictionReplayRepository implements ReplayRepository {
  private rows=safeRead();
  list(){return this.rows.map(r=>({...r,reasons:[...r.reasons],stages:[...r.stages]}));}
  get(id:string){return this.list().find(r=>r.predictionId===id);}
  snapshot(prediction:Prediction,capturedAt=new Date().toISOString()){
    const existing=this.get(prediction.selectionId);
    if(existing) return existing;
    const replay=createDecisionReplay(prediction,'PENDING',capturedAt);
    this.rows=[replay,...this.rows.filter(r=>r.predictionId!==replay.predictionId)];
    safeWrite(this.rows);
    return replay;
  }
  settle(id:string,outcome:Exclude<ReplayOutcome,'PENDING'>,settledAt=new Date().toISOString()){
    const index=this.rows.findIndex(r=>r.predictionId===id);
    if(index<0) throw new Error('PREDICTION_REPLAY_NOT_FOUND');
    if(this.rows[index].outcome!=='PENDING') throw new Error('PREDICTION_REPLAY_ALREADY_SETTLED');
    const next={...this.rows[index],outcome,stages:[...this.rows[index].stages],capturedAt:this.rows[index].capturedAt,settledAt};
    this.rows=[...this.rows.slice(0,index),next,...this.rows.slice(index+1)];
    safeWrite(this.rows);
    return next;
  }
  clear(){this.rows=[];safeWrite([]);}
}
