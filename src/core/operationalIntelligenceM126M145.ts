export type Severity='INFO'|'WARN'|'CRITICAL';
export interface AuditEvent {id:string;sequence:number;payloadHash:string;previousHash?:string;}
export function validateAuditChain(events:AuditEvent[]):boolean { const s=[...events].sort((a,b)=>a.sequence-b.sequence); return s.every((e,i)=>e.sequence===i+1&&!!e.id&&!!e.payloadHash&&(i===0||e.previousHash===s[i-1].payloadHash)); }

export const CORE_STAGE_ORDER=['CONTEXT','INTELLIGENCE','OPPORTUNITY','DECISION','MISSION','RISK_POLICY','APPROVAL','EXECUTION_PERMISSION','EXECUTION','OUTCOME','LEARNING'] as const;
export function validateReplayStages(stages:string[]):boolean { let last=-1; for(const stage of stages){const i=CORE_STAGE_ORDER.indexOf(stage as typeof CORE_STAGE_ORDER[number]);if(i<0||i<last)return false;last=i;}return true; }

export interface EvidenceLink {from:string;to:string;kind:'SUPPORTS'|'CONTRADICTS'|'DERIVED_FROM';}
export function validateEvidenceLinks(nodes:string[],links:EvidenceLink[]):boolean { const set=new Set(nodes); return links.every(l=>set.has(l.from)&&set.has(l.to)&&l.from!==l.to); }

export interface PolicyVersion {id:string;version:number;active:boolean;checksum:string;}
export function selectActivePolicy(policies:PolicyVersion[]):PolicyVersion|null { const a=policies.filter(p=>p.active&&p.checksum).sort((x,y)=>y.version-x.version);return a[0]??null; }

export interface DecisionPacket {id:string;version:number;createdAt:string;policyVersion:number;evidenceCount:number;}
export function nextDecisionPacket(previous:DecisionPacket|null,input:Omit<DecisionPacket,'version'>):DecisionPacket {return {...input,version:(previous?.version??0)+1};}

export interface Incident {id:string;severity:Severity;openedAt:string;resolvedAt?:string;}
export function openIncident(incidents:Incident[],incident:Incident):Incident[]{if(incidents.some(x=>x.id===incident.id))throw new Error('INCIDENT_DUPLICATE');return [...incidents,incident];}

export interface DegradationEvent {provider:string;mode:'NORMAL'|'DEGRADED'|'OFFLINE';reason:string;at:string;}
export function requiresUserNotice(event:DegradationEvent):boolean{return event.mode!=='NORMAL';}

export function freshnessRoute(ageSeconds:number,softSla:number,hardSla:number):'FRESH'|'STALE'|'CRITICAL'{return ageSeconds<=softSla?'FRESH':ageSeconds<=hardSla?'STALE':'CRITICAL';}

export function quarantineProvider(discrepancyPct:number,thresholdPct=5):boolean{return discrepancyPct>thresholdPct;}

export interface CostRecord {provider:string;requests:number;unitCost:number;}
export function attributeCost(records:CostRecord[]):number{return records.reduce((s,r)=>s+Math.max(0,r.requests)*Math.max(0,r.unitCost),0);}

export function withinModelBudget(computeUnits:number,budgetUnits:number):boolean{return budgetUnits>=0&&computeUnits>=0&&computeUnits<=budgetUnits;}

export interface TransparencyRow {label:string;value:string;source:string;updatedAt:string;}
export function transparencyReady(rows:TransparencyRow[]):boolean{return rows.length>0&&rows.every(r=>!!r.label&&!!r.value&&!!r.source&&!!r.updatedAt);}

export interface PublicMetric {name:string;value:number;sampleSize:number;minimumSample:number;}
export function publishableMetric(metric:PublicMetric):boolean{return metric.sampleSize>=metric.minimumSample&&Number.isFinite(metric.value);}

export function correlationExplanation(coefficient:number):string{return coefficient>=.8?'HIGH: strong overlap; treat legs as materially correlated':coefficient>=.5?'MEDIUM: meaningful overlap; review concentration':'LOW: limited modeled overlap';}

export function uncertaintyBand(confidence:number):'LOW'|'MEDIUM'|'HIGH'|'VERY_HIGH'{return confidence<.5?'LOW':confidence<.7?'MEDIUM':confidence<.85?'HIGH':'VERY_HIGH';}

export interface RiskControl {maxStake:number;cooldownSeconds:number;lossLimit:number;}
export function riskControlsValid(c:RiskControl):boolean{return c.maxStake>0&&c.cooldownSeconds>=0&&c.lossLimit>0;}

export type DecisionUiState='LOADING'|'READY'|'REVIEW'|'BLOCKED'|'DEGRADED'|'EMPTY';
export function decisionUiState(input:{loading:boolean;policy:'CLEAR'|'REVIEW'|'BLOCKED';provider:'NORMAL'|'DEGRADED'|'OFFLINE';hasData:boolean}):DecisionUiState{if(input.loading)return'LOADING';if(!input.hasData)return'EMPTY';if(input.provider!=='NORMAL')return input.provider==='OFFLINE'?'BLOCKED':'DEGRADED';return input.policy==='BLOCKED'?'BLOCKED':input.policy==='REVIEW'?'REVIEW':'READY';}

export interface AlertCandidate {id:string;severity:Severity;freshness:number;confidence:number;}
export function prioritizeAlerts(items:AlertCandidate[]):AlertCandidate[]{return [...items].sort((a,b)=>({CRITICAL:0,WARN:1,INFO:2}[a.severity]-({CRITICAL:0,WARN:1,INFO:2}[b.severity])||b.confidence-a.confidence||a.freshness-b.freshness));}

export interface CompactDecision {title:string;probability:number;confidence:number;risk:Severity;status:DecisionUiState;}
export function compactDecision(d:CompactDecision){return {title:d.title.slice(0,80),probability:Math.max(0,Math.min(1,d.probability)),confidence:Math.max(0,Math.min(1,d.confidence)),risk:d.risk,status:d.status};}

export interface ReadinessInput {tests:boolean;security:boolean;slo:boolean;provider:boolean;quota:boolean;release:boolean;audit:boolean;transparency:boolean;}
export function productionReady(r:ReadinessInput):boolean{return Object.values(r).every(Boolean);}
