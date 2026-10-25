package com.song123jian.pricequery.mobile.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class BusinessParityModelsTest {
    @Test
    fun customerProfileAllowsOptionalFieldsAndEnforcesDesktopLengths() {
        assertEquals(CustomerProfile(), normalizeCustomerProfile(CustomerProfile()))
        assertThrows(IllegalArgumentException::class.java) {
            normalizeCustomerProfile(CustomerProfile(name = "n".repeat(241)))
        }
    }

    @Test
    fun todoKeepsDesktopStatusesAndDueDateFilters() {
        val today = TodoItem(title = "回访客户", dueDate = "2026-10-25", status = "waiting", category = "客户跟进", priority = "high")
        val overdue = TodoItem(title = "送样", dueDate = "2026-10-24", status = "open", category = "送样")
        val completed = TodoItem(title = "已完成", dueDate = "2026-10-20", status = "completed")

        assertEquals(listOf(today), filterTodos(listOf(today, overdue, completed), due = "today", today = "2026-10-25"))
        assertEquals(listOf(overdue), filterTodos(listOf(today, overdue, completed), due = "overdue", today = "2026-10-25"))
        assertEquals(listOf(today), filterTodos(listOf(today, overdue, completed), query = "客户", status = "waiting", category = "客户跟进", priority = "high", today = "2026-10-25"))
        assertFalse(normalizeTodo(today).completed)
        assertTrue(normalizeTodo(completed).completed)
    }

    @Test
    fun todoSearchAndOpenFilterMatchDesktopFieldsAndStatusRules() {
        val notStarted = TodoItem(title = "确认计划", category = "客户自定义", owner = "李工", customerName = "甲客户", projectName = "A项目")
        val inProgress = TodoItem(title = "送样", status = "in_progress", category = "送样", owner = "王工")
        val waiting = TodoItem(title = "等待报告", status = "waiting", category = "测试", owner = "赵工")
        val completed = TodoItem(title = "已完成", status = "completed", category = "回款", owner = "李工")
        val records = listOf(notStarted, inProgress, waiting, completed)

        assertEquals(listOf(notStarted), filterTodos(records, query = "客户自定义"))
        assertEquals(listOf(notStarted, completed), filterTodos(records, query = "李工"))
        assertEquals(listOf(notStarted), filterTodos(records, query = "A项目"))
        assertEquals(listOf(notStarted, inProgress, waiting), filterTodos(records, status = "open"))
        assertEquals(listOf(notStarted), filterTodos(records, status = "not_started"))
    }

    @Test
    fun todoCountsUseAllRecordsAndExcludeCompletedItemsFromOverdue() {
        val records = listOf(
            TodoItem(title = "未开始", dueDate = "2026-10-24"),
            TodoItem(title = "进行中", status = "in_progress"),
            TodoItem(title = "等待反馈", status = "waiting", dueDate = "2026-10-24"),
            TodoItem(title = "已完成", status = "completed", dueDate = "2026-10-20"),
        )

        assertEquals(TodoCounts(open = 3, completed = 1, overdue = 2), countTodos(records, today = "2026-10-25"))
        assertEquals(listOf(records[0], records[2]), filterTodos(records, status = "overdue", today = "2026-10-25"))
        assertEquals(listOf(records[0], records[2], records[1]), filterTodos(records, status = "open", today = "2026-10-25"))
    }

    @Test
    fun todoCustomCategoryOwnerAndLinkedNamesUseDesktopLengthLimits() {
        val item = normalizeTodo(TodoItem(
            title = "  跟进  ", category = "  专项类别  ", owner = "  李工  ", customerName = "  甲客户  ", projectName = "  A项目  ",
        ))
        assertEquals("专项类别", item.category)
        assertEquals("李工", item.owner)
        assertEquals("甲客户", item.customerName)
        assertEquals("A项目", item.projectName)
        assertThrows(IllegalArgumentException::class.java) { normalizeTodo(TodoItem(title = "跟进", category = "类".repeat(61))) }
        assertThrows(IllegalArgumentException::class.java) { normalizeTodo(TodoItem(title = "跟进", owner = "人".repeat(81))) }
        assertThrows(IllegalArgumentException::class.java) { normalizeTodo(TodoItem(title = "跟进", customerName = "客".repeat(241))) }
        assertThrows(IllegalArgumentException::class.java) { normalizeTodo(TodoItem(title = "跟进", projectName = "项".repeat(241))) }
    }

    @Test
    fun customProjectLabelsArePreservedAndDoNotContributeToDesktopScore() {
        val project = normalizeProjectProgress(
            ProjectProgressRecord(
                industry = "汽车零部件",
                customerType = "oem",
                customerName = "示例客户",
                material = "PA66",
                materialValue = "special",
                stageCode = "5",
                customerValue = "geely_strategic",
                competition = "awarded",
                customStageLabel = "客户自定义阶段",
            ),
        )

        val score = scoreProjectProgress(project)
        assertEquals("客户自定义阶段", project.customStageLabel)
        assertEquals(70, score.total)
        assertEquals("B", score.tier)
    }

    @Test
    fun projectRequiresCoreFieldsAndAcceptsCustomScoringValues() {
        assertThrows(IllegalArgumentException::class.java) {
            normalizeProjectProgress(ProjectProgressRecord())
        }
        val custom = normalizeProjectProgress(
            ProjectProgressRecord(
                industry = "其他",
                customerType = "non_auto",
                customerName = "示例客户",
                material = "其他",
                materialValue = "custom-material",
                customMaterialValue = "自定义材料价值",
                stageCode = "2",
                customerValue = "non_auto",
                competition = "open",
            ),
        )
        assertEquals("custom-material", custom.materialValue)
        assertEquals(32, scoreProjectProgress(custom).total)
    }
}
