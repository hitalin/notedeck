<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { useFocusTrap } from '@/composables/useFocusTrap'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { useConfirm } from '@/stores/confirm'

const { visible: show, options, resolve } = useConfirm()

const { visible, entering, leaving } = useVaporTransition(show, {
  enterDuration: 200,
  leaveDuration: 200,
})

const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef, {
  get initialFocus() {
    return options.value.type === 'danger'
      ? '._button:first-child'
      : '._button:last-child'
  },
  onEscape: () => resolve(false),
})

watch(visible, (v) => {
  if (v) nextTick(activate)
  else deactivate()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="_dialogBackdrop"
      :class="[entering && $style.enter, leaving && $style.leave]"
      @click.self="resolve(false)"
    >
      <div
        ref="dialogRef"
        class="_dialog nd-popup-content"
        :class="[entering && $style.contentEnter, leaving && $style.contentLeave]"
        @click.stop
      >
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
  </Teleport>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;
@use '@/styles/popup';

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
