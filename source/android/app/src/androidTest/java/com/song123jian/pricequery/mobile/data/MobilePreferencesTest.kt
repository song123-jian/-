package com.song123jian.pricequery.mobile.data

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class MobilePreferencesTest {
    private val base: Context = ApplicationProvider.getApplicationContext()
    private val store = base.getSharedPreferences("vault_test_${UUID.randomUUID()}", Context.MODE_PRIVATE)
    private val isolatedContext = object : ContextWrapper(base) {
        override fun getApplicationContext(): Context = this
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences = store
    }

    @After
    fun clearOnlyTestPreferences() {
        store.edit().clear().commit()
    }

    @Test
    fun pendingJournalIsEncryptedAndSurvivesReload() {
        val vault = VaultState(pendingSave = PendingQuoteSave(
            ownerId = UUID.randomUUID().toString(),
            requestId = UUID.randomUUID().toString(),
            baseId = null,
            customerRevision = "0",
            draft = QuoteDraft(customer = "SYNTHETIC", grade = "QA", price = "1", effectiveDate = "2026-10-23"),
        ))
        MobilePreferences(isolatedContext).saveVault(vault)
        val ciphertext = store.getString("encrypted_vault", "").orEmpty()
        assertTrue(ciphertext.isNotEmpty())
        assertFalse(ciphertext.contains("SYNTHETIC"))
        assertEquals(vault, MobilePreferences(isolatedContext).loadVault())
    }

    @Test
    fun imageMetadataAndHistoryKeysRemainEncryptedWithOriginalRequest() {
        val requestId = UUID.randomUUID().toString()
        val pending = PendingQuoteSave(
            ownerId = UUID.randomUUID().toString(), requestId = requestId, baseId = "42", customerRevision = "8",
            draft = QuoteDraft(customer = "TEST CUSTOMER", grade = "PA66", color = "黑色", price = "12", taxType = "含税", effectiveDate = "2026-10-23", reason = "补齐缺失字段"),
            imageSource = ImageQuoteSource("private-image-name.png", row = 3),
            historyKeys = listOf(QuoteHistoryKey("42", "a".repeat(64))),
        )
        val preferences = MobilePreferences(isolatedContext)
        preferences.saveVault(VaultState(pendingSave = pending))
        val ciphertext = store.getString("encrypted_vault", "").orEmpty()
        assertFalse(ciphertext.contains("private-image-name"))
        assertFalse(ciphertext.contains("TEST CUSTOMER"))
        val recovered = preferences.loadVault().pendingSave!!
        assertEquals(requestId, recovered.requestId)
        assertEquals(pending, recovered)
    }

    @Test
    fun corruptedJournalRemainsIntactAndReadFails() {
        val corrupted = "AAAA"
        store.edit().putString("encrypted_vault", corrupted).commit()
        val result = runCatching { MobilePreferences(isolatedContext).loadVault() }
        assertEquals("Corrupted journal must not be deleted", corrupted, store.getString("encrypted_vault", null))
        assertTrue("Unreadable journal must fail closed", result.isFailure)
    }

    @Test
    fun mesCredentialsAreEncryptedAndCanBeCleared() {
        val preferences = MobilePreferences(isolatedContext)
        val credentials = MesCredentials("synthetic-mes-user", "synthetic-mes-password")
        preferences.saveMesCredentials(credentials)
        val ciphertext = store.getString("encrypted_mes_credentials", "").orEmpty()
        assertTrue(ciphertext.isNotEmpty())
        assertFalse(ciphertext.contains(credentials.username))
        assertFalse(ciphertext.contains(credentials.password))
        assertEquals(credentials, preferences.loadMesCredentials())
        preferences.clearMesCredentials()
        assertTrue(store.getString("encrypted_mes_credentials", null) == null)
        assertEquals(null, preferences.loadMesCredentials())
    }
}
