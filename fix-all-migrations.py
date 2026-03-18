#!/usr/bin/env python3
"""
Fix all migrations to add idempotency checks (hasTable, hasColumn, hasIndex, etc.)
"""
import os
import re
from pathlib import Path

migrations_dir = Path('./src/migrations')
migration_files = sorted([f for f in migrations_dir.glob('*.ts') if f.is_file()])

print(f"📋 Found {len(migration_files)} migration files\n")

fixes_applied = 0

for migration_file in migration_files:
    content = migration_file.read_text('utf-8')
    original_content = content
    
    # Pattern 1: CREATE TABLE oracle.table_name without IF NOT EXISTS or hasTable check
    create_table_pattern = r'await queryRunner\.query\(`[\n\s]*CREATE TABLE oracle\.(\w+)'
    if re.search(create_table_pattern, content) and 'hasTable' not in content:
        # Extract table name
        match = re.search(r'CREATE TABLE oracle\.(\w+)', content)
        if match:
            table_name = match.group(1)
            # Find the public async up method and add hasTable check at the beginning
            
            # Pattern for raw query CREATE TABLE
            if 'CREATE TABLE oracle.' in content and 'queryRunner.query' in content:
                # Add hasTable check before the first queryRunner.query in CREATE TABLE
                new_content = re.sub(
                    r'(public async up\(queryRunner: QueryRunner\): Promise<void> \{)\n(\s*await queryRunner\.query\(`[\n\s]*CREATE TABLE oracle\.)',
                    f'\\1\n        // Check if table already exists to prevent re-creation errors\n        const tableExists = await queryRunner.hasTable("oracle.{table_name}");\n        if (tableExists) {{\n            console.log("⏭️  Table oracle.{table_name} already exists, skipping");\n            return;\n        }}\n\n\\2',
                    content,
                    count=1
                )
                if new_content != content:
                    content = new_content
                    print(f"✅ Fixed {migration_file.name}: Added hasTable check for oracle.{table_name}")
                    fixes_applied += 1
    
    # Pattern 2: CREATE TABLE using queryRunner.createTable() without hasTable check
    if 'queryRunner.createTable(' in content and 'hasTable' not in content and 'CREATE TABLE' in content:
        # Find table name from createTable
        match = re.search(r'name:\s*[\'"](\w+)[\'"]', content)
        if match:
            table_name = match.group(1)
            new_content = re.sub(
                r'(public async up\(queryRunner: QueryRunner\): Promise<void> \{)\n(\s*await queryRunner\.createTable\()',
                f'\\1\n        // Check if table already exists to prevent re-creation errors\n        const tableExists = await queryRunner.hasTable("oracle.{table_name}");\n        if (tableExists) {{\n            console.log("⏭️  Table oracle.{table_name} already exists, skipping");\n            return;\n        }}\n\n\\2',
                content,
                count=1
            )
            if new_content != content:
                content = new_content
                print(f"✅ Fixed {migration_file.name}: Added hasTable check for {table_name}")
                fixes_applied += 1
    
    # Pattern 3: Replace raw DROP with dropTable(..., true) for safety
    if 'DROP TABLE oracle.' in content and 'queryRunner.dropTable' not in content:
        match = re.search(r'DROP TABLE oracle\.(\w+)', content)
        if match:
            table_name = match.group(1)
            new_content = re.sub(
                r'await queryRunner\.query\(`[\n\s]*DROP TABLE oracle\.\w+[^\`]*`\);',
                f'await queryRunner.dropTable("oracle.{table_name}", true);',
                content
            )
            if new_content != content:
                content = new_content
                print(f"✅ Fixed {migration_file.name}: Changed DROP to queryRunner.dropTable() for safety")
                fixes_applied += 1
    
    # Pattern 4: DROP TABLE without schema prefix
    if re.search(r"DROP TABLE ['\"]?\w+['\"]?", content) and 'oracle.' not in content.split('DROP TABLE')[1] if 'DROP TABLE' in content else False:
        # Check if it's not already prefixed
        pass  # Skip, need more context
    
    # Save if changed
    if content != original_content:
        migration_file.write_text(content, 'utf-8')

print(f"\n🎉 Applied {fixes_applied} fixes")
print("Note: Some migrations may need manual review (triggers, stored procedures, etc.)")
