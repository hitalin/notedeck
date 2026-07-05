import type { ApiAdapter } from '../../types'
import { createChartsApi } from './charts'
import { createChatApi } from './chat'
import { createCollectionsApi } from './collections'
import { createContext } from './context'
import { createDriveApi } from './drive'
import { createNotesApi } from './notes'
import { createNotificationsApi } from './notifications'
import { createServerContentApi } from './server'
import { createUsersApi } from './users'

/**
 * Misskey の ApiAdapter 実装 (#707 でドメイン別モジュールに分割)。
 * 旧 MisskeyApi クラス相当。ドメインごとのファクトリを 1 つのフラットな
 * オブジェクトに合成する — 呼び出し側は従来どおり `api.getNote(...)`。
 *
 * `_host` はフォーク差分吸収の将来用に呼び出しシグネチャだけ維持している
 * (旧クラスのコンストラクタと同じく現状未使用)。
 */
export function createMisskeyApi(
  accountId: string,
  _host: string,
  hasToken = true,
): ApiAdapter {
  const ctx = createContext(accountId, hasToken)
  const notes = createNotesApi(ctx)
  return {
    ...notes,
    ...createUsersApi(ctx, notes),
    ...createCollectionsApi(ctx),
    ...createChatApi(ctx),
    ...createNotificationsApi(ctx),
    ...createDriveApi(ctx),
    ...createChartsApi(ctx),
    ...createServerContentApi(ctx),
  }
}
