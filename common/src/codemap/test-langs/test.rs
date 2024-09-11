// Trait definition
trait Greeter {
    fn greet(&self, name: &str) -> String;
}

// Struct implementation
struct Greeting {
    prefix: String,
}

impl Greeting {
    fn new(prefix: &str) -> Self {
        Greeting {
            prefix: prefix.to_string(),
        }
    }
}

impl Greeter for Greeting {
    fn greet(&self, name: &str) -> String {
        format!("{}, {}!", self.prefix, name)
    }
}

fn main() {
    let greeting = Greeting::new("Hello");
    print_greeting(&greeting, "World");
}
