; Method definitions

(
  [
    (method
      name: (_) @identifier) 
    (singleton_method
      name: (_) @identifier)
  ]
)

(alias
  name: (_) @identifier)

; (setter
;  (identifier) @identifier)

; Class definitions

(
  (comment)*
  .
  [
    (class
      name: [
        (constant) @identifier
        (scope_resolution
          name: (_) @identifier)
      ])
    (singleton_class
      value: [
        (constant) @identifier
        (scope_resolution
          name: (_) @identifier)
      ])
  ]
)

; Module definitions

(
  (module
    name: [
      (constant) @identifier
      (scope_resolution
        name: (_) @identifier)
    ])
)

; Calls

(call method: (identifier) @call.identifier)

(
  [(identifier) (constant)] @call.identifier
  (#is-not? local)
  (#not-match? @call.identifier "^(lambda|load|require|require_relative|__FILE__|__LINE__)$")
)
