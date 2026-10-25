package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import com.song123jian.pricequery.mobile.BusinessPage
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileScreen
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.MobilePreferences
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test

class DrawerNavigationUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun everyDrawerDestinationOpensItsIndependentPage() {
        val activity = rule.activity
        assertNotNull("Uses the existing session; this test performs no business writes", MobilePreferences(activity).loadVault().session)
        val model = ViewModelProvider(activity, MobileViewModel.Factory(activity))[MobileViewModel::class.java]
        rule.waitUntil(30000) {
            model.state.value.syncMeta != null && !model.state.value.loading
        }

        val destinations = listOf(
            Destination("drawer-quotes", "报价查询", MobileScreen.QUOTES),
            Destination("drawer-new-quote", "新增报价", MobileScreen.EDITOR),
            Destination("drawer-customers", "客户目录", MobileScreen.CUSTOMERS),
            Destination("drawer-data", "数据管理", MobileScreen.TOOLS, BusinessPage.DATA),
            Destination("drawer-import", "导入报价", MobileScreen.TOOLS, BusinessPage.IMPORT),
            Destination("drawer-recycle", "客户回收站", MobileScreen.TOOLS, BusinessPage.RECYCLE),
            Destination("drawer-documents", "报价单与合同", MobileScreen.TOOLS, BusinessPage.DOCUMENTS),
            Destination("drawer-new-quotation", "报价单", MobileScreen.TOOLS, BusinessPage.DOCUMENT_EDITOR, "quotation"),
            Destination("drawer-new-contract", "购销合同", MobileScreen.TOOLS, BusinessPage.DOCUMENT_EDITOR, "contract"),
            Destination("drawer-inventory", "库存与批号备货", MobileScreen.TOOLS, BusinessPage.INVENTORY),
            Destination("drawer-customer-profiles", "客户档案", MobileScreen.TOOLS, BusinessPage.CUSTOMER_PROFILES),
            Destination("drawer-todos", "待办事项", MobileScreen.TOOLS, BusinessPage.TODOS),
            Destination("drawer-project-progress", "项目进度", MobileScreen.TOOLS, BusinessPage.PROJECT_PROGRESS),
            Destination("drawer-backup", "备份与恢复", MobileScreen.TOOLS, BusinessPage.BACKUP),
            Destination("drawer-account", "账户与同步", MobileScreen.ACCOUNT),
        )

        destinations.forEach { destination ->
            rule.runOnUiThread { model.openQuotes() }
            rule.waitUntil(30000) {
                model.state.value.screen == MobileScreen.QUOTES && !model.business.state.value.busy
            }
            rule.onNodeWithContentDescription("打开导航菜单").performClick()
            rule.onNodeWithTag(destination.tag).performScrollTo().performClick()
            try {
                rule.waitUntil(30000) {
                    val state = model.state.value
                    val business = model.business.state.value
                    state.screen == destination.screen &&
                        (destination.businessPage == null || business.page == destination.businessPage) &&
                        (destination.documentKind == null || business.document?.kind == destination.documentKind)
                }
            } catch (failure: ComposeTimeoutException) {
                val state = model.state.value
                val business = model.business.state.value
                throw AssertionError(
                    "${destination.tag}: screen=${state.screen}, page=${business.page}, " +
                        "synced=${state.syncMeta != null}, loading=${state.loading}, busy=${business.busy}",
                    failure,
                )
            }
            rule.onNode(hasText(destination.title) and !isSelectable()).assertIsDisplayed()

            when (destination.tag) {
                "drawer-new-quote" -> {
                    rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
                    rule.waitUntil(10000) { model.state.value.screen == MobileScreen.QUOTES }
                }
                "drawer-new-quotation", "drawer-new-contract" -> {
                    rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
                    rule.onNodeWithText("单据尚未保存").assertExists()
                    rule.onNodeWithText("离开").performClick()
                    rule.waitUntil(10000) {
                        model.business.state.value.page == BusinessPage.DOCUMENTS && !model.business.state.value.busy
                    }
                    rule.onNode(hasText("报价单与合同") and !isSelectable()).assertIsDisplayed()
                }
            }
        }

        rule.runOnUiThread { model.openQuotes() }
    }

    private data class Destination(
        val tag: String,
        val title: String,
        val screen: MobileScreen,
        val businessPage: BusinessPage? = null,
        val documentKind: String? = null,
    )
}
