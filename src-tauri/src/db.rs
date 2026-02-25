use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use crate::error::NoteDeckError;
use crate::models::{Account, NormalizedNote, StoredServer};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, NoteDeckError> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, NoteDeckError> {
        self.conn.lock().map_err(|_| {
            NoteDeckError::Database(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_LOCKED),
                Some("Database lock poisoned".to_string()),
            ))
        })
    }

    fn migrate(&self) -> Result<(), NoteDeckError> {
        let conn = self.lock()?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                host TEXT NOT NULL,
                token TEXT NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                display_name TEXT,
                avatar_url TEXT,
                software TEXT NOT NULL,
                UNIQUE(host, user_id)
            );
            CREATE TABLE IF NOT EXISTS servers (
                host TEXT PRIMARY KEY,
                software TEXT NOT NULL,
                version TEXT NOT NULL,
                features_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes_cache (
                note_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                server_host TEXT NOT NULL,
                created_at TEXT NOT NULL,
                text TEXT,
                note_json TEXT NOT NULL,
                cached_at INTEGER NOT NULL,
                PRIMARY KEY (note_id, account_id)
            );
            CREATE INDEX IF NOT EXISTS idx_notes_cache_timeline
                ON notes_cache (account_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_notes_cache_text
                ON notes_cache (account_id, text)
                WHERE text IS NOT NULL;",
        )?;
        Ok(())
    }

    // --- Accounts ---

    pub fn load_accounts(&self) -> Result<Vec<Account>, NoteDeckError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, host, token, user_id, username, display_name, avatar_url, software
             FROM accounts ORDER BY rowid",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                host: row.get(1)?,
                token: row.get(2)?,
                user_id: row.get(3)?,
                username: row.get(4)?,
                display_name: row.get(5)?,
                avatar_url: row.get(6)?,
                software: row.get(7)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn upsert_account(&self, account: &Account) -> Result<(), NoteDeckError> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO accounts (id, host, token, user_id, username, display_name, avatar_url, software)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(host, user_id) DO UPDATE SET
                 token = excluded.token,
                 username = excluded.username,
                 display_name = excluded.display_name,
                 avatar_url = excluded.avatar_url,
                 software = excluded.software",
            params![
                account.id,
                account.host,
                account.token,
                account.user_id,
                account.username,
                account.display_name,
                account.avatar_url,
                account.software,
            ],
        )?;
        Ok(())
    }

    pub fn get_account(&self, id: &str) -> Result<Option<Account>, NoteDeckError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT id, host, token, user_id, username, display_name, avatar_url, software
             FROM accounts WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Account {
                id: row.get(0)?,
                host: row.get(1)?,
                token: row.get(2)?,
                user_id: row.get(3)?,
                username: row.get(4)?,
                display_name: row.get(5)?,
                avatar_url: row.get(6)?,
                software: row.get(7)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn delete_account(&self, id: &str) -> Result<(), NoteDeckError> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
        Ok(())
    }

    // --- Servers ---

    pub fn load_servers(&self) -> Result<Vec<StoredServer>, NoteDeckError> {
        let conn = self.lock()?;
        let mut stmt =
            conn.prepare("SELECT host, software, version, features_json, updated_at FROM servers")?;
        let rows = stmt.query_map([], |row| {
            Ok(StoredServer {
                host: row.get(0)?,
                software: row.get(1)?,
                version: row.get(2)?,
                features_json: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn get_server(&self, host: &str) -> Result<Option<StoredServer>, NoteDeckError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT host, software, version, features_json, updated_at FROM servers WHERE host = ?1",
        )?;
        let mut rows = stmt.query_map(params![host], |row| {
            Ok(StoredServer {
                host: row.get(0)?,
                software: row.get(1)?,
                version: row.get(2)?,
                features_json: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    // --- Notes cache ---

    pub fn cache_notes(&self, notes: &[NormalizedNote]) -> Result<(), NoteDeckError> {
        let conn = self.lock()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let mut stmt = conn.prepare_cached(
            "INSERT INTO notes_cache (note_id, account_id, server_host, created_at, text, note_json, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(note_id, account_id) DO UPDATE SET
                 note_json = excluded.note_json,
                 cached_at = excluded.cached_at",
        )?;
        for note in notes {
            let json = serde_json::to_string(note).unwrap_or_default();
            stmt.execute(params![
                note.id,
                note.account_id,
                note.server_host,
                note.created_at,
                note.text,
                json,
                now,
            ])?;
        }
        Ok(())
    }

    pub fn cache_note(&self, note: &NormalizedNote) -> Result<(), NoteDeckError> {
        self.cache_notes(&[note.clone()])
    }

    pub fn upsert_server(&self, server: &StoredServer) -> Result<(), NoteDeckError> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO servers (host, software, version, features_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(host) DO UPDATE SET
                 software = excluded.software,
                 version = excluded.version,
                 features_json = excluded.features_json,
                 updated_at = excluded.updated_at",
            params![
                server.host,
                server.software,
                server.version,
                server.features_json,
                server.updated_at,
            ],
        )?;
        Ok(())
    }
}
