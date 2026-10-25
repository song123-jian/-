package com.song123jian.pricequery.mobile.ui.main

import android.content.Intent
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.*
import androidx.core.content.FileProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.song123jian.pricequery.mobile.data.ExchangeArtifact
import com.song123jian.pricequery.mobile.data.FileExchange
import com.song123jian.pricequery.mobile.theme.Theme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.atomic.AtomicReference
import java.util.UUID

class ArtifactIntentTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun pdfAndWordOpenAndShareIntentsGrantReadableFileUris() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val files = FileExchange(context)
        val cases = listOf(
            Triple("pdf", "application/pdf", "%PDF-1.4\nintent-check\n%%EOF".toByteArray()),
            Triple("docx", WORD_DOCUMENT_MIME, "word-intent-check".toByteArray()),
        )

        val artifacts = cases.map { (extension, mime, bytes) ->
            files.artifact("intent-${UUID.randomUUID()}.$extension", mime, bytes)
        }
        val currentArtifact = mutableStateOf(artifacts.first())
        val launchedChooser = AtomicReference<Intent?>()
        try {
            rule.setContent {
                Theme {
                    ArtifactActionPanel(
                        artifact = currentArtifact.value,
                        onPreview = {},
                        onSave = {},
                        saveEnabled = true,
                        onClear = {},
                        onLaunchChooser = { intent, _ -> launchedChooser.set(intent) },
                    )
                }
            }
            artifacts.zip(cases).forEach { (artifact, testCase) ->
                val bytes = testCase.third
                verifyArtifact(context, artifact, bytes)
                rule.runOnIdle { currentArtifact.value = artifact }
                if (artifact.mime == "application/pdf") rule.onNodeWithText("预览").assertExists()
                else rule.onNodeWithText("预览").assertDoesNotExist()
                rule.onNodeWithTag("artifact-open").assertExists().performClick()
                verifyChooser(launchedChooser.getAndSet(null), Intent.ACTION_VIEW, artifact)
                rule.onNodeWithTag("artifact-share").performClick()
                verifyChooser(launchedChooser.getAndSet(null), Intent.ACTION_SEND, artifact)
            }
        } finally {
            artifacts.forEach { it.file.delete() }
        }
    }

    @Suppress("DEPRECATION")
    private fun verifyArtifact(context: android.content.Context, artifact: ExchangeArtifact, bytes: ByteArray) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", artifact.file)
        val openChooser = artifactOpenChooserIntent(context, artifact)
        val open = openChooser.getParcelableExtra(Intent.EXTRA_INTENT) as? Intent
        assertNotNull(open)
        assertEquals(Intent.ACTION_VIEW, open!!.action)
        assertEquals(artifact.mime, open.type)
        assertEquals(uri, open.data)
        assertTrue(open.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertEquals(uri, open.clipData?.getItemAt(0)?.uri)

        val shareChooser = artifactShareChooserIntent(context, artifact)
        val share = shareChooser.getParcelableExtra(Intent.EXTRA_INTENT) as? Intent
        assertNotNull(share)
        assertEquals(Intent.ACTION_SEND, share!!.action)
        assertEquals(artifact.mime, share.type)
        assertEquals(uri, share.getParcelableExtra(Intent.EXTRA_STREAM))
        assertTrue(share.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertEquals(uri, share.clipData?.getItemAt(0)?.uri)
        assertEquals(bytes.toList(), context.contentResolver.openInputStream(uri)!!.use { it.readBytes().toList() })
    }

    @Suppress("DEPRECATION")
    private fun verifyChooser(chooser: Intent?, action: String, artifact: ExchangeArtifact) {
        assertNotNull(chooser)
        val nested = chooser!!.getParcelableExtra(Intent.EXTRA_INTENT) as? Intent
        assertNotNull(nested)
        assertEquals(action, nested!!.action)
        assertEquals(artifact.mime, nested.type)
    }
}
