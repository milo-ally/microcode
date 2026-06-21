CC = gcc
CFLAGS = -Wall -Wextra -g
LDFLAGS = -lm
TARGET = calc
SRCS = main.c parser.c stack.c
OBJS = $(SRCS:.c=.o)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

.PHONY: clean
