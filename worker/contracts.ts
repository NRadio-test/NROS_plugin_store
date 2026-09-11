export interface Env {
 DB: D1Database; ADMIN_AUTH_DB: D1Database; JOBS: Queue<{taskId?:string; scanCursor?:string}>; ASSETS: Fetcher;
 APP_ENV: string; APP_ORIGIN: string; MASTER_KEY: string; PHONE_HMAC_KEY: string; GITHUB_TOKEN?: string;
 MAX_IPK_BYTES: string; DAILY_AI_BUDGET: string;
}
export type Verdict = 'allow'|'reject'|'uncertain';
export interface Asset { id:number; name:string; size:number; url:string; digest:string|null; updatedAt:string; sha256?:string; packageName?:string; architecture?:string }
export interface Snapshot { repositoryId:number; fullName:string; description:string; license:string|null; readme:string; readmePath:string; readmeCommit:string; releaseId:number; tag:string; sourceCommit:string; assets:Asset[]; materials:string; coverage:string[]; fingerprint:string }
export interface AIConfig { baseUrl:string; model:string; apiKey?:string; timeoutMs:number; maxRetries:number; inputBudget:number; outputBudget:number; rules:string; structuredOutput:boolean }
export interface ReviewResult { verdict:Verdict; publicReason:string; internalReason:string }
export interface DownloadSource { id:string; name:string; template:string; allowedHosts:string[]; enabled:boolean; trusted:boolean; priority:number; timeoutMs:number }
export class AppError extends Error { constructor(public status:number, message:string, public code='error'){super(message)} }
