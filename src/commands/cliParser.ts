export interface CliCommand {
  name: CliCommandName
  args: string
}

const CLI_COMMANDS = [
  'post',
  'search',
  'tl',
  'notifications',
  'note',
  'delete',
  'accounts',
] as const

export type CliCommandName = (typeof CLI_COMMANDS)[number]

export interface CliCommandMeta {
  usage: string
  description: string
  icon: string
  needsArgs: boolean
}

export const CLI_COMMAND_META: Record<CliCommandName, CliCommandMeta> = {
  post: {
    usage: 'post <text>',
    description: 'Post a note',
    icon: 'send',
    needsArgs: true,
  },
  search: {
    usage: 'search <query>',
    description: 'Search notes',
    icon: 'search',
    needsArgs: true,
  },
  tl: {
    usage: 'tl [home|local|social|global]',
    description: 'Open timeline',
    icon: 'list',
    needsArgs: false,
  },
  notifications: {
    usage: 'notifications',
    description: 'Open notifications',
    icon: 'bell',
    needsArgs: false,
  },
  note: {
    usage: 'note <id>',
    description: 'Show note detail',
    icon: 'note',
    needsArgs: true,
  },
  delete: {
    usage: 'delete <id>',
    description: 'Delete a note',
    icon: 'trash',
    needsArgs: true,
  },
  accounts: {
    usage: 'accounts',
    description: 'Show account menu',
    icon: 'users',
    needsArgs: false,
  },
}

export function parseCliInput(input: string): CliCommand | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const spaceIdx = trimmed.indexOf(' ')
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1)

  if (!(CLI_COMMANDS as readonly string[]).includes(name)) return null
  return { name: name as CliCommandName, args }
}
