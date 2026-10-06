import type { PredictionRecord } from './outcomeLearning';
import { summarizeLearning } from './outcomeLearning';
export interface TrackRecord { records:PredictionRecord[]; summary:ReturnType<typeof summarizeLearning>; immutable:true; }
export function createTrackRecord(records:PredictionRecord[]):TrackRecord{return {records:records.map(r=>({...r})),summary:summarizeLearning(records),immutable:true};}
