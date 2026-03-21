/**
 * プラグインテンプレート
 *
 * 既存の AiScript プラグインをテンプレートとして提供する。
 * ユーザーがワンクリックでインストールできる。
 * コードは .is ファイルとして分離し、Vite の ?raw import で読み込む。
 */

import youtubeLinkCleanerCode from './templates/youtube-link-cleaner.is?raw'

export interface PluginTemplate {
  id: string
  label: string
  icon: string
  description: string
  code: string
}

export const pluginTemplates: PluginTemplate[] = [
  {
    id: 'youtube-link-cleaner',
    label: 'YouTube Link Cleaner',
    icon: 'ti-brand-youtube',
    description: '投稿時に YouTube URL の追跡クエリを自動削除',
    code: youtubeLinkCleanerCode,
  },
]
