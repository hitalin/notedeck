/**
 * AiScript App ウィジェットテンプレート
 *
 * Misskey 本家のデフォルトウィジェットを AiScript で再現したもの。
 * ユーザーが追加後に自由に編集・改造できる。
 * コードは .is ファイルとして分離し、Vite の ?raw import で読み込む。
 */

import buttonCode from './templates/button.is?raw'
import memoCode from './templates/memo.is?raw'
import pollCode from './templates/poll.is?raw'
import postFormCode from './templates/post-form.is?raw'
import profileCode from './templates/profile.is?raw'
import serverInfoCode from './templates/server-info.is?raw'

export interface WidgetTemplate {
  id: string
  label: string
  icon: string
  description: string
  code: string
  /** 追加時に自動実行するか */
  autoRun: boolean
}

export const widgetTemplates: WidgetTemplate[] = [
  {
    id: 'memo',
    label: 'メモ帳',
    icon: 'ti-note',
    description: 'テキストを保存できるメモ帳',
    autoRun: true,
    code: memoCode,
  },
  {
    id: 'button',
    label: 'ボタン',
    icon: 'ti-square-rounded',
    description: 'カスタムアクションボタン',
    autoRun: true,
    code: buttonCode,
  },
  {
    id: 'serverInfo',
    label: 'サーバー情報',
    icon: 'ti-server',
    description: 'サーバーのメタ情報を表示',
    autoRun: true,
    code: serverInfoCode,
  },
  {
    id: 'profile',
    label: 'プロフィール',
    icon: 'ti-user',
    description: '自分のプロフィール情報を表示',
    autoRun: true,
    code: profileCode,
  },
  {
    id: 'postForm',
    label: '投稿ボタン',
    icon: 'ti-pencil',
    description: '定型文をすばやく投稿',
    autoRun: true,
    code: postFormCode,
  },
  {
    id: 'poll',
    label: '簡易アンケート',
    icon: 'ti-chart-bar',
    description: 'ローカル保存の簡易投票',
    autoRun: true,
    code: pollCode,
  },
]
