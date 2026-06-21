#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <math.h>
#include "parser.h"
#include "stack.h"

static int get_precedence(char op) {
    switch (op) {
        case '+': case '-': return 1;
        case '*': case '/': case '%': return 2;
        case '^': return 3;
        default: return 0;
    }
}

static int is_right_assoc(char op) {
    return op == '^';
}

static double apply_op(double a, double b, char op, char **err) {
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
            if (b == 0) { *err = strdup("division by zero"); return 0; }
            return a / b;
        case '%':
            if (b == 0) { *err = strdup("division by zero"); return 0; }
            return (int)a % (int)b;
        case '^': return pow(a, b);
        default: return 0;
    }
}

double evaluate(const char *expr, char **error) {
    CharStack *ops = create_char_stack(256);
    DoubleStack *vals = create_double_stack(256);
    int i = 0;
    int len = strlen(expr);
    int paren_count = 0;
    int expect_operand = 1;

    while (i < len) {
        if (isspace(expr[i])) { i++; continue; }

        if (expr[i] == '(') {
            char_push(ops, '(');
            paren_count++;
            expect_operand = 1;
            i++;
        } else if (expr[i] == ')') {
            paren_count--;
            if (paren_count < 0) {
                *error = strdup("mismatched parentheses");
                free_char_stack(ops); free_double_stack(vals);
                return 0;
            }
            while (!char_is_empty(ops) && char_peek(ops) != '(') {
                char op = char_pop(ops);
                double b = double_pop(vals);
                double a = double_pop(vals);
                double_push(vals, apply_op(a, b, op, error));
                if (*error) { free_char_stack(ops); free_double_stack(vals); return 0; }
            }
            if (!char_is_empty(ops)) char_pop(ops);
            expect_operand = 0;
            i++;
        } else if (expr[i] == '+' || expr[i] == '-' || expr[i] == '*' || expr[i] == '/' || expr[i] == '%' || expr[i] == '^') {
            if (expect_operand && (expr[i] == '+' || expr[i] == '-')) {
                double_push(vals, 0);
            } else if (expect_operand) {
                *error = strdup("syntax error");
                free_char_stack(ops); free_double_stack(vals);
                return 0;
            }
            int prec = get_precedence(expr[i]);
            while (!char_is_empty(ops) && char_peek(ops) != '(') {
                char top = char_peek(ops);
                int top_prec = get_precedence(top);
                if (top_prec > prec || (top_prec == prec && !is_right_assoc(expr[i]))) {
                    char_pop(ops);
                    double b = double_pop(vals);
                    double a = double_pop(vals);
                    double_push(vals, apply_op(a, b, top, error));
                    if (*error) { free_char_stack(ops); free_double_stack(vals); return 0; }
                } else break;
            }
            char_push(ops, expr[i]);
            expect_operand = 1;
            i++;
        } else if (isdigit(expr[i]) || expr[i] == '.') {
            char num[64];
            int j = 0;
            while (i < len && (isdigit(expr[i]) || expr[i] == '.')) num[j++] = expr[i++];
            num[j] = '\0';
            double_push(vals, atof(num));
            expect_operand = 0;
        } else {
            char err[64];
            snprintf(err, sizeof(err), "invalid character '%c'", expr[i]);
            *error = strdup(err);
            free_char_stack(ops); free_double_stack(vals);
            return 0;
        }
    }

    if (paren_count != 0) {
        *error = strdup("mismatched parentheses");
        free_char_stack(ops); free_double_stack(vals);
        return 0;
    }

    while (!char_is_empty(ops)) {
        char op = char_pop(ops);
        double b = double_pop(vals);
        double a = double_pop(vals);
        double_push(vals, apply_op(a, b, op, error));
        if (*error) { free_char_stack(ops); free_double_stack(vals); return 0; }
    }

    double result = double_pop(vals);
    free_char_stack(ops); free_double_stack(vals);
    return result;
}
