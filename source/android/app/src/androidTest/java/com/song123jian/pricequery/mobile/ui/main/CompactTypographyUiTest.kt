package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.material3.Typography as MaterialTypography
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.lifecycle.ViewModelProvider
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.theme.Typography
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class CompactTypographyUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun allFifteenThemeRolesAreOneSpSmaller() {
        fun roles(t: MaterialTypography) = listOf(
            t.displayLarge, t.displayMedium, t.displaySmall,
            t.headlineLarge, t.headlineMedium, t.headlineSmall,
            t.titleLarge, t.titleMedium, t.titleSmall,
            t.bodyLarge, t.bodyMedium, t.bodySmall,
            t.labelLarge, t.labelMedium, t.labelSmall,
        )
        roles(MaterialTypography()).zip(roles(Typography)).forEachIndexed { index, (before, after) ->
            assertEquals("Font role $index", before.fontSize.value - 1f, after.fontSize.value, 0f)
            assertEquals("Line height $index", before.lineHeight.value - 1f, after.lineHeight.value, 0f)
            assertEquals("Letter spacing $index", 0f, after.letterSpacing.value, 0f)
            assertTrue("Readable minimum", after.fontSize.value >= 10f)
        }
    }

    @Test
    fun launcherNameAndRenderedCustomerActionsUseCompactTheme() {
        val activity = rule.activity
        assertEquals("工作", activity.applicationInfo.loadLabel(activity.packageManager).toString())
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncMeta != null && !model.state.value.loading }
        assertTextSize(hasText("报价查询") and !isSelectable(), 21f)
        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-customers").performScrollTo().performClick()
        assertTextSize(hasText("新增客户"), 13f)
        rule.onNodeWithTag("customer-add").assertIsEnabled().performClick()
        rule.onNodeWithContentDescription("返回").assertIsDisplayed().performClick()
        rule.onNodeWithTag("customer-add").assertIsDisplayed()
    }

    private fun assertTextSize(matcher: SemanticsMatcher, expected: Float) {
        val layouts = mutableListOf<TextLayoutResult>()
        rule.onNode(matcher and !hasAnyAncestor(isSelectable()), useUnmergedTree = true).performSemanticsAction(SemanticsActions.GetTextLayoutResult) {
            assertTrue(it(layouts))
        }
        assertEquals(1, layouts.size)
        assertEquals(expected, layouts.single().layoutInput.style.fontSize.value, 0f)
        val layout = layouts.single()
        val measurements = "text=${layout.layoutInput.text}; size=${layout.size}; " +
            "constraints=${layout.layoutInput.constraints}; widthOverflow=${layout.didOverflowWidth}; " +
            "heightOverflow=${layout.didOverflowHeight}; intrinsic=${layout.multiParagraph.maxIntrinsicWidth}; " +
            "paragraphWidth=${layout.multiParagraph.width}; paragraphHeight=${layout.multiParagraph.height}; " +
            "lineBounds=${(0 until layout.lineCount).map { layout.getLineLeft(it) to layout.getLineRight(it) }}; " +
            "glyphBounds=${layout.layoutInput.text.indices.map { layout.getBoundingBox(it) }}; " +
            "lineHeight=${layout.layoutInput.style.lineHeight}; " +
            "lines=${layout.lineCount}; fontSize=${layout.layoutInput.style.fontSize}"
        // Compose may retain a wider paragraph container than its measured text box.
        assertFalse("Text height must fit: $measurements", layout.didOverflowHeight)
        assertFalse("All lines must be laid out: $measurements", layout.multiParagraph.didExceedMaxLines)
        repeat(layout.lineCount) { line ->
            assertFalse("No line may be ellipsized: $measurements", layout.isLineEllipsized(line))
            assertTrue("Line must fit: $measurements",
                layout.getLineLeft(line) >= 0f && layout.getLineRight(line) <= layout.size.width)
        }
        layout.layoutInput.text.indices.forEach { offset ->
            val bounds = layout.getBoundingBox(offset)
            assertTrue("Every glyph must fit: $measurements",
                bounds.left >= 0f && bounds.right <= layout.size.width &&
                    bounds.top >= 0f && bounds.bottom <= layout.size.height)
        }
    }
}
