(() => {
  if (parent === window) return;
  document.documentElement.classList.add('embedded');
  let previous=0;
  function report() {const height=Math.ceil(document.body.getBoundingClientRect().height);if(height>0&&height!==previous){previous=height;parent.postMessage({type:'glass-demo-height',height},location.origin);}}
  new ResizeObserver(report).observe(document.body);
  addEventListener('message', event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='glass-request-height'){previous=0;report();}});
  addEventListener('load',report);
})();
