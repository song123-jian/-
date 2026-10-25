package com.song123jian.pricequery.mobile.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.concurrent.CancellationException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class VaultState(
    val session: MobileSession? = null,
    val pendingSave: PendingQuoteSave? = null,
    val pendingBusiness: JSONObject? = null,
)

internal fun mesCredentialPersistenceWarning(rememberCredentials: Boolean, persist: () -> Unit): String? = try {
    persist()
    null
} catch (cancelled: CancellationException) {
    throw cancelled
} catch (failure: Exception) {
    val action = if (rememberCredentials) "本机加密凭据保存" else "本机保存凭据清除"
    "MES已登录，但${action}失败：${failure.message ?: "请重试"}"
}

class MobilePreferences(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("mobile_client_v1", Context.MODE_PRIVATE)
    private val vaultAlias = "com.song123jian.pricequery.mobile.session.v1"
    private val mesCredentialsAlias = "com.song123jian.pricequery.mobile.mes-credentials.v1"
    private val bundledConfig = runCatching {
        val json = context.assets.open("account_config.json").bufferedReader(Charsets.UTF_8).use { JSONObject(it.readText()) }
        MobileConfig(json.getString("url"), json.getString("publishable_key"))
    }.getOrDefault(MobileConfig(DEFAULT_PROJECT_URL, ""))

    fun config(): MobileConfig = MobileConfig(
        projectUrl = preferences.getString("project_url", bundledConfig.projectUrl) ?: bundledConfig.projectUrl,
        publishableKey = preferences.getString("publishable_key", bundledConfig.publishableKey) ?: bundledConfig.publishableKey,
    )

    fun saveConfig(config: MobileConfig) {
        preferences.edit()
            .putString("project_url", config.projectUrl.trim().trimEnd('/'))
            .putString("publishable_key", config.publishableKey.trim())
            .apply()
    }

    @Synchronized
    fun loadMesCredentials(): MesCredentials? {
        val encoded = preferences.getString("encrypted_mes_credentials", null) ?: return null
        return try {
            val packed = Base64.decode(encoded, Base64.NO_WRAP)
            require(packed.size > 12)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(mesCredentialsAlias), GCMParameterSpec(128, packed.copyOfRange(0, 12)))
            val root = JSONObject(String(cipher.doFinal(packed.copyOfRange(12, packed.size)), Charsets.UTF_8))
            MesCredentials(root.getString("username"), root.getString("password"))
        } catch (_: Exception) {
            throw IllegalStateException("本机加密的 MES 登录信息无法读取；原记录保持不变。")
        }
    }

    @Synchronized
    fun saveMesCredentials(credentials: MesCredentials) {
        require(credentials.username.isNotBlank() && credentials.password.isNotEmpty())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(mesCredentialsAlias))
        val cleartext = JSONObject().put("username", credentials.username).put("password", credentials.password)
            .toString().toByteArray(Charsets.UTF_8)
        val saved = preferences.edit()
            .putString("encrypted_mes_credentials", Base64.encodeToString(cipher.iv + cipher.doFinal(cleartext), Base64.NO_WRAP))
            .commit()
        check(saved) { "无法保存加密的 MES 登录信息" }
    }

    @Synchronized
    fun clearMesCredentials() {
        check(preferences.edit().remove("encrypted_mes_credentials").commit()) { "无法清除已保存的 MES 登录信息" }
    }

    @Synchronized
    fun loadVault(): VaultState {
        val encoded = preferences.getString("encrypted_vault", null) ?: return VaultState()
        return try {
            val packed = Base64.decode(encoded, Base64.NO_WRAP)
            require(packed.size > 12)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, packed.copyOfRange(0, 12)))
            val cleartext = cipher.doFinal(packed.copyOfRange(12, packed.size))
            decodeVault(String(cleartext, Charsets.UTF_8))
        } catch (_: Exception) {
            throw IllegalStateException("本机加密记录无法读取。为防止重复提交，已停止保存；原记录保持不变。")
        }
    }

    @Synchronized
    fun saveVault(value: VaultState) {
        if (value.session == null && value.pendingSave == null && value.pendingBusiness == null) {
            check(preferences.edit().remove("encrypted_vault").commit()) { "无法保存本机登录状态" }
            return
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ciphertext = cipher.doFinal(encodeVault(value).toByteArray(Charsets.UTF_8))
        val saved = preferences.edit()
            .putString("encrypted_vault", Base64.encodeToString(cipher.iv + ciphertext, Base64.NO_WRAP))
            .commit()
        check(saved) { "无法持久保存请求，请检查设备存储空间" }
    }

    private fun secretKey(alias: String = vaultAlias): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encodeVault(value: VaultState): String {
        val root = JSONObject()
        value.pendingBusiness?.let { root.put("pending_business", it) }
        value.session?.let {
            root.put("session", JSONObject()
                .put("user_id", it.userId)
                .put("username", it.username)
                .put("access_token", it.accessToken)
                .put("refresh_token", it.refreshToken)
                .put("expires_at", it.expiresAt))
        }
        value.pendingSave?.let { pending ->
            val draft = pending.draft
            root.put("pending_save", JSONObject()
                .put("owner_id", pending.ownerId)
                .put("request_id", pending.requestId)
                .put("base_id", pending.baseId ?: JSONObject.NULL)
                .put("customer_revision", pending.customerRevision)
                .put("draft", JSONObject()
                    .put("customer", draft.customer)
                    .put("grade", draft.grade)
                    .put("material", draft.material)
                    .put("color", draft.color)
                    .put("price", draft.price)
                    .put("tax_type", draft.taxType)
                    .put("effective_date", draft.effectiveDate)
                    .put("note", draft.note)
                    .put("reason", draft.reason)))
            pending.imageSource?.let { source ->
                root.getJSONObject("pending_save").put("image_source", JSONObject()
                    .put("file", source.file).put("sheet", source.sheet).put("row", source.row))
            }
            if (pending.historyKeys.isNotEmpty()) {
                root.getJSONObject("pending_save").put("history_keys", JSONArray(pending.historyKeys.map { key ->
                    JSONObject().put("id", key.id).put("import_key", key.importKey ?: JSONObject.NULL)
                }))
            }
        }
        return root.toString()
    }

    private fun decodeVault(text: String): VaultState {
        val root = JSONObject(text)
        val session = root.optJSONObject("session")?.let {
            MobileSession(
                userId = it.getString("user_id"),
                username = it.getString("username"),
                accessToken = it.getString("access_token"),
                refreshToken = it.getString("refresh_token"),
                expiresAt = it.getLong("expires_at"),
            )
        }
        val pending = root.optJSONObject("pending_save")?.let {
            val draft = it.getJSONObject("draft")
            val baseId = if (it.isNull("base_id")) null else it.getString("base_id")
            PendingQuoteSave(
                ownerId = it.getString("owner_id"),
                requestId = it.getString("request_id"),
                baseId = baseId,
                customerRevision = it.getString("customer_revision"),
                draft = QuoteDraft(
                    customer = draft.getString("customer"),
                    grade = draft.getString("grade"),
                    material = draft.getString("material"),
                    color = draft.getString("color"),
                    price = draft.getString("price"),
                    taxType = draft.getString("tax_type"),
                    effectiveDate = draft.getString("effective_date"),
                    note = draft.getString("note"),
                    reason = draft.getString("reason"),
                ),
                imageSource = it.optJSONObject("image_source")?.let { source ->
                    ImageQuoteSource(source.getString("file"), source.optString("sheet", "图片识别"), source.optInt("row"))
                },
                historyKeys = it.optJSONArray("history_keys")?.let { keys ->
                    List(keys.length()) { index ->
                        val key = keys.getJSONObject(index)
                        QuoteHistoryKey(key.getString("id"), if (key.isNull("import_key")) null else key.getString("import_key"))
                    }
                }.orEmpty(),
            )
        }
        return VaultState(session, pending, root.optJSONObject("pending_business"))
    }
}
