#include <iostream>
#include <string>
<memory>

// Abstract base class
class Greeter {
public:
    virtual ~Greeter() = default;
    virtual std::string greet(const std::string& name) const = 0;
};

// Class implementation
class Greeting : public Greeter {
private:
    std::string prefix;

public:
    Greeting(const std::string& prefix) : prefix(prefix) {}

    std::string greet(const std::string& name) const override {
        return prefix + ", " + name + "!";
    }
};

// Function
void printGreeting(const Greeter& greeter, const std::string& name) {
    std::cout << greeter.greet(name) << std::endl;
}

int main() {
    auto greeting = std::make_unique<Greeting>("Hello");
    printGreeting(*greeting, "World");
    return 0;
}
