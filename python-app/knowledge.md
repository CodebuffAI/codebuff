# Python Package

## Current Status
Placeholder package that redirects users to npm version. Not functional - serves only to inform users about the npm package.

## Structure
- `pyproject.toml`: Package metadata, version 0.1.1
- `src/codebuff/__init__.py`: Main function that prints redirect message
- `README.md`: Installation instructions (npm only)
- `LICENSE`: MIT License template (incomplete)

## Key Issues
- Package name mismatch: configured as "codebuff" but script entry point references "manicode"
- LICENSE file has placeholder text `[year] [fullname]`
- URLs point to old "manicode" repository instead of current project

## Publishing
- Uses setuptools build system
- Requires Python 3.6+
- Build with: `python -m build`
- Current version: 0.1.1