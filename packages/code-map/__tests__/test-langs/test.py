from abc import ABC, abstractmethod


# Abstract base class
class Greeter(ABC):
    @abstractmethod
    def greet(self, name: str) -> str:
        pass

# Class implementation
class Greeting(Greeter):
    def __init__(self, prefix: str):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f'{self.prefix}, {name}!'

# Function
def print_greeting(greeter: Greeter, name: str):
    print(greeter.greet(name))

# Main execution
if __name__ == "__main__":
    greeting = Greeting("Hello")
    print_greeting(greeting, "World")
