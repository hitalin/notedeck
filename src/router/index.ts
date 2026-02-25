import { createRouter, createWebHistory } from 'vue-router'
import { useAccountsStore } from '@/stores/accounts'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'deck',
      component: () => import('@/views/DeckPage.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/note/:accountId/:noteId',
      name: 'note-detail',
      component: () => import('@/views/NoteDetailPage.vue'),
      props: true,
    },
    {
      path: '/user/:accountId/:userId',
      name: 'user-profile',
      component: () => import('@/views/UserProfilePage.vue'),
      props: true,
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundPage.vue'),
      meta: { public: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const accountsStore = useAccountsStore()
  if (!accountsStore.isLoaded) {
    await accountsStore.loadAccounts()
  }

  const isPublic = to.meta.public === true
  const hasAccounts = accountsStore.accounts.length > 0

  if (!isPublic && !hasAccounts) {
    return { name: 'login' }
  }
  if (to.name === 'login' && hasAccounts) {
    return { name: 'deck' }
  }
})
