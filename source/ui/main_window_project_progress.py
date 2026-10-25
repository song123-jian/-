"""Main-window behavior grouped by UI responsibility."""
from __future__ import annotations

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QAbstractItemView,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QMessageBox,
    QProgressBar,
    QScrollArea,
    QSizePolicy,
    QTableWidget,
    QTableWidgetItem,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from domain import today

from .dialogs import button, label
from .project_progress_dialog import ProjectProgressDialog


class MainWindowProjectProgressMixin:
    def build_project_progress_page(self):
        _, layout = self.page_layout("项目进度", "项目台账 · 集中维护客户、阶段、档位、下一步动作和时间节点。")
        self.project_progress_scroll = QScrollArea()
        self.project_progress_scroll.setObjectName("ProjectProgressScroll")
        self.project_progress_scroll.setWidgetResizable(True)
        body = QWidget()
        self.project_body = body
        panels = QVBoxLayout(body)
        panels.setContentsMargins(0, 0, 0, 0)
        panels.setSpacing(0)
        self.build_project_progress_ledger(panels)
        self.project_progress_scroll.setWidget(body)
        layout.addWidget(self.project_progress_scroll, 1)

    def build_project_progress_ledger(self, panels):
        ledger = QFrame()
        self.project_progress_ledger = ledger
        ledger.setObjectName("ProjectProgressLedger")
        ledger.setProperty("role", "panel")
        ledger.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        box = QVBoxLayout(ledger)
        box.setContentsMargins(10, 8, 10, 8)
        box.setSpacing(6)
        toolbar = QHBoxLayout()
        toolbar.addWidget(label("项目台账", "heading"))
        toolbar.addStretch()
        self.project_progress_status = label("尚未读取", "muted")
        toolbar.addWidget(self.project_progress_status)
        self.project_progress_template_button = button("下载模板", self.save_project_progress_template, icon="download")
        self.project_progress_import_button = button("导入项目", self.import_project_progress, icon="upload")
        self.project_progress_export_button = button("导出项目", self.export_project_progress, icon="download")
        self.project_progress_refresh = button("刷新", self.load_project_progress)
        self.project_progress_edit = button("编辑", self.edit_project_progress)
        self.project_progress_new = button("新增项目", self.new_project_progress, primary=True)
        self.project_progress_edit.setEnabled(False)
        self.project_progress_toolbar_buttons = (
            self.project_progress_template_button, self.project_progress_import_button,
            self.project_progress_export_button, self.project_progress_refresh,
            self.project_progress_edit, self.project_progress_new,
        )
        for control in self.project_progress_toolbar_buttons:
            toolbar.addWidget(control)
        box.addLayout(toolbar)
        self.project_progress_table = QTableWidget(0, 9)
        self.project_progress_table.setObjectName("ProjectProgressTable")
        self.project_progress_table.setHorizontalHeaderLabels([
            "客户", "行业", "客户类型", "材料", "推荐牌号", "阶段", "档位", "下一步动作", "时间节点",
        ])
        self.project_progress_table.setEditTriggers(
            QAbstractItemView.EditTrigger.DoubleClicked | QAbstractItemView.EditTrigger.EditKeyPressed
        )
        self.project_progress_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.project_progress_table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.project_progress_table.setAlternatingRowColors(True)
        self.project_progress_table.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.project_progress_table.setMinimumHeight(0)
        self.project_progress_table.setWordWrap(True)
        self.project_progress_table.setTextElideMode(Qt.TextElideMode.ElideNone)
        self.project_progress_table.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.project_progress_table.verticalHeader().hide()
        header = self.project_progress_table.horizontalHeader()
        header.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        for column in range(self.project_progress_table.columnCount()):
            header.setSectionResizeMode(column, QHeaderView.ResizeMode.Stretch)
        header.setMinimumSectionSize(56)
        self.project_progress_table.setHorizontalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.project_progress_table.setVerticalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.project_progress_table.verticalHeader().setDefaultSectionSize(36)
        for column, title in ((0, "客户"), (1, "行业"), (3, "材料"), (4, "推荐牌号"), (7, "下一步动作"), (8, "时间节点")):
            self.project_progress_table.horizontalHeaderItem(column).setToolTip(f"{title}支持双击或按 F2 编辑")
        self.project_progress_table.itemSelectionChanged.connect(self.project_progress_selection_changed)
        self.project_progress_table.itemChanged.connect(self.project_progress_item_changed)
        box.addWidget(self.project_progress_table)
        panels.addWidget(ledger)

    def project_progress_selection_changed(self):
        self.project_progress_edit.setEnabled(bool(self.project_progress_table.selectedItems()))

    def selected_project_progress(self, row=None):
        if row is None:
            rows = self.project_progress_table.selectionModel().selectedRows()
            if not rows:
                return None
            row = rows[0].row()
        item = self.project_progress_table.item(row, 0)
        return item.data(Qt.ItemDataRole.UserRole) if item else None

    def new_project_progress(self):
        dialog = ProjectProgressDialog(self.project_rules, parent=self,
                                       customer_profiles=getattr(self, "customer_profiles", ()))
        dialog.saved.connect(self.save_project_progress)
        self.show_dialog(dialog)

    def edit_project_progress(self, row=None):
        record = self.selected_project_progress(row)
        if not record:
            return
        dialog = ProjectProgressDialog(self.project_rules, record=record, parent=self,
                                       customer_profiles=getattr(self, "customer_profiles", ()))
        dialog.saved.connect(self.save_project_progress)
        self.show_dialog(dialog)

    def save_project_progress(self, record):
        generation = self.context.storage_generation
        self.project_progress_status.setText("正在保存…")
        self.project_progress_table.setEnabled(False)

        def saved(_result):
            self.project_progress_table.setEnabled(True)
            self.project_progress_status.setText("已保存并完成评分")
            self.load_project_progress()

        def failed(exc):
            self.project_progress_table.setEnabled(True)
            self.project_progress_status.setText("保存失败")
            self.failed(exc)
            self.load_project_progress()

        self.tasks.submit(lambda: self.project_progress_service.save(record, generation), saved, failed,
                          generation=generation, write=True)

    def project_progress_item_changed(self, item):
        editable_fields = {
            0: "customer_name", 1: "industry", 3: "material", 4: "recommended_grade",
            7: "next_action", 8: "milestone_date",
        }
        field = editable_fields.get(item.column())
        if field is None:
            return
        record = self.selected_project_progress(item.row())
        if not record:
            return
        self.save_project_progress({**record, field: item.text()})

    def save_project_progress_template(self):
        path = self.save_path("保存项目进度模板", "项目进度导入模板.xlsx", "Excel 工作簿 (*.xlsx)")
        if path:
            self.tasks.submit(lambda: self.project_progress_service.save_template(path), self.file_saved, self.failed,
                              write=True)

    def import_project_progress(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "导入项目进度", self.last_directory(), "项目进度模板 (*.xlsx);;Excel 工作簿 (*.xlsx)")
        if not path:
            return
        self.remember_path(path)
        generation = self.context.storage_generation
        self.project_progress_status.setText("正在校验导入文件…")
        self.tasks.submit(
            lambda: self.project_progress_service.preview_import_file(path, generation, self.project_rules),
            lambda result: self.project_progress_import_previewed(result, generation),
            self.project_progress_import_failed, generation=generation, latest_key="project-progress-import")

    def project_progress_import_previewed(self, result, generation):
        errors = result["errors"]
        projects = result["projects"]
        if errors:
            self.project_progress_status.setText("导入校验失败")
            details = "\n".join(f"第{item['row']}行：{item['message']}" for item in errors[:10])
            if len(errors) > 10:
                details += f"\n另有 {len(errors) - 10} 项错误"
            QMessageBox.warning(self, "项目进度模板有误", details)
            return
        if not projects:
            self.project_progress_status.setText("0 个项目")
            QMessageBox.information(self, "项目进度导入", "模板中没有项目记录。")
            return
        updates = sum(1 for project in projects if project.get("revision") is not None)
        creates = len(projects) - updates
        answer = QMessageBox.question(
            self, "确认导入项目进度",
            f"模板已校验通过，将新增 {creates} 个项目、按版本更新 {updates} 个项目。\n导入后会回读核对，是否继续？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            self.project_progress_status.setText("已取消导入")
            return
        self.project_progress_status.setText("正在导入…")
        self.tasks.submit(
            lambda: self.project_progress_service.import_projects(projects, generation),
            self.project_progress_imported, self.project_progress_import_failed,
            generation=generation, write=True)

    def project_progress_imported(self, result):
        self.project_progress_status.setText(f"已导入 {result['total']} 个项目")
        self.notify(f"项目进度导入完成：新增 {result['created']} 个，更新 {result['updated']} 个。")
        self.load_project_progress()

    def project_progress_import_failed(self, exc):
        self.project_progress_status.setText("导入失败")
        self.failed(exc)

    def export_project_progress(self):
        path = self.save_path("导出项目进度", f"项目进度-{today()}.xlsx", "Excel 工作簿 (*.xlsx)")
        if path:
            generation = self.context.storage_generation
            self.project_progress_status.setText("正在导出…")
            self.tasks.submit(lambda: self.project_progress_service.export_file(path, generation),
                              self.file_saved, self.project_progress_import_failed,
                              generation=generation, write=True)

    def load_project_progress(self):
        if self._closing:
            return
        generation = self.context.storage_generation
        self.project_progress_sequence += 1
        sequence = self.project_progress_sequence
        scroll_state = (
            self.project_progress_scroll.verticalScrollBar().value(),
            self.project_progress_table.verticalScrollBar().value(),
            self.project_progress_table.horizontalScrollBar().value(),
        )
        self.project_progress_status.setText("正在读取…")

        def loaded(result):
            if sequence != self.project_progress_sequence:
                return
            self.project_rules = result["rules"]
            projects = result["projects"]
            self.project_progress_records = projects
            table = self.project_progress_table
            table.blockSignals(True)
            table.setRowCount(len(projects))
            stage_labels = self.project_rules["stage_scores"]
            for row, project in enumerate(projects):
                values = (
                    project["customer_name"], project["industry"],
                    "汽车零部件主机厂" if project["customer_type"] == "oem" else "非汽车客户",
                    project["material"], project["recommended_grade"],
                    project.get("custom_stage_label") or stage_labels[str(project["stage_code"])]["label"],
                    project["tier"], project["next_action"], project["milestone_date"] or "—",
                )
                for column, value in enumerate(values):
                    item = QTableWidgetItem(str(value))
                    if column in {0, 1, 3, 4, 7, 8}:
                        item.setFlags(item.flags() | Qt.ItemFlag.ItemIsEditable)
                        item.setToolTip(f"{value}\n双击或按 F2 编辑")
                    else:
                        item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
                        item.setToolTip(str(value))
                    table.setItem(row, column, item)
                table.item(row, 0).setData(Qt.ItemDataRole.UserRole, project)
            table.resizeRowsToContents()
            table.blockSignals(False)
            self.project_progress_status.setText(f"{len(projects)} 个项目")
            self.project_progress_selection_changed()
            self.load_todos()

            def restore_scroll():
                self.project_progress_scroll.verticalScrollBar().setValue(scroll_state[0])
                table.verticalScrollBar().setValue(scroll_state[1])
                table.horizontalScrollBar().setValue(scroll_state[2])

            QTimer.singleShot(0, restore_scroll)

        def failed(exc):
            if sequence != self.project_progress_sequence:
                return
            self.project_progress_status.setText("读取失败")
            self.failed(exc)

        self.tasks.submit(lambda: self.project_progress_service.list(generation), loaded, failed,
                          generation=generation, latest_key="project-progress")

    def build_project_progress(self):
        """Build the workbook-backed priority model and operating cadence."""
        panel = QFrame()
        panel.setObjectName("ProjectProgressPanel")
        panel.setProperty("role", "projectProgress")
        outer = QVBoxLayout(panel)
        outer.setContentsMargins(14, 12, 14, 12)
        outer.setSpacing(8)

        self.project_progress_toggle = QToolButton()
        self.project_progress_toggle.setObjectName("ProjectProgressDetailsToggle")
        self.project_progress_toggle.setText("改性材料项目进度与最优方案")
        self.project_progress_toggle.setAccessibleName("展开改性材料项目进度与最优方案")
        self.project_progress_toggle.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
        self.project_progress_toggle.setArrowType(Qt.ArrowType.RightArrow)
        self.project_progress_toggle.setCheckable(True)
        outer.addWidget(self.project_progress_toggle)

        self.project_progress_details = QWidget()
        self.project_progress_details.setObjectName("ProjectProgressDetails")
        details = QVBoxLayout(self.project_progress_details)
        details.setContentsMargins(0, 4, 0, 0)
        details.setSpacing(10)
        self.project_progress_details.hide()

        def set_details_expanded(expanded):
            self.project_progress_details.setVisible(expanded)
            self.project_progress_toggle.setArrowType(
                Qt.ArrowType.DownArrow if expanded else Qt.ArrowType.RightArrow
            )
            self.project_progress_toggle.setAccessibleName(
                "收起改性材料项目进度与最优方案" if expanded else "展开改性材料项目进度与最优方案"
            )

        self.project_progress_toggle.toggled.connect(set_details_expanded)
        outer.addWidget(self.project_progress_details)

        header = QHBoxLayout()
        self.project_progress_title = label("改性材料项目进度与最优方案", "heading")
        self.project_progress_title.setObjectName("ProjectProgressTitle")
        self.project_progress_title.setAccessibleName("项目进度标题")
        header.addWidget(self.project_progress_title)
        self.project_progress_badge = label("四维评分 · 满分100", "projectBadge")
        self.project_progress_badge.setAccessibleName("项目优先级评分模型")
        header.addWidget(self.project_progress_badge)
        header.addStretch()
        header.addWidget(label("汽车零部件主机厂 + 非汽车客户", "muted"))
        details.addLayout(header)

        formula = label(
            "优先级得分 = 项目阶段（30） + 客户战略价值（30） + 竞争态势（20） + 材料价值（20）；得分自动对应 A / B / C / D 档位。",
            "projectFormula",
        )
        formula.setWordWrap(True)
        formula.setAccessibleName("项目优先级评分公式")
        details.addWidget(formula)

        summary = QGridLayout()
        summary.setHorizontalSpacing(10)
        summary.setVerticalSpacing(10)
        summary_data = (
            ("项目阶段", "最高30分", "从项目接触到量产"),
            ("客户战略价值", "最高30分", "主机厂与非汽车分层"),
            ("竞争态势", "最高20分", "定点、竞争、失单"),
            ("材料价值", "最高20分", "特种、常规、通用"),
        )
        self.project_metrics = []
        for index, (caption, value, note) in enumerate(summary_data):
            metric = QFrame()
            metric.setProperty("role", "projectMetric")
            box = QVBoxLayout(metric)
            box.setContentsMargins(12, 10, 12, 10)
            box.setSpacing(3)
            box.addWidget(label(caption, "muted"))
            value_label = label(value, "projectMetricValue")
            box.addWidget(value_label)
            note_label = label(note, "muted")
            note_label.setWordWrap(True)
            box.addWidget(note_label)
            self.project_metrics.append(metric)
            summary.addWidget(metric, 0, index)
        details.addLayout(summary)

        portfolio = QFrame()
        portfolio.setObjectName("ProjectPortfolioPlan")
        portfolio.setProperty("role", "projectCallout")
        portfolio_box = QVBoxLayout(portfolio)
        portfolio_box.setContentsMargins(12, 10, 12, 10)
        portfolio_box.setSpacing(4)
        portfolio_box.addWidget(label("产品平台与立项资料", "projectRecommendationTitle"))
        portfolio_text = label(
            "按客户应用场景整理 PP / PE 通用改性、PA / PBT / PC / ABS 工程塑料及增强、增韧、阻燃、耐候等需求方向；"
            "每个项目先确认零件用途、工况、关键物性、颜色、年用量和目标成本，再匹配可供牌号。"
            "统一准备牌号说明、物性检测、SDS、样料批次、报价条件和变更记录；未确认的性能或认证要求先列为验证项。",
            "muted",
        )
        portfolio_text.setWordWrap(True)
        portfolio_box.addWidget(portfolio_text)
        details.addWidget(portfolio)

        stage_title = label("项目阶段模型（阶段得分上限30分）", "heading")
        stage_title.setObjectName("ProjectRoadmapTitle")
        details.addWidget(stage_title)
        stage_grid = QGridLayout()
        stage_grid.setHorizontalSpacing(10)
        stage_grid.setVerticalSpacing(7)
        stage_grid.setColumnStretch(1, 1)
        stage_grid.setColumnMinimumWidth(0, 130)
        stage_grid.setColumnMinimumWidth(2, 64)
        self.project_milestones = []
        stage_data = (
            ("1 · 项目接触", "立项接触 / 信息获取 / 首次报价", 6),
            ("2 · 送样 / 试料", "寄样、试模、小批试样", 12),
            ("3 · 测试 / 认证", "客户测试、第三方认证、合格性验证", 18),
            ("4 · 定点 / 小批", "定点通知、小批量供货", 24),
            ("5 · 量产", "批量供货、持续订单", 30),
        )
        for row, (stage, detail, score) in enumerate(stage_data):
            stage_label = label(stage, "projectStage")
            stage_label.setObjectName(f"ProjectStage{row + 1}")
            detail_label = label(detail, "muted")
            detail_label.setWordWrap(True)
            bar = QProgressBar()
            bar.setObjectName(f"ProjectMilestoneBar{row + 1}")
            bar.setProperty("role", "projectMilestone")
            bar.setRange(0, 100)
            bar.setValue(round(score * 100 / 30))
            bar.setTextVisible(False)
            bar.setAccessibleName(f"{stage}阶段模型占比")
            percent = label(f"{score}/30", "projectPercent")
            percent.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            stage_grid.addWidget(stage_label, row, 0)
            stage_grid.addWidget(detail_label, row, 1)
            stage_grid.addWidget(bar, row, 2)
            stage_grid.addWidget(percent, row, 3)
            self.project_milestones.append({"stage": stage, "bar": bar, "percent": percent, "score": score})
        details.addLayout(stage_grid)

        score_title = label("客户、竞争与材料价值分值", "heading")
        score_title.setObjectName("ProjectScoreTitle")
        details.addWidget(score_title)
        score_grid = QGridLayout()
        score_grid.setHorizontalSpacing(10)
        score_grid.setVerticalSpacing(10)
        self.project_score_cards = {}
        score_data = (
            ("customer", "客户战略价值", ("吉利系 / 战略客户项目 · 30", "主机厂 T1 重要客户 · 22", "主机厂 T1 普通客户 · 15", "非汽车客户 · 8")),
            ("competition", "竞争态势", ("已定点我司 / 独供 · 20", "有竞争未定点 · 12", "竞争激烈暂无优势 · 8", "已失单 / 无望 · 0")),
            ("material", "材料价值", ("特种高价值：长玻纤 / 高增强 / 阻燃 · 20", "常规增强改性 · 12", "低附加值通用料 · 6")),
        )
        for column, (key, title, lines) in enumerate(score_data):
            card = QFrame()
            card.setObjectName(f"ProjectScore{key.title()}")
            card.setProperty("role", "projectScore")
            box = QVBoxLayout(card)
            box.setContentsMargins(14, 11, 14, 11)
            box.setSpacing(4)
            box.addWidget(label(title, "projectScoreTitle"))
            for line in lines:
                item = label(line, "projectList")
                item.setWordWrap(True)
                box.addWidget(item)
            self.project_score_cards[key] = card
            score_grid.addWidget(card, 0, column)
        details.addLayout(score_grid)

        resource_title = label("A / B / C / D 资源分层", "heading")
        resource_title.setObjectName("ProjectResourceTitle")
        details.addWidget(resource_title)
        resource_grid = QGridLayout()
        resource_grid.setHorizontalSpacing(10)
        resource_grid.setVerticalSpacing(10)
        self.project_resource_cards = {}
        resource_data = (
            ("a", "A档 · ≥80分", "销售资源50%", "重点攻坚：样品、测试、认证费用优先；高层对接采购与技术，推动定点到量产。"),
            ("b", "B档 · 65–79分", "销售资源30%", "重点跟进：列出卡点、定人定时限；吉利系用材料报告主动敲门，每周更新进度。"),
            ("c", "C档 · 45–64分", "销售资源20%", "常规推进：按标准流程送样测试、保持联系，出现定点信号立即升级。"),
            ("d", "D档 · <45分", "观察暂缓", "记录线索，不投入主动资源，定期回访；避免平均用力。"),
        )
        for index, (key, title, allocation, detail) in enumerate(resource_data):
            card = QFrame()
            card.setObjectName(f"ProjectResource{key.upper()}")
            card.setProperty("role", "projectResource")
            box = QVBoxLayout(card)
            box.setContentsMargins(14, 11, 14, 11)
            box.setSpacing(4)
            row = QHBoxLayout()
            row.addWidget(label(title, "projectResourceTier"))
            row.addStretch()
            row.addWidget(label(allocation, "projectTag"))
            box.addLayout(row)
            detail_label = label(detail, "projectResourceText")
            detail_label.setWordWrap(True)
            box.addWidget(detail_label)
            self.project_resource_cards[key] = card
            resource_grid.addWidget(card, index // 2, index % 2)
        details.addLayout(resource_grid)

        segment_title = label("客户打法", "heading")
        segment_title.setObjectName("ProjectSegmentTitle")
        details.addWidget(segment_title)
        segments = QGridLayout()
        segments.setHorizontalSpacing(10)
        segments.setVerticalSpacing(10)
        self.project_segment_cards = {}
        segment_data = (
            (
                "oem",
                "汽车零部件主机厂",
                "认证与定点主线",
                "主机厂已不再参与材料指定，供应商备齐对应材料报告即可参与项目；把已定点项目做成样板，主动跟进其他项目。",
                "主攻 A / B 档：送样、第三方测试和认证费用优先，推动定点到量产。",
            ),
            (
                "non_auto",
                "非汽车客户",
                "稳供、快验证、抓回款",
                "用主机厂 A / B 档定点与量产记录做资质背书，切入 3C、婴童、工业高端场景；老客稳供，新客先小批验证再放量。",
                "异常回款客户每周对账催收，把供货与回款挂钩管理。",
            ),
        )
        for column, (key, title, subtitle, detail, action) in enumerate(segment_data):
            card = QFrame()
            card.setObjectName("ProjectSegmentOem" if key == "oem" else "ProjectSegmentNonAuto")
            card.setProperty("role", "projectSegment")
            box = QVBoxLayout(card)
            box.setContentsMargins(14, 12, 14, 12)
            box.setSpacing(5)
            row = QHBoxLayout()
            row.addWidget(label(title, "projectSegmentTitle"))
            row.addStretch()
            row.addWidget(label(subtitle, "projectTag"))
            box.addLayout(row)
            detail_label = label(detail, "projectStep")
            detail_label.setWordWrap(True)
            box.addWidget(detail_label)
            action_label = label("首要动作：" + action, "projectAction")
            action_label.setWordWrap(True)
            box.addWidget(action_label)
            self.project_segment_cards[key] = card
            segments.addWidget(card, 0, column)
        details.addLayout(segments)

        cadence_title = label("周度推进节奏", "heading")
        cadence_title.setObjectName("ProjectCadenceTitle")
        details.addWidget(cadence_title)
        cadence_grid = QGridLayout()
        cadence_grid.setHorizontalSpacing(10)
        cadence_grid.setVerticalSpacing(10)
        self.project_cadence_cards = {}
        cadence_data = (
            ("monday", "周一", "更新项目进度表", "维护阶段代码、客户战略价值、竞争态势、材料价值，得分与档位自动重算。"),
            ("wednesday", "周三", "卡点协调会", "围绕样品、测试、商务三类卡点，明确责任人与完成时限。"),
            ("friday", "周五", "周报 + 回款对账", "输出周报并核对回款；异常客户优先催收，供货与回款联动。"),
        )
        for column, (key, day, title, detail) in enumerate(cadence_data):
            card = QFrame()
            card.setProperty("role", "projectCadence")
            box = QVBoxLayout(card)
            box.setContentsMargins(14, 10, 14, 10)
            box.setSpacing(3)
            box.addWidget(label(day, "projectCadenceDay"))
            box.addWidget(label(title, "projectCadenceTitle"))
            detail_label = label(detail, "muted")
            detail_label.setWordWrap(True)
            box.addWidget(detail_label)
            self.project_cadence_cards[key] = card
            cadence_grid.addWidget(card, 0, column)
        details.addLayout(cadence_grid)

        ledger = QFrame()
        ledger.setObjectName("ProjectLedger")
        ledger.setProperty("role", "projectCallout")
        ledger_box = QVBoxLayout(ledger)
        ledger_box.setContentsMargins(14, 11, 14, 11)
        ledger_box.setSpacing(4)
        ledger_box.addWidget(label("项目台账字段", "projectRecommendationTitle"))
        ledger_text = label(
            "行业 · 客户名称 · 材料 · 推荐牌号 · 材料价值 · 颜色 · 竞争对手 · 产品名称 · 阶段代码 · 下一步动作 · 时间节点 · 备注",
            "muted",
        )
        ledger_text.setWordWrap(True)
        ledger_box.addWidget(ledger_text)
        ledger_box.addWidget(label("每周至少维护一次；阶段得分、总分和 A / B / C / D 档位由模型自动计算，不手工改档。", "projectAction"))
        details.addWidget(ledger)

        execution = QFrame()
        execution.setObjectName("ProjectExecutionChecklist")
        execution.setProperty("role", "projectCallout")
        execution_box = QVBoxLayout(execution)
        execution_box.setContentsMargins(14, 11, 14, 11)
        execution_box.setSpacing(5)
        execution_box.addWidget(label("项目阶段验收与风险闭环", "projectRecommendationTitle"))
        execution_text = label(
            "汽车项目按客户要求依次核对需求澄清、材料匹配、报价与送样、试验/认证、供应商审核、定点/小批和量产准备；"
            "在客户要求时补齐 PPAP、批次追溯和变更控制资料。非汽车项目依次推进样品确认、小批试产、首单交付和复购评估。"
            "每周复核负责人、下一动作与日期、客户反馈、样品/测试结论、报价有效期、预计用量、质量或交付风险及回款状态；"
            "阶段升级以客户书面反馈、测试结论、订单或定点依据为准，卡点明确责任人和关闭日期。",
            "muted",
        )
        execution_text.setWordWrap(True)
        execution_box.addWidget(execution_text)
        details.addWidget(execution)

        recommendation = QFrame()
        recommendation.setObjectName("ProjectRecommendation")
        recommendation.setProperty("role", "projectCallout")
        recommendation_box = QVBoxLayout(recommendation)
        recommendation_box.setContentsMargins(14, 11, 14, 11)
        recommendation_box.setSpacing(4)
        recommendation_box.addWidget(label("最优方案：分层资源 + 双客户打法", "projectRecommendationTitle"))
        self.project_progress_recommendation = label(
            "A 档主机厂项目集中攻认证、定点和样板复制；B 档项目持续清卡点；非汽车客户用主机厂案例做背书，先小批验证再放量，同时把回款管理纳入每周节奏。",
            "muted",
        )
        self.project_progress_recommendation.setWordWrap(True)
        recommendation_box.addWidget(self.project_progress_recommendation)
        recommendation_box.addWidget(label("资源建议：A 档50% · B 档30% · C 档20% · D 档观察暂缓。", "projectAction"))
        details.addWidget(recommendation)
        return panel
