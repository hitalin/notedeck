import type { Component } from 'vue'
import type { WidgetType } from '@/stores/deck'

export type WidgetCategory = 'aiscript'

export interface WidgetDefinition {
  type: WidgetType
  label: string
  icon: string
  component: Component
  category?: WidgetCategory
}
