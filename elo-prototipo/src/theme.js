try {
  const theme = localStorage.getItem('elo-theme');
  document.documentElement.dataset.theme = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
} catch { document.documentElement.dataset.theme = 'light'; }
document.querySelector('meta[name="theme-color"]').content = document.documentElement.dataset.theme === 'dark' ? '#232428' : '#f6f6f7';
