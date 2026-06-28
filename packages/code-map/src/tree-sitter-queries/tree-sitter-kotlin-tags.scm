; Kotlin tag query — function/class/interface/object declarations.
;
; The @vscode/tree-sitter-wasm package does NOT bundle a Kotlin grammar, so
; loading this language config no-ops gracefully (getLanguageConfig returns
; undefined) until a Kotlin WASM grammar is supplied.

(function_declaration name: (simple_identifier) @identifier)
(class_declaration name: (type_identifier) @identifier)
(interface_declaration name: (type_identifier) @identifier)
(object_declaration name: (type_identifier) @identifier)

(call_expression function: (simple_identifier) @call.identifier)
