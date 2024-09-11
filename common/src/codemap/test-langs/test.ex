defmodule Greeting do
  def greet(name) do
    "Hello, #{name}!"
  end
end

IO.puts Greeting.greet("World")
