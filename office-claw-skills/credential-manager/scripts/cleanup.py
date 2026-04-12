#!/usr/bin/env python3
"""
Clean up old credential files after migration.

ENFORCES: Consolidation Rule - All credentials in ~/.openclaw/.env ONLY.
Removes scattered .env files from workspace, skills, and scripts directories.
See CONSOLIDATION-RULE.md for details.
"""
import logging
import argparse
from pathlib import Path
from typing import List


def find_old_files() -> List[Path]:
    """Find old credential files (excluding the new .env)."""
    from scan import scan_locations
    results = scan_locations()
    
    home = Path.home()
    env_file = home / '.openclaw' / '.env'
    
    old_files = []
    for result in results:
        path = Path(result['path'])
        if path != env_file and path.exists():
            old_files.append(path)
    
    return old_files


def cleanup(confirm: bool = False, keep_backups: bool = True, dry_run: bool = True):
    """Clean up old credential files."""
    old_files = find_old_files()
    
    if not old_files:
        logging.info("✅ No old credential files to clean up")
        return {'status': 'no_files'}
    
    logging.info(f"\n📋 Found {len(old_files)} old credential file(s):\n")
    for f in old_files:
        logging.info(f"   • {f}")
    
    if not confirm:
        logging.info(f"\n⚠️  DRY RUN - No files will be deleted")
        logging.info(f"   Run with --confirm to actually delete files")
        return {'status': 'dry_run'}
    
    # Final confirmation
    logging.info(f"\n⚠️  WARNING: This will permanently delete {len(old_files)} file(s)")
    
    if keep_backups:
        backup_dir = Path.home() / '.openclaw' / 'backups'
        if backup_dir.exists():
            backups = list(backup_dir.glob('credentials-old-*'))
            if backups:
                logging.info(f"\n📦 Backups exist in: {backup_dir}")
                for backup in backups:
                    logging.info(f"   • {backup.name}")
    
    response = input(f"\n   Type 'DELETE' to confirm: ")
    if response != 'DELETE':
        logging.info("   ❌ Cancelled")
        return {'status': 'cancelled'}
    
    # Delete files
    deleted = []
    errors = []
    
    logging.info(f"\n🗑️  Deleting files...")
    for f in old_files:
        try:
            f.unlink()
            deleted.append(f)
            logging.info(f"   ✅ Deleted: {f}")
        except Exception as e:
            errors.append((f, str(e)))
            logging.info(f"   ❌ Error: {f} - {e}")
    
    # Summary
    logging.info(f"\n📊 Summary:")
    logging.info(f"   Deleted: {len(deleted)}")
    if errors:
        logging.info(f"   Errors: {len(errors)}")
    
    if deleted and keep_backups:
        logging.info(f"\n💡 Backups preserved in ~/.openclaw/backups/")
    
    logging.info(f"\n{'✅' if not errors else '⚠️'} Cleanup {'complete' if not errors else 'finished with errors'}")
    
    return {
        'status': 'success' if not errors else 'partial',
        'deleted': len(deleted),
        'errors': len(errors)
    }


def main():
    parser = argparse.ArgumentParser(
        description='Clean up old credential files',
        epilog='IMPORTANT: Make sure to test your applications with the new .env before cleanup!'
    )
    parser.add_argument('--confirm', action='store_true',
                      help='Actually delete files (default is dry run)')
    parser.add_argument('--keep-backups', action='store_true', default=True,
                      help='Keep backup directory (default: True)')
    parser.add_argument('--force', action='store_true',
                      help='Skip final confirmation (dangerous!)')
    args = parser.parse_args()
    
    if args.force and not args.confirm:
        logging.info("❌ --force requires --confirm")
        return 1
    
    result = cleanup(args.confirm, args.keep_backups, not args.confirm)
    return 0 if result['status'] in ['success', 'no_files', 'dry_run', 'cancelled'] else 1

if __name__ == '__main__':
    exit(main())
