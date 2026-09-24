import type { EventResearch, ResearchFinding, ResearchSource } from '../research/types';

export interface EvidenceItem {
  id:string; category:ResearchFinding['category']; statement:string; polarity:ResearchFinding['polarity'];
  confidence:number; freshnessHours:number; independentSources:number; reliabilityScore:number;
  sourceIds:string[]; sourceTitles:string[]; sourcePublishers:string[]; languages:string[];
}
export interface EvidenceConflict { category:string; supportive:string[]; adverse:string[]; severity:'low'|'medium'|'high'; }
export interface ResearchEvidence {
  eventId:string; generatedAt:string; digest:string; quality:number; coverageScore:number;
  evidence:EvidenceItem[]; conflicts:EvidenceConflict[]; criticalWarnings:string[];
  decisionImpact:{supportive:number; adverse:number; net:number; confidence:number; rationale:string[]};
  auditTrail:string[];
}

const clamp=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const hash=(s:string)=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
const reliability=(s:ResearchSource)=>({A:1,B:.82,C:.58,D:.35}[s.reliability]??.5);

export function buildResearchEvidence(research:EventResearch):ResearchEvidence{
  const byId=new Map(research.sources.map(s=>[s.url,s]));
  const evidence=research.findings.map(f=>{
    const sources=f.sourceIds.map(id=>byId.get(id)).filter(Boolean) as ResearchSource[];
    const rel=sources.length?sources.reduce((a,s)=>a+reliability(s),0)/sources.length:0;
    const freshness=clamp(1-f.freshnessHours/168);
    const independence=clamp(f.independentSourceCount/4);
    const confidence=clamp(f.confidence*.45+rel*.25+freshness*.15+independence*.15);
    return {id:f.id,category:f.category,statement:f.statement,polarity:f.polarity,confidence,freshnessHours:Number.isFinite(f.freshnessHours)?f.freshnessHours:168,independentSources:Number.isFinite(f.independentSourceCount)?f.independentSourceCount:0,reliabilityScore:rel,sourceIds:f.sourceIds,sourceTitles:sources.map(s=>s.title),sourcePublishers:sources.map(s=>s.publisher),languages:sources.map(s=>s.language)};
  });
  const conflicts:EvidenceConflict[]=research.findings
    .filter(f=>f.polarity==='neutral' || f.category==='contradiction')
    .map(f=>({category:f.category,supportive:f.polarity==='neutral'?['Neutral/uncertain evidence']:[],adverse:f.polarity==='adverse'?[f.statement]:[],severity:(f.category==='contradiction'||research.consensus.contradictionRate>=.5?'high':research.consensus.contradictionRate>=.25?'medium':'low') as 'low'|'medium'|'high'}));
  if(research.consensus.direction==='mixed' && !conflicts.some(c=>c.category==='consensus')){
    conflicts.push({category:'consensus',supportive:research.findings.filter(f=>f.polarity==='supportive').map(f=>f.statement).slice(0,4),adverse:research.findings.filter(f=>f.polarity==='adverse').map(f=>f.statement).slice(0,4),severity:research.consensus.contradictionRate>=.5?'high':'medium'});
  }
  const supportive=evidence.filter(e=>e.polarity==='supportive').reduce((a,e)=>a+e.confidence,0);
  const adverse=evidence.filter(e=>e.polarity==='adverse').reduce((a,e)=>a+e.confidence,0);
  const total=supportive+adverse;
  const net=total?clamp(.5+(supportive-adverse)/(2*total)):0;
  const coverage=clamp((new Set(research.sources.map(s=>s.language)).size/7)*.3+(new Set(research.sources.map(s=>s.publisher)).size/8)*.35+(research.sourceCoverage.official>0?.15:0)+(research.sourceCoverage.expert>0?.1:0)+(research.sourceCoverage.localMedia>0?.1:0));
  const criticalWarnings=[...research.warnings];
  if(research.lineupStatus==='unknown')criticalWarnings.push('Lineup status is unknown.');
  if(research.consensus.contradictionRate>=.5)criticalWarnings.push('High contradiction rate in research evidence.');
  const quality=clamp(research.researchQuality*.6+coverage*.25+(1-research.consensus.contradictionRate)*.15);
  const rationale:string[]=[];
  if(supportive>adverse)rationale.push('Research evidence contains more weighted supportive signal than adverse signal.');
  if(adverse>supportive)rationale.push('Research evidence contains more weighted adverse signal than supportive signal.');
  if(Math.abs(supportive-adverse)<.15)rationale.push('Evidence balance is close; research should not materially override the quantitative model.');
  if(research.sourceCoverage.official)rationale.push('At least one official-source signal is present.');
  if(research.sourceCoverage.localMedia||research.sourceCoverage.expert)rationale.push('Local/expert context is represented.');
  if(research.sourceCoverage.tipster)rationale.push('Tipster consensus is included as secondary evidence only.');
  return {eventId:research.eventId,generatedAt:research.generatedAt,digest:hash(JSON.stringify(research)),quality,coverageScore:coverage,evidence,conflicts,criticalWarnings,decisionImpact:{supportive,adverse,net,confidence:clamp(total?total/evidence.length:0),rationale},auditTrail:[`Evidence Engine processed ${research.sources.length} sources and ${research.findings.length} findings.`,`Weighted supportive signal: ${supportive.toFixed(2)}; adverse: ${adverse.toFixed(2)}.`,`Coverage score: ${(coverage*100).toFixed(0)}%; evidence quality: ${(quality*100).toFixed(0)}%.`,`Research digest: ${hash(JSON.stringify(research))}.`]};
}