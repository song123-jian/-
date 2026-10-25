package com.song123jian.pricequery.mobile.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
  primary = Color(0xFF8FD3C5),
  onPrimary = Color(0xFF00382F),
  primaryContainer = Color(0xFF145248),
  onPrimaryContainer = Color(0xFFB2F0E3),
  secondary = Color(0xFFBBCBC5),
  onSecondary = Color(0xFF26332F),
  secondaryContainer = Color(0xFF374843),
  onSecondaryContainer = Color(0xFFD7E7E0),
  tertiary = Color(0xFFFFB68C),
  onTertiary = Color(0xFF522300),
  tertiaryContainer = Color(0xFF703A20),
  onTertiaryContainer = Color(0xFFFFDBCA),
  background = Color(0xFF101918),
  onBackground = Color(0xFFDDE8E4),
  surface = Color(0xFF17211F),
  onSurface = Color(0xFFDDE8E4),
  surfaceVariant = Color(0xFF384541),
  onSurfaceVariant = Color(0xFFBAC9C3),
  outline = Color(0xFF84938D),
  outlineVariant = Color(0xFF4A5954),
)

private val LightColorScheme =
  lightColorScheme(
    primary = Color(0xFF176B63),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFC9EDE5),
    onPrimaryContainer = Color(0xFF00201B),
    secondary = Color(0xFF536B66),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDCE8E4),
    onSecondaryContainer = Color(0xFF101F1C),
    tertiary = Color(0xFF9A4F2F),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFDBCA),
    onTertiaryContainer = Color(0xFF351000),
    background = Color(0xFFF5F7F6),
    onBackground = Color(0xFF18211F),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF18211F),
    surfaceVariant = Color(0xFFE6ECEA),
    onSurfaceVariant = Color(0xFF3F4D49),
    outline = Color(0xFF6F7D78),
    outlineVariant = Color(0xFFC1CCC7),
  )

@Composable
fun Theme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  // Dynamic color is available on Android 12+
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  val colorScheme =
    if (darkTheme) DarkColorScheme else LightColorScheme

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
