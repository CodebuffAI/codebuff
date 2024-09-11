#include <stdio.h>
#include <string.h>

char* greet(const char* name) {
    static char greeting[50];
    sprintf(greeting, "Hello, %s!", name);
    return greeting;
}

int main() {
    printf("%s
", greet("World"));
    return 0;
}
