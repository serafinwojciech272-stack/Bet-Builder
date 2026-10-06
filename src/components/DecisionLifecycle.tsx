import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDot, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { DECISION_STAGES, decisionLabel, isGate, stageIndex, type DecisionStage } from '../core/decisionLifecycle';

type EvidenceKind = 'LIVE' | 'MODEL' | 'HUMAN' | 'HISTORICAL';
type Evidence = { kind: EvidenceKind; title: string; detail: string; freshness: string; confidence: number };

const evidence: Evidence[] = [
  { kind:'LIVE', title:'Market snapshot', detail:'Current event/market state is the decision input.', freshness:'fresh', confidence:94 },
  { kind:'MODEL', title:'Model inference', detail:'Probability and value are treated as inference, not fact.', freshness:'current', confidence:81 },
  { kind:'HISTORICAL', title:'Calibration history', detail:'Past outcomes provide a learning signal only.', freshness:'rolling', confidence:76 },
];

export function DecisionLifecycle(){
  const [active,setActive]=useState<DecisionStage>('VERIFY');
  const [approved,setApproved]=useState(false);
  const index=stageIndex(active);
  const gateReady=active==='APPROVE' && approved;
  const executionLocked=!gateReady;
  const evidenceScore=useMemo(()=>Math.round(evidence.reduce((a,b)=>a+b.confidence,0)/evidence.length),[]);

  return <section className="bb-lifecycle" aria-label="Decision lifecycle and execution safety">
    <div className="bb-lifecycle-head">
      <div>
        <span className="bb-eyebrow"><Sparkles size={11}/> CORE DECISION SPINE · M25–M42</span>
        <h2>Decision lifecycle</h2>
        <p>Evidence → decision → human approval → controlled execution → outcome → learning.</p>
      </div>
      <div className={`bb-gate-badge ${gateReady?'ready':'locked'}`}>
        {gateReady?<CheckCircle2 size={14}/>:<LockKeyhole size={14}/>}
        {gateReady?'EXECUTION PERMISSION':'EXECUTION LOCKED'}
      </div>
    </div>

    <div className="bb-lifecycle-rail" role="list" aria-label="Decision stages">
      {DECISION_STAGES.map((stage,i)=>{
        const done=i<index, current=stage===active;
        return <button key={stage} type="button" role="listitem" aria-current={current?'step':undefined}
          className={`bb-stage ${done?'done ':''}${current?'current ':''}${isGate(stage)?'gate':''}`}
          onClick={()=>setActive(stage)} aria-label={`${decisionLabel(stage)} stage`}>
          <span className="bb-stage-index">{done?<CheckCircle2 size={12}/>:<CircleDot size={12}/>}</span>
          <span><b>{stage}</b><small>{decisionLabel(stage)}</small></span>
        </button>
      })}
    </div>

    <div className="bb-lifecycle-grid">
      <div className="bb-evidence-panel">
        <div className="bb-panel-title"><ShieldCheck size={13}/> Evidence integrity <strong>{evidenceScore}%</strong></div>
        <div className="bb-evidence-list">
          {evidence.map(item=><div className="bb-evidence-row" key={item.title}>
            <span className={`bb-evidence-kind kind-${item.kind.toLowerCase()}`}>{item.kind}</span>
            <div><b>{item.title}</b><p>{item.detail}</p></div>
            <span className="bb-confidence">{item.confidence}% · {item.freshness}</span>
          </div>)}
        </div>
      </div>

      <div className="bb-gate-panel">
        <div className="bb-panel-title"><LockKeyhole size={13}/> Human Approval Gate</div>
        <div className="bb-gate-copy">
          <strong>{active==='APPROVE'?'Decision ready for human review':'Approval is intentionally downstream of verification.'}</strong>
          <p>No client-side action can claim execution. Provider execution remains locked until the approval state is explicitly confirmed by the core execution policy.</p>
        </div>
        <label className="bb-approval-toggle">
          <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} disabled={active!=='APPROVE'}/>
          <span>Human approval confirmed</span>
        </label>
        <div className={`bb-safety-note ${executionLocked?'locked':'ready'}`}>
          {executionLocked?<AlertTriangle size={14}/>:<CheckCircle2 size={14}/>}
          {executionLocked?'Execution permission unavailable — observational/safe mode remains locked.':'Approval recorded in this local UI; authoritative execution permission must still come from the Core Engine.'}
        </div>
      </div>
    </div>
  </section>;
}
