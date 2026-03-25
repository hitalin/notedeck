/* Scroll fade-in */
const obs = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach((el) => obs.observe(el));

/* Fetch screenshot URL from README */
fetch('https://raw.githubusercontent.com/hitalin/notedeck/main/README.md')
  .then(r => r.text())
  .then(md => {
    const m = md.match(/<img[^>]+src="(https:\/\/github\.com\/user-attachments\/assets\/[^"]+)"/);
    if (m) document.getElementById('hero-screenshot').src = m[1];
  })
  .catch(() => {});

/* Resolve direct download URLs from GitHub Releases API */
fetch('https://api.github.com/repos/hitalin/notedeck/releases/latest')
  .then(r => r.json())
  .then(release => {
    const assets = release.assets || [];
    const match = {
      windows: a => a.name.endsWith('-setup.exe'),
      macos:   a => a.name.endsWith('.dmg'),
      linux:   a => a.name.endsWith('.deb'),
      android: a => a.name.endsWith('.apk'),
    };
    document.querySelectorAll('.platform[data-platform]').forEach(el => {
      const fn = match[el.dataset.platform];
      const asset = fn && assets.find(fn);
      if (asset) el.href = asset.browser_download_url;
    });
  })
  .catch(() => {}); /* fallback: links stay as /releases/latest */

/* Click to copy install commands */
document.querySelectorAll('.install-cmd[data-cmd]').forEach((el) => {
  el.addEventListener('click', () => {
    navigator.clipboard.writeText(el.dataset.cmd);
    const hint = el.querySelector('.copy-hint');
    hint.textContent = 'copied!';
    el.classList.add('copied');
    setTimeout(() => { hint.textContent = 'click to copy'; el.classList.remove('copied'); }, 1500);
  });
});
