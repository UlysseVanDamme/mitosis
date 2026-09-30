"""Demo authentication: fixed demo users, passcodes from env, HMAC-signed bearer tokens.

Tokens are `<b64url(json payload)>.<b64url(hmac-sha256)>`. The payload only carries the username,
purpose, expiry and a random id; role and access are always resolved server-side from DEMO_USERS.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

from .events import STATE_DIR

log = logging.getLogger("mitosis.auth")

ROLES = ("admin", "expert", "consultant", "client", "public")
FULL_ACCESS = "consultant"  # the access string swarm.can_see treats as "all internal + public"


@dataclass(frozen=True)
class User:
    username: str
    display_name: str
    role: str
    access: str  # passed to swarm.can_see: "consultant" (all), "client:<name>", "public"

    @property
    def full_access(self) -> bool:
        return self.access == FULL_ACCESS

    def public(self) -> dict:
        return asdict(self)


DEMO_USERS: dict[str, User] = {u.username: u for u in [
    User("desk", "Knowledge desk", "admin", FULL_ACCESS),
    User("jan", "Jan Peeters", "expert", FULL_ACCESS),
    User("sofie", "Sofie", "consultant", FULL_ACCESS),
    User("vandessel", "HR admin, Brouwerij Van Dessel", "client", "client:Brouwerij Van Dessel"),
    User("guest", "Guest", "public", "public"),
]}

PASSCODE_FILE = STATE_DIR / "demo_passcodes.json"


class AuthError(Exception):
    """Invalid, expired or revoked credentials. Message is safe to show."""


class RateLimited(Exception):
    def __init__(self, retry_after: int):
        super().__init__("too many attempts")
        self.retry_after = max(1, int(retry_after))


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _digest(s: str) -> bytes:
    return hashlib.sha256(s.encode("utf-8", "surrogatepass")).digest()


def load_passcodes(path: Path = PASSCODE_FILE) -> dict[str, str]:
    """MITOSIS_PASSCODES (JSON) wins; else reuse/generate backend/state/demo_passcodes.json (chmod 600)."""
    try:
        from .llm import _load_env
        _load_env()
    except Exception:  # noqa: BLE001
        pass
    raw = os.environ.get("MITOSIS_PASSCODES")
    if raw:
        try:
            pcs = json.loads(raw)
            if isinstance(pcs, dict):
                return {str(k): str(v) for k, v in pcs.items() if k in DEMO_USERS and v}
        except json.JSONDecodeError:
            log.error("MITOSIS_PASSCODES is not valid JSON; generating random passcodes instead")
    try:
        pcs = json.loads(path.read_text())
        if isinstance(pcs, dict) and all(u in pcs for u in DEMO_USERS):
            log.info("demo passcodes loaded from %s", path)
            return {u: str(pcs[u]) for u in DEMO_USERS}
    except (OSError, json.JSONDecodeError):
        pass
    pcs = {u: secrets.token_urlsafe(9) for u in DEMO_USERS}
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(pcs, f, indent=2)
        os.chmod(path, 0o600)
        log.info("generated random demo passcodes, see %s", path)
    except OSError:
        log.warning("could not write %s; passcodes exist only in this process", path)
    return pcs


class Auth:
    def __init__(self, passcodes: Optional[dict[str, str]] = None, secret: Optional[bytes] = None,
                 ttl_s: Optional[int] = None, max_failures: int = 5, lockout_s: int = 300,
                 ip_limit_per_min: int = 30, user_ceiling: int = 50):
        self.passcodes = passcodes if passcodes is not None else load_passcodes()
        env_secret = os.environ.get("MITOSIS_SECRET")
        self.secret = secret or (env_secret.encode() if env_secret and len(env_secret) >= 32 else secrets.token_bytes(32))
        self.ttl_s = ttl_s or int(os.environ.get("MITOSIS_TOKEN_TTL", str(8 * 3600)))
        self.max_failures = max_failures
        self.lockout_s = lockout_s
        self.ip_limit = ip_limit_per_min
        self.user_ceiling = user_ceiling  # global per-username failures (all IPs) before a hard lock
        self._ufail: dict[str, deque] = defaultdict(deque)
        self._fail: dict[str, deque] = defaultdict(deque)
        self._ip: dict[str, deque] = defaultdict(deque)
        self._revoked: dict[str, float] = {}  # jti -> exp
        self._lock = threading.Lock()
        self._dummy = _digest(secrets.token_urlsafe(16))

    # ------------------------------------------------------------ login
    def login(self, username: str, passcode: str, ip: str = "?") -> tuple[str, User]:
        now = time.time()
        with self._lock:
            self._evict(now)
            hits = self._ip[ip]
            while hits and hits[0] < now - 60:
                hits.popleft()
            if len(hits) >= self.ip_limit:
                raise RateLimited(60 - (now - hits[0]))
            hits.append(now)
            key = f"{username}|{ip}"  # lockout per (username, ip): failures elsewhere never lock you out
            for fails, limit in ((self._fail.get(key), self.max_failures), (self._ufail.get(username), self.user_ceiling)):
                while fails and fails[0] < now - self.lockout_s:
                    fails.popleft()
                if fails and len(fails) >= limit:
                    raise RateLimited(self.lockout_s - (now - fails[0]))
        expected = self.passcodes.get(username)
        # constant-time compare on fixed-length digests; unknown users still pay for a compare
        ok = hmac.compare_digest(_digest(passcode), _digest(expected) if expected else self._dummy)
        user = DEMO_USERS.get(username)
        if not (ok and expected and user):
            if user is not None:  # unknown usernames only count against the per-IP limit (bounded maps)
                with self._lock:
                    self._fail[key].append(now)
                    self._ufail[username].append(now)
            raise AuthError("invalid username or passcode")
        with self._lock:
            self._fail.pop(key, None)
        return self.issue(user), user

    def _evict(self, now: float) -> None:
        """Drop empty/expired buckets so spoofed IPs or usernames cannot grow memory without bound."""
        if len(self._ip) + len(self._fail) < 1000:
            return
        for d, win in ((self._ip, 60), (self._fail, self.lockout_s)):
            for k in [k for k, q in d.items() if not q or q[-1] < now - win]:
                d.pop(k, None)

    # ------------------------------------------------------------ tokens
    def issue(self, user: User, purpose: str = "api", ttl_s: Optional[int] = None,
              parent: Optional[str] = None) -> str:
        now = int(time.time())
        payload = {"sub": user.username, "pur": purpose, "iat": now, "exp": now + (ttl_s or self.ttl_s),
                   "jti": secrets.token_urlsafe(8)}
        if parent:
            payload["par"] = parent  # SSE token minted from this session: revoked with it on logout
        body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
        sig = _b64e(hmac.new(self.secret, body.encode(), hashlib.sha256).digest())
        return f"{body}.{sig}"

    def _payload(self, token: str) -> dict:
        if not token or len(token) > 1024 or token.count(".") != 1:
            raise AuthError("invalid token")
        body, sig = token.split(".")
        want = _b64e(hmac.new(self.secret, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, want):
            raise AuthError("invalid token")
        try:
            p = json.loads(_b64d(body))
        except (ValueError, json.JSONDecodeError):
            raise AuthError("invalid token") from None
        if not isinstance(p, dict) or int(p.get("exp", 0)) < time.time():
            raise AuthError("token expired")
        if p.get("jti") in self._revoked or (p.get("par") and p["par"] in self._revoked):
            raise AuthError("token revoked")
        return p

    def verify(self, token: str, purposes: tuple[str, ...] = ("api",)) -> User:
        p = self._payload(token)
        if p.get("pur") not in purposes:
            raise AuthError("invalid token")
        user = DEMO_USERS.get(p.get("sub", ""))
        if user is None or user.username not in self.passcodes:
            raise AuthError("invalid token")
        return user

    def revoke(self, token: str) -> None:
        try:
            p = self._payload(token)
        except AuthError:
            return
        now = time.time()
        with self._lock:
            self._revoked = {j: e for j, e in self._revoked.items() if e > now}
            self._revoked[p["jti"]] = float(p["exp"])


class RateLimiter:
    """Sliding-window limiter per key (in memory, per process)."""

    def __init__(self, limit: int, window_s: float = 60.0):
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.time()
        with self._lock:
            h = self._hits[key]
            while h and h[0] < now - self.window:
                h.popleft()
            if len(h) >= self.limit:
                raise RateLimited(self.window - (now - h[0]))
            h.append(now)
