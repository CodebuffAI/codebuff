package main

import "fmt"

// Interface definition
type Greeter interface {
    Greet(name string) string
}

// Struct implementation
type Greeting struct {
    prefix string
}

func (g Greeting) Greet(name string) string {
    return fmt.Sprintf("%s, %s!", g.prefix, name)
}

// Function
func PrintGreeting(greeter Greeter, name string) {
    fmt.Println(greeter.Greet(name))
}

func main() {
    greeting := Greeting{prefix: "Hello"}
    PrintGreeting(greeting, "World")
}