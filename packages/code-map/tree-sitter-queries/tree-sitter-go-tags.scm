(
  (comment)*
  .
  (function_declaration
    name: (identifier) @identifier)
)

(
  (comment)*
  .
  (method_declaration
    name: (field_identifier) @identifier)
)

(type_spec
  name: (type_identifier) @identifier)

(type_identifier) @identifier

(call_expression
  function: [
    (identifier) @call.identifier
    (parenthesized_expression (identifier) @call.identifier)
    (selector_expression field: (field_identifier) @call.identifier)
    (parenthesized_expression (selector_expression field: (field_identifier) @call.identifier))
  ])
