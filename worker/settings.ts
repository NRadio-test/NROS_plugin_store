import { AppError, type AIConfig, type Env } from './contracts';
import { encrypt, decrypt } from './security';
import { setting, query } from './db';
import { validatePublicHttpsUrl } from './network';
export const defaultAI: AIConfig = { baseUrl: 'https://api.openai.com/v1', model: '', timeoutMs: 45000, maxRetries: 2, inputBudget: 100000, outputBudget: 1500, rules: '识别欺骗、恶意与垃圾行为；不因热度、简单功能或正常网络及系统操作拒绝。资料不足返回 uncertain。', structuredOutput: false };
export async function loadAI(env: Env, mask = false): Promise<AIConfig> { const c = await setting<AIConfig>(env, 'ai'); if (!c)
    return { ...defaultAI }; return { ...c, apiKey: c.apiKey ? (mask ? '••••••••' : await decrypt(env.MASTER_KEY, c.apiKey)) : undefined }; }
export async function saveAI(env: Env, body: unknown) {
    if (!body || typeof body !== 'object')
        throw new AppError(400, '无效配置');
    const b = body as Record<string, unknown>;
    if (Object.keys(b).some(k => !['baseUrl', 'model', 'apiKey', 'timeoutMs', 'maxRetries', 'inputBudget', 'outputBudget', 'rules', 'structuredOutput'].includes(k)))
        throw new AppError(400, '未知配置字段');
    const c = { ...defaultAI, ...b } as AIConfig;
    if (typeof c.baseUrl !== 'string' || typeof c.model !== 'string' || !c.model.trim() || c.model.length > 200 || typeof c.rules !== 'string' || c.rules.length > 12000 || typeof c.structuredOutput !== 'boolean')
        throw new AppError(400, '模型和审核规则格式错误');
    validatePublicHttpsUrl(c.baseUrl);
    for (const [key, min, max] of [['timeoutMs', 1000, 120000], ['maxRetries', 0, 3], ['inputBudget', 4000, 200000], ['outputBudget', 200, 8000]] as const) {
        if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max)
            throw new AppError(400, `${key} 超出范围`);
    }
    const old = await setting<AIConfig>(env, 'ai');
    if (c.apiKey === undefined || c.apiKey === '••••••••')
        c.apiKey = old?.apiKey;
    else {
        if (typeof c.apiKey !== 'string' || c.apiKey.length > 4096)
            throw new AppError(400, 'API Key 格式错误');
        c.apiKey = c.apiKey ? await encrypt(env.MASTER_KEY, c.apiKey) : undefined;
    }
    await env.DB.batch([query(env, 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'ai', JSON.stringify(c)), query(env, 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'reviewVersion', JSON.stringify(crypto.randomUUID()))]);
}
