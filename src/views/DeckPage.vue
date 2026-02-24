<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DeckLayout from '@/components/deck/DeckLayout.vue'
import { useAccountsStore } from '@/stores/accounts'

const accountsStore = useAccountsStore()
const router = useRouter()

onMounted(async () => {
  if (!accountsStore.isLoaded) {
    await accountsStore.loadAccounts()
  }
  if (accountsStore.accounts.length === 0) {
    router.push('/login')
  }
})
</script>

<template>
  <div class="deck-page">
    <DeckLayout v-if="accountsStore.isLoaded" />
    <div v-else class="deck-loading">Loading...</div>
  </div>
</template>

<style scoped>
.deck-page {
  height: 100%;
  background: var(--nd-deckBg);
  overflow: hidden;
}

.deck-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}
</style>
