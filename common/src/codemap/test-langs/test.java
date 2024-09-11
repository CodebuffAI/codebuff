// Interface definition
interface Greeter {
    String greet(String name);
}

// Class implementation
public class Greeting implements Greeter {
    // Instance variable
    private String prefix;

    // Constructor
    public Greeting(String prefix) {
        this.prefix = prefix;
    }

    // Method implementation
    @Override
    public String greet(String name) {
        return prefix + ", " + name + "!";
    }

    // Static method
    public static void printGreeting(Greeter greeter, String name) {
        System.out.println(greeter.greet(name));
    }

    public static void main(String[] args) {
        Greeting greeting = new Greeting("Hello");
        printGreeting(greeting, "World");
    }
}
