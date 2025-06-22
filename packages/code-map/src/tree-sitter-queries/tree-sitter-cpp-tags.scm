(struct_specifier name: (type_identifier) @identifier)

(declaration type: (union_specifier name: (type_identifier) @identifier))

(function_declarator declarator: (identifier) @identifier)

(function_declarator declarator: (field_identifier) @identifier)

(function_declarator declarator: (qualified_identifier scope: (namespace_identifier) name: (identifier) @identifier))

(type_definition declarator: (type_identifier) @identifier)

(enum_specifier name: (type_identifier) @identifier)

(class_specifier name: (type_identifier) @identifier)

; Function calls
(call_expression
  function: (identifier) @call.identifier)

(call_expression
  function: (field_expression field: (field_identifier) @call.identifier))

; Constructor calls
(class_specifier
  name: (type_identifier) @call.identifier)

(new_expression
  type: (type_identifier) @call.identifier)