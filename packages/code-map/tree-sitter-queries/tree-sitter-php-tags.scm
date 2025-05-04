(interface_declaration
  name: (name) @identifier)

(class_declaration
  name: (name) @identifier)

(function_definition
  name: (name) @identifier)

(method_declaration
  name: (name) @identifier)

(object_creation_expression
  type: (qualified_name) @call.identifier)

(function_call_expression
  function: (name) @call.identifier)

(member_call_expression
  name: (name) @call.identifier)
