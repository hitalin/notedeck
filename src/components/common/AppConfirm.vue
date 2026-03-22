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
            <button :class="$style.btnCancel" @click="resolve(false)">
              {{ options.cancelLabel || 'キャンセル' }}
            </button>
            <button
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

.btnOk {
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

.btnDanger {
  padding: 6px 20px;
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
</style>
