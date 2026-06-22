function renderItem(item) {
  const mark = item.done ? '✔' : '○';
  const status = item.done ? ' (done)' : '';
  return `${mark} [${item.id}] ${item.text}${status}`;
}

function render(result) {
  if (Array.isArray(result)) {
    if (result.length === 0) {
      console.log('No todos yet!');
      return;
    }
    console.log(`TODO List (${result.length})`);
    for (const item of result) {
      console.log(renderItem(item));
    }
    return;
  }

  console.log(renderItem(result));
}

module.exports = { render };
