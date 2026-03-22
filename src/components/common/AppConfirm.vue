<script setup lang="ts">
import { useConfirm } from '@/stores/confirm'

const { visible, options, resolve } = useConfirm()
</script>

<template>
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="visible" class="_dialogBackdrop" @click.self="resolve(false)">
        <div class="_dialog nd-popup-content" @click.stop>
          <div :class="$style.header">
            <div :class="$style.title">{{ options.title }}</div>
          </div>
          <div :class="$style.body">
            <p :class="$style.message">{{ options.message }}</p>
          </div>
          <div :class="$style.actions">
            <button v-if="!options.hideCancel" class="_button" :class="$style.btnCancel" @click="resolve(false)">
              {{ options.cancelLabel || 'キャンセル' }}
            </button>
            <button
              class="_button"
              :class="options.type === 'danger' ? $style.btnDanger : $style.btnOk"
              @click="resolve(true)"
            >
              {{ options.okLabel || 'OK' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.header {
  padding: 16px 20px 4px;
  text-align: center;
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

.actions {
  display: flex;
  gap: 6px;
  padding: 0 16px 16px;
  justify-content: center;
}

.btnCancel { @include btn-secondary; }
.btnOk { @include btn-primary; }
.btnDanger { @include btn-danger; }
</style>
