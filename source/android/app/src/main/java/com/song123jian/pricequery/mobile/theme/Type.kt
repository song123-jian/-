package com.song123jian.pricequery.mobile.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp

private fun TextStyle.compact() = copy(
    fontSize = (fontSize.value - 1f).sp,
    lineHeight = (lineHeight.value - 1f).sp,
    letterSpacing = 0.sp,
)

val Typography = Typography().run {
    copy(
        displayLarge = displayLarge.compact(),
        displayMedium = displayMedium.compact(),
        displaySmall = displaySmall.compact(),
        headlineLarge = headlineLarge.compact(),
        headlineMedium = headlineMedium.compact(),
        headlineSmall = headlineSmall.compact(),
        titleLarge = titleLarge.compact(),
        titleMedium = titleMedium.compact(),
        titleSmall = titleSmall.compact(),
        bodyLarge = bodyLarge.compact(),
        bodyMedium = bodyMedium.compact(),
        bodySmall = bodySmall.compact(),
        labelLarge = labelLarge.compact(),
        labelMedium = labelMedium.compact(),
        labelSmall = labelSmall.compact(),
    )
}
