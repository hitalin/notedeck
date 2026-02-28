import type { WidgetType } from '@/stores/deck'
import type { WidgetDefinition } from './types'
import WidgetAiScriptApp from './WidgetAiScriptApp.vue'
import WidgetAiScriptConsole from './WidgetAiScriptConsole.vue'

const widgets: WidgetDefinition[] = [
  {
    type: 'aiscriptConsole',
    label: 'AiScript Console',
    icon: 'ti-terminal-2',
    component: WidgetAiScriptConsole,
  },
  {
    type: 'aiscriptApp',
    label: 'AiScript App',
    icon: 'ti-apps',
    component: WidgetAiScriptApp,
  },
]

export function getWidgetDefinitions(): WidgetDefinition[] {
  return widgets
}

export function getWidgetComponent(
  type: WidgetType,
): WidgetDefinition | undefined {
  return widgets.find((w) => w.type === type)
}
