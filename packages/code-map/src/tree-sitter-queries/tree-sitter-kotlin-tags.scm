; Kotlin tag query — function/class/interface/object declarations.
;
; The prebuilt Kotlin grammar does not expose named fields, so identifier
; captures intentionally use positional child patterns.

(function_declaration (simple_identifier) @identifier)
(class_declaration (type_identifier) @identifier)
(object_declaration (type_identifier) @identifier)

(call_expression (simple_identifier) @call.identifier)
