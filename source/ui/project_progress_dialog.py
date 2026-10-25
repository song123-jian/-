"""Project progress editor backed by the workbook scoring model."""
from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QComboBox, QCompleter, QFormLayout, QLineEdit, QPlainTextEdit

from services.project_progress_service import DEFAULT_PROJECT_RULES, validate_project

from .dialogs import BaseDialog, button, label


class ProjectProgressDialog(BaseDialog):
    saved = Signal(object)

    def __init__(self, rules=None, record=None, parent=None, customer_profiles=()):
        super().__init__("编辑项目" if record else "新增项目", 700, 720, parent)
        self.rules = rules or DEFAULT_PROJECT_RULES
        self.record = dict(record or {})
        self.customer_profiles = tuple(customer_profiles)
        self.controls = {}
        self.setObjectName("ProjectProgressDialog")
        self.content.insertWidget(0, label("编辑项目" if record else "新增项目", "title"))
        description = label("四类预设值按原规则计算档位；自定义文字保留为项目说明，不参与评分。", "muted")
        description.setWordWrap(True)
        self.content.addWidget(description)

        form = QFormLayout()
        form.setHorizontalSpacing(14)
        form.setVerticalSpacing(10)
        self._line(form, "industry", "行业", "如：汽车零部件")
        self.customer_type = QComboBox()
        self.customer_type.addItem("请选择客户类型", None)
        self.customer_type.addItem("汽车零部件主机厂", "oem")
        self.customer_type.addItem("非汽车客户", "non_auto")
        self.customer_type.setAccessibleName("客户类型")
        form.addRow("客户类型", self.customer_type)
        self.customer_value = QComboBox()
        self.customer_value.setEditable(True)
        self.customer_value.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.customer_value.lineEdit().setPlaceholderText("选择或输入客户战略价值")
        self.customer_value.addItem("请选择客户战略价值", None)
        self.customer_value.setAccessibleName("客户战略价值")
        form.addRow("客户战略价值", self.customer_value)
        self._line(form, "customer_name", "客户名称", "客户或主机厂名称")
        customer_names = sorted({str(item.get("name") or "").strip() for item in self.customer_profiles
                                 if str(item.get("name") or "").strip()}, key=str.casefold)
        if customer_names:
            completer = QCompleter(customer_names, self.controls["customer_name"])
            completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
            completer.setFilterMode(Qt.MatchFlag.MatchContains)
            self.controls["customer_name"].setCompleter(completer)
            completer.activated[str].connect(self.customer_profile_activated)
        self._line(form, "material", "材料", "塑胶粒子改性材料")
        self._line(form, "recommended_grade", "推荐牌号", "推荐牌号")
        self.material_value = QComboBox()
        self.material_value.setEditable(True)
        self.material_value.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.material_value.lineEdit().setPlaceholderText("选择或输入材料价值")
        self.material_value.addItem("请选择材料价值", None)
        for key, entry in self.rules["material_values"].items():
            self.material_value.addItem(entry["label"], key)
        self.material_value.setAccessibleName("材料价值")
        form.addRow("材料价值", self.material_value)
        self._line(form, "color", "颜色", "颜色或留空")
        self._line(form, "competitor", "竞争对手", "竞争对手或留空")
        self._line(form, "product_name", "产品名称", "终端产品名称")
        self.stage = QComboBox()
        self.stage.setEditable(True)
        self.stage.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.stage.lineEdit().setPlaceholderText("选择或输入项目阶段")
        self.stage.addItem("请选择项目阶段", None)
        for key, entry in self.rules["stage_scores"].items():
            self.stage.addItem(entry["label"], int(key))
        self.stage.setAccessibleName("项目阶段")
        form.addRow("项目阶段", self.stage)
        self.competition = QComboBox()
        self.competition.setEditable(True)
        self.competition.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.competition.lineEdit().setPlaceholderText("选择或输入竞争态势")
        self.competition.addItem("请选择竞争态势", None)
        for key, entry in self.rules["competition_scores"].items():
            self.competition.addItem(entry["label"], key)
        self.competition.setAccessibleName("竞争态势")
        form.addRow("竞争态势", self.competition)
        self._line(form, "next_action", "下一步动作", "建议动作，可按实际情况调整")
        self._line(form, "milestone_date", "时间节点", "YYYY-MM-DD，可留空")
        self.notes = QPlainTextEdit()
        self.notes.setMaximumHeight(78)
        self.notes.setAccessibleName("项目备注")
        form.addRow("备注", self.notes)
        self.content.addLayout(form)

        self.customer_type.currentIndexChanged.connect(self._refresh_customer_values)
        self._refresh_customer_values()
        self._load_record()
        cancel = button("取消", self.reject)
        save = button("保存", self.submit, primary=True)
        save.setObjectName("SaveProjectProgress")
        self.footer.addWidget(cancel)
        self.footer.addWidget(save)
        cancel.setDefault(True)

    def customer_profile_activated(self, name):
        profile = next((item for item in self.customer_profiles
                        if str(item.get("name") or "").strip() == str(name).strip()), None)
        if profile and profile.get("industry") and not self.controls["industry"].text().strip():
            self.controls["industry"].setText(profile["industry"])

    def _line(self, form, key, title, placeholder):
        control = QLineEdit()
        control.setAccessibleName(title)
        control.setMaxLength({"industry": 120, "customer_name": 240, "material": 120,
                              "recommended_grade": 120, "color": 120, "competitor": 240,
                              "product_name": 240, "next_action": 1000, "milestone_date": 10}.get(key, 240))
        control.setPlaceholderText(placeholder)
        self.controls[key] = control
        form.addRow(title, control)

    def _refresh_customer_values(self):
        current = self.customer_value.currentData()
        current_text = self.customer_value.currentText()
        customer_type = self.customer_type.currentData()
        self.customer_value.clear()
        self.customer_value.addItem("请选择客户战略价值", None)
        for key, entry in self.rules["customer_values"].items():
            if (customer_type == "non_auto") == (key == "non_auto"):
                self.customer_value.addItem(entry["label"], key)
        index = self.customer_value.findData(current) if current is not None else -1
        if index >= 0:
            self.customer_value.setCurrentIndex(index)
        elif current_text and current_text != "请选择客户战略价值":
            self.customer_value.setEditText(current_text)
        else:
            self.customer_value.setCurrentIndex(0)

    def _load_record(self):
        for key, control in self.controls.items():
            control.setText(str(self.record.get(key) or ""))
        if self.record.get("customer_type"):
            self.customer_type.setCurrentIndex(self.customer_type.findData(self.record["customer_type"]))
        if self.record.get("custom_customer_value"):
            self.customer_value.setEditText(self.record["custom_customer_value"])
        elif self.record.get("customer_value"):
            self.customer_value.setCurrentIndex(self.customer_value.findData(self.record["customer_value"]))
        for name, key in (("material_value", "material_value"), ("stage", "stage_code"), ("competition", "competition")):
            control = getattr(self, name)
            custom_key = {
                "material_value": "custom_material_value", "stage_code": "custom_stage_label",
                "competition": "custom_competition",
            }[key]
            if self.record.get(custom_key):
                control.setEditText(self.record[custom_key])
            elif key in self.record:
                control.setCurrentIndex(control.findData(self.record[key]))
        self.notes.setPlainText(str(self.record.get("notes", "")))

    def submit(self):
        payload = {key: control.text() for key, control in self.controls.items()}
        customer_type = self.customer_type.currentData()
        customer_value, custom_customer_value = self._choice_value(
            self.customer_value, "non_auto" if customer_type == "non_auto" else "oem_t1_regular")
        material_value, custom_material_value = self._choice_value(self.material_value, "general")
        stage_code, custom_stage_label = self._choice_value(self.stage, 1)
        competition, custom_competition = self._choice_value(self.competition, "open")
        payload.update({
            "customer_type": customer_type,
            "customer_value": customer_value,
            "custom_customer_value": custom_customer_value,
            "material_value": material_value,
            "custom_material_value": custom_material_value,
            "stage_code": stage_code,
            "custom_stage_label": custom_stage_label,
            "competition": competition,
            "custom_competition": custom_competition,
            "notes": self.notes.toPlainText().strip(),
            "project_id": self.record.get("project_id"),
            "revision": self.record.get("revision"),
        })
        try:
            checked = validate_project(payload)
        except ValueError as exc:
            self.notice.show_message(exc, True)
            return
        self.saved.emit(checked)
        self.accept()

    @staticmethod
    def _choice_value(control, fallback):
        text = control.currentText().strip()
        index = control.findText(text)
        if index >= 0 and control.itemData(index) is not None:
            return control.itemData(index), ""
        if not text:
            return None, ""
        if (control.currentIndex() >= 0 and control.currentData() is None
                and control.itemText(control.currentIndex()) == text):
            return None, ""
        return fallback, text
