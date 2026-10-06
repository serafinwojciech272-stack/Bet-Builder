import {describe,it,expect,beforeEach,vi} from 'vitest';
import {BrowserPredictionReplayRepository} from '../core/predictionReplayStore';
import type {Prediction} from '../core/predictionEngine';
const p:Prediction={selectionId:'replay-1',eventId:'event-1',marketId:'m',label:'Home',probability:.65,confidence:.8,fairOdds:1/.65,marketOdds:2,edge:.15,ev:.3,risk:'LOW',modelVersion:'v1',reasons:['signal']};
describe('prediction replay repository',()=>{
 beforeEach(()=>{ const store=new Map<string,string>(); vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v)},removeItem:(k:string)=>{store.delete(k)}}}); });
 it('persists a snapshot and does not duplicate it',()=>{
  const a=new BrowserPredictionReplayRepository(); const one=a.snapshot(p,'2026-10-06T10:00:00Z'); a.snapshot(p,'2026-10-06T11:00:00Z');
  const b=new BrowserPredictionReplayRepository();
  expect(b.list()).toHaveLength(1); expect(b.get('replay-1')?.capturedAt).toBe(one.capturedAt);
 });
 it('allows exactly one verified settlement',()=>{
  const a=new BrowserPredictionReplayRepository(); a.snapshot(p);
  expect(a.settle('replay-1','WON').outcome).toBe('WON');
  expect(()=>a.settle('replay-1','LOST')).toThrow('PREDICTION_REPLAY_ALREADY_SETTLED');
 });
 it('rejects settlement of unknown prediction',()=>{const a=new BrowserPredictionReplayRepository();expect(()=>a.settle('missing','WON')).toThrow('PREDICTION_REPLAY_NOT_FOUND');});
});
