declare module 'vue-virtual-scroller' {
  import type { DefineComponent } from 'vue'
  export const DynamicScroller: DefineComponent<Record<string, unknown>>
  export const DynamicScrollerItem: DefineComponent<Record<string, unknown>>
}
