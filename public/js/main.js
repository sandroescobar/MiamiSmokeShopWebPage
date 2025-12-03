// Track slide index for each slideshow independently
const slideIndices = {
  slideshow1: 1,
  slideshow2: 1
};

// Initialize slideshows on page load
document.addEventListener('DOMContentLoaded', function() {
  showSlides(slideIndices.slideshow1, 'slideshow1');
  showSlides(slideIndices.slideshow2, 'slideshow2');
});

// Change slide for a specific slideshow
function changeSlide(n, slideshowId) {
  slideIndices[slideshowId] += n;
  showSlides(slideIndices[slideshowId], slideshowId);
}

// Display the current slide for a specific slideshow
function showSlides(n, slideshowId) {
  const container = document.getElementById(slideshowId);
  if (!container) return; // Exit if slideshow doesn't exist on this page
  const slides = container.getElementsByClassName("mySlides");
  
  // Loop around if we go past the end
  if (n > slides.length) {
    slideIndices[slideshowId] = 1;
  }
  
  // Loop around if we go before the start
  if (n < 1) {
    slideIndices[slideshowId] = slides.length;
  }
  
  // Hide all slides in this slideshow
  for (let i = 0; i < slides.length; i++) {
    slides[i].style.display = "none";
  }
  
  // Show the current slide
  slides[slideIndices[slideshowId] - 1].style.display = "block";
}