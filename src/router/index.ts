import { createRouter, createWebHistory } from 'vue-router'

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
  ],
})
