#include <stdlib.h>
#include "stack.h"

DoubleStack *create_double_stack(int capacity) {
    DoubleStack *s = malloc(sizeof(DoubleStack));
    s->data = malloc(sizeof(double) * capacity);
    s->top = -1;
    s->capacity = capacity;
    return s;
}

void double_push(DoubleStack *s, double val) {
    s->data[++s->top] = val;
}

double double_pop(DoubleStack *s) {
    return s->data[s->top--];
}

double double_peek(DoubleStack *s) {
    return s->data[s->top];
}

int double_is_empty(DoubleStack *s) {
    return s->top == -1;
}

void free_double_stack(DoubleStack *s) {
    free(s->data);
    free(s);
}

CharStack *create_char_stack(int capacity) {
    CharStack *s = malloc(sizeof(CharStack));
    s->data = malloc(sizeof(char) * capacity);
    s->top = -1;
    s->capacity = capacity;
    return s;
}

void char_push(CharStack *s, char val) {
    s->data[++s->top] = val;
}

char char_pop(CharStack *s) {
    return s->data[s->top--];
}

char char_peek(CharStack *s) {
    return s->data[s->top];
}

int char_is_empty(CharStack *s) {
    return s->top == -1;
}

void free_char_stack(CharStack *s) {
    free(s->data);
    free(s);
}
