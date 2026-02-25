<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>Page not found</p>
    <button class="_buttonPrimary back-btn" @click="router.push('/')">
      Back to Home
    </button>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--nd-fg);
  gap: 8px;
}

.not-found h1 {
  font-size: 3em;
  margin: 0;
  opacity: 0.3;
}

.not-found p {
  margin: 0;
  opacity: 0.5;
}

.back-btn {
  margin-top: 16px;
  padding: 8px 24px;
  border-radius: 8px;
}
</style>
