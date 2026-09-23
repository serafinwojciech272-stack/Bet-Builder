import { sportScoreSmoke } from './odds.ts';

type Request = { method?: string; query?: Record<string,string> };
type Response = { status:(code:number)=>Response; setHeader:(name:string,value:string)=>Response; end:(body:string)=>void };

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow','GET').end(JSON.stringify({ error:'METHOD_NOT_ALLOWED' }));
    return;
  }
  const requestedDate = req.query?.date || new Date().toISOString().slice(0,10);
  const requestedSport = req.query?.sport || 'all';
  try {
    const result = await sportScoreSmoke(requestedDate, requestedSport);
    res.status(result.ok ? 200 : 503).setHeader('Content-Type','application/json; charset=utf-8').end(JSON.stringify(result));
  } catch (error) {
    res.status(500).setHeader('Content-Type','application/json; charset=utf-8').end(JSON.stringify({
      smoke:'sportscore', ok:false, error:'SPORTSCORE_SMOKE_INTERNAL_ERROR',
      message:error instanceof Error ? error.message : 'unknown error'
    }));
  }
}
