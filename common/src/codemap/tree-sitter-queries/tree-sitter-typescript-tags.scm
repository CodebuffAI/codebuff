(function_declaration name: (identifier) @identifier)
(class_declaration name: (type_identifier) @identifier)
(method_definition name: (property_identifier) @identifier)

(call_expression function: (identifier) @call.identifier)
(new_expression constructor: (identifier) @call.identifier)
