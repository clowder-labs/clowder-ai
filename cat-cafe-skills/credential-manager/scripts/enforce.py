#!/usr/bin/env python3
"""
Enforce .env requirement for OpenClaw skills.

Usage: Import this in your skill's scripts to validate credentials are properly secured.

Example:
    from enforce import require_secure_env
    
    # At start of your script
    require_secure_env()
    
    # Now safe to load credentials
"""
import logging
import sys
from pathlib import Path


def check_env_exists() -> bool:
    """Check if .env file exists."""
    env_file = Path.home() / '.openclaw' / '.env'
    return env_file.exists()


def check_env_permissions() -> bool:
    """Check if .env has correct permissions (600)."""
    env_file = Path.home() / '.openclaw' / '.env'
    if not env_file.exists():
        return False
    mode = oct(env_file.stat().st_mode)[-3:]
    return mode == '600'


def check_gitignore() -> bool:
    """Check if .env is git-ignored."""
    gitignore = Path.home() / '.openclaw' / '.gitignore'
    if not gitignore.exists():
        return False
    return '.env' in gitignore.read_text()


def require_secure_env(exit_on_fail: bool = True) -> bool:
    """
    Enforce secure .env setup.
    
    Args:
        exit_on_fail: If True, exit with error. If False, return bool.
        
    Returns:
        True if all checks pass, False otherwise.
    """
    checks = [
        (check_env_exists, "❌ ~/.openclaw/.env does not exist"),
        (check_env_permissions, "❌ ~/.openclaw/.env has insecure permissions (should be 600)"),
        (check_gitignore, "❌ .env is not git-ignored"),
    ]
    
    failed = []
    for check_fn, error_msg in checks:
        if not check_fn():
            failed.append(error_msg)
    
    if failed:
        logging.info("\n🔒 SECURITY REQUIREMENT NOT MET\n", file=sys.stderr)
        logging.info("OpenClaw requires centralized credential management.", file=sys.stderr)
        logging.info("\nIssues found:", file=sys.stderr)
        for msg in failed:
            logging.info(f"  {msg}", file=sys.stderr)
        
        logging.info("\n💡 Fix this by running:", file=sys.stderr)
        logging.info("   cd ~/.openclaw/skills/credential-manager", file=sys.stderr)
        logging.info("   ./scripts/consolidate.py", file=sys.stderr)
        logging.info("   ./scripts/validate.py --fix", file=sys.stderr)
        logging.info("\nSee CORE-PRINCIPLE.md for why this is mandatory.\n", file=sys.stderr)
        
        if exit_on_fail:
            raise ValueError("Secure .env requirement not met")
        return False
    
    return True


def get_credential(key: str) -> str:
    """
    Safely get a credential from .env.
    
    Args:
        key: Credential key (e.g., 'X_ACCESS_TOKEN')
        
    Returns:
        Credential value
        
    Raises:
        ValueError: If .env not secure or key not found
    """
    if not require_secure_env(exit_on_fail=False):
        raise ValueError("Secure .env requirement not met")
    
    env_file = Path.home() / '.openclaw' / '.env'
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                if k.strip() == key:
                    return v.strip()
    
    logging.info(f"\n❌ Credential '{key}' not found in .env\n", file=sys.stderr)
    logging.info("Add it to ~/.openclaw/.env:", file=sys.stderr)
    logging.info(f"   {key}=your_value_here\n", file=sys.stderr)
    raise ValueError(f"Credential '{key}' not found in .env")

if __name__ == '__main__':
    # When run directly, validate and report
    logging.info("🔍 Checking OpenClaw credential security...\n")
    
    if require_secure_env(exit_on_fail=False):
        logging.info("✅ All security checks passed")
        logging.info("\nYour credentials are properly secured:")
        logging.info("  • ~/.openclaw/.env exists")
        logging.info("  • Permissions are 600 (owner only)")
        logging.info("  • Git-ignored")
        logging.info("\n🔒 Good job! Your OpenClaw deployment follows security best practices.")
        sys.exit(0)
    else:
        sys.exit(1)
