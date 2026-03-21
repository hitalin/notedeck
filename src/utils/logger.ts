import { AppError } from './errors'

/**
 * 開発時のエラーログを統一する軽量ユーティリティ。
 *
 * - dev ビルドでは console.warn でコンテキスト付きログを出力
 * - prod ビルドでは完全に無視（ツリーシェイク対象）
 * - 意図的に無視するエラーには `logIgnored` を使い、lint の空キャッチを回避
 */

const isDev = import.meta.env.DEV

/** エラーをコンテキスト付きで console.warn に出力（dev のみ） */
export function logWarn(context: string, error: unknown): void {
  if (!isDev) return
  const appError = AppError.from(error)
  console.warn(`[${context}]`, appError.code, appError.message)
}

/** エラーをコンテキスト付きで console.error に出力（dev のみ） */
export function logError(context: string, error: unknown): void {
  if (!isDev) return
  const appError = AppError.from(error)
  console.error(`[${context}]`, appError.code, appError.message)
}

/**
 * 意図的にエラーを無視する場合に使う。
 * Biome の noEmptyCatch を回避しつつ、dev では trace ログを残す。
 */
export function logIgnored(context: string, error: unknown): void {
  if (!isDev) return
  const appError = AppError.from(error)
  console.debug(`[${context}] ignored:`, appError.code, appError.message)
}

/**
 * Promise の catch 用ショートハンド。
 * `promise.catch(catchLog('context'))` のように使う。
 */
export function catchLog(context: string): (error: unknown) => void {
  return (error: unknown) => logWarn(context, error)
}

/**
 * 意図的に無視する Promise の catch 用。
 * `promise.catch(catchIgnore('context'))` のように使う。
 */
export function catchIgnore(context: string): (error: unknown) => void {
  return (error: unknown) => logIgnored(context, error)
}
