import type { Env } from './contracts';

/** 只有显式开启才执行内容审核；关闭时仍保留安装包结构与身份检查。 */
export const reviewEnabled = (env: Env): boolean => env.REVIEW_ENABLED === 'true';
export const UNREVIEWED_REASON = '审核暂时关闭，此版本未经自动审核或查毒';
