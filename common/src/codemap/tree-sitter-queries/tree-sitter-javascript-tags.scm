(function_declaration name: (identifier) @identifier)
(class_declaration name: (identifier) @identifier)
(method_definition name: (property_identifier) @identifier)

(export_statement
  declaration: (lexical_declaration
    (variable_declarator
      name: (identifier) @identifier)))
(export_statement
  declaration: (variable_declaration
    (variable_declarator
      name: (identifier) @identifier)))

(call_expression function: (identifier) @call.identifier)
(new_expression constructor: (identifier) @call.identifier)
