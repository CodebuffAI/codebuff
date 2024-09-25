(class_declaration
  name: (identifier) @identifier)

(interface_declaration
  name: (identifier) @identifier) @definition.interface

(method_declaration
  name: (identifier) @identifier)

(method_invocation
  name: (identifier) @call.identifier)

(type_list
  (type_identifier) @call.identifier)

(object_creation_expression
  type: (type_identifier) @call.identifier)

(superclass (type_identifier) @call.identifier)
