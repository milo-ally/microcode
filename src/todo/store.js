import fs from 'fs';
import path from 'path';
import os from 'os';

const STORE_PATH = path.join(os.homedir(), '.todo-cli.json');

export class TodoList {
  constructor() {
    this.todos = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  save() {
    fs.writeFileSync(STORE_PATH, JSON.stringify(this.todos, null, 2));
  }

  _nextId() {
    if (this.todos.length === 0) return 1;
    return Math.max(...this.todos.map(t => t.id)) + 1;
  }

  add(text) {
    const todo = {
      id: this._nextId(),
      text,
      done: false,
      createdAt: new Date().toISOString(),
    };
    this.todos.push(todo);
    this.save();
    return todo;
  }

  list(filterByStatus) {
    if (filterByStatus === 'pending') return this.todos.filter(t => !t.done);
    if (filterByStatus === 'done') return this.todos.filter(t => t.done);
    return this.todos;
  }

  done(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) throw new Error('Not found');
    todo.done = true;
    this.save();
    return todo;
  }

  delete(id) {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Not found');
    const [removed] = this.todos.splice(index, 1);
    this.save();
    return removed;
  }
}
