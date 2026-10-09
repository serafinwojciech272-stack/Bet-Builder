export type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

export interface VercelResponse {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string | number | readonly string[]): VercelResponse;
  json(body: unknown): VercelResponse;
  end(body?: string): void;
}
