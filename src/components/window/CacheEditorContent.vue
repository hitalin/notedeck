<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useConfirm } from '@/stores/confirm'
import { commands, unwrap } from '@/utils/tauriInvoke'

const { confirm } = useConfirm()

const noteCount = ref<number | null>(null)
const dbBytes = ref<number | null>(null)
const isClearing = ref(false)
const errorMessage = ref('')

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function refreshStats() {
  try {
    const stats = unwrap(await commands.cacheStats())
    noteCount.value = stats.noteCount
    dbBytes.value = stats.dbSizeBytes
  } catch (e) {
    if (import.meta.env.DEV) console.debug('[cache-editor] fetch failed:', e)
  }
}

async function clearAll() {
  const ok = await confirm({
    title: 'キャッシュ削除',
    message: 'ノートキャッシュとOGPキャッシュをすべて削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (!ok) return
  isClearing.value = true
  errorMessage.value = ''
  try {
    unwrap(await commands.clearAllCache())
    await refreshStats()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    isClearing.value = false
  }
}

onMounted(refreshStats)
</script>

<template>
  <div :class="$style.content">
    <!-- 統計 -->
    <div :class="$style.section">
      <div :class="$style.sectionHeader">
        <i class="ti ti-chart-bar" :class="$style.sectionIcon" />
        <span :class="$style.sectionTitle">使用状況</span>
      </div>
      <div :class="$style.statsRow">
        <div :class="$style.statBox">
          <span :class="$style.statLabel">ノート</span>
          <span :class="$style.statValue">
            {{ noteCount == null ? '—' : noteCount.toLocaleString() }}
          </span>
        </div>
        <div :class="$style.statBox">
          <span :class="$style.statLabel">DB サイズ</span>
          <span :class="$style.statValue">
            {{ dbBytes == null ? '—' : formatBytes(dbBytes) }}
          </span>
        </div>
      </div>
    </div>

    <div :class="$style.divider" />

    <!-- 自動 eviction の説明 -->
    <div :class="$style.section">
      <div :class="$style.sectionHeader">
        <i class="ti ti-recycle" :class="$style.sectionIcon" />
        <span :class="$style.sectionTitle">自動掃除</span>
      </div>
      <p :class="$style.hint">
        起動時に古いノートが自動で削除されます。
      </p>
      <ul :class="$style.bulletList">
        <li>90 日以上前にキャッシュされたノート</li>
        <li>アカウントごとに最新 50,000 件を超える分</li>
      </ul>
    </div>

    <div :class="$style.divider" />

    <!-- 手動削除 -->
    <div :class="$style.section">
      <div :class="$style.sectionHeader">
        <i class="ti ti-eraser" :class="$style.sectionIcon" />
        <span :class="$style.sectionTitle">手動削除</span>
      </div>
      <p :class="$style.hint">
        ノートと OGP のキャッシュをすべて削除します。サーバーから再取得すれば復元されます。
      </p>
      <div :class="$style.btnRow">
        <button
          class="_button"
          :class="$style.actionBtn"
          :disabled="isClearing"
          @click="clearAll"
        >
          <i class="ti ti-trash" />
          {{ isClearing ? '処理中...' : '全キャッシュ削除' }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" :class="$style.error">{{ errorMessage }}</div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.content {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 0;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sectionHeader {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sectionIcon {
  font-size: 16px;
  color: var(--nd-fgMuted);
}

.sectionTitle {
  font-weight: bold;
  font-size: 0.95em;
  color: var(--nd-fg);
}

.hint {
  font-size: 0.8em;
  color: var(--nd-fgMuted);
  line-height: 1.5;
  margin: 0;
}

.bulletList {
  margin: 0;
  padding-left: 20px;
  font-size: 0.8em;
  color: var(--nd-fgMuted);
  line-height: 1.6;
}

.statsRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.statBox {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-panelBg, var(--nd-bgTransparentWeak));
}

.statLabel {
  font-size: 0.75em;
  color: var(--nd-fgMuted);
}

.statValue {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fg);
  font-variant-numeric: tabular-nums;
}

.btnRow {
  display: flex;
  gap: 8px;
}

.actionBtn {
  @include btn-action;
}

.divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 16px 0;
}

.error {
  margin-top: 12px;
  padding: 8px 12px;
  font-size: 0.8em;
  color: var(--nd-love);
  background: color-mix(in srgb, var(--nd-love) 10%, transparent);
  border-radius: var(--nd-radius-sm);
}
</style>
