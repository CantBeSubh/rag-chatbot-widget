from app.core.rag import _build_prompt, _DEFAULT_INSTRUCTIONS


def test_build_prompt_starts_with_instructions():
    prompt = _build_prompt("Be concise.", "Some context.", "What is X?")
    assert prompt.startswith("Be concise.")


def test_build_prompt_contains_context_block():
    prompt = _build_prompt("Instructions.", "My source text.", "Question?")
    assert "Context:\nMy source text." in prompt


def test_build_prompt_contains_question():
    prompt = _build_prompt("Instructions.", "Context.", "My question?")
    assert "Question: My question?" in prompt


def test_build_prompt_ends_with_answer_label():
    prompt = _build_prompt("Instructions.", "Context.", "Question?")
    assert prompt.strip().endswith("Answer:")


def test_default_instructions_has_no_context_placeholder():
    # instructions-only: the {context} block is appended by _build_prompt, not stored
    assert "{context}" not in _DEFAULT_INSTRUCTIONS


def test_default_instructions_mentions_context():
    assert "context" in _DEFAULT_INSTRUCTIONS.lower()
