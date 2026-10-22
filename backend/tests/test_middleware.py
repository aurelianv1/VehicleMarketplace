"""Rate limiting, protecția CSRF și antetele de securitate, pe o aplicație mică de test
(fără baza de date)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.middleware import OriginCheckMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware

ALLOWED = "http://localhost:5173"


def build_app(limit: int = 1000) -> FastAPI:
    app = FastAPI()

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"ok": "da"}

    @app.post("/actiune")
    def actiune() -> dict[str, str]:
        return {"ok": "da"}

    @app.get("/uploads/poza.jpg")
    def poza() -> dict[str, str]:
        return {"ok": "da"}

    app.add_middleware(OriginCheckMiddleware, allowed_origins=[ALLOWED])
    app.add_middleware(RateLimitMiddleware, limit=limit)
    app.add_middleware(SecurityHeadersMiddleware, hsts=True)
    return app


@pytest.fixture
def client():
    return TestClient(build_app(limit=5))


def test_requests_under_the_limit_pass_and_show_remaining(client):
    response = client.get("/ping")
    assert response.status_code == 200
    assert response.headers["x-ratelimit-limit"] == "5"
    assert response.headers["x-ratelimit-remaining"] == "4"


def test_requests_over_the_limit_get_429_with_retry_after(client):
    for _ in range(5):
        assert client.get("/ping").status_code == 200
    blocked = client.get("/ping")
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    assert "Prea multe cereri" in blocked.json()["detail"]


def test_static_images_are_not_counted(client):
    for _ in range(10):
        assert client.get("/uploads/poza.jpg").status_code == 200
    assert client.get("/ping").status_code == 200


def test_post_from_another_site_is_blocked():
    response = TestClient(build_app()).post("/actiune", headers={"Origin": "https://site-rau.com"})
    assert response.status_code == 403


def test_post_from_the_frontend_is_allowed():
    assert TestClient(build_app()).post("/actiune", headers={"Origin": ALLOWED}).status_code == 200


def test_post_from_a_local_file_is_blocked():
    assert TestClient(build_app()).post("/actiune", headers={"Origin": "null"}).status_code == 403


def test_post_without_origin_is_allowed():
    # curl / aplicații native: nu vin dintr-un browser, deci nu pot fi CSRF
    assert TestClient(build_app()).post("/actiune").status_code == 200


def test_security_headers_are_present():
    headers = TestClient(build_app()).get("/ping").headers
    assert headers["x-frame-options"] == "DENY"
    assert headers["x-content-type-options"] == "nosniff"
    assert "default-src 'none'" in headers["content-security-policy"]
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in headers["permissions-policy"]
    assert "max-age" in headers["strict-transport-security"]
