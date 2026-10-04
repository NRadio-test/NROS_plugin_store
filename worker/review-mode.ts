import type { Env } from './contracts';

/** Missing configuration fails closed to manual review. Automatic code is retained for future use. */
export const manualReview = (env: Env): boolean => env.REVIEW_MODE !== 'automatic';
export const MANUAL_REVIEW_REASON = '等待管理员人工审核';
export const publicationFilter = (env: Env, alias = 's'): string => manualReview(env) ? ` AND json_extract(${alias}.data,'$.publicationMode')='human-reviewed'` : '';
/** 只有显式开启才执行内容审核；关闭时仍保留安装包结构与身份检查。 */
export const reviewEnabled = (env: Env): boolean => !manualReview(env) && env.REVIEW_ENABLED === 'true';
export const UNREVIEWED_REASON = '审核暂时关闭，此版本未经自动审核或查毒';
