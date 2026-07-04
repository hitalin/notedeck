#!/usr/bin/env node
/**
 * Mk:api の endpoint → PermissionKey 対応表を生成する (#712 §5.5 / PR 1d)。
 *
 * 生成ソース (正本) は misskey 本家 backend の endpoint meta (`meta.kind` /
 * `meta.requireCredential`)。misskey-js の autogen JSDoc は 2026.6 系で
 * permission 記述が消えたため使えない (実パッケージ検証済み)。
 *
 * 使い方:
 *   git clone --depth 1 --branch 2026.6.0 --filter=blob:none --sparse \
 *     https://github.com/misskey-dev/misskey /tmp/misskey-sparse
 *   (cd /tmp/misskey-sparse && git sparse-checkout set packages/backend/src/server/api/endpoints)
 *   node scripts/gen-misskey-endpoint-permissions.mjs \
 *     /tmp/misskey-sparse/packages/backend/src/server/api/endpoints 2026.6.0
 *
 * 生成物 (src/permissions/misskeyEndpoints.generated.ts) はコミットする。
 * ランタイム / CI はネットワークに依存しない。表の妥当性は
 * src/permissions/misskeyEndpoints.test.ts の sanity テストが固定する。
 *
 * マッピング規則 (#712 §5.5 — 既存 PermissionKey 語彙への粗マップ):
 * - admin 系 kind / admin/ 配下 → deny
 * - write:notes → notes.write / write:reactions・write:favorites → notes.react
 * - read:account 系 → account.read / write:account 系 → account.write
 * - read:drive → drive.read / write:drive → drive.write
 * - clip 系 → clips.read / clips.write
 * - read:notifications → notifications
 * - 対応キーの無い read 系 (pages / channels / gallery / chat 等) →
 *   account.read に丸める (「そのアカウントとしてサーバーへ読みに行く」粗い同意)
 * - 対応キーの無い write 系 → deny (黙って開かない)
 * - kind 無し + credential 不要 → allow (公開 read)
 * - kind 無し + credential 必須 (i/regenerate-token 等の高感度) → deny
 * - 対応表に無い endpoint はランタイム側で deny (deny-by-default)
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const [, , endpointsDir, sourceTag] = process.argv
if (!endpointsDir || !sourceTag) {
  console.error(
    'usage: gen-misskey-endpoint-permissions.mjs <endpoints-dir> <misskey-tag>',
  )
  process.exit(1)
}

/** Misskey kind → NoteDeck PermissionKey (read の丸め先は account.read) */
const KIND_TO_KEY = new Map([
  ['read:account', 'account.read'],
  ['write:account', 'account.write'],
  ['read:blocks', 'account.read'],
  ['write:blocks', 'account.write'],
  ['read:mutes', 'account.read'],
  ['write:mutes', 'account.write'],
  ['read:following', 'account.read'],
  ['write:following', 'account.write'],
  ['write:notes', 'notes.write'],
  ['write:reactions', 'notes.react'],
  ['read:favorites', 'account.read'],
  ['write:favorites', 'notes.react'],
  ['read:drive', 'drive.read'],
  ['write:drive', 'drive.write'],
  ['read:clip-favorite', 'clips.read'],
  ['write:clip-favorite', 'clips.write'],
  ['read:notifications', 'notifications'],
])

/** 対応キーの無い read 系 kind → account.read への丸め対象 */
const COARSE_READ_KINDS = new Set([
  'read:channels',
  'read:chat',
  'read:pages',
  'read:page-likes',
  'read:gallery',
  'read:gallery-likes',
  'read:flash',
  'read:flash-likes',
  'read:federation',
  'read:invite-codes',
])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

const files = walk(endpointsDir)
if (files.length < 300) {
  throw new Error(
    `endpoint files too few (${files.length}) — sparse checkout が不完全?`,
  )
}

const entries = []
for (const file of files) {
  const endpoint = relative(endpointsDir, file).replace(/\.ts$/, '')
  const src = readFileSync(file, 'utf8')

  // meta.kind — 引用符は ' / " の両対応。kind: が在るのに抽出できなければ fail
  let kind = null
  const kindLines = src.match(/^\tkind:.*$/m)
  if (kindLines) {
    const m = kindLines[0].match(/^\tkind: ['"]([a-z:-]+)['"],?$/)
    if (!m) {
      throw new Error(`parse failed for kind in ${endpoint}: ${kindLines[0]}`)
    }
    kind = m[1]
  }

  // meta.requireCredential — 省略時は false (公開)。リテラル以外は安全側 true
  let requireCredential = false
  const credLine = src.match(/^\trequireCredential:.*$/m)
  if (credLine) {
    if (/requireCredential: true,?$/.test(credLine[0])) {
      requireCredential = true
    } else if (/requireCredential: false,?$/.test(credLine[0])) {
      requireCredential = false
    } else {
      // 条件式等は安全側 (credential 必須扱い)
      requireCredential = true
    }
  }

  let rule
  if (endpoint.startsWith('admin/') || (kind && kind.includes(':admin:'))) {
    rule = 'deny:admin'
  } else if (kind) {
    if (KIND_TO_KEY.has(kind)) {
      rule = KIND_TO_KEY.get(kind)
    } else if (COARSE_READ_KINDS.has(kind)) {
      rule = 'account.read'
    } else if (kind.startsWith('read:')) {
      throw new Error(
        `unknown read kind "${kind}" (${endpoint}) — KIND_TO_KEY か COARSE_READ_KINDS に追加が必要`,
      )
    } else if (kind.startsWith('write:')) {
      // 対応キーの無い write は黙って開かない
      rule = `deny:no-mapped-key(${kind})`
    } else {
      throw new Error(`unclassifiable kind "${kind}" (${endpoint})`)
    }
  } else if (!requireCredential) {
    rule = 'allow'
  } else {
    // kind 無し + credential 必須 = トークン再発行 / アカウント削除 / 2FA 等の
    // 高感度操作。プラグインに開かない
    rule = 'deny:credential-required-without-kind'
  }

  entries.push([endpoint, rule])
}

entries.sort(([a], [b]) => (a < b ? -1 : 1))

if (entries.length < 350) {
  throw new Error(`generated entries too few (${entries.length})`)
}

const body = entries
  .map(([ep, rule]) => `  '${ep}': '${rule}',`)
  .join('\n')

const out = `// このファイルは自動生成 — 手で編集しない。
// 再生成: scripts/gen-misskey-endpoint-permissions.mjs (手順はスクリプト冒頭)
// ソース: misskey-dev/misskey ${sourceTag} packages/backend/src/server/api/endpoints (meta.kind)
//
// 値の意味 (#712 §5.5):
// - 'allow'       : 公開 endpoint (credential 不要・permission 無し) — 常に許可
// - 'deny:<why>'  : 恒久拒否 (admin 面 / 対応キーの無い write / 高感度操作)
// - その他        : 必要な PermissionKey (plugin プロファイルで判定)
// 表に無い endpoint は deny (deny-by-default — fork 独自 / 本家新設は再生成まで開かない)

import type { PermissionKey } from './schema'

export type MisskeyEndpointRule = 'allow' | \`deny:\${string}\` | PermissionKey

export const MISSKEY_ENDPOINT_RULES: Record<
  string,
  MisskeyEndpointRule
> = {
${body}
}
`

writeFileSync(
  new URL('../src/permissions/misskeyEndpoints.generated.ts', import.meta.url),
  out,
)
console.log(`generated ${entries.length} entries from ${sourceTag}`)
