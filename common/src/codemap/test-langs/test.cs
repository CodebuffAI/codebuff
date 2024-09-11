using System;

public class Greeting
{
    public static string Greet(string name)
    {
        return $"Hello, {name}!";
    }

    public static void Main()
    {
        Console.WriteLine(Greet("World"));
    }
}
