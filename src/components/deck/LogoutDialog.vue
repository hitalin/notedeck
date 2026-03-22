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
            <button class="_button" :class="$style.btnCancel" @click="emit('cancel')">
              キャンセル
            </button>
            <button class="_button" :class="$style.btnDelete" @click="emit('delete-all')">
              {{ isGuest ? '削除' : 'すべて削除' }}
            </button>
            <button v-if="!isGuest" class="_button" :class="$style.btnKeep" @click="emit('keep-data')">
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
  justify-content: center;
  gap: 8px;
  padding: 16px 20px 4px;
}

.icon {
  font-size: 1.2em;
  color: var(--nd-fg);
  opacity: 0.7;
}

.title {
  font-size: 1em;
  font-weight: bold;
  color: var(--nd-fg);
}

.body {
  padding: 4px 20px 12px;
  text-align: center;
}

.message {
  margin: 0;
  color: var(--nd-fg);
  font-size: 0.85em;
  line-height: 1.5;
  opacity: 0.8;
}

.hint {
  margin: 4px 0 0;
  color: var(--nd-fg);
  font-size: 0.8em;
  opacity: 0.5;
}

.actions {
  display: flex;
  gap: 6px;
  padding: 0 16px 16px;
  justify-content: center;
}

.btnCancel {
  padding: 8px 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.8em;
  font-weight: bold;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.btnDelete {
  padding: 8px 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love);
  color: #fff;
  font-size: 0.8em;
  font-weight: bold;
  transition: background var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    background: color-mix(in srgb, var(--nd-love) 80%, black);
  }
}

.btnKeep {
  padding: 8px 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.8em;
  font-weight: bold;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-accentDarken);
  }
}
</style>
