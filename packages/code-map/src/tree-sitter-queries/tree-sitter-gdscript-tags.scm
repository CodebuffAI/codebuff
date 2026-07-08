; Function definitions
(function_definition
  name: (name) @identifier)

; Class definitions
(class_definition
  name: (name) @identifier)

(class_name_statement
  name: (name) @identifier)

; Variable and constant declarations
(variable_statement
  name: (name) @identifier)

(const_statement
  name: (name) @identifier)

; Enum definitions
(enum_definition
  name: (name) @identifier)

; Signal declarations
(signal_statement
  name: (name) @identifier)

; Function calls (e.g. helper(42))
(call
  (identifier) @call.identifier)

; Attribute-based calls (e.g. obj.method())
; The AST is: (attribute (identifier) (attribute_call (identifier)))
; Capture the method name from the attribute_call
(attribute
  (attribute_call
    (identifier) @call.identifier))

; Baseless calls (e.g. .foo())
; The AST is: (base_call (identifier))
(base_call
  (identifier) @call.identifier)
