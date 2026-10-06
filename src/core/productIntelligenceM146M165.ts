export type ProductState='READY'|'REVIEW'|'BLOCKED'|'DEGRADED'|'EMPTY';export type RiskBand='LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
export interface MarketSnapshot{eventId:string;marketId:string;selectionId:string;odds:number;probability:number;capturedAt:string;provider:string}
export interface DecisionEvidence{id:string;label:string;value:string;source:string;updatedAt:string;quality:'A'|'B'|'C'|'D'}
export interface DecisionView{title:string;probability:number;fairProbability:number;edge:number;confidence:number;risk:RiskBand;state:ProductState;evidence:DecisionEvidence[];stale:boolean;explanation:string}
export function marketSnapshotValid(s:MarketSnapshot){return!!s.eventId&&!!s.marketId&&!!s.selectionId&&s.odds>1&&s.probability>0&&s.probability<1&&!Number.isNaN(Date.parse(s.capturedAt))&&!!s.provider}
export function snapshotAgeSeconds(at:string,now=new Date()){return Math.max(0,(now.getTime()-new Date(at).getTime())/1000)}
export function classifyFreshness(age:number,soft=60,hard=180):'FRESH'|'STALE'|'CRITICAL'{return age<=soft?'FRESH':age<=hard?'STALE':'CRITICAL'}
export function computeEdge(model:number,fair:number){return model-fair}
export function riskFromDecision(conf:number,edge:number,corr:number):RiskBand{if(conf<.45||edge<0)return'CRITICAL';if(corr>=.8||conf<.6)return'HIGH';if(corr>=.5||conf<.75)return'MEDIUM';return'LOW'}
export function decisionState(a:{freshness:'FRESH'|'STALE'|'CRITICAL';policy:'CLEAR'|'REVIEW'|'BLOCKED';provider:'NORMAL'|'DEGRADED'|'OFFLINE';hasEvidence:boolean}):ProductState{if(!a.hasEvidence)return'EMPTY';if(a.provider==='OFFLINE'||a.freshness==='CRITICAL'||a.policy==='BLOCKED')return'BLOCKED';if(a.provider==='DEGRADED'||a.freshness==='STALE'||a.policy==='REVIEW')return'DEGRADED';return'READY'}
export function buildExplanation(d:{title:string;probability:number;fairProbability:number;confidence:number;risk:RiskBand;freshness:string;model:string}){return`${d.title}: model ${(d.probability*100).toFixed(1)}%, fair reference ${(d.fairProbability*100).toFixed(1)}%, confidence ${(d.confidence*100).toFixed(0)}%, risk ${d.risk}, data ${d.freshness}, model ${d.model}. Decision support, not a guarantee.`}
// M146 point-in-time freeze
export function freezeSnapshot(s:MarketSnapshot){return Object.freeze({...s})}
// M147 evidence quality
export function evidenceQuality(e:DecisionEvidence[]){return e.length?e.reduce((a,x)=>a+({A:1,B:.8,C:.6,D:.3}[x.quality]),0)/e.length:0}
// M148 live pulse
export function marketPulse(a:MarketSnapshot,b:MarketSnapshot){return{oddsDelta:b.odds-a.odds,probabilityDelta:b.probability-a.probability,providerChanged:a.provider!==b.provider}}
// M149 stale UX
export function staleCopy(age:number){const f=classifyFreshness(age);return f==='FRESH'?'LIVE DATA':f==='STALE'?'REFRESHING / STALE':'DATA BLOCKED'}
// M150 model disagreement
export function modelDisagreement(p:number[]){return p.length<2?0:Math.max(...p)-Math.min(...p)}
// M151 uncertainty
export function uncertaintyReason(conf:number,sample:number){return sample<20?'LOW SAMPLE: strong claims withheld':conf<.6?'LOW CONFIDENCE: substantial uncertainty':conf<.8?'MODERATE CONFIDENCE: monitor evidence':'HIGH CONFIDENCE: not a guarantee'}
// M152 correlation
export function correlationPenalty(c:number){return Math.max(0,Math.min(1,c))}
// M153 exposure preview
export function exposurePreview(stakes:number[],losses:number[]){return{stake:stakes.reduce((a,b)=>a+b,0),maxLoss:losses.reduce((a,b)=>a+b,0),legs:Math.max(stakes.length,losses.length)}}
// M154 decision gate
export function gateSummary(a:{state:ProductState;approvalRequired:boolean;executionAllowed:boolean}){return{...a,action:a.executionAllowed?'EXECUTION_PERMISSION_GRANTED':a.approvalRequired?'AWAITING_HUMAN_APPROVAL':a.state==='BLOCKED'?'BLOCKED':'REVIEW'}}
// M155 deterministic replay view key
export function deterministicViewKey(input:unknown){const s=JSON.stringify(input);let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16)}
// M156 audit readiness
export function auditReady(a:{decisionId:string;evidenceCount:number;policyVersion:number;viewKey:string}){return!!a.decisionId&&a.evidenceCount>0&&a.policyVersion>0&&!!a.viewKey}
// M157 accessible status
export function statusLabel(s:ProductState){return({READY:'Ready',REVIEW:'Human review required',BLOCKED:'Blocked by policy/data',DEGRADED:'Degraded data state',EMPTY:'No decision available'}[s])}
// M158 notification priority
export function notificationPriority(s:ProductState,r:RiskBand):0|1|2|3{if(s==='BLOCKED'||r==='CRITICAL')return 3;if(s==='DEGRADED'||r==='HIGH')return 2;if(r==='MEDIUM')return 1;return 0}
// M159 intent-first query
export interface IntentQuery{sport?:string;event?:string;market?:string;timeWindow?:string}
export function normalizeIntent(q:IntentQuery){const c=(v?:string)=>v?.trim().replace(/\s+/g,' ')||undefined;return{sport:c(q.sport),event:c(q.event),market:c(q.market),timeWindow:c(q.timeWindow)}}
// M160 recommendation reasons
export function recommendationReasons(d:DecisionView){const r:string[]=[];if(d.edge>0)r.push('POSITIVE_EDGE');if(d.confidence>=.75)r.push('HIGH_CONFIDENCE');if(d.stale)r.push('STALE_DATA');if(d.risk==='HIGH'||d.risk==='CRITICAL')r.push('ELEVATED_RISK');if(d.evidence.length<2)r.push('LIMITED_EVIDENCE');return r}
// M161 responsible friction
export function riskFriction(r:RiskBand):'NONE'|'CONFIRM'|'COOLING_OFF'{return r==='CRITICAL'?'COOLING_OFF':r==='HIGH'?'CONFIRM':'NONE'}
// M162 mobile summary
export function mobileSummary(d:DecisionView){return{headline:d.title,probability:`${(d.probability*100).toFixed(1)}%`,edge:`${(d.edge*100).toFixed(1)}%`,confidence:`${(d.confidence*100).toFixed(0)}%`,risk:d.risk,state:d.state}}
// M163 evidence freshness
export function evidenceFreshness(e:DecisionEvidence[],now=new Date()){return e.length?Math.min(...e.map(x=>snapshotAgeSeconds(x.updatedAt,now)):Infinity}
// M164 product readiness
export function productIntelligenceReady(a:{decision:boolean;evidence:boolean;replay:boolean;audit:boolean;accessibility:boolean;responsible:boolean}){return Object.values(a).every(Boolean)}
// M165 final contract: never bypasses human approval
export function finalDecisionContract(d:DecisionView){return{decision:d.title,state:d.state,probability:d.probability,edge:d.edge,confidence:d.confidence,risk:d.risk,evidenceCount:d.evidence.length,explanation:d.explanation,executionAllowed:false,requiresHumanApproval:true}}
