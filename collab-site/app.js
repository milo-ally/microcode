document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('main');

  const h1 = document.createElement('h1');
  h1.textContent = 'Collaborative Project';
  main.appendChild(h1);

  const p = document.createElement('p');
  p.textContent = 'Built by 3 agents working in parallel.';
  main.appendChild(p);

  console.log('App initialized');
});
