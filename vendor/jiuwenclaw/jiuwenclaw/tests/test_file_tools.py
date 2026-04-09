# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Tests for file_tools.py."""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

import pytest

from jiuwenclaw.agentserver.tools.file_tools import FileToolkit, _is_path_allowed, _has_binary_extension
from jiuwenclaw.agentserver.tools.file_tools_config import FileToolsConfig, get_file_tools_config


class TestFileToolkit:
    """Test cases for FileToolkit."""

    @pytest.fixture
    def toolkit(self):
        return FileToolkit()

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test files."""
        with tempfile.TemporaryDirectory() as d:
            yield Path(d)

    @pytest.fixture
    def allow_any_path(self, monkeypatch):
        """Enable allow_any_path for tests."""
        monkeypatch.setenv("FILE_TOOLS_ALLOW_ANY_PATH", "1")

    @pytest.mark.asyncio
    async def test_file_read_basic(self, toolkit, temp_dir, allow_any_path):
        """Test basic file reading."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("Hello, World!", encoding="utf-8")

        result = await toolkit._file_read(str(test_file))
        assert "[ERROR]" not in result
        assert "Hello, World!" in result

    @pytest.mark.asyncio
    async def test_file_read_with_offset(self, toolkit, temp_dir, allow_any_path):
        """Test reading with offset."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("0123456789", encoding="utf-8")

        result = await toolkit._file_read(str(test_file), offset=5)
        assert "[ERROR]" not in result
        assert "56789" in result

    @pytest.mark.asyncio
    async def test_file_read_with_limit(self, toolkit, temp_dir, allow_any_path):
        """Test reading with limit."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("0123456789", encoding="utf-8")

        result = await toolkit._file_read(str(test_file), limit=5)
        assert "[ERROR]" not in result
        assert "01234" in result

    @pytest.mark.asyncio
    async def test_file_read_not_found(self, toolkit, temp_dir, allow_any_path):
        """Test reading non-existent file."""
        test_file = temp_dir / "nonexistent.txt"

        result = await toolkit._file_read(str(test_file))
        assert "[ERROR]" in result
        assert "FILE_NOT_FOUND" in result

    @pytest.mark.asyncio
    async def test_file_read_binary_extension(self, toolkit, temp_dir, allow_any_path):
        """Test reading file with binary extension."""
        test_file = temp_dir / "test.exe"
        test_file.write_bytes(b"\x00\x00\x00\x00")

        result = await toolkit._file_read(str(test_file))
        assert "[ERROR]" in result
        assert "FILE_IS_BINARY" in result

    @pytest.mark.asyncio
    async def test_file_read_binary_content(self, toolkit, temp_dir, allow_any_path):
        """Test reading file with binary content (NULL bytes)."""
        test_file = temp_dir / "test.dat"
        test_file.write_bytes(b"\x00\x01\x02\x03")

        result = await toolkit._file_read(str(test_file))
        assert "[ERROR]" in result
        assert "FILE_IS_BINARY" in result

    @pytest.mark.asyncio
    async def test_file_read_crlf_normalization(self, toolkit, temp_dir, allow_any_path):
        """Test CRLF to LF normalization."""
        test_file = temp_dir / "test.txt"
        test_file.write_bytes(b"Line1\r\nLine2\r\n")

        result = await toolkit._file_read(str(test_file))
        assert "[ERROR]" not in result
        assert "Line1\nLine2" in result
        assert "\r\n" not in result.split("---")[1]  # content section

    @pytest.mark.asyncio
    async def test_file_read_offset_out_of_bounds(self, toolkit, temp_dir, allow_any_path):
        """Test offset exceeding file size."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("short", encoding="utf-8")

        result = await toolkit._file_read(str(test_file), offset=1000)
        assert "[ERROR]" in result
        assert "OFFSET_OUT_OF_BOUNDS" in result

    @pytest.mark.asyncio
    async def test_file_write_basic(self, toolkit, temp_dir, allow_any_path):
        """Test basic file writing."""
        test_file = temp_dir / "test.txt"

        result = await toolkit._file_write(str(test_file), "Hello, World!")
        assert "[OK]" in result
        assert test_file.exists()
        assert test_file.read_text(encoding="utf-8") == "Hello, World!"

    @pytest.mark.asyncio
    async def test_file_write_creates_parent_dirs(self, toolkit, temp_dir, allow_any_path):
        """Test writing creates parent directories."""
        test_file = temp_dir / "subdir" / "deep" / "test.txt"

        result = await toolkit._file_write(str(test_file), "content")
        assert "[OK]" in result
        assert test_file.exists()
        assert test_file.parent.exists()

    @pytest.mark.asyncio
    async def test_file_write_overwrites_existing(self, toolkit, temp_dir, allow_any_path):
        """Test overwriting existing file."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("old content", encoding="utf-8")

        result = await toolkit._file_write(str(test_file), "new content")
        assert "[OK]" in result
        assert test_file.read_text(encoding="utf-8") == "new content"

    @pytest.mark.asyncio
    async def test_file_write_preserves_crlf(self, toolkit, temp_dir, allow_any_path):
        """Test writing preserves original CRLF line endings."""
        test_file = temp_dir / "test.txt"
        # Create file with CRLF
        test_file.write_bytes(b"Line1\r\nLine2\r\n")

        # Write content with LF (should be converted to CRLF)
        result = await toolkit._file_write(str(test_file), "New1\nNew2")
        assert "[OK]" in result
        content = test_file.read_bytes()
        assert b"\r\n" in content  # CRLF preserved

    @pytest.mark.asyncio
    async def test_file_edit_basic(self, toolkit, temp_dir, allow_any_path):
        """Test basic string replacement."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("Hello, World!", encoding="utf-8")

        result = await toolkit._file_edit(str(test_file), "World", "Python")
        assert "[OK]" in result
        assert test_file.read_text(encoding="utf-8") == "Hello, Python!"

    @pytest.mark.asyncio
    async def test_file_edit_replace_all(self, toolkit, temp_dir, allow_any_path):
        """Test replace_all option."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("aaa bbb aaa", encoding="utf-8")

        result = await toolkit._file_edit(str(test_file), "aaa", "ccc", replace_all=True)
        assert "[OK]" in result
        assert "replaced all" in result
        assert test_file.read_text(encoding="utf-8") == "ccc bbb ccc"

    @pytest.mark.asyncio
    async def test_file_edit_not_found(self, toolkit, temp_dir, allow_any_path):
        """Test when old_string not found."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("Hello", encoding="utf-8")

        result = await toolkit._file_edit(str(test_file), "NotFound", "New")
        assert "[ERROR]" in result
        assert "OLD_STRING_NOT_FOUND" in result

    @pytest.mark.asyncio
    async def test_file_edit_multiple_matches_no_replace_all(self, toolkit, temp_dir, allow_any_path):
        """Test multiple matches without replace_all."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("aaa aaa", encoding="utf-8")

        result = await toolkit._file_edit(str(test_file), "aaa", "bbb")
        assert "[ERROR]" in result
        assert "MULTIPLE_MATCHES" in result

    @pytest.mark.asyncio
    async def test_file_edit_single_match_succeeds(self, toolkit, temp_dir, allow_any_path):
        """Test single match succeeds without replace_all."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("aaa bbb", encoding="utf-8")

        result = await toolkit._file_edit(str(test_file), "aaa", "ccc")
        assert "[OK]" in result
        assert test_file.read_text(encoding="utf-8") == "ccc bbb"

    @pytest.mark.asyncio
    async def test_file_edit_no_change(self, toolkit, temp_dir, allow_any_path):
        """Test when old_string equals new_string."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("Hello", encoding="utf-8")

        result = await toolkit._file_edit(str(test_file), "Hello", "Hello")
        assert "[ERROR]" in result
        assert "NO_CHANGE" in result

    @pytest.mark.asyncio
    async def test_file_edit_file_not_found(self, toolkit, temp_dir, allow_any_path):
        """Test editing non-existent file."""
        test_file = temp_dir / "nonexistent.txt"

        result = await toolkit._file_edit(str(test_file), "old", "new")
        assert "[ERROR]" in result
        assert "FILE_NOT_FOUND" in result

    @pytest.mark.asyncio
    async def test_file_edit_preserves_encoding(self, toolkit, temp_dir, allow_any_path):
        """Test editing preserves original encoding."""
        test_file = temp_dir / "test.txt"
        # Write with BOM (UTF-8 with BOM)
        test_file.write_bytes(b"\xef\xbb\xbfHello")

        result = await toolkit._file_edit(str(test_file), "Hello", "World")
        assert "[OK]" in result
        content = test_file.read_bytes()
        assert content[:3] == b"\xef\xbb\xbf"  # BOM preserved

    def test_get_tools(self, toolkit):
        """Test get_tools returns expected tools."""
        tools = toolkit.get_tools()
        assert len(tools) == 3
        tool_names = [t.card.name for t in tools]
        assert "file_read" in tool_names
        assert "file_write" in tool_names
        assert "file_edit" in tool_names


class TestPathValidation:
    """Test cases for path validation."""

    @pytest.fixture
    def allow_any_path(self, monkeypatch):
        monkeypatch.setenv("FILE_TOOLS_ALLOW_ANY_PATH", "1")

    @pytest.fixture
    def restrict_path(self, monkeypatch, tmp_path):
        """Restrict to tmp_path only."""
        monkeypatch.setenv("FILE_TOOLS_ALLOW_ANY_PATH", "0")
        monkeypatch.setenv("FILE_TOOLS_ALLOWED_DIRS", str(tmp_path))
        # Re-read config
        import importlib
        import jiuwenclaw.agentserver.tools.file_tools_config as cfg_module
        importlib.reload(cfg_module)

    def test_allow_any_path_permits_all(self, allow_any_path):
        """Test allow_any_path permits any path."""
        ok, msg = _is_path_allowed("/any/random/path.txt")
        assert ok is True
        assert msg == ""

    def test_restricted_path_blocks_outside(self, restrict_path, tmp_path):
        """Test restricted path blocks outside directory."""
        outside_path = tempfile.gettempdir() + "/outside_test.txt"
        ok, msg = _is_path_allowed(outside_path)
        assert ok is False
        assert "PERMISSION_DENIED" in msg

    def test_restricted_path_permits_inside(self, restrict_path, tmp_path):
        """Test restricted path permits inside directory."""
        inside_path = str(tmp_path / "inside.txt")
        ok, msg = _is_path_allowed(inside_path)
        assert ok is True

    def test_hidden_file_blocked(self, monkeypatch):
        """Test hidden files are blocked when not allowed."""
        monkeypatch.setenv("FILE_TOOLS_ALLOW_ANY_PATH", "0")
        monkeypatch.setenv("FILE_TOOLS_ALLOW_HIDDEN_FILES", "0")
        import importlib
        import jiuwenclaw.agentserver.tools.file_tools_config as cfg_module
        importlib.reload(cfg_module)

        ok, msg = _is_path_allowed("/workspace/.hidden_file")
        assert ok is False
        assert "hidden files" in msg

    def test_hidden_file_allowed_when_configured(self, monkeypatch):
        """Test hidden files are allowed when configured."""
        monkeypatch.setenv("FILE_TOOLS_ALLOW_ANY_PATH", "0")
        monkeypatch.setenv("FILE_TOOLS_ALLOW_HIDDEN_FILES", "1")
        import importlib
        import jiuwenclaw.agentserver.tools.file_tools_config as cfg_module
        importlib.reload(cfg_module)

        ok, msg = _is_path_allowed("/workspace/.hidden_file")
        # May still fail due to workspace check, but not due to hidden file rule
        assert "hidden files" not in msg


class TestBinaryExtension:
    """Test cases for binary extension detection."""

    def test_exe_is_binary(self):
        assert _has_binary_extension("test.exe") is True

    def test_dll_is_binary(self):
        assert _has_binary_extension("test.dll") is True

    def test_png_is_binary(self):
        assert _has_binary_extension("test.png") is True

    def test_txt_is_not_binary(self):
        assert _has_binary_extension("test.txt") is False

    def test_py_is_not_binary(self):
        assert _has_binary_extension("test.py") is False

    def test_json_is_not_binary(self):
        assert _has_binary_extension("test.json") is False

    def test_case_insensitive(self):
        assert _has_binary_extension("test.EXE") is True
        assert _has_binary_extension("test.PNG") is True


class TestEncodingDetection:
    """Test cases for encoding detection."""

    def test_utf8_bom_detection(self, tmp_path):
        from jiuwenclaw.agentserver.tools.file_tools import _detect_encoding_and_line_endings

        test_file = tmp_path / "bom.txt"
        test_file.write_bytes(b"\xef\xbb\xbfHello World")

        meta = _detect_encoding_and_line_endings(str(test_file))
        assert meta.encoding == "utf-8"

    def test_utf16_le_detection(self, tmp_path):
        from jiuwenclaw.agentserver.tools.file_tools import _detect_encoding_and_line_endings

        test_file = tmp_path / "utf16.txt"
        test_file.write_bytes(b"\xff\xfeH\x00e\x00l\x00l\x00o\x00")

        meta = _detect_encoding_and_line_endings(str(test_file))
        assert meta.encoding == "utf-16-le"

    def test_crlf_detection(self, tmp_path):
        from jiuwenclaw.agentserver.tools.file_tools import _detect_encoding_and_line_endings

        test_file = tmp_path / "crlf.txt"
        test_file.write_bytes(b"Line1\r\nLine2\r\nLine3")

        meta = _detect_encoding_and_line_endings(str(test_file))
        assert meta.line_endings == "CRLF"

    def test_lf_detection(self, tmp_path):
        from jiuwenclaw.agentserver.tools.file_tools import _detect_encoding_and_line_endings

        test_file = tmp_path / "lf.txt"
        test_file.write_bytes(b"Line1\nLine2\nLine3")

        meta = _detect_encoding_and_line_endings(str(test_file))
        assert meta.line_endings == "LF"

    def test_empty_file(self, tmp_path):
        from jiuwenclaw.agentserver.tools.file_tools import _detect_encoding_and_line_endings

        test_file = tmp_path / "empty.txt"
        test_file.write_bytes(b"")

        meta = _detect_encoding_and_line_endings(str(test_file))
        assert meta.encoding == "utf-8"
        assert meta.size == 0
