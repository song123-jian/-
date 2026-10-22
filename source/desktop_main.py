"""Native Windows entry point. No browser, HTTP server or online UI assets."""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from PySide6.QtCore import QTimer
from PySide6.QtGui import QGuiApplication, QIcon
from PySide6.QtWidgets import QApplication, QMessageBox

from domain import APP_ID, APP_NAME, VERSION
from instance import DesktopIPC, instance_lock, ipc_name, wake_existing
from services.app_context import AppContext
from services.backend_service import create_store
from services.price_service import atomic_bytes
from ui.main_window import MainWindow
from ui.theme_tokens import apply_theme


def main(argv=None):
    parser = argparse.ArgumentParser(description=f"{APP_NAME}原生桌面版")
    parser.add_argument("--data-dir", type=Path, help="独立数据目录，默认 EXE 同级 data")
    parser.add_argument("--smoke-test", type=Path, help="在指定隔离数据目录运行打包验收并输出报告")
    parser.add_argument('--account-qa',type=Path,help='在显式隔离目录进行个人账号实际窗口验收')
    parser.add_argument('--registration-qa',type=Path,help='在显式隔离目录进行注册实际窗口验收')
    parser.add_argument('--mobile-qa',type=Path,help='在显式隔离目录进行手机与电脑联合验收')
    args = parser.parse_args(argv)
    root = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
    folder = (args.data_dir or root / "data").resolve()
    if args.smoke_test and (args.data_dir is None or folder == (root / "data").resolve()):
        parser.error("打包验收必须通过 --data-dir 指定隔离目录，禁止使用正式 data")
    if args.account_qa and (args.data_dir is None or folder==(root/'data').resolve()):
        parser.error('账号验收必须使用显式隔离数据目录')
    if args.registration_qa and (args.data_dir is None or folder==(root/'data').resolve()):
        parser.error('注册验收必须使用显式隔离数据目录')
    if args.mobile_qa and (args.data_dir is None or folder==(root/'data').resolve()):
        parser.error('手机联合验收必须使用显式隔离数据目录')
    folder.mkdir(parents=True, exist_ok=True)
    app = QApplication.instance() or QApplication([sys.argv[0]])
    app.setApplicationName(APP_NAME)
    app.setOrganizationName("PriceManager")
    app.setApplicationVersion(VERSION)
    apply_theme(app)
    app.setWindowIcon(QIcon(":/app-icon.svg"))
    logging.basicConfig(level=logging.INFO, handlers=[RotatingFileHandler(folder / "app.log", maxBytes=1024 * 1024, backupCount=2, encoding="utf-8")], format="%(asctime)s %(levelname)s %(message)s")
    lock_file = instance_lock(folder)
    if lock_file is None:
        if wake_existing(folder):
            return 0
        QMessageBox.information(None, APP_NAME, "此数据目录已被打开，或旧版程序仍在运行。请先退出旧版后重试。")
        return 1
    ipc = None
    try:
        if not args.smoke_test:
            from ui.account_controller import AccountController

            controller = AccountController(app,folder)
            if args.account_qa:
                from account_qa import AccountAcceptance
                account_runner = AccountAcceptance(controller,args.account_qa)
            if args.registration_qa:
                from registration_qa import RegistrationAcceptance
                registration_runner = RegistrationAcceptance(controller,args.registration_qa)
            if args.mobile_qa:
                from mobile_qa import MobileJointAcceptance
                controller.mobile_runner = MobileJointAcceptance(controller,args.mobile_qa)
            ipc = DesktopIPC(folder,controller.wake)
            atomic_bytes(folder / 'runtime.json',json.dumps({'app':APP_ID,'pid':os.getpid(),'version':VERSION,
                         'data_dir':str(folder),'ipc':ipc_name(folder),'interface':'Qt Widgets','accounts':15}).encode('utf-8'))
            exit_code=app.exec()
            if args.account_qa and account_runner.report.get('status')!='passed':
                return 1
            if args.registration_qa and registration_runner.report.get('status')!='passed':
                return 1
            return exit_code
        context = AppContext(create_store(folder), folder)
        window = MainWindow(context)

        def wake():
            window.showNormal()
            window.raise_()
            window.activateWindow()

        ipc = DesktopIPC(folder, wake)
        runtime = {"app": APP_ID, "pid": os.getpid(), "version": VERSION,
                   "data_dir": str(folder), "ipc": ipc_name(folder), "interface": "Qt Widgets"}
        atomic_bytes(folder / "runtime.json", json.dumps(runtime, ensure_ascii=False, indent=2).encode("utf-8"))
        window.show()
        available = QGuiApplication.primaryScreen().availableGeometry()
        window.resize(min(window.width(), available.width()), min(window.height(), available.height()))
        logging.info("Started desktop version=%s backend=%s", VERSION, context.store.backend)
        if args.smoke_test:
            from business_document_qa import PackagedBusinessDocumentSmoke
            from core_import_qa import PackagedCoreImportSmoke
            from customer_import_qa import PackagedCustomerImportSmoke
            from customer_lifecycle_qa import PackagedCustomerLifecycleSmoke
            from desktop_shell_qa import PackagedDesktopShellSmoke
            from dropdown_qa import PackagedDropdownSmoke
            from image_quote_qa import PackagedImageQuoteSmoke
            from import_date_qa import PackagedImportDateSmoke
            from inventory_display_qa import PackagedInventoryDisplaySmoke
            from inventory_qa import PackagedInventorySmoke, PackagedInventoryTransportSmoke
            from operation_sync_qa import PackagedOperationSyncSmoke
            from optimization_qa import PackagedOptimizationSmoke
            from qa_runner import PackagedCloudSmoke, PackagedPdfSmoke, PackagedSmoke
            from quote_workflow_qa import PackagedQuoteWorkflowSmoke
            from table_grid_qa import PackagedTableGridSmoke
            runner_class = (PackagedOperationSyncSmoke if (folder / "acceptance-operation-sync.json").is_file() else
                            PackagedInventoryTransportSmoke if (folder / "acceptance-inventory-transport.json").is_file() else
                            PackagedDesktopShellSmoke if (folder / "acceptance-desktop-shell.json").is_file() else
                            PackagedBusinessDocumentSmoke if (folder / "acceptance-documents.json").is_file() else
                            PackagedOptimizationSmoke if (folder / "acceptance-optimization.json").is_file() else
                            PackagedTableGridSmoke if (folder / "acceptance-table-grid.json").is_file() else
                            PackagedInventoryDisplaySmoke if (folder / "acceptance-inventory-display.json").is_file() else
                            PackagedInventorySmoke if (folder / "acceptance-inventory.json").is_file() else
                            PackagedQuoteWorkflowSmoke if (folder / "acceptance-workflow.json").is_file() else
                            PackagedImportDateSmoke if (folder / "acceptance-import-date.json").is_file() else
                            PackagedImageQuoteSmoke if (folder / "acceptance-image.json").is_file() else
                            PackagedCoreImportSmoke if (folder / "acceptance-core-import.json").is_file() else
                            PackagedDropdownSmoke if (folder / "acceptance-dropdown.json").is_file() else
                            PackagedCustomerLifecycleSmoke if (folder / "acceptance-lifecycle.json").is_file() else
                            PackagedCustomerImportSmoke if (folder / "acceptance-customer.csv").is_file() else
                            PackagedCloudSmoke if context.store.backend == "supabase" else
                            PackagedPdfSmoke if (folder / "acceptance.pdf").is_file() else PackagedSmoke)
            runner = runner_class(window, args.smoke_test.resolve())
            QTimer.singleShot(100, runner.start)
        exit_code = app.exec()
        return runner.exit_code if args.smoke_test else exit_code
    finally:
        if ipc:
            ipc.close()
        lock_file.close()
        try:
            path = folder / "runtime.json"
            if json.loads(path.read_text(encoding="utf-8")).get("pid") == os.getpid():
                path.unlink()
        except (OSError, ValueError):
            pass
        logging.info("Stopped desktop")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logging.error("Startup failed (%s)", type(exc).__name__)
        if QApplication.instance():
            QMessageBox.critical(None, f"{APP_NAME}启动失败", f"{exc}\n请检查数据目录权限及 data/app.log。")
        raise
