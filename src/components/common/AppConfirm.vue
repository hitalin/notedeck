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
.header {
  padding: 20px 24px 8px;
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

.actions {
  display: flex;
  gap: 6px;
  padding: 8px 16px 16px;
  justify-content: flex-end;
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

.btnOk {
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

.btnDanger {
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
</style>
