// Interface definition
interface Greeter {
    greet(name: string): string;
}

// Class implementation
class Greeting implements Greeter {
    private prefix: string;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    greet(name: string): string {
        return `${this.prefix}, ${name}!`;
    }

    // Static method
    static printGreeting(greeter: Greeter, name: string): void {
        console.log(greeter.greet(name));
    }
}

// Function
function createGreeter(prefix: string): Greeter {
    return new Greeting(prefix);
}

// Main execution
const greeting = createGreeter('Hello');
Greeting.printGreeting(greeting, 'World');
