"""Small immutable token comparison for foreground desktop polling."""
from dataclasses import dataclass


@dataclass
class SyncState:
    token: tuple | None = None
    failures: int = 0

    @staticmethod
    def token_from(meta):
        return tuple(meta[key] for key in ('schema_epoch', 'owner_id', 'data_version', 'business_date'))

    def observe(self, meta):
        new = self.token_from(meta)
        changed = new != self.token
        self.failures = 0
        return changed

    def applied(self, meta):
        self.token = self.token_from(meta)
        self.failures = 0

    def failed(self):
        self.failures += 1
        return min(60_000, 15_000 * 2 ** min(self.failures, 2))
