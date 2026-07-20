<script setup lang="ts">
import { computed } from 'vue'
import { useNoteSound } from '@/composables/useNoteSound'
import { useSetting } from '@/composables/useSetting'
import { useAccountsStore } from '@/stores/accounts'
import AiSwitchRow from './ai-settings/AiSwitchRow.vue'

const dnd = useSetting('notifications.dnd', false)
const osEnabled = useSetting('notifications.osEnabled', true)
const soundEnabled = useSetting('notifications.soundEnabled', true)
const volume = useSetting('notifications.volume', 0.3)

// スライダーは 0-100 表示、内部は 0-1
const volumePercent = computed({
  get: () => Math.round(volume.value * 100),
  set: (v: number) => {
    volume.value = v / 100
  },
})

// 操作を止めたタイミング (change) で試聴。音はサーバー由来 (通知カラムと同じ音種)
const accountsStore = useAccountsStore()
const previewSound = useNoteSound(
  () => accountsStore.accounts[0]?.host,
  'syuilo/n-ea',
)

function previewVolume() {
  if (soundEnabled.value && !dnd.value) previewSound.play()
}
</script>

<template>
  <div :class="$style.content">
    <div :class="$style.section">
      <AiSwitchRow
        label="通知を一時停止 (DND)"
        sub-label="ON の間は OS 通知と通知音を止めます (カラム表示は残ります)"
        icon="ti-moon"
        :on="dnd"
        @toggle="dnd = !dnd"
      />
    </div>

    <div :class="$style.divider" />

    <div :class="$style.section">
      <AiSwitchRow
        label="OS 通知"
        sub-label="ウィンドウが非フォーカスのときデスクトップ通知を表示"
        icon="ti-bell"
        :on="osEnabled"
        @toggle="osEnabled = !osEnabled"
      />
      <AiSwitchRow
        label="通知音"
        sub-label="新着通知・チャット・タイムラインの効果音"
        icon="ti-volume"
        :on="soundEnabled"
        @toggle="soundEnabled = !soundEnabled"
      />
      <div :class="[$style.volumeRow, { [$style.volumeDisabled]: !soundEnabled }]">
        <i class="ti ti-volume-2" :class="$style.volumeIcon" />
        <input
          v-model.number="volumePercent"
          type="range"
          min="0"
          max="100"
          step="1"
          :disabled="!soundEnabled"
          :class="$style.volumeSlider"
          aria-label="通知音の音量"
          @change="previewVolume"
        />
        <span :class="$style.volumeValue">{{ volumePercent }}%</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
.content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.divider {
  height: 1px;
  background: var(--nd-divider);
}

.volumeRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 4px 8px 28px;
}

.volumeDisabled {
  opacity: 0.5;
}

.volumeIcon {
  font-size: 14px;
  color: var(--nd-fg);
  opacity: 0.7;
  flex-shrink: 0;
}

.volumeSlider {
  flex: 1;
  min-width: 0;
}

.volumeValue {
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.7;
  min-width: 38px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
