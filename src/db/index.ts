import type { Table } from 'dexie'
import Dexie from 'dexie'
import type { ServerSoftware } from '@/adapters/types'

export interface StoredAccount {
  id: string
  host: string
  token: string
  userId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  software: ServerSoftware
}

export interface StoredServer {
  host: string
  software: ServerSoftware
  version: string
  featuresJson: string
  updatedAt: number
}

class NotedeckDB extends Dexie {
  accounts!: Table<StoredAccount, string>
  servers!: Table<StoredServer, string>

  constructor() {
    super('notedeck')

    this.version(1).stores({
      accounts: 'id, host, userId',
      servers: 'host',
    })
  }
}

export const db = new NotedeckDB()
