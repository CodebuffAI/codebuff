// Interface-like object (JavaScript doesn't have native interfaces)
const Greeter = {
    greet(name) {
        throw new Error('Method not implemented');
    }
};

// Class implementation
class Greeting {
    constructor(prefix) {
        this.prefix = prefix;
    }

    greet(name) {
        return `${this.prefix}, ${name}!`;
    }

    // Static method
    static printGreeting(greeter, name) {
        console.log(greeter.greet(name));
    }
}

// Function
function createGreeter(prefix) {
    return new Greeting(prefix);
}

// Arrow function
const greetAsync = async (greeter, name) => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(greeter.greet(name));
        }, 100);
    });
};

// Main execution
(async function main() {
    const greeting = createGreeter('Hello');
    Greeting.printGreeting(greeting, 'World');

    const asyncResult = await greetAsync(greeting, 'Async World');
    console.log(asyncResult);

    // Demonstrating array methods and arrow functions
    const names = ['Alice', 'Bob', 'Charlie'];
    const greetings = names.map(name => greeting.greet(name));
    console.log(greetings);
})();
