(struct_item name: (type_identifier) @identifier)
(enum_item name: (type_identifier) @identifier)
(union_item name: (type_identifier) @identifier)
(type_item name: (type_identifier) @identifier)
(trait_item name: (type_identifier) @identifier)
(function_item name: (identifier) @identifier)
(macro_definition name: (identifier) @identifier)
(mod_item name: (identifier) @identifier)
(const_item name: (identifier) @identifier)
(static_item name: (identifier) @identifier)

; Function and macro calls
(call_expression function: (identifier) @call.identifier)
(call_expression function: (field_expression field: (field_identifier) @call.identifier))
(macro_invocation macro: (identifier) @call.identifier)

; Struct instantiation
(struct_expression (type_identifier) @call.identifier)

; Enum variant usage
(scoped_identifier path: (identifier) name: (identifier) @call.identifier)

; implementations

(impl_item trait: (type_identifier) @call.identifier)
(impl_item type: (type_identifier) @call.identifier !trait)