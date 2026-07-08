# GDScript Idioms

- Follow Godot node conventions: use `$NodePath` or `onready var` references, and prefer `get_node()` sparingly.
- Use signals (`signal`) for decoupling node communication; connect/disconnect them explicitly.
- Use typed variables and function signatures (`var x: int`, `func f(a: int) -> void:`) where the project already does.
- Preserve `@export` annotations, `@onready` initializers, and `preload`/`load` resource references exactly.
- Keep `extends Node` inheritance and `_ready`/`_process`/`_physics_process` lifecycle hooks intact and uncluttered.
- Use `class_name` sparingly and only for global type registration the project already depends on.
- Preserve scene/resource file references (`res://`) and avoid hardcoding file paths outside of export variables.
- Use `@tool` annotation only when the script runs in the editor; preserve the existing annotation convention.
- Follow the project's existing style for static typing, null-safety (`Optional`), and engine version conventions (Godot 4.x vs 3.x).
