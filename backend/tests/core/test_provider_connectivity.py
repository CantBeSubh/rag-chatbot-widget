"""Live connectivity checks against real provider APIs.

Excluded from the default test run (see `addopts` in pyproject.toml).
Run explicitly with: uv run pytest -m live -v
"""

import pytest

from app.core.rag import _bind, _build_providers

_PROMPT = "Hey, how are you?"
_PROVIDERS = _build_providers()


@pytest.mark.live
@pytest.mark.parametrize("name,model", _PROVIDERS, ids=[name for name, _ in _PROVIDERS])
def test_provider_responds_to_simple_prompt(name, model):
    bound = _bind(name, model, temperature=0.1, max_tokens=100)
    response = bound.invoke(_PROMPT)
    content = response.content if hasattr(response, "content") else response

    assert content.strip()
