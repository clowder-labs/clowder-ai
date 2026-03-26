"""PyInstaller entrypoint for the standalone dare executable."""

from __future__ import annotations

import multiprocessing

from client.main import sync_main


def main() -> int:
    multiprocessing.freeze_support()
    return sync_main()


if __name__ == "__main__":
    raise SystemExit(main())
