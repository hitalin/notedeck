package com.notedeck.desktop

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec

class NotificationWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val CHANNEL_ID = "notedeck_notifications"
        private const val KEYSTORE_ALIAS = "keyring-default"
        private const val PREFS_NAME = "keyring-default"
        private const val KEYRING_DIVIDER = "\uFEFF@\uFEFF"
        private const val KEYRING_SERVICE = "notedeck"
    }

    override suspend fun doWork(): Result {
        val accounts = loadAccountList() ?: return Result.success()
        if (accounts.isEmpty()) return Result.success()

        ensureNotificationChannel()

        for (account in accounts) {
            try {
                val token = getTokenFromKeyStore(account.id) ?: continue
                val unread = checkUnread(account.host, token)
                if (unread > 0) {
                    showNotification(account, unread)
                }
            } catch (_: Exception) {
                // Skip this account on error
            }
        }

        return Result.success()
    }

    private fun loadAccountList(): List<PollAccount>? {
        // Tauri's app_data_dir() maps to Context.getFilesDir() on Android
        val file = File(applicationContext.filesDir, "poll_accounts.json")
        if (!file.exists()) return null

        return try {
            val json = JSONArray(file.readText())
            (0 until json.length()).map { i ->
                val obj = json.getJSONObject(i)
                PollAccount(
                    id = obj.getString("id"),
                    host = obj.getString("host"),
                    username = obj.getString("username"),
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun getTokenFromKeyStore(accountId: String): String? {
        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val key = "$accountId$KEYRING_DIVIDER$KEYRING_SERVICE"
        val encoded = prefs.getString(key, null) ?: return null

        val encrypted = Base64.decode(encoded, Base64.DEFAULT)
        if (encrypted.size < 14) return null // 1 byte IV len + 12 bytes IV + at least 1 byte data

        val ivLen = encrypted[0].toInt() and 0xFF
        if (ivLen != 12 || encrypted.size < 1 + ivLen + 1) return null

        val iv = encrypted.copyOfRange(1, 1 + ivLen)
        val ciphertext = encrypted.copyOfRange(1 + ivLen, encrypted.size)

        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        val secretKey = keyStore.getKey(KEYSTORE_ALIAS, null) ?: return null

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
        val decrypted = cipher.doFinal(ciphertext)

        return String(decrypted, Charsets.UTF_8)
    }

    private fun checkUnread(host: String, token: String): Int {
        val url = URL("https://$host/api/i/notifications")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.doOutput = true

            conn.outputStream.use { out ->
                out.write("""{"i":"$token","limit":1}""".toByteArray())
            }

            if (conn.responseCode != 200) return 0

            val body = conn.inputStream.bufferedReader().readText()
            val arr = JSONArray(body)
            return arr.length()
        } finally {
            conn.disconnect()
        }
    }

    private fun showNotification(account: PollAccount, count: Int) {
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE)
            as NotificationManager

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("@${account.username}@${account.host}")
            .setContentText("新しい通知があります")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        manager.notify(account.id.hashCode(), notification)
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE)
                as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Notifications",
                    NotificationManager.IMPORTANCE_DEFAULT,
                )
                manager.createNotificationChannel(channel)
            }
        }
    }

    private data class PollAccount(
        val id: String,
        val host: String,
        val username: String,
    )
}
