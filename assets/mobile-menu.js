document.addEventListener('DOMContentLoaded',function(){
  var btn=document.getElementById('mobileMenuBtn');
  var nav=document.getElementById('mobileNav');
  var bg=document.getElementById('mobileNavBg');
  var close=document.getElementById('mobileMenuClose');
  if(!btn||!nav||!bg)return;
  function openMenu(){
    nav.classList.add('open');
    bg.classList.add('open');
    document.body.style.overflow='hidden';
  }
  function closeMenu(){
    nav.classList.remove('open');
    bg.classList.remove('open');
    document.body.style.overflow='';
  }
  btn.onclick=function(e){e.preventDefault();e.stopPropagation();openMenu();};
  if(close)close.onclick=function(e){e.preventDefault();closeMenu();};
  bg.onclick=closeMenu;
  var links=nav.querySelectorAll('a');
  for(var i=0;i<links.length;i++){links[i].addEventListener('click',closeMenu);}
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu();});
});