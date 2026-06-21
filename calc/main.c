#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "parser.h"

int main(int argc, char *argv[]) {
    if (argc == 2) {
        char *error = NULL;
        double result = evaluate(argv[1], &error);
        if (error) {
            printf("Error: %s\n", error);
            free(error);
            return 1;
        }
        if (result == (int)result)
            printf("%d\n", (int)result);
        else
            printf("%.2f\n", result);
        return 0;
    }

    printf("Calc - Interactive Calculator\n");
    printf("Enter expressions or 'quit' to exit\n");

    char line[1024];
    while (1) {
        printf("calc> ");
        fflush(stdout);
        if (!fgets(line, sizeof(line), stdin)) break;
        line[strcspn(line, "\n")] = '\0';
        if (strcmp(line, "quit") == 0 || strcmp(line, "exit") == 0) break;
        if (strlen(line) == 0) continue;

        char *error = NULL;
        double result = evaluate(line, &error);
        if (error) {
            printf("Error: %s\n", error);
            free(error);
        } else {
            if (result == (int)result)
                printf("%d\n", (int)result);
            else
                printf("%.2f\n", result);
        }
    }
    return 0;
}
