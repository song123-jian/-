"""Compatibility exports for the desktop dialog modules."""
from .backend_dialog import BackendDialog
from .dialog_base import BaseDialog, MoneyValidator, Notice, button, label
from .history_dialog import HistoryDialog
from .import_dialogs import ImportPreviewDialog, PdfImportOptionsDialog
from .quote_dialog import QuoteDialog

__all__ = [
    "BackendDialog",
    "BaseDialog",
    "HistoryDialog",
    "ImportPreviewDialog",
    "MoneyValidator",
    "Notice",
    "PdfImportOptionsDialog",
    "QuoteDialog",
    "button",
    "label",
]
