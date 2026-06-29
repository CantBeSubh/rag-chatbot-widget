from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import settings


def get_api_key(request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.removeprefix("Bearer ").strip()
    return get_remote_address(request)


limiter = Limiter(key_func=get_api_key, storage_uri=settings.REDIS_URL)
