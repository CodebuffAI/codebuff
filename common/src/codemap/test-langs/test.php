<?php

// Interface definition
interface Greeter {
    public function greet(string $name): string;
}

// Class implementation
class Greeting implements Greeter {
    private string $prefix;

    public function __construct(string $prefix) {
        $this->prefix = $prefix;
    }

    public function greet(string $name): string {
        return "{$this->prefix}, {$name}!";
    }

    // Static method
    public static function printGreeting(Greeter $greeter, string $name): void {
        echo $greeter->greet($name) . PHP_EOL;
    }
}

// Function
function createGreeter(string $prefix): Greeter {
    return new Greeting($prefix);
}

// Main execution
$greeting = createGreeter("Hello");
Greeting::printGreeting($greeting, "World");
?>
