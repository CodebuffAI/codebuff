; Swift tag query — function/class/struct/enum/protocol definitions.
;
; The @vscode/tree-sitter-wasm package does NOT bundle a Swift grammar, so
; loading this language config no-ops gracefully (getLanguageConfig returns
; undefined) until a Swift WASM grammar is supplied.

(function_declaration name: (simple_identifier) @identifier)
(class_declaration name: (type_identifier) @identifier)
(struct_declaration name: (type_identifier) @identifier)
(enum_declaration name: (type_identifier) @identifier)
(protocol_declaration name: (type_identifier) @identifier)

(call_expression function: (simple_identifier) @call.identifier)
