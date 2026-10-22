"""Cross-process byte lock. IPC helpers are imported lazily."""
import hashlib
import os
from pathlib import Path


def instance_lock(folder):
    lock_file = open(folder / "instance.lock", "a+b")
    lock_file.seek(0)
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        lock_file.close()
        return None
    # Windows blocks reads of another process's locked byte, even before locking.
    try:
        lock_file.seek(0)
        if lock_file.read(1) == b"":
            lock_file.write(b"0")
            lock_file.flush()
    except Exception:
        lock_file.close()
        raise
    return lock_file


def ipc_name(folder):
    canonical = os.path.normcase(str(Path(folder).resolve()))
    return "price-manager-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:40]


def wake_existing(folder, timeout=4000):
    from PySide6.QtCore import QElapsedTimer
    from PySide6.QtNetwork import QLocalSocket
    elapsed = QElapsedTimer()
    elapsed.start()
    while elapsed.elapsed() < timeout:
        socket = QLocalSocket()
        socket.connectToServer(ipc_name(folder))
        if socket.waitForConnected(min(250, timeout - elapsed.elapsed())):
            socket.write(b"wake\n")
            socket.flush()
            socket.waitForBytesWritten(500)
            acknowledged = socket.waitForReadyRead(1000) and bytes(socket.readAll()) == b"ok\n"
            socket.disconnectFromServer()
            return bool(acknowledged)
    return False


class DesktopIPC:
    def __init__(self, folder, wake_callback):
        from PySide6.QtNetwork import QLocalServer
        self.server = QLocalServer()
        self.server.setSocketOptions(QLocalServer.SocketOption.UserAccessOption)
        self.name = ipc_name(folder)
        self.wake_callback = wake_callback
        self.sockets = set()
        self.buffers = {}
        # Only instantiate this after the caller has acquired the file lock.
        QLocalServer.removeServer(self.name)
        if not self.server.listen(self.name):
            raise RuntimeError("无法建立窗口唤醒通道，请重启后再试")
        self.server.newConnection.connect(self.connected)

    def connected(self):
        from PySide6.QtCore import QTimer
        while self.server.hasPendingConnections():
            socket = self.server.nextPendingConnection()
            self.sockets.add(socket)
            self.buffers[socket] = bytearray()
            socket.readyRead.connect(lambda s=socket: self.read(s))
            socket.disconnected.connect(lambda s=socket: self.disconnected(s))
            QTimer.singleShot(2000, socket, socket.disconnectFromServer)
            if socket.bytesAvailable():
                self.read(socket)

    def read(self, socket):
        data = self.buffers.get(socket)
        if data is None:
            return
        data.extend(bytes(socket.readAll()))
        if bytes(data) == b"wake\n":
            self.wake_callback()
            socket.write(b"ok\n")
            socket.flush()
            socket.disconnectFromServer()
        elif len(data) >= 5 or b"\n" in data:
            socket.disconnectFromServer()

    def disconnected(self, socket):
        self.sockets.discard(socket)
        self.buffers.pop(socket, None)
        socket.deleteLater()

    def close(self):
        for socket in tuple(self.sockets):
            socket.disconnectFromServer()
        self.server.close()


