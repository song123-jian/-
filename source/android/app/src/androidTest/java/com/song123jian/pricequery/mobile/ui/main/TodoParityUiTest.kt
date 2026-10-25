package com.song123jian.pricequery.mobile.ui.main

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import com.song123jian.pricequery.mobile.BusinessController
import com.song123jian.pricequery.mobile.BusinessPage
import com.song123jian.pricequery.mobile.BusinessState
import com.song123jian.pricequery.mobile.MainActivity
import com.song123jian.pricequery.mobile.MobileScreen
import com.song123jian.pricequery.mobile.MobileViewModel
import com.song123jian.pricequery.mobile.data.CustomerProfile
import com.song123jian.pricequery.mobile.data.MobilePreferences
import com.song123jian.pricequery.mobile.data.ProjectProgressRecord
import com.song123jian.pricequery.mobile.data.TodoItem
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate

class TodoParityUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun todoPageSearchesDesktopFieldsShowsGlobalCountsAndEditsEntityLinksInMemory() {
        val model = syncedModel()
        val business = model.business
        @Suppress("UNCHECKED_CAST")
        val businessState = BusinessController::class.java.getDeclaredField("mutableState").run {
            isAccessible = true
            get(business) as MutableStateFlow<BusinessState>
        }

        rule.onNodeWithContentDescription("打开导航菜单").performClick()
        rule.onNodeWithTag("drawer-todos").performScrollTo().performClick()
        rule.waitUntil(30000) { business.state.value.page == BusinessPage.TODOS && !business.state.value.busy }
        val original = businessState.value
        val profile = CustomerProfile(
            profileId = "550e8400-e29b-41d4-a716-446655440000",
            name = "仅内存客户",
        )
        val project = ProjectProgressRecord(
            projectId = "550e8400-e29b-41d4-a716-446655440001",
            customerName = profile.name,
            productName = "仅内存产品",
            material = "PA66",
        )
        val todos = listOf(
            TodoItem(
                id = "550e8400-e29b-41d4-a716-446655440002",
                title = "确认计划",
                category = "客户自定义",
                owner = "李工",
                dueDate = LocalDate.now().minusDays(1).toString(),
            ),
            TodoItem(title = "送样", status = "in_progress", dueDate = LocalDate.now().minusDays(1).toString()),
            TodoItem(title = "等待报告", status = "waiting"),
            TodoItem(title = "已完成", status = "completed", dueDate = LocalDate.now().minusDays(5).toString()),
        )

        try {
            rule.runOnUiThread {
                businessState.value = original.copy(
                    todos = todos,
                    customerProfiles = listOf(profile),
                    projects = listOf(project),
                    todoDraft = null,
                    busy = false,
                )
            }
            rule.waitForIdle()
            rule.onNodeWithText("3 项未完成 · 1 项已完成 · 2 项逾期").assertIsDisplayed()

            rule.onNodeWithText("搜索待办、客户或项目").performTextReplacement("客户自定义")
            rule.onNodeWithText("确认计划").assertIsDisplayed()
            rule.onNodeWithText("搜索待办、客户或项目").performTextReplacement("李工")
            rule.onNodeWithText("确认计划").assertIsDisplayed()
            rule.onNodeWithText("搜索待办、客户或项目").performTextReplacement("确认计划")
            rule.onNode(hasText("确认计划") and !hasSetTextAction()).assertIsDisplayed()
            rule.onAllNodesWithText("编辑")[0].performClick()
            rule.onNodeWithText("类别").performTextReplacement("临时自定义类别")
            rule.onNodeWithText("负责人").performTextReplacement("测试负责人")
            rule.onNodeWithText("关联客户：未关联").performScrollTo().performClick()
            rule.onNodeWithText(profile.name).performClick()
            rule.onNodeWithText("关联项目：未关联").performScrollTo().performClick()
            rule.onNodeWithText("仅内存客户 · 仅内存产品 · PA66").performClick()

            assertEquals("临时自定义类别", business.state.value.todoDraft?.category)
            assertEquals("测试负责人", business.state.value.todoDraft?.owner)
            assertEquals(profile.profileId, business.state.value.todoDraft?.customerId)
            assertEquals(profile.name, business.state.value.todoDraft?.customerName)
            assertEquals(project.projectId, business.state.value.todoDraft?.projectId)
            assertEquals("仅内存客户 · 仅内存产品 · PA66", business.state.value.todoDraft?.projectName)
            rule.onNodeWithText("取消").performClick()
            rule.waitUntil(10000) { business.state.value.todoDraft == null }
            assertEquals(todos, business.state.value.todos)
            assertNull(MobilePreferences(rule.activity).loadVault().pendingBusiness)
            assertNull(MobilePreferences(rule.activity).loadVault().pendingSave)
        } finally {
            rule.runOnUiThread {
                businessState.value = original
                model.openQuotes()
            }
        }
    }

    private fun syncedModel(): MobileViewModel {
        val vault = MobilePreferences(rule.activity).loadVault()
        assertNotNull("Requires the existing authorized session", vault.session)
        assertNull("Never replaces an unresolved save", vault.pendingSave)
        assertNull("Never replaces an unresolved business request", vault.pendingBusiness)
        val model = ViewModelProvider(rule.activity, MobileViewModel.Factory(rule.activity))[MobileViewModel::class.java]
        rule.waitUntil(40000) { model.state.value.syncMeta != null && !model.state.value.loading }
        return model
    }
}
