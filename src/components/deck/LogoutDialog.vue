<script setup lang="ts">
const props = defineProps<{
  show: boolean
  isGuest?: boolean
}>()

const emit = defineEmits<{
  'keep-data': []
  'delete-all': []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="show" class="_dialogBackdrop" @click="emit('cancel')">
        <div class="_dialog nd-popup-content" @click.stop>
          <div :class="$style.header">
            <i :class="[$style.icon, isGuest ? 'ti ti-user-off' : 'ti ti-logout']" />
            <div :class="$style.title">{{ isGuest ? 'ゲストを削除' : 'ログアウト' }}</div>
          </div>

          <div :class="$style.body">
            <p :class="$style.message">
              {{ isGuest ? 'このゲストアカウントを削除しますか？' : 'ローカルデータをこのデバイスに残しますか？' }}
            </p>
            <p v-if="!isGuest" :class="$style.hint">
              残したデータはオフラインで閲覧できます。
            </p>
          </div>

          <div :class="$style.actions">
            <button :class="$style.btnCancel" @click="emit('cancel')">
              キャンセル
            </button>
            <button :class="$style.btnDelete" @click="emit('delete-all')">
              {{ isGuest ? '削除' : 'すべて削除' }}
            </button>
            <button v-if="!isGuest" :class="$style.btnKeep" @click="emit('keep-data')">
              データを残す
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" module>
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 24px 8px;
}

.icon {
  font-size: 1.3em;
  color: var(--nd-fg);
  opacity: 0.7;
}

.title {
  font-size: 1.1em;
  font-weight: bold;
  color: var(--nd-fg);
}

.body {
  padding: 8px 24px 16px;
}

.message {
  margin: 0;
  color: var(--nd-fg);
  font-size: 0.9em;
  line-height: 1.5;
}

.hint {
  margin: 6px 0 0;
  color: var(--nd-fg);
  font-size: 0.8em;
  opacity: 0.6;
}

.actions {
  display: flex;
  gap: 8px;
  padding: 8px 16px 16px;
  justify-content: flex-end;
}

.btnCancel {
  padding: 6px 14px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-md);
  background: none;
  color: var(--nd-fg);
  font-size: 0.85em;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.btnDelete {
  padding: 6px 14px;
  border: none;
  border-radius: var(--nd-radius-md);
  background: var(--nd-love);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }
}

.btnKeep {
  padding: 6px 20px;
  border: none;
  border-radius: var(--nd-radius-md);
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }
}
</style>
