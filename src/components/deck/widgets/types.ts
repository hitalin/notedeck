import type { Component } from 'vue'
import type { WidgetType } from '@/stores/deck'

export interface WidgetDefinition {
  type: WidgetType
  label: string
  icon: string
  component: Component
}
