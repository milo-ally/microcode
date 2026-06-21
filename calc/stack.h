#ifndef STACK_H
#define STACK_H

typedef struct {
    double *data;
    int top;
    int capacity;
} DoubleStack;

typedef struct {
    char *data;
    int top;
    int capacity;
} CharStack;

DoubleStack *create_double_stack(int capacity);
void double_push(DoubleStack *s, double val);
double double_pop(DoubleStack *s);
double double_peek(DoubleStack *s);
int double_is_empty(DoubleStack *s);
void free_double_stack(DoubleStack *s);

CharStack *create_char_stack(int capacity);
void char_push(CharStack *s, char val);
char char_pop(CharStack *s);
char char_peek(CharStack *s);
int char_is_empty(CharStack *s);
void free_char_stack(CharStack *s);

#endif
