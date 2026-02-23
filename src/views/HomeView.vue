<script setup lang="ts">
import { useAccountsStore } from '@/stores/accounts'

const accounts = useAccountsStore()
</script>

<template>
  <div class="home">
    <h1>notedeck</h1>
    <p v-if="accounts.accounts.length === 0">
      <router-link to="/login">Add an account to get started</router-link>
    </p>
    <router-link v-else to="/timeline">Open Timeline</router-link>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 1rem;
}
</style>
