(function_declaration name: (identifier) @identifier)
(class_declaration name: (type_identifier) @identifier)
(interface_declaration name: (type_identifier) @identifier)
(method_definition name: (property_identifier) @identifier)

(export_statement
  declaration: (function_declaration
    name: (identifier) @identifier))

(export_statement
  declaration: (lexical_declaration
    (variable_declarator
      name: (identifier) @identifier)))

(export_statement
  declaration: (variable_declaration
    (variable_declarator
      name: (identifier) @identifier)))

(call_expression function: (identifier) @call.identifier)
(call_expression function: (member_expression property: (property_identifier) @call.identifier))
(new_expression constructor: (identifier) @call.identifier)
