"""Regression checks using real OS file locks and separate processes."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE))

from app import instance_lock


class InstanceLockTests(unittest.TestCase):
    def contender(self, folder):
        code = (
            "import sys; from pathlib import Path; "
            "sys.path.insert(0, sys.argv[1]); "
            "from app import instance_lock; "
            "lock = instance_lock(Path(sys.argv[2])); "
            "print('busy' if lock is None else 'acquired'); "
            "lock.close() if lock is not None else None"
        )
        return subprocess.run(
            [sys.executable, "-X", "utf8", "-c", code, str(SOURCE), str(folder)],
            capture_output=True, text=True, encoding="utf-8", timeout=10,
        )

    def test_second_process_reports_busy_without_permission_error(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            owner = instance_lock(folder)
            self.assertIsNotNone(owner)
            try:
                result = self.contender(folder)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), "busy")
            finally:
                owner.close()

    def test_process_can_acquire_after_owner_closes(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            owner = instance_lock(folder)
            self.assertIsNotNone(owner)
            owner.close()
            result = self.contender(folder)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "acquired")

    def test_empty_lock_file_is_initialized_and_reusable(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            path = folder / "instance.lock"
            path.touch()
            owner = instance_lock(folder)
            self.assertIsNotNone(owner)
            owner.close()
            self.assertEqual(path.read_bytes(), b"0")
            result = self.contender(folder)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "acquired")

    def test_lock_file_access_failure_is_not_reported_as_busy(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder / "instance.lock").mkdir()
            with self.assertRaises(OSError):
                instance_lock(folder)


if __name__ == "__main__":
    unittest.main()
