(() => {
  const tabs = [...document.querySelectorAll('[data-demo]')];
  function activate(name, focus = false) {
    if (!['glass-ui', 'controls'].includes(name)) name = 'glass-ui';
    tabs.forEach(tab => {
      const active = tab.dataset.demo === name;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      document.querySelector('#panel-' + tab.dataset.demo).hidden = !active;
      if (active && focus) tab.focus();
    });
    const frame = document.querySelector('#frame-' + name);
    if (!frame.getAttribute('src')) frame.src = frame.dataset.src;
    document.querySelector('#open-demo').href = name + '/';
    const skill = name === 'controls' ? 'liquid-glass-controls' : 'glass-ui';
    document.querySelector('#demo-source').href = 'https://github.com/Apson-Chian/my-skills/tree/main/' + skill;
    frame.contentWindow?.postMessage({type:'glass-request-height'}, location.origin);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { location.hash = tab.dataset.demo; activate(tab.dataset.demo); });
    tab.addEventListener('keydown', event => {
      const next = {ArrowLeft:0, ArrowRight:1, Home:0, End:1}[event.key];
      if (next !== undefined) {event.preventDefault(); location.hash=tabs[next].dataset.demo; activate(tabs[next].dataset.demo,true);}
    });
  });
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'glass-demo-height') return;
    const frame = [...document.querySelectorAll('iframe')].find(f => f.contentWindow === event.source);
    if (frame && Number.isFinite(event.data.height) && event.data.height > 0) frame.style.height = Math.ceil(event.data.height) + 'px';
  });
  let timer;
  function toast(message) {const el=document.querySelector('.toast');el.textContent=message;el.classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('visible'),2200);}
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try {await navigator.clipboard.writeText(button.dataset.copy);toast('提示词已复制');}
    catch {toast('请选中左侧提示词进行复制');}
  }));
  activate(location.hash.slice(1));
})();
