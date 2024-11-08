# Codebuff Project Knowledge

## Project Structure

The codebuff project follows the modern Python packaging structure:

- `pyproject.toml`: Contains project metadata and build system requirements.
- `src/codebuff/`: Source code directory.
- `tests/`: Directory for test files (currently empty).
- `dist/`: Contains distribution files after building the package.
- `LICENSE`: MIT License file.
- `README.md`: Project description and usage instructions.

## Build System

- Uses `setuptools` as the build backend.
- Configured to use the `src` layout for better separation of source code.

## Package Information

- Name: codebuff
- Description: An AI-powered coding assistant (coming soon)
- Requires Python 3.6 or later

## Distribution

- The project can be built using the `build` package: `python -m build`
- This creates both source (.tar.gz) and wheel (.whl) distributions in the `dist/` directory.

## Development

- For local development, install the package in editable mode: `pip install -e .`
- Remember to update the version in `pyproject.toml` when making new releases.

## Next Steps

- Implement the main functionality of the AI-powered coding assistant.
- Add tests in the `tests/` directory.
- Update `README.md` with detailed usage instructions as features are developed.

## Important Notes

- The package currently uses a console script entry point, which should be implemented in the `manicode/__init__.py` file.
- The project is in a pre-alpha state and not yet ready for public release.

Remember to keep this knowledge file updated as the project evolves.