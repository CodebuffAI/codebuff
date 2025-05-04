(class_declaration
 name: (identifier) @identifier
 )

(interface_declaration
 name: (identifier) @identifier
)

(method_declaration
 name: (identifier) @identifier
 )

; Method calls
(invocation_expression
  function: (identifier) @call.identifier)

(invocation_expression
  function: (member_access_expression
    name: (identifier) @call.identifier))

; Constructor calls
(object_creation_expression
  type: (identifier) @call.identifier)