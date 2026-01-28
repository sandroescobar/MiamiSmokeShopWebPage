// Track slide index for each slideshow independently
const slideIndices = {
  slideshow1: 1,
  slideshow2: 1,
  slideshow3: 1
};

document.addEventListener('DOMContentLoaded', () => {
  initSlideshows();
  initNavbarToggle();
});

function initSlideshows() {
  showSlides(slideIndices.slideshow1, 'slideshow1');
  showSlides(slideIndices.slideshow2, 'slideshow2');
  showSlides(slideIndices.slideshow3, 'slideshow3');
}

function changeSlide(n, slideshowId) {
  slideIndices[slideshowId] += n;
  showSlides(slideIndices[slideshowId], slideshowId);
}

function showSlides(n, slideshowId) {
  const container = document.getElementById(slideshowId);
  if (!container) return;
  const slides = container.getElementsByClassName('mySlides');

  if (n > slides.length) {
    slideIndices[slideshowId] = 1;
  }
  if (n < 1) {
    slideIndices[slideshowId] = slides.length;
  }

  for (let i = 0; i < slides.length; i += 1) {
    slides[i].style.display = 'none';
  }

  slides[slideIndices[slideshowId] - 1].style.display = 'block';
}

function initNavbarToggle() {
  const togglers = document.querySelectorAll('.navbar-toggler');
  togglers.forEach((btn) => {
    const targetSelector = btn.getAttribute('data-bs-target') || btn.getAttribute('data-target');
    if (!targetSelector) return;
    const target = document.querySelector(targetSelector);
    if (!target) return;

    const hasBootstrap = !!(window.bootstrap && window.bootstrap.Collapse);

    if (!hasBootstrap) {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        target.classList.toggle('show');
        btn.setAttribute('aria-expanded', target.classList.contains('show'));
      });
    }

    const closeCollapse = () => {
      if (hasBootstrap) {
        const instance = bootstrap.Collapse.getOrCreateInstance(target, { toggle: false });
        instance.hide();
      } else {
        target.classList.remove('show');
      }
      btn.setAttribute('aria-expanded', 'false');
    };

    target.querySelectorAll('.nav-link').forEach((link) => {
      if (link.classList.contains('dropdown-toggle')) return;
      link.addEventListener('click', closeCollapse);
    });

    target.querySelectorAll('.dropdown-menu .dropdown-item').forEach((item) => {
      item.addEventListener('click', closeCollapse);
    });
  });
}


