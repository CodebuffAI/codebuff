module Greeter
  def greet(name)
    "#{prefix}, #{name}!"
  end

  def prefix
    raise NotImplementedError, "#{self.class} has not implemented method '#{__method__}'"
  end
end

class Greeting
  include Greeter

  def initialize(prefix)
    @prefix = prefix
  end

  def prefix
    @prefix
  end
end

def print_greeting(greeter, name)
  puts greeter.greet(name)
end

greeting = Greeting.new("Hello")
print_greeting(greeting, "World")
