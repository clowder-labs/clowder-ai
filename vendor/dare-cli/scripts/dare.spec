# -*- mode: python ; coding: utf-8 -*-
r"""DARE CLI PyInstaller packaging config.

Build before packaging:
1. Install dependencies: python -m pip install -r requirements.txt pyinstaller
2. Run packaging: .\scripts\build-exe.ps1  or  python -m PyInstaller scripts/dare.spec
"""

import os
import sys

from PyInstaller.utils.hooks import collect_submodules, copy_metadata

block_cipher = None

SPEC_DIR = os.path.abspath(globals().get("SPECPATH", os.getcwd()))
project_root = os.path.abspath(os.path.join(SPEC_DIR, os.pardir))
if project_root not in sys.path:
    sys.path.insert(0, project_root)


def collect_example_datas() -> list[tuple[str, str]]:
    mappings = [
        ("client/examples/basic.script.txt", "client/examples"),
        ("client/examples/config.anthropic.example.json", "client/examples"),
        ("client/examples/config.huawei-modelarts.example.json", "client/examples"),
    ]
    datas = []
    for relative_path, target_dir in mappings:
        absolute_path = os.path.join(project_root, relative_path)
        if os.path.isfile(absolute_path):
            datas.append((absolute_path, target_dir))
    return datas


datas = collect_example_datas()
datas += copy_metadata("anthropic", recursive=True)
datas += copy_metadata("chromadb", recursive=True)
datas += copy_metadata("httpx", recursive=True)
datas += copy_metadata("langchain-core", recursive=True)
datas += copy_metadata("langchain-openai", recursive=True)
datas += copy_metadata("openai", recursive=True)
datas += copy_metadata("starlette", recursive=True)
datas += copy_metadata("uvicorn", recursive=True)

hiddenimports = sorted(set(
    collect_submodules("client")
    + collect_submodules("dare_framework")
    + [
        "anthropic",
        "langchain_core",
        "langchain_openai",
        "openai",
    ]
))

excludes = [
    "tkinter",
    "matplotlib",
    "scipy",
    "numpy.tests",
]

entry_script = os.path.join(project_root, "scripts", "dare_exe_entry.py")

a = Analysis(
    [entry_script],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="dare",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
