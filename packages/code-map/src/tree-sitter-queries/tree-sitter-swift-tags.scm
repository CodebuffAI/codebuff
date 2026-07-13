; Swift tag query — function/class/struct/enum/protocol definitions.
;
; tree-sitter-wasms models class, struct, and enum declarations through the
; shared class_declaration node with a declaration-kind child.

(function_declaration name: (simple_identifier) @identifier)
(class_declaration name: (type_identifier) @identifier)
(protocol_declaration name: (type_identifier) @identifier)

(call_expression (simple_identifier) @call.identifier)
