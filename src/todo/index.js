#!/usr/bin/env node

import { TodoList } from './store.js';
import { render } from './render.js';

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`Usage: todo <command> [args]

Commands:
  add <text>    Add a new todo item
  list          List all todo items
  done <id>     Mark a todo item as done
  delete <id>   Delete a todo item`);
}

const store = new TodoList();

switch (command) {
  case 'add': {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.error('Error: "add" requires a task description.');
      usage();
      process.exit(1);
    }
    const item = store.add(text);
    render(item);
    break;
  }
  case 'list': {
    const items = store.list();
    render(items);
    break;
  }
  case 'done': {
    const id = args[1];
    if (!id) {
      console.error('Error: "done" requires an item id.');
      usage();
      process.exit(1);
    }
    const item = store.done(id);
    render(item);
    break;
  }
  case 'delete': {
    const id = args[1];
    if (!id) {
      console.error('Error: "delete" requires an item id.');
      usage();
      process.exit(1);
    }
    const item = store.delete(id);
    render(item);
    break;
  }
  default:
    usage();
    process.exit(1);
}
