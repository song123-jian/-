package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.song123jian.pricequery.mobile.MainActivity
import org.junit.Rule
import org.junit.Test

class MainScreenTest {
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun actualLoginScreenRejectsInvalidProjectBeforeNetwork() {
        composeRule.onNodeWithText("工作").assertExists()
        composeRule.onNodeWithText("Publishable key").assertExists()
        composeRule.onNodeWithText("用户名").assertExists()
        composeRule.onNodeWithText("密码").assertExists()
        composeRule.onNodeWithText("Supabase 项目地址").performTextReplacement("invalid")
        composeRule.onNodeWithText("登录").performClick()
        composeRule.onNodeWithText("项目地址须为 https://项目编号.supabase.co").assertExists()
    }
}
