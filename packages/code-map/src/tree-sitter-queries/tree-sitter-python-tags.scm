(class_definition
  name: (identifier) @identifier)

(function_definition
  name: (identifier) @identifier)

(call
  function: (identifier) @call.identifier)

(call
  function: (attribute
    attribute: (identifier) @call.identifier))
