(class_declaration
  name: (name) @identifier)

(function_definition
  name: (name) @identifier)

(method_declaration
  name: (name) @identifier)

(object_creation_expression
  [
    (qualified_name (name) @call.identifier)
    (variable_name (name) @call.identifier)
  ])

(function_call_expression
  function: [
    (qualified_name (name) @call.identifier)
    (variable_name (name)) @call.identifier
  ])

(scoped_call_expression
  name: (name) @call.identifier)

(member_call_expression
  name: (name) @call.identifier)
