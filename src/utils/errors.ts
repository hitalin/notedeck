export type ErrorCode =
  | 'DATABASE'
  | 'NETWORK'
  | 'JSON'
  | 'ACCOUNT_NOT_FOUND'
  | 'API'
  | 'AUTH'
  | 'WEBSOCKET'
  | 'NO_CONNECTION'
  | 'CONNECTION_CLOSED'
  | 'INVALID_INPUT'
  | 'UNKNOWN'

export const AUTH_ERROR_MESSAGE = 'ログインが必要です。'

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'AppError'
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK' || this.code === 'CONNECTION_CLOSED'
  }

  get isAuth(): boolean {
    return this.code === 'AUTH' || this.code === 'ACCOUNT_NOT_FOUND'
  }

  /** toast 用のエラーコード。API エラーなら Misskey コードを抽出 */
  get displayCode(): string {
    if (this.code === 'API') {
      const match = this.message.match(/^[^:]+:\s*([A-Z_]+)/)
      if (match?.[1]) return match[1]
    }
    return this.code
  }

  /** Parse an error from Tauri invoke rejection or any thrown value */
  static from(e: unknown): AppError {
    if (e instanceof AppError) return e
    if (typeof e === 'object' && e !== null && 'code' in e && 'message' in e) {
      return new AppError(
        (e as { code: string }).code as ErrorCode,
        (e as { message: string }).message,
      )
    }
    if (typeof e === 'string') return new AppError('UNKNOWN', e)
    if (e instanceof Error) return new AppError('UNKNOWN', e.message)
    return new AppError('UNKNOWN', String(e))
  }
}
