// Javascript for the gallery page

var title = document.getElementById('gallery-title');
title.onclick = function(e) {
  e.preventDefault();
  var form = document.getElementById('gallery-title-edit');
  form.style.display = 'block';
}
