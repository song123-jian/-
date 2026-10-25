package com.song123jian.pricequery.mobile.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.zip.ZipFile

class BusinessWorkbookTest {
    @Test
    fun desktopProjectTemplateKeepsScoringSheetsAndParsesAsAnEmptyImport() = withWorkbook(projectProgressTemplateXlsx(desktopTemplate())) { file ->
        ZipFile(file).use { workbook ->
            val index = workbook.getInputStream(workbook.getEntry("xl/workbook.xml")).bufferedReader().use { it.readText() }
            assertTrue(index.contains("项目进度表"))
            assertTrue(index.contains("评分模型"))
            assertTrue(index.contains("最优方案"))
            val projectSheet = workbook.getInputStream(workbook.getEntry("xl/worksheets/sheet1.xml")).bufferedReader().use { it.readText() }
            assertTrue(projectSheet.contains("A1:V2"))
        }
        val parsed = parseProjectProgressXlsx(file, file.name)
        assertTrue(parsed.errors.toString(), parsed.errors.isEmpty())
        assertTrue(parsed.projects.isEmpty())
    }

    @Test
    fun projectExportRoundTripsDesktopLabelsIdsAndCustomScoringFields() = withWorkbook(
        projectProgressXlsx(
            listOf(
                normalizeProjectProgress(
                    ProjectProgressRecord(
                        projectId = "2b3067ef-4c39-47c5-9fa9-a160eb807297",
                        revision = 4,
                        industry = "汽车零部件",
                        customerType = "oem",
                        customerName = "测试客户",
                        material = "PA66-GF30",
                        recommendedGrade = "QX-30",
                        materialValue = "special",
                        color = "黑色",
                        competitor = "示例供应商",
                        productName = "工程料",
                        stageCode = "3",
                        customerValue = "oem_t1_important",
                        competition = "open",
                        nextAction = "寄送样品",
                        milestoneDate = "2026-11-02",
                        notes = "保留原文",
                    ),
                ),
            ),
            desktopTemplate(),
        ),
    ) { file ->
        val parsed = parseProjectProgressXlsx(file, file.name)
        assertTrue(parsed.errors.toString(), parsed.errors.isEmpty())
        assertEquals(
            "2b3067ef-4c39-47c5-9fa9-a160eb807297",
            parsed.projects.single().projectId,
        )
        assertEquals(4, parsed.projects.single().revision)
        assertEquals("测试客户", parsed.projects.single().customerName)
        assertEquals("oem_t1_important", parsed.projects.single().customerValue)
        assertEquals("special", parsed.projects.single().materialValue)
        assertEquals("保留原文", parsed.projects.single().notes)
    }

    @Test
    fun customerProfilesAcceptLegacySevenColumnHeaderAndRejectDuplicateIds() {
        val legacy = simpleWorkbook("客户资料", CUSTOMER_PROFILE_XLSX_HEADERS.take(7), listOf(listOf("", "", "旧模板客户", "联系人", "", "", "")))
        withWorkbook(legacy) { file ->
            val parsed = parseCustomerProfilesXlsx(file, file.name)
            assertTrue(parsed.errors.toString(), parsed.errors.isEmpty())
            assertEquals("旧模板客户", parsed.profiles.single().name)
        }

        val id = UUID.fromString("f8f87cac-e39d-4c86-aad1-1ddf89e9b9f8")
        val duplicated = customerProfilesXlsx(
            listOf(
                CustomerProfile(profileId = id.toString(), revision = 1, name = "客户甲"),
                CustomerProfile(profileId = id.toString().uppercase(), revision = 1, name = "客户乙"),
            ),
        )
        withWorkbook(duplicated) { file ->
            val parsed = parseCustomerProfilesXlsx(file, file.name)
            assertEquals(1, parsed.profiles.size)
            assertFalse(parsed.errors.isEmpty())
            assertTrue(parsed.errors.single().contains("客户编号重复"))
        }
    }

    @Test
    fun projectImportRejectsDuplicateHeadersAndMismatchedSystemVersion() {
        val headers = PROJECT_PROGRESS_XLSX_HEADERS.toMutableList().apply { add(1, "客户名称") }
        val duplicated = simpleWorkbook("项目进度表", headers, emptyList())
        withWorkbook(duplicated) { file ->
            assertThrows(IllegalArgumentException::class.java) { parseProjectProgressXlsx(file, file.name) }
        }

        val row = MutableList(22) { "" }.apply {
            this[0] = "汽车零部件"
            this[1] = "客户甲"
            this[2] = "PA66"
            this[4] = "special"
            this[8] = "1"
            this[13] = "汽车零部件主机厂"
            this[14] = "吉利系 / 战略客户项目"
            this[15] = "有竞争未定点"
            this[17] = "2"
        }
        val mismatchedVersion = simpleWorkbook("项目进度表", PROJECT_PROGRESS_XLSX_HEADERS, listOf(row))
        withWorkbook(mismatchedVersion) { file ->
            val parsed = parseProjectProgressXlsx(file, file.name)
            assertTrue(parsed.errors.any { it.contains("数据版本有值时必须填写项目编号") })
            assertTrue(parsed.projects.isEmpty())
        }
    }

    private fun desktopTemplate(): ByteArray {
        val paths = listOf(
            File("src/main/assets/business_templates/project-progress-template.xlsx"),
            File("app/src/main/assets/business_templates/project-progress-template.xlsx"),
            File("../app/src/main/assets/business_templates/project-progress-template.xlsx"),
        )
        return paths.firstOrNull(File::isFile)?.readBytes() ?: error("找不到项目进度模板测试资产")
    }

    private fun withWorkbook(bytes: ByteArray, block: (File) -> Unit) {
        val file = File.createTempFile("mobile-business-workbook-", ".xlsx")
        try {
            file.writeBytes(bytes)
            block(file)
        } finally {
            file.delete()
        }
    }
}
