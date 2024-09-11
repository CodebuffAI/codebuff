using System;

// Interface definition
public interface IGreeter
{
    string Greet(string name);
}

// Class implementation
public class Greeting : IGreeter
{
    private readonly string _prefix;

    public Greeting(string prefix)
    {
        _prefix = prefix;
    }

    public string Greet(string name)
    {
        return $"{_prefix}, {name}!";
    }

    // Static method
    public static void PrintGreeting(IGreeter greeter, string name)
    {
        Console.WriteLine(greeter.Greet(name));
    }
    public static void Main()
    {
        var greeting = new Greeting("Hello");
        PrintGreeting(greeting, "World");
    }
}
