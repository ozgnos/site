(function(){
  var nav=document.querySelector('nav.site-nav');
  if(!nav) return;
  var lastY=window.scrollY||0;
  function onScroll(){
    var y=Math.max(0, window.scrollY||0);
    nav.classList.toggle('scrolled', y>8);
    var menu=document.getElementById('navlinks');
    if(menu && menu.classList.contains('open')){
      nav.classList.remove('nav-hidden'); lastY=y; return;
    }
    if(y>lastY && y>160) nav.classList.add('nav-hidden');
    else if(y<lastY-2) nav.classList.remove('nav-hidden');
    lastY=y;
  }
  onScroll();
  window.addEventListener('scroll', onScroll, {passive:true});
})();
