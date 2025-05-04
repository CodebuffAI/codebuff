(struct_specifier name: (type_identifier) @identifier body:(_))

(declaration type: (union_specifier name: (type_identifier) @identifier))

(function_declarator declarator: (identifier) @identifier)

(type_definition declarator: (type_identifier) @identifier)

(enum_specifier name: (type_identifier) @identifier)

; Function calls
(call_expression
  function: (identifier) @call.identifier)

(call_expression
  function: (field_expression field: (field_identifier) @call.identifier))
