#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Structure definition
typedef struct {
    char* prefix;
} Greeter;

// Function to create a Greeter
Greeter* create_greeter(const char* prefix) {
    Greeter* greeter = (Greeter*)malloc(sizeof(Greeter));
    greeter->prefix = strdup(prefix);
    return greeter;
}

// Function to greet
char* greet(Greeter* greeter, const char* name) {
    char* result = malloc(strlen(greeter->prefix) + strlen(name) + 4);
    sprintf(result, "%s, %s!", greeter->prefix, name);
    return result;
}

// Function to free Greeter
void free_greeter(Greeter* greeter) {
    free(greeter->prefix);
    free(greeter);
}

// Function to print greeting
void print_greeting(Greeter* greeter, const char* name) {
    char* greeting = greet(greeter, name);
    printf("%s\n", greeting);
    free(greeting);
}

int main() {
    Greeter* greeter = create_greeter("Hello");
    print_greeting(greeter, "World");
    free_greeter(greeter);
    return 0;
}
