export interface QuickPickItem {
  id: string
  label: string
  icon: string
  /** アバター画像URL（指定時は icon の代わりに表示） */
  avatarUrl?: string
  /** 2行目のサブテキスト */
  description?: string
  /** カテゴリグループ */
  group?: string
  /** 最終アクション（children がない場合に実行） */
  action?: () => void
  /** 次ステップの候補を返す（遅延評価） */
  children?: () => QuickPickItem[] | Promise<QuickPickItem[]>
}

export interface QuickPickStep {
  title: string
  placeholder: string
  items: QuickPickItem[]
  loading?: boolean
}
